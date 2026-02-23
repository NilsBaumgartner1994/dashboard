import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  TextField,
  IconButton,
  CircularProgress,
  Chip,
  Tooltip,
  Divider,
  Switch,
  FormControlLabel,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import LanguageIcon from '@mui/icons-material/Language'
import BaseTile from './BaseTile'
import LargeModal from './LargeModal'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'
import ReactMarkdown from 'react-markdown'

const DEFAULT_AI_MODEL = 'llama3.1:8b'
const POLL_INTERVAL_MS = 2000

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface JobStatusResponse {
  status: 'pending' | 'running' | 'done' | 'error'
  partialContent: string
  message?: { role: string; content: string }
  error?: string
  debugPayload?: Record<string, unknown>
}

interface AiChatProps {
  backendUrl: string
  model: string
  allowInternet: boolean
  debugMode: boolean
  messages: Message[]
  onMessages: (msgs: Message[]) => void
  compact?: boolean
}

function AiChat({ backendUrl, model, allowInternet, debugMode, messages, onMessages, compact = false }: AiChatProps) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [partialContent, setPartialContent] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [debugPayload, setDebugPayload] = useState<Record<string, unknown> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, partialContent])

  // Clean up polling timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) clearTimeout(pollTimerRef.current)
    }
  }, [])

  const pollJob = useCallback(
    (jobId: string, newMessages: Message[]) => {
      const poll = async () => {
        try {
          const res = await fetch(`${backendUrl}/ai-agent/job/${jobId}`)
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          const data = (await res.json()) as JobStatusResponse

          // Update partial content so the user sees the AI "thinking"
          if (data.partialContent) {
            setPartialContent(data.partialContent)
          }

          if (data.status === 'done') {
            const reply = data.message?.content ?? ''
            onMessages([...newMessages, { role: 'assistant', content: reply }])
            setPartialContent('')
            if (data.debugPayload) setDebugPayload(data.debugPayload)
            setLoading(false)
          } else if (data.status === 'error') {
            setError(data.error ?? 'Unbekannter Fehler')
            setPartialContent('')
            setLoading(false)
          } else {
            // Still running – poll again after interval
            pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(msg)
          setPartialContent('')
          setLoading(false)
        }
      }
      pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
    },
    [backendUrl, onMessages],
  )

  const send = async () => {
    const trimmed = input.trim()
    if (!trimmed || loading) return
    setInput('')
    setError(null)
    setPartialContent('')
    setDebugPayload(null)
    const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }]
    onMessages(newMessages)
    setLoading(true)
    try {
      const res = await fetch(`${backendUrl}/ai-agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: newMessages, allowInternet }),
      })
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(errData.error ?? `HTTP ${res.status}`)
      }
      const data = (await res.json()) as { jobId?: string; error?: string }
      if (!data.jobId) throw new Error('Kein jobId in der Antwort')
      // Start polling for the job result
      pollJob(data.jobId, newMessages)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
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
        {messages.length === 0 && !loading && (
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
        {/* Partial / streaming response while the AI is still generating */}
        {loading && partialContent && (
          <Box
            sx={{
              alignSelf: 'flex-start',
              maxWidth: '85%',
              bgcolor: 'action.hover',
              color: 'text.primary',
              borderRadius: 2,
              px: 1.5,
              py: 0.75,
              opacity: 0.85,
            }}
          >
            <Box
              sx={{
                '& p': { my: 0.25 },
                '& pre': { bgcolor: 'action.selected', p: 0.5, borderRadius: 1, overflow: 'auto', fontSize: '0.8rem' },
                '& code': { fontFamily: 'monospace', fontSize: '0.85em' },
                fontSize: compact ? '0.8rem' : '0.875rem',
              }}
            >
              <ReactMarkdown>{partialContent}</ReactMarkdown>
            </Box>
          </Box>
        )}
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">
              {partialContent ? 'KI schreibt…' : 'KI denkt nach…'}
            </Typography>
          </Box>
        )}
        {error && (
          <Typography variant="caption" color="error" sx={{ p: 1 }}>
            Fehler: {error}
          </Typography>
        )}
        {/* Debug panel – shown only when debugMode is active */}
        {debugMode && debugPayload && (
          <Box
            sx={{
              mt: 1,
              p: 1,
              bgcolor: 'action.selected',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'warning.main',
            }}
          >
            <Typography variant="caption" fontWeight="bold" color="warning.main" sx={{ display: 'block', mb: 0.5 }}>
              🐛 Debug: Letzte Ollama-Anfrage
            </Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                fontSize: '0.7rem',
                overflow: 'auto',
                maxHeight: 300,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {JSON.stringify(debugPayload, null, 2)}
            </Box>
          </Box>
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
  const [allowInternetInput, setAllowInternetInput] = useState(
    tile.config?.allowInternet !== undefined ? (tile.config.allowInternet as boolean) : true,
  )
  const [debugModeInput, setDebugModeInput] = useState(
    tile.config?.debugMode !== undefined ? (tile.config.debugMode as boolean) : false,
  )

  const model = (tile.config?.aiModel as string) || DEFAULT_AI_MODEL
  const allowInternet = tile.config?.allowInternet !== undefined ? (tile.config.allowInternet as boolean) : true
  const debugMode = tile.config?.debugMode !== undefined ? (tile.config.debugMode as boolean) : false
  const tileTitle = (tile.config?.name as string) || 'KI-Agent'

  return (
    <>
      <BaseTile
        tile={tile}
        onTileClick={() => setModalOpen(true)}
        onSettingsOpen={() => {
          setModelInput((tile.config?.aiModel as string) || DEFAULT_AI_MODEL)
          setAllowInternetInput(tile.config?.allowInternet !== undefined ? (tile.config.allowInternet as boolean) : true)
          setDebugModeInput(tile.config?.debugMode !== undefined ? (tile.config.debugMode as boolean) : false)
        }}
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
            <FormControlLabel
              control={
                <Switch
                  checked={allowInternetInput}
                  onChange={(e) => setAllowInternetInput(e.target.checked)}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LanguageIcon fontSize="small" />
                  <Typography variant="body2">Internet-Zugriff erlauben</Typography>
                </Box>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  checked={debugModeInput}
                  onChange={(e) => setDebugModeInput(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">Debug-Modus (zeige Ollama-Anfrage)</Typography>
              }
            />
          </Box>
        }
        getExtraConfig={() => ({ aiModel: modelInput || DEFAULT_AI_MODEL, allowInternet: allowInternetInput, debugMode: debugModeInput })}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <SmartToyIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" fontWeight="bold" sx={{ flex: 1 }}>
              {tileTitle}
            </Typography>
            <Chip label={model} size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} />
            {allowInternet && (
              <Tooltip title="Internet-Zugriff aktiv">
                <LanguageIcon fontSize="small" color="action" />
              </Tooltip>
            )}
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
              allowInternet={allowInternet}
              debugMode={debugMode}
              messages={messages}
              onMessages={setMessages}
            />
          </Box>
        </Box>
      </LargeModal>
    </>
  )
}
