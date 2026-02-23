import { useState, useRef, useEffect } from 'react'
import {
  Box,
  Typography,
  TextField,
  IconButton,
  CircularProgress,
  Chip,
  Tooltip,
  Divider,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import BaseTile from './BaseTile'
import LargeModal from './LargeModal'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'
import ReactMarkdown from 'react-markdown'

const DEFAULT_AI_MODEL = 'llama3.1:8b'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AiChatProps {
  backendUrl: string
  model: string
  messages: Message[]
  onMessages: (msgs: Message[]) => void
  compact?: boolean
}

function AiChat({ backendUrl, model, messages, onMessages, compact = false }: AiChatProps) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    setInput('')
    setError(null)
    const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }]
    onMessages(newMessages)
    setLoading(true)
    try {
      const res = await fetch(`${backendUrl}/ai-agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: newMessages, stream: false }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(errData.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { message?: { content?: string }; error?: string }
      const reply = data.message?.content ?? ''
      onMessages([...newMessages, { role: 'assistant', content: reply }])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 1 }}>
      {/* Message list */}
      <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
        {messages.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            Starte eine Unterhaltung mit dem KI-Agenten…
          </Typography>
        )}
        {messages.map((msg, i) => (
          <Box
            key={i}
            sx={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              bgcolor: msg.role === 'user' ? 'primary.main' : 'action.hover',
              color: msg.role === 'user' ? 'primary.contrastText' : 'text.primary',
              borderRadius: 2,
              px: 1.5,
              py: 0.75,
            }}
          >
            {msg.role === 'assistant' ? (
              <Box
                sx={{
                  '& p': { my: 0.25 },
                  '& pre': { bgcolor: 'action.selected', p: 0.5, borderRadius: 1, overflow: 'auto', fontSize: '0.8rem' },
                  '& code': { fontFamily: 'monospace', fontSize: '0.85em' },
                  fontSize: compact ? '0.8rem' : '0.875rem',
                }}
              >
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </Box>
            ) : (
              <Typography variant={compact ? 'caption' : 'body2'} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {msg.content}
              </Typography>
            )}
          </Box>
        ))}
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">KI denkt nach…</Typography>
          </Box>
        )}
        {error && (
          <Typography variant="caption" color="error" sx={{ p: 1 }}>
            Fehler: {error}
          </Typography>
        )}
        <div ref={bottomRef} />
      </Box>

      <Divider />

      {/* Input row */}
      <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
        <TextField
          size="small"
          fullWidth
          multiline
          maxRows={4}
          placeholder="Nachricht eingeben… (Enter zum Senden)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          disabled={loading}
        />
        <Tooltip title="Senden">
          <span>
            <IconButton
              color="primary"
              onClick={send}
              disabled={!input.trim() || loading}
              size="small"
            >
              <SendIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  )
}

export default function AiAgentTile({ tile }: { tile: TileInstance }) {
  const backendUrl = useStore((s) => s.backendUrl)
  const [modalOpen, setModalOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [modelInput, setModelInput] = useState((tile.config?.aiModel as string) || DEFAULT_AI_MODEL)

  const model = (tile.config?.aiModel as string) || DEFAULT_AI_MODEL
  const tileTitle = (tile.config?.name as string) || 'KI-Agent'

  return (
    <>
      <BaseTile
        tile={tile}
        onTileClick={() => setModalOpen(true)}
        onSettingsOpen={() => setModelInput((tile.config?.aiModel as string) || DEFAULT_AI_MODEL)}
        settingsChildren={
          <Box>
            <Divider sx={{ mb: 2 }}>KI-Modell</Divider>
            <TextField
              fullWidth
              label="Ollama Modell"
              placeholder={DEFAULT_AI_MODEL}
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              sx={{ mb: 2 }}
              helperText="Muss auf dem Ollama-Server verfügbar sein"
            />
          </Box>
        }
        getExtraConfig={() => ({ aiModel: modelInput || DEFAULT_AI_MODEL })}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <SmartToyIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" fontWeight="bold" sx={{ flex: 1 }}>
              {tileTitle}
            </Typography>
            <Chip label={model} size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} />
            {messages.length > 0 && (
              <Tooltip title="Verlauf löschen">
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); setMessages([]) }}>
                  <DeleteSweepIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setModalOpen(true)}>
            {messages.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Tippe hier, um mit dem KI-Agenten zu chatten…
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                {messages.length} Nachricht{messages.length !== 1 ? 'en' : ''} – Tippe zum Öffnen
              </Typography>
            )}
          </Box>
        </Box>
      </BaseTile>

      <LargeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={tileTitle}
      >
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', p: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', mb: 1, flexShrink: 0 }}>
            {messages.length > 0 && (
              <Tooltip title="Verlauf löschen">
                <IconButton size="small" onClick={() => setMessages([])}>
                  <DeleteSweepIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <AiChat
              backendUrl={backendUrl}
              model={model}
              messages={messages}
              onMessages={setMessages}
            />
          </Box>
        </Box>
      </LargeModal>
    </>
  )
}
