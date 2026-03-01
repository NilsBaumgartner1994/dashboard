import { useState, useRef, useEffect, useCallback, isValidElement } from 'react'
import {
  Box,
  Typography,
  TextField,
  Autocomplete,
  IconButton,
  CircularProgress,
  Chip,
  Tooltip,
  Divider,
  Switch,
  FormControlLabel,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemText,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import StopIcon from '@mui/icons-material/Stop'
import SmartToyIcon from '@mui/icons-material/SmartToy'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import LanguageIcon from '@mui/icons-material/Language'
import AddIcon from '@mui/icons-material/Add'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import PsychologyIcon from '@mui/icons-material/Psychology'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import ImageIcon from '@mui/icons-material/Image'
import BaseTile from './BaseTile'
import LargeModal from './LargeModal'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'
import { useTileFlowStore } from '../../store/useTileFlowStore'
import { getLatestConnectedPayload, getOutputTargets } from '../../store/tileFlowHelpers'
import ReactMarkdown from 'react-markdown'

const DEFAULT_AI_MODEL = 'llama3.1:8b'
const DEFAULT_PROVIDER = 'ollama'
const PROVIDER_OPTIONS = [
  { value: 'ollama', label: 'Ollama (Custom Backend)' },
  { value: 'chatgpt-unofficial-proxy', label: 'ChatGPT Unofficial Proxy API' },
  { value: 'openai', label: 'OpenAI (Official)' },
] as const
const PROVIDER_MODEL_OPTIONS: Record<string, string[]> = {
  ollama: [DEFAULT_AI_MODEL, 'qwen3:8b', 'mistral:7b'],
  'chatgpt-unofficial-proxy': ['gpt-4', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'],
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1', 'gpt-4.1-mini'],
}
const CHATGPT_UNOFFICIAL_PROXY_COMMUNITY_URLS = [
  'https://ai.fakeopen.com/api/conversation',
  'https://api.pawan.krd/backend-api/conversation',
] as const
const POLL_INTERVAL_MS = 2000
const DEFAULT_BACKEND_CHECK_INTERVAL_S = 60
const MAX_STATUS_LOG_ENTRIES = 50

type BackendStatus = 'online' | 'offline' | 'checking' | 'unknown'

interface BackendStatusLogEntry {
  timestamp: Date
  url: string
  result: 'online' | 'offline'
  detail?: string
}

const BACKEND_STATUS_LABEL: Record<BackendStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  checking: 'Prüfe…',
  unknown: 'Unbekannt',
}

const BACKEND_STATUS_COLOR: Record<BackendStatus, 'success' | 'error' | 'default'> = {
  online: 'success',
  offline: 'error',
  checking: 'default',
  unknown: 'default',
}

function BackendStatusIcon({ status }: { status: BackendStatus }) {
  if (status === 'online') return <CheckCircleIcon />
  if (status === 'offline') return <ErrorIcon />
  return <HelpOutlineIcon />
}

function formatStatusDate(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const mon = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = String(date.getFullYear())
  return `${hh}:${mm}:${ss} ${dd}.${mon}.${yyyy}`
}

function uniqueUrls(sources: string[]): string[] {
  return [...new Set(sources)]
}

function normalizeProxyUrlInput(proxyUrl: string, backendUrl: string): string {
  if (proxyUrl === 'backend-default') return `${backendUrl}/cors-proxy`
  return proxyUrl
}

/** Calls the backend abort endpoint for a running job. Errors are silently ignored. */
async function abortAgentJob(backendUrl: string, jobId: string): Promise<void> {
  try {
    await fetch(`${backendUrl}/ai-agent/job/${jobId}`, { method: 'DELETE' })
  } catch { /* ignore network errors – the job will time out on its own */ }
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  /** Base64 data URLs of images attached to a user message. */
  images?: string[]
  /** Time (ms) from send to final reply – only on assistant messages. */
  responseTimeMs?: number
  /** URLs visited while generating this reply – only on assistant messages. */
  sources?: string[]
  /** In debug mode: the full payload that was sent to Ollama – only on user messages. */
  debugSentPayload?: Record<string, unknown>
}

interface JobStatusResponse {
  status: 'pending' | 'running' | 'done' | 'error' | 'aborted'
  partialContent: string
  currentAnswer?: string
  finalAnswer?: string
  currentActivity?: string
  visitedUrls?: string[]
  plannedSteps?: Array<{ text: string; done: boolean }>
  message?: { role: string; content: string }
  error?: string
  debugPayload?: Record<string, unknown>
}

interface AiChatProps {
  backendUrl: string
  provider: string
  model: string
  chatGptUnofficialAccessToken?: string
  chatGptUnofficialProxyUrl?: string
  allowInternet: boolean
  thinking: boolean
  debugMode: boolean
  messages: Message[]
  onMessages: (msgs: Message[]) => void
  /** Job ID of an in-progress request from a previous session, so polling can resume after reload. */
  initialJobId?: string
  /** Called with the job ID when a new polling job starts, so the caller can persist it. */
  onJobStarted?: (jobId: string) => void
  /** Called when the current job finishes (success or error), so the caller can clear the persisted job ID. */
  onJobDone?: () => void
  onLiveStatusChange?: (status: { loading: boolean; partialContent: string; currentActivity: string }) => void
  externalInputTrigger?: { id: number; content: string } | null
  compact?: boolean
}

function extractCodeBlocks(content: string): string {
  const matches = [...content.matchAll(/```(?:[\w+-]+)?\n([\s\S]*?)```/g)]
  return matches.map((match) => match[1]?.trim() ?? '').filter(Boolean).join('\n\n')
}

function MarkdownWithCopyCode({ content, compact = false }: { content: string; compact?: boolean }) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const handleCopyCode = async (codeText: string) => {
    try {
      await navigator.clipboard.writeText(codeText)
      setCopiedCode(codeText)
      setTimeout(() => setCopiedCode((current) => (current === codeText ? null : current)), 1500)
    } catch {
      // Clipboard API may be unavailable in some browser contexts.
    }
  }

  return (
    <Box
      sx={{
        '& p': { my: 0.25 },
        '& pre': { bgcolor: 'action.selected', p: 0.75, borderRadius: 1, overflow: 'auto', fontSize: '0.8rem' },
        '& code': { fontFamily: 'monospace', fontSize: '0.85em' },
        fontSize: compact ? '0.8rem' : '0.875rem',
      }}
    >
      <ReactMarkdown
        components={{
          pre({ children, ...props }) {
            const firstChild = Array.isArray(children) ? children[0] : children
            const rawText = isValidElement(firstChild)
              ? (firstChild.props as { children?: unknown }).children
              : ''
            const codeText = String(rawText ?? '').replace(/\n$/, '')
            return (
              <Box sx={{ position: 'relative', my: 0.5 }}>
                <Tooltip title={copiedCode === codeText ? 'Kopiert!' : 'Code kopieren'}>
                  <IconButton
                    size="small"
                    onClick={() => handleCopyCode(codeText)}
                    sx={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      bgcolor: 'background.paper',
                      border: '1px solid',
                      borderColor: 'divider',
                      zIndex: 1,
                      '&:hover': { bgcolor: 'action.hover' },
                    }}
                  >
                    <ContentCopyIcon fontSize="inherit" />
                  </IconButton>
                </Tooltip>
                <pre {...props}>{children}</pre>
              </Box>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </Box>
  )
}

function AiChat({ backendUrl, provider, model, chatGptUnofficialAccessToken, chatGptUnofficialProxyUrl, allowInternet, thinking, debugMode, messages, onMessages, initialJobId, onJobStarted, onJobDone, onLiveStatusChange, externalInputTrigger = null, compact = false }: AiChatProps) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [partialContent, setPartialContent] = useState<string>('')
  const [currentActivity, setCurrentActivity] = useState<string>('')
  const [plannedSteps, setPlannedSteps] = useState<Array<{ text: string; done: boolean }>>([])
  const [error, setError] = useState<string | null>(null)
  const [debugPayload, setDebugPayload] = useState<Record<string, unknown> | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [pendingImages, setPendingImages] = useState<string[]>([])
  const imageInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentJobIdRef = useRef<string | null>(null)
  const activeRequestSignatureRef = useRef<string | null>(null)
  const lastExternalTriggerIdRef = useRef<number | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, partialContent])

  useEffect(() => {
    onLiveStatusChange?.({ loading, partialContent, currentActivity })
  }, [currentActivity, loading, onLiveStatusChange, partialContent])

  // Clean up polling timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) clearTimeout(pollTimerRef.current)
    }
  }, [])

  // Resume polling for an in-progress job from a previous session (e.g. after page reload).
  // This runs only once on mount; subsequent job IDs are handled by submitMessages directly.
  const didResumeRef = useRef(false)
  useEffect(() => {
    if (!initialJobId || didResumeRef.current) return
    didResumeRef.current = true
    currentJobIdRef.current = initialJobId
    setLoading(true)
    pollJob(initialJobId, messages, Date.now())
    // Intentionally run once on mount – pollJob/messages captured from initial render are correct
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pollJob = useCallback(
    (jobId: string, newMessages: Message[], startTime: number) => {
      const poll = async () => {
        try {
          const res = await fetch(`${backendUrl}/ai-agent/job/${jobId}`)
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
          const data = (await res.json()) as JobStatusResponse

          // Update partial content so the user sees the AI progress while generating.
          const liveCurrentAnswer = data.currentAnswer ?? data.partialContent
          if (liveCurrentAnswer !== undefined) {
            setPartialContent(liveCurrentAnswer)
          }

          // Update current activity status message
          if (data.currentActivity !== undefined) {
            setCurrentActivity(data.currentActivity)
          }

          // Update planned steps checkboxes (thinking mode)
          if (data.plannedSteps !== undefined) {
            setPlannedSteps(data.plannedSteps)
          }

          if (data.status === 'done') {
            const reply = data.finalAnswer ?? data.message?.content ?? ''
            const responseTimeMs = Date.now() - startTime
            const sources = data.visitedUrls ?? []

            // In debug mode replace the last user message with the actual payload sent to Ollama
            const finalNewMessages: Message[] =
              debugMode && data.debugPayload
                ? newMessages.map((m, idx) =>
                    idx === newMessages.length - 1 && m.role === 'user'
                      ? { ...m, debugSentPayload: data.debugPayload }
                      : m,
                  )
                : newMessages

            onMessages([...finalNewMessages, { role: 'assistant', content: reply, responseTimeMs, sources }])
            setPartialContent('')
            setCurrentActivity('')
            setPlannedSteps([])
            if (data.debugPayload) setDebugPayload(data.debugPayload)
            setLoading(false)
            currentJobIdRef.current = null
            activeRequestSignatureRef.current = null
            onJobDone?.()
          } else if (data.status === 'error') {
            setError(data.error ?? 'Unbekannter Fehler')
            setPartialContent('')
            setCurrentActivity('')
            setPlannedSteps([])
            setLoading(false)
            currentJobIdRef.current = null
            activeRequestSignatureRef.current = null
            onJobDone?.()
          } else if (data.status === 'aborted') {
            setPartialContent('')
            setCurrentActivity('')
            setPlannedSteps([])
            setLoading(false)
            currentJobIdRef.current = null
            activeRequestSignatureRef.current = null
            onJobDone?.()
          } else {
            // Still running – poll again after interval
            pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          setError(msg)
          setPartialContent('')
          setCurrentActivity('')
          setPlannedSteps([])
          setLoading(false)
          currentJobIdRef.current = null
          activeRequestSignatureRef.current = null
          onJobDone?.()
        }
      }
      pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS)
    },
    [backendUrl, onMessages, onJobDone, debugMode],
  )

  /** Submit a pre-built messages array to the backend and start polling. */
  const submitMessages = useCallback(
    async (newMessages: Message[]) => {
      const requestSignature = JSON.stringify({ provider, model, chatGptUnofficialAccessToken, chatGptUnofficialProxyUrl, allowInternet, thinking, messages: newMessages })
      if (loading && activeRequestSignatureRef.current === requestSignature) return

      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current)
        pollTimerRef.current = null
      }

      activeRequestSignatureRef.current = requestSignature
      onMessages(newMessages)
      setLoading(true)
      const startTime = Date.now()
      try {
        const res = await fetch(`${backendUrl}/ai-agent/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, model, messages: newMessages, allowInternet, thinking, chatGptUnofficialAccessToken, chatGptUnofficialProxyUrl }),
        })
        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(errData.error ?? `HTTP ${res.status}`)
        }
        const data = (await res.json()) as { jobId?: string; error?: string }
        if (!data.jobId) throw new Error('Kein jobId in der Antwort')
        currentJobIdRef.current = data.jobId
        onJobStarted?.(data.jobId)
        pollJob(data.jobId, newMessages, startTime)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        setLoading(false)
        activeRequestSignatureRef.current = null
        onJobDone?.()
      }
    },
    [backendUrl, provider, model, chatGptUnofficialAccessToken, chatGptUnofficialProxyUrl, allowInternet, thinking, loading, onMessages, onJobStarted, onJobDone, pollJob],
  )

  const send = async () => {
    const trimmed = input.trim()
    if ((!trimmed && pendingImages.length === 0) || loading) return
    setInput('')
    setError(null)
    setPartialContent('')
    setCurrentActivity('')
    setPlannedSteps([])
    setDebugPayload(null)
    const userMessage: Message = { role: 'user', content: trimmed }
    if (pendingImages.length > 0) userMessage.images = [...pendingImages]
    setPendingImages([])
    const newMessages: Message[] = [...messages, userMessage]
    await submitMessages(newMessages)
  }

  /** Save an edited user message at index `idx` and re-send from there. */
  const handleEditSave = async (idx: number) => {
    const trimmed = editingContent.trim()
    if (!trimmed) return
    setEditingIdx(null)
    setError(null)
    setPartialContent('')
    setCurrentActivity('')
    setPlannedSteps([])
    setDebugPayload(null)
    // Truncate history to everything before the edited message, then append the edited version
    const newMessages: Message[] = [...messages.slice(0, idx), { role: 'user', content: trimmed }]
    await submitMessages(newMessages)
  }

  const handleEditCancel = () => {
    setEditingIdx(null)
    setEditingContent('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (input.trim() || pendingImages.length > 0) send()
    }
  }

  const handleAbort = async () => {
    if (!currentJobIdRef.current) return
    if (pollTimerRef.current !== null) clearTimeout(pollTimerRef.current)
    const jobId = currentJobIdRef.current
    currentJobIdRef.current = null
    await abortAgentJob(backendUrl, jobId)
    setLoading(false)
    activeRequestSignatureRef.current = null
    setPartialContent('')
    setCurrentActivity('')
    setPlannedSteps([])
    onJobDone?.()
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setPendingImages((prev) => [...prev, reader.result as string])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  useEffect(() => {
    if (!externalInputTrigger?.content?.trim()) return
    if (loading) return
    if (lastExternalTriggerIdRef.current === externalInputTrigger.id) return

    lastExternalTriggerIdRef.current = externalInputTrigger.id
    setError(null)
    setPartialContent('')
    setCurrentActivity('')
    setPlannedSteps([])
    setDebugPayload(null)
    submitMessages([{ role: 'user', content: externalInputTrigger.content.trim() }])
  }, [externalInputTrigger, loading, submitMessages])

  const removePendingImage = (idx: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== idx))
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
              position: 'relative',
              '&:hover .msg-edit-btn': { opacity: 1 },
            }}
          >
            {msg.role === 'assistant' ? (
              <Box>
                <MarkdownWithCopyCode content={msg.content} compact={compact} />
                {/* Source attribution */}
                {msg.sources && msg.sources.length > 0 ? (
                  <Box sx={{ mt: 0.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ opacity: 0.8 }}>
                      Quellen:
                    </Typography>
                    {uniqueUrls(msg.sources).map((url, idx) => (
                      <Typography
                        key={idx}
                        variant="caption"
                        component="a"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ display: 'block', opacity: 0.8, wordBreak: 'break-all', color: 'inherit' }}
                      >
                        {url}
                      </Typography>
                    ))}
                  </Box>
                ) : (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>
                    (Quellen: Trainingsdaten)
                  </Typography>
                )}
                {/* Response time */}
                {msg.responseTimeMs !== undefined && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', opacity: 0.7 }}>
                    ⏱ {(msg.responseTimeMs / 1000).toFixed(1)}s
                  </Typography>
                )}
              </Box>
            ) : editingIdx === i ? (
              /* Inline edit mode for user messages */
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 200 }}>
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  maxRows={8}
                  value={editingContent}
                  onChange={(e) => setEditingContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSave(i) }
                    if (e.key === 'Escape') handleEditCancel()
                  }}
                  autoFocus
                  sx={{
                    '& .MuiInputBase-root': { color: 'primary.contrastText', fontSize: compact ? '0.8rem' : '0.875rem' },
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.light' },
                  }}
                />
                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                  <Tooltip title="Speichern & neu senden (Enter)">
                    <IconButton size="small" onClick={() => handleEditSave(i)} sx={{ color: 'primary.contrastText' }}>
                      <CheckIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Abbrechen (Esc)">
                    <IconButton size="small" onClick={handleEditCancel} sx={{ color: 'primary.contrastText' }}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            ) : (
              /* Normal user message display */
              <>
                {/* Image thumbnails attached to user message */}
                {msg.images && msg.images.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
                    {msg.images.map((src, imgIdx) => (
                      <Box
                        key={imgIdx}
                        component="img"
                        src={src}
                        alt={`Bild ${imgIdx + 1}`}
                        sx={{ maxWidth: 120, maxHeight: 120, borderRadius: 1, objectFit: 'cover' }}
                      />
                    ))}
                  </Box>
                )}
                {debugMode && msg.debugSentPayload ? (
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      fontSize: '0.7rem',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      maxHeight: 300,
                      overflow: 'auto',
                    }}
                  >
                    {JSON.stringify(msg.debugSentPayload, null, 2)}
                  </Box>
                ) : (
                  <Typography variant={compact ? 'caption' : 'body2'} sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {msg.content}
                  </Typography>
                )}
                {/* Edit button – visible on hover, hidden while loading */}
                {!loading && (
                  <Tooltip title="Nachricht bearbeiten & ab hier neu senden">
                    <IconButton
                      className="msg-edit-btn"
                      size="small"
                      onClick={() => { setEditingIdx(i); setEditingContent(msg.content) }}
                      sx={{
                        position: 'absolute',
                        top: 2,
                        left: -28,
                        opacity: 0,
                        transition: 'opacity 0.15s',
                        color: 'text.secondary',
                        p: 0.25,
                      }}
                    >
                      <EditIcon sx={{ fontSize: '0.85rem' }} />
                    </IconButton>
                  </Tooltip>
                )}
              </>
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
            <Box>
              <MarkdownWithCopyCode content={partialContent} compact={compact} />
            </Box>
          </Box>
        )}
        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1 }}>
            <CircularProgress size={16} />
            <Typography variant="caption" color="text.secondary">
              {currentActivity || (partialContent ? 'KI schreibt…' : 'KI denkt nach…')}
            </Typography>
          </Box>
        )}
        {/* Planned steps checkboxes – shown in thinking mode while the AI is working */}
        {loading && plannedSteps.length > 0 && (
          <Box sx={{ px: 1, pb: 0.5 }}>
            {plannedSteps.map((step, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                <Checkbox
                  size="small"
                  checked={step.done}
                  disabled
                  sx={{ p: 0.25, mt: 0.1, flexShrink: 0 }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    textDecoration: step.done ? 'line-through' : 'none',
                    opacity: step.done ? 0.5 : 1,
                    lineHeight: 1.4,
                    pt: 0.3,
                  }}
                >
                  {step.text}
                </Typography>
              </Box>
            ))}
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

      {/* Pending image thumbnails above input */}
      {pendingImages.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, px: 0.5, flexShrink: 0 }}>
          {pendingImages.map((src, idx) => (
            <Box key={idx} sx={{ position: 'relative', display: 'inline-flex' }}>
              <Box
                component="img"
                src={src}
                alt={`Anhang ${idx + 1}`}
                sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1 }}
              />
              <IconButton
                size="small"
                onClick={() => removePendingImage(idx)}
                sx={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  bgcolor: 'background.paper',
                  p: 0.25,
                  '&:hover': { bgcolor: 'error.main', color: 'white' },
                }}
              >
                <CloseIcon sx={{ fontSize: '0.7rem' }} />
              </IconButton>
            </Box>
          ))}
        </Box>
      )}

      {/* Input row */}
      <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleImageSelect}
        />
        <Tooltip title="Bild anhängen">
          <span>
            <IconButton size="small" onClick={() => imageInputRef.current?.click()} disabled={loading}>
              <ImageIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
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
        {loading ? (
          <Tooltip title="Antwort abbrechen">
            <IconButton color="error" onClick={handleAbort} size="small">
              <StopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title="Senden">
            <span>
              <IconButton
                color="primary"
                onClick={send}
                disabled={(!input.trim() && pendingImages.length === 0) || loading}
                size="small"
              >
                <SendIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
    </Box>
  )
}

export default function AiAgentTile({ tile }: { tile: TileInstance }) {
  const backendUrl = useStore((s) => s.backendUrl)
  const tiles = useStore((s) => s.tiles)
  const outputs = useTileFlowStore((s) => s.outputs)
  const publishOutput = useTileFlowStore((s) => s.publishOutput)
  const [modalOpen, setModalOpen] = useState(false)
  const [copiedId, setCopiedId] = useState(false)

  // Backend reachability status
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('unknown')
  const [backendStatusLog, setBackendStatusLog] = useState<BackendStatusLogEntry[]>([])
  const [statusLogOpen, setStatusLogOpen] = useState(false)
  const backendCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const backendCheckIntervalS: number =
    typeof tile.config?.backendCheckInterval === 'number' && tile.config.backendCheckInterval >= 10
      ? (tile.config.backendCheckInterval as number)
      : DEFAULT_BACKEND_CHECK_INTERVAL_S

  const checkBackend = useCallback(async () => {
    if (!backendUrl) return
    setBackendStatus('checking')
    const now = new Date()
    const healthUrl = `${backendUrl}/server/health`
    try {
      const response = await fetch(healthUrl, { method: 'GET', signal: AbortSignal.timeout(5000) })
      if (response.ok) {
        setBackendStatus('online')
        setBackendStatusLog((prev) => [{ timestamp: now, url: healthUrl, result: 'online' as const }, ...prev].slice(0, MAX_STATUS_LOG_ENTRIES))
      } else {
        setBackendStatus('offline')
        setBackendStatusLog((prev) => [{ timestamp: now, url: healthUrl, result: 'offline' as const, detail: `HTTP ${response.status}` }, ...prev].slice(0, MAX_STATUS_LOG_ENTRIES))
      }
    } catch (err) {
      setBackendStatus('offline')
      setBackendStatusLog((prev) => [{ timestamp: now, url: healthUrl, result: 'offline' as const, detail: String(err) }, ...prev].slice(0, MAX_STATUS_LOG_ENTRIES))
    }
  }, [backendUrl])

  useEffect(() => {
    checkBackend()
    backendCheckTimerRef.current = setInterval(checkBackend, backendCheckIntervalS * 1000)
    return () => {
      if (backendCheckTimerRef.current) clearInterval(backendCheckTimerRef.current)
    }
  }, [checkBackend, backendCheckIntervalS])

  // Chat ID – persisted in localStorage per tile so conversations survive page reloads.
  const [chatId, setChatId] = useState<string>(() => {
    try {
      return localStorage.getItem(`ai-chat-id-${tile.id}`) ?? `chat-${crypto.randomUUID()}`
    } catch {
      return `chat-${crypto.randomUUID()}`
    }
  })

  // Messages – persisted in localStorage keyed by chatId.
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const storedId = localStorage.getItem(`ai-chat-id-${tile.id}`) ?? ''
      if (!storedId) return []
      const stored = localStorage.getItem(`ai-chat-messages-${storedId}`)
      return stored ? (JSON.parse(stored) as Message[]) : []
    } catch {
      return []
    }
  })

  // Persist chatId whenever it changes.
  useEffect(() => {
    try {
      localStorage.setItem(`ai-chat-id-${tile.id}`, chatId)
    } catch { /* ignore */ }
  }, [chatId, tile.id])

  // Wrapper that also persists messages to localStorage.
  const handleSetMessages = useCallback(
    (msgs: Message[]) => {
      setMessages(msgs)
      try {
        localStorage.setItem(`ai-chat-messages-${chatId}`, JSON.stringify(msgs))
      } catch { /* ignore */ }
    },
    [chatId],
  )

  // Active job ID – persisted in localStorage so polling can resume after a page reload
  // (backend keeps jobs alive for 10 minutes, so short reloads reconnect automatically).
  // storedChatId mirrors the `chatId` state but is read independently here since React
  // does not allow one useState lazy initializer to read another's value.
  const [activeJobId, setActiveJobId] = useState<string | undefined>(() => {
    try {
      const storedChatId = localStorage.getItem(`ai-chat-id-${tile.id}`) ?? ''
      if (!storedChatId) return undefined
      return localStorage.getItem(`ai-chat-job-${storedChatId}`) ?? undefined
    } catch {
      return undefined
    }
  })

  const handleJobStarted = useCallback(
    (jobId: string) => {
      setActiveJobId(jobId)
      try {
        localStorage.setItem(`ai-chat-job-${chatId}`, jobId)
      } catch { /* ignore */ }
    },
    [chatId],
  )

  const handleJobDone = useCallback(() => {
    setActiveJobId(undefined)
    try {
      localStorage.removeItem(`ai-chat-job-${chatId}`)
    } catch { /* ignore */ }
  }, [chatId])

  // Start a new chat: generate fresh ID, clear messages.
  const handleNewChat = () => {
    const newId = `chat-${crypto.randomUUID()}`
    setChatId(newId)
    setMessages([])
    setActiveJobId(undefined)
    try {
      localStorage.setItem(`ai-chat-id-${tile.id}`, newId)
      localStorage.removeItem(`ai-chat-messages-${newId}`)
      localStorage.removeItem(`ai-chat-job-${chatId}`)
    } catch { /* ignore */ }
  }

  const handleTileAbort = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!activeJobId) return
    await abortAgentJob(backendUrl, activeJobId)
    handleJobDone()
  }

  const handleCopyId = () => {
    navigator.clipboard.writeText(chatId).then(() => {
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 1500)
    }).catch((err) => { console.error('Clipboard write failed:', err) })
  }

  const [copiedHistory, setCopiedHistory] = useState(false)

  const handleCopyHistory = () => {
    if (messages.length === 0) return
    const text = messages
      .map((m) => {
        const label = m.role === 'assistant' ? 'KI' : 'Ich'
        return `${label}: ${m.content}`
      })
      .join('\n\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopiedHistory(true)
      setTimeout(() => setCopiedHistory(false), 1500)
    }).catch((err) => { console.error('Clipboard write failed:', err) })
  }

  const [providerInput, setProviderInput] = useState((tile.config?.aiProvider as string) || DEFAULT_PROVIDER)
  const [modelInput, setModelInput] = useState((tile.config?.aiModel as string) || DEFAULT_AI_MODEL)
  const [chatGptUnofficialAccessTokenInput, setChatGptUnofficialAccessTokenInput] = useState((tile.config?.chatGptUnofficialAccessToken as string) || '')
  const [chatGptUnofficialProxyUrlInput, setChatGptUnofficialProxyUrlInput] = useState(
    normalizeProxyUrlInput((tile.config?.chatGptUnofficialProxyUrl as string) || '', backendUrl),
  )
  const [allowInternetInput, setAllowInternetInput] = useState(
    tile.config?.allowInternet !== undefined ? (tile.config.allowInternet as boolean) : true,
  )
  const [thinkingModeInput, setThinkingModeInput] = useState(
    tile.config?.thinkingMode !== undefined ? (tile.config.thinkingMode as boolean) : false,
  )
  const [debugModeInput, setDebugModeInput] = useState(
    tile.config?.debugMode !== undefined ? (tile.config.debugMode as boolean) : false,
  )
  const [autoOutputInput, setAutoOutputInput] = useState(
    tile.config?.autoOutputEnabled !== undefined ? (tile.config.autoOutputEnabled as boolean) : false,
  )
  const [checkIntervalInput, setCheckIntervalInput] = useState(String(backendCheckIntervalS))
  const [codeBlocksOnlyOutputInput, setCodeBlocksOnlyOutputInput] = useState(
    tile.config?.codeBlocksOnlyOutput !== undefined ? (tile.config.codeBlocksOnlyOutput as boolean) : false,
  )
  const [showLatestChatInTileInput, setShowLatestChatInTileInput] = useState(
    tile.config?.showLatestChatInTile !== undefined ? (tile.config.showLatestChatInTile as boolean) : false,
  )

  const provider = (tile.config?.aiProvider as string) || DEFAULT_PROVIDER
  const model = (tile.config?.aiModel as string) || DEFAULT_AI_MODEL
  const chatGptUnofficialAccessToken = (tile.config?.chatGptUnofficialAccessToken as string) || ''
  const chatGptUnofficialProxyUrl = (tile.config?.chatGptUnofficialProxyUrl as string) || ''
  const allowInternet = tile.config?.allowInternet !== undefined ? (tile.config.allowInternet as boolean) : true
  const thinkingMode = tile.config?.thinkingMode !== undefined ? (tile.config.thinkingMode as boolean) : false
  const debugMode = tile.config?.debugMode !== undefined ? (tile.config.debugMode as boolean) : false
  const tileTitle = (tile.config?.name as string) || 'KI-Agent'
  const autoOutputEnabled = tile.config?.autoOutputEnabled !== undefined ? (tile.config.autoOutputEnabled as boolean) : false
  const codeBlocksOnlyOutput = tile.config?.codeBlocksOnlyOutput !== undefined ? (tile.config.codeBlocksOnlyOutput as boolean) : false
  const showLatestChatInTile = tile.config?.showLatestChatInTile !== undefined ? (tile.config.showLatestChatInTile as boolean) : false
  const latestConnectedPayload = getLatestConnectedPayload(tiles, outputs, tile.id)
  const hasOutputTargets = getOutputTargets(tile).length > 0
  const shouldShowManualOutputButton = hasOutputTargets && !autoOutputEnabled
  const [externalInputTrigger, setExternalInputTrigger] = useState<{ id: number; content: string } | null>(null)
  const [nextExternalInputId, setNextExternalInputId] = useState(1)
  const latestConnectedTimestampRef = useRef<number>(latestConnectedPayload?.timestamp ?? 0)
  const waitingForConnectedOutputRef = useRef(false)
  const tileChatBottomRef = useRef<HTMLDivElement>(null)
  const [tileLiveStatus, setTileLiveStatus] = useState<{ loading: boolean; partialContent: string; currentActivity: string }>({
    loading: false,
    partialContent: '',
    currentActivity: '',
  })

  const getForwardedAssistantContent = useCallback((rawContent: string): string => {
    if (!codeBlocksOnlyOutput) return rawContent.trim()
    return extractCodeBlocks(rawContent)
  }, [codeBlocksOnlyOutput])

  const chatGptUnofficialProxySuggestions = uniqueUrls([
    `${backendUrl}/cors-proxy`,
    ...CHATGPT_UNOFFICIAL_PROXY_COMMUNITY_URLS,
  ])

  useEffect(() => {
    if (!autoOutputEnabled) return
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    const content = lastAssistant ? getForwardedAssistantContent(lastAssistant.content) : ''
    if (!content) return
    publishOutput(tile.id, { content, dataType: 'text' })
  }, [autoOutputEnabled, getForwardedAssistantContent, messages, publishOutput, tile.id])

  useEffect(() => {
    if (!latestConnectedPayload?.content?.trim()) return
    if (latestConnectedPayload.timestamp <= latestConnectedTimestampRef.current) return

    latestConnectedTimestampRef.current = latestConnectedPayload.timestamp
    if (activeJobId) {
      abortAgentJob(backendUrl, activeJobId).finally(() => {
        handleJobDone()
      })
    }

    waitingForConnectedOutputRef.current = true
    const newId = `chat-${crypto.randomUUID()}`
    setChatId(newId)
    setMessages([])
    setActiveJobId(undefined)

    try {
      localStorage.setItem(`ai-chat-id-${tile.id}`, newId)
      localStorage.removeItem(`ai-chat-job-${chatId}`)
      localStorage.removeItem(`ai-chat-messages-${newId}`)
    } catch { /* ignore */ }

    setExternalInputTrigger({ id: nextExternalInputId, content: latestConnectedPayload.content })
    setNextExternalInputId((prev) => prev + 1)
  }, [activeJobId, backendUrl, chatId, handleJobDone, latestConnectedPayload, nextExternalInputId, tile.id])

  useEffect(() => {
    if (!waitingForConnectedOutputRef.current) return
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    if (!lastAssistant) return
    const content = getForwardedAssistantContent(lastAssistant.content)
    if (!content) return
    publishOutput(tile.id, { content, dataType: 'text' })
    waitingForConnectedOutputRef.current = false
  }, [getForwardedAssistantContent, messages, publishOutput, tile.id])

  useEffect(() => {
    if (!showLatestChatInTile) return
    tileChatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, showLatestChatInTile, tileLiveStatus])

  const handlePublishAssistantOutput = () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
    const content = lastAssistant ? getForwardedAssistantContent(lastAssistant.content) : ''
    if (!content) return
    publishOutput(tile.id, { content, dataType: 'text' })
  }

  return (
    <>
      <BaseTile
        tile={tile}
        onTileClick={() => setModalOpen(true)}
        onSettingsOpen={() => {
          setProviderInput((tile.config?.aiProvider as string) || DEFAULT_PROVIDER)
          setModelInput((tile.config?.aiModel as string) || DEFAULT_AI_MODEL)
          setChatGptUnofficialAccessTokenInput((tile.config?.chatGptUnofficialAccessToken as string) || '')
          setChatGptUnofficialProxyUrlInput(
            normalizeProxyUrlInput((tile.config?.chatGptUnofficialProxyUrl as string) || '', backendUrl),
          )
          setAllowInternetInput(tile.config?.allowInternet !== undefined ? (tile.config.allowInternet as boolean) : true)
          setThinkingModeInput(tile.config?.thinkingMode !== undefined ? (tile.config.thinkingMode as boolean) : false)
          setDebugModeInput(tile.config?.debugMode !== undefined ? (tile.config.debugMode as boolean) : false)
          setAutoOutputInput(tile.config?.autoOutputEnabled !== undefined ? (tile.config.autoOutputEnabled as boolean) : false)
          setCodeBlocksOnlyOutputInput(tile.config?.codeBlocksOnlyOutput !== undefined ? (tile.config.codeBlocksOnlyOutput as boolean) : false)
          setShowLatestChatInTileInput(tile.config?.showLatestChatInTile !== undefined ? (tile.config.showLatestChatInTile as boolean) : false)
          setCheckIntervalInput(String(
            typeof tile.config?.backendCheckInterval === 'number' && tile.config.backendCheckInterval >= 10
              ? tile.config.backendCheckInterval
              : DEFAULT_BACKEND_CHECK_INTERVAL_S
          ))
        }}
        settingsChildren={
          <Box>
            <Divider sx={{ mb: 2 }}>KI-Modell</Divider>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="ai-provider-label">Provider</InputLabel>
              <Select
                labelId="ai-provider-label"
                value={providerInput}
                label="Provider"
                onChange={(e) => {
                  const nextProvider = e.target.value
                  setProviderInput(nextProvider)
                  const providerModels = PROVIDER_MODEL_OPTIONS[nextProvider] ?? []
                  if (providerModels.length > 0) setModelInput(providerModels[0])
                }}
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {providerInput === 'chatgpt-unofficial-proxy' && (
              <>
                <TextField
                  fullWidth
                  label="Access Token"
                  value={chatGptUnofficialAccessTokenInput}
                  onChange={(e) => setChatGptUnofficialAccessTokenInput(e.target.value)}
                  sx={{ mb: 2 }}
                  placeholder="eyJ..."
                  helperText={(
                    <>
                      Für den Unofficial Proxy Access Token: 
                      <a href="https://chat.openai.com/api/auth/session" target="_blank" rel="noreferrer">https://chat.openai.com/api/auth/session</a>
                    </>
                  )}
                />
                <Autocomplete
                  freeSolo
                  options={chatGptUnofficialProxySuggestions}
                  value={chatGptUnofficialProxyUrlInput}
                  onChange={(_, value) => setChatGptUnofficialProxyUrlInput(value || '')}
                  onInputChange={(_, value) => setChatGptUnofficialProxyUrlInput(value)}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Proxy URL"
                      sx={{ mb: 2 }}
                      placeholder="Leer lassen = Auto (Fallback-Reihenfolge)"
                      helperText="Eigene URL möglich. Vorschlag: Global Settings Backend URL + /cors-proxy"
                    />
                  )}
                />
              </>
            )}
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="ai-model-label">Modell</InputLabel>
              <Select
                labelId="ai-model-label"
                value={modelInput}
                label="Modell"
                onChange={(e) => setModelInput(e.target.value)}
              >
                {(PROVIDER_MODEL_OPTIONS[providerInput] ?? []).map((modelOption) => (
                  <MenuItem key={modelOption} value={modelOption}>{modelOption}</MenuItem>
                ))}
              </Select>
            </FormControl>
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
                  checked={thinkingModeInput}
                  onChange={(e) => setThinkingModeInput(e.target.checked)}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <PsychologyIcon fontSize="small" />
                  <Typography variant="body2">Denkmodus (Analyse → Plan → Ausführung → Synthese)</Typography>
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
            <FormControlLabel
              control={
                <Switch
                  checked={autoOutputInput}
                  onChange={(e) => setAutoOutputInput(e.target.checked)}
                />
              }
              label={<Typography variant="body2">Auto-Output (letzte KI-Antwort) weiterleiten</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={codeBlocksOnlyOutputInput}
                  onChange={(e) => setCodeBlocksOnlyOutputInput(e.target.checked)}
                />
              }
              label={<Typography variant="body2">Beim Weiterleiten nur Codeblöcke senden</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={showLatestChatInTileInput}
                  onChange={(e) => setShowLatestChatInTileInput(e.target.checked)}
                />
              }
              label={<Typography variant="body2">Letzten Chat in der Kachel anzeigen (auto-scroll)</Typography>}
            />
            <Divider sx={{ my: 2 }}>Server-Statusprüfung</Divider>
            <TextField
              fullWidth
              label="Prüfintervall (Sekunden)"
              type="number"
              inputProps={{ min: 10 }}
              value={checkIntervalInput}
              onChange={(e) => setCheckIntervalInput(e.target.value)}
              sx={{ mb: 2 }}
            />
          </Box>
        }
        getExtraConfig={() => ({ aiProvider: providerInput || DEFAULT_PROVIDER, aiModel: modelInput || DEFAULT_AI_MODEL, chatGptUnofficialAccessToken: chatGptUnofficialAccessTokenInput.trim(), chatGptUnofficialProxyUrl: chatGptUnofficialProxyUrlInput.trim(), allowInternet: allowInternetInput, thinkingMode: thinkingModeInput, debugMode: debugModeInput, autoOutputEnabled: autoOutputInput, codeBlocksOnlyOutput: codeBlocksOnlyOutputInput, showLatestChatInTile: showLatestChatInTileInput, backendCheckInterval: Math.max(10, Number(checkIntervalInput) || DEFAULT_BACKEND_CHECK_INTERVAL_S) })}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <SmartToyIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" fontWeight="bold" sx={{ flex: 1 }}>
              {tileTitle}
            </Typography>
            <Chip
              size="small"
              label={BACKEND_STATUS_LABEL[backendStatus]}
              color={BACKEND_STATUS_COLOR[backendStatus]}
              icon={<BackendStatusIcon status={backendStatus} />}
              sx={{ fontSize: '0.65rem', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); setStatusLogOpen(true) }}
            />
            <Chip label={provider} size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} />
            <Chip label={model} size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} />
            {allowInternet && (
              <Tooltip title="Internet-Zugriff aktiv">
                <LanguageIcon fontSize="small" color="action" />
              </Tooltip>
            )}
            {thinkingMode && (
              <Tooltip title="Denkmodus aktiv">
                <PsychologyIcon fontSize="small" color="secondary" />
              </Tooltip>
            )}
            {activeJobId && (
              <Tooltip title="KI-Antwort abbrechen">
                <IconButton size="small" color="error" onClick={handleTileAbort}>
                  <StopIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            )}
            {messages.length > 0 && (
              <Tooltip title="Verlauf löschen">
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleSetMessages([]) }}>
                  <DeleteSweepIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setModalOpen(true)}>
            {shouldShowManualOutputButton && (
              <Box sx={{ display: 'flex', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
                <Button size="small" variant="contained" onClick={(e) => { e.stopPropagation(); handlePublishAssistantOutput() }} disabled={!messages.some((m) => m.role === 'assistant')}>Output senden</Button>
              </Box>
            )}
            {messages.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Tippe hier, um mit dem KI-Agenten zu chatten…
              </Typography>
            ) : (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block', mb: showLatestChatInTile ? 0.5 : 0 }}>
                  {messages.length} Nachricht{messages.length !== 1 ? 'en' : ''} – Tippe zum Öffnen
                </Typography>
                {showLatestChatInTile && (
                  <Box sx={{ maxHeight: 170, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 0.5, pr: 0.5 }}>
                    {messages.map((msg, index) => (
                      <Box key={`${msg.role}-${index}`} sx={{ alignSelf: msg.role === 'assistant' ? 'flex-start' : 'flex-end', bgcolor: msg.role === 'assistant' ? 'action.hover' : 'primary.main', color: msg.role === 'assistant' ? 'text.primary' : 'primary.contrastText', px: 0.75, py: 0.5, borderRadius: 1.5, maxWidth: '90%' }}>
                        <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {msg.content}
                        </Typography>
                      </Box>
                    ))}
                    {tileLiveStatus.loading && (
                      <Box sx={{ alignSelf: 'flex-start', bgcolor: 'action.hover', color: 'text.primary', px: 0.75, py: 0.5, borderRadius: 1.5, maxWidth: '90%', opacity: 0.85 }}>
                        <Typography variant="caption" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {tileLiveStatus.partialContent || tileLiveStatus.currentActivity || 'KI denkt nach…'}
                        </Typography>
                      </Box>
                    )}
                    <Box ref={tileChatBottomRef} />
                  </Box>
                )}
              </>
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
          {/* Chat header: ID display + action buttons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexShrink: 0, flexWrap: 'wrap' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', opacity: 0.8, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Chat-ID: {chatId}
            </Typography>
            <Tooltip title={copiedId ? 'Kopiert!' : 'Chat-ID kopieren'}>
              <IconButton size="small" onClick={handleCopyId}>
                <ContentCopyIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Neuen Chat starten">
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddIcon fontSize="small" />}
                onClick={handleNewChat}
                sx={{ fontSize: '0.7rem', py: 0.25, px: 1 }}
              >
                Neuer Chat
              </Button>
            </Tooltip>
            {messages.length > 0 && (
              <Tooltip title={copiedHistory ? 'Kopiert!' : 'Verlauf kopieren (KI: … / Ich: …)'}>
                <IconButton size="small" onClick={handleCopyHistory}>
                  <ContentCopyIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            )}
            {messages.length > 0 && (
              <Tooltip title="Verlauf löschen">
                <IconButton size="small" onClick={() => handleSetMessages([])}>
                  <DeleteSweepIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <AiChat
              backendUrl={backendUrl}
              provider={provider}
              model={model}
              chatGptUnofficialAccessToken={chatGptUnofficialAccessToken}
              chatGptUnofficialProxyUrl={chatGptUnofficialProxyUrl}
              allowInternet={allowInternet}
              thinking={thinkingMode}
              debugMode={debugMode}
              messages={messages}
              onMessages={handleSetMessages}
              initialJobId={activeJobId}
              onJobStarted={handleJobStarted}
              onJobDone={handleJobDone}
              onLiveStatusChange={setTileLiveStatus}
              externalInputTrigger={externalInputTrigger}
            />
          </Box>
        </Box>
      </LargeModal>

      {/* Backend status log modal */}
      <Dialog open={statusLogOpen} onClose={() => setStatusLogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
          <Box sx={{ flex: 1 }}>Backend-Status Log</Box>
          <IconButton size="small" onClick={() => setStatusLogOpen(false)}>
            <CloseIcon fontSize="inherit" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {backendStatusLog.length === 0 ? (
            <Typography variant="body2" color="text.secondary">Noch keine Prüfungen durchgeführt.</Typography>
          ) : (
            <List dense disablePadding>
              {backendStatusLog.map((entry, i) => (
                <ListItem key={i} disableGutters divider>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip
                          size="small"
                          label={entry.result === 'online' ? 'Online' : 'Offline'}
                          color={entry.result === 'online' ? 'success' : 'error'}
                        />
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {formatStatusDate(entry.timestamp)}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          URL: {entry.url}
                        </Typography>
                        {entry.detail && (
                          <Typography variant="caption" color="error" sx={{ display: 'block', wordBreak: 'break-all' }}>
                            {entry.detail}
                          </Typography>
                        )}
                      </>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
