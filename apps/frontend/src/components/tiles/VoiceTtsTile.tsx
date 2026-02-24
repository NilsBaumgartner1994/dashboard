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
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  List,
  ListItem,
  ListItemText,
} from '@mui/material'
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import CloseIcon from '@mui/icons-material/Close'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'

const DEFAULT_CHECK_INTERVAL_S = 60
const MAX_STATUS_LOG_ENTRIES = 50

type ServerStatus = 'online' | 'offline' | 'checking' | 'unknown'

interface StatusLogEntry {
  timestamp: Date
  url: string
  result: 'online' | 'offline'
  detail?: string
}

const STATUS_LABEL: Record<ServerStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  checking: 'Prüfe…',
  unknown: 'Unbekannt',
}

const STATUS_COLOR: Record<ServerStatus, 'success' | 'error' | 'default'> = {
  online: 'success',
  offline: 'error',
  checking: 'default',
  unknown: 'default',
}

function StatusIcon({ status }: { status: ServerStatus }) {
  if (status === 'online') return <CheckCircleIcon />
  if (status === 'offline') return <ErrorIcon />
  return <HelpOutlineIcon />
}

function formatDate(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const mon = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = String(date.getFullYear())
  return `${hh}:${mm}:${ss} ${dd}.${mon}.${yyyy}`
}

export default function VoiceTtsTile({ tile }: { tile: TileInstance }) {
  const backendUrl = useStore((s) => s.backendUrl)
  const defaultTtsUrl = `${backendUrl}/tts`
  const ttsUrl: string = (tile.config?.ttsUrl as string) || defaultTtsUrl
  const checkIntervalS: number =
    typeof tile.config?.checkInterval === 'number' && tile.config.checkInterval >= 10
      ? (tile.config.checkInterval as number)
      : DEFAULT_CHECK_INTERVAL_S

  const tileTitle = (tile.config?.name as string) || 'Sprachausgabe (TTS)'

  // Server status
  const [serverStatus, setServerStatus] = useState<ServerStatus>('unknown')
  const [statusLog, setStatusLog] = useState<StatusLogEntry[]>([])
  const [statusLogOpen, setStatusLogOpen] = useState(false)
  const checkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkServer = useCallback(async () => {
    if (!ttsUrl) return
    setServerStatus('checking')
    const now = new Date()
    const healthUrl = `${ttsUrl}/health`
    try {
      const res = await fetch(healthUrl, { method: 'GET', signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        setServerStatus('online')
        setStatusLog((prev) =>
          [{ timestamp: now, url: healthUrl, result: 'online' as const }, ...prev].slice(0, MAX_STATUS_LOG_ENTRIES),
        )
      } else {
        setServerStatus('offline')
        setStatusLog((prev) =>
          [{ timestamp: now, url: healthUrl, result: 'offline' as const, detail: `HTTP ${res.status}` }, ...prev].slice(0, MAX_STATUS_LOG_ENTRIES),
        )
      }
    } catch (err) {
      setServerStatus('offline')
      setStatusLog((prev) =>
        [{ timestamp: now, url: healthUrl, result: 'offline' as const, detail: String(err) }, ...prev].slice(0, MAX_STATUS_LOG_ENTRIES),
      )
    }
  }, [ttsUrl])

  useEffect(() => {
    checkServer()
    checkTimerRef.current = setInterval(checkServer, checkIntervalS * 1000)
    return () => {
      if (checkTimerRef.current) clearInterval(checkTimerRef.current)
    }
  }, [checkServer, checkIntervalS])

  // TTS state
  const [textInput, setTextInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [generationTimeMs, setGenerationTimeMs] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioBlobUrlRef = useRef<string | null>(null)

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current)
    }
  }, [])

  const handleGenerate = async () => {
    if (!textInput.trim()) return
    setLoading(true)
    setError(null)
    setAudioUrl(null)
    setGenerationTimeMs(null)
    setPlaying(false)
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current)
      audioBlobUrlRef.current = null
    }

    const start = Date.now()
    try {
      const res = await fetch(`${ttsUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textInput }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${body}`)
      }
      const elapsed = Date.now() - start
      const headerMs = res.headers.get('X-Generation-Time-Ms')
      setGenerationTimeMs(headerMs ? parseInt(headerMs, 10) : elapsed)

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      audioBlobUrlRef.current = url
      setAudioUrl(url)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handlePlay = () => {
    if (!audioUrl) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    const audio = new Audio(audioUrl)
    audioRef.current = audio
    audio.onended = () => setPlaying(false)
    audio.play().then(() => setPlaying(true)).catch((err) => setError(String(err)))
  }

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }
    setPlaying(false)
  }

  // Settings state
  const [ttsUrlInput, setTtsUrlInput] = useState(ttsUrl)
  const [checkIntervalInput, setCheckIntervalInput] = useState(String(checkIntervalS))

  return (
    <>
      <BaseTile
        tile={tile}
        onSettingsOpen={() => {
          setTtsUrlInput((tile.config?.ttsUrl as string) || defaultTtsUrl)
          setCheckIntervalInput(String(checkIntervalS))
        }}
        settingsChildren={
          <Box>
            <Divider sx={{ my: 2 }}>TTS Server</Divider>
            <TextField
              fullWidth
              label="TTS Server URL"
              placeholder={defaultTtsUrl}
              value={ttsUrlInput}
              onChange={(e) => setTtsUrlInput(e.target.value)}
              sx={{ mb: 2 }}
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
        getExtraConfig={() => ({
          ttsUrl: ttsUrlInput || defaultTtsUrl,
          checkInterval: Math.max(10, Number(checkIntervalInput) || DEFAULT_CHECK_INTERVAL_S),
        })}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 1 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RecordVoiceOverIcon fontSize="small" color="primary" />
            <Typography variant="subtitle2" fontWeight="bold" sx={{ flex: 1 }}>
              {tileTitle}
            </Typography>
            <Chip
              size="small"
              label={STATUS_LABEL[serverStatus]}
              color={STATUS_COLOR[serverStatus]}
              icon={<StatusIcon status={serverStatus} />}
              sx={{ fontSize: '0.65rem', cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); setStatusLogOpen(true) }}
            />
          </Box>

          {/* Text input */}
          <TextField
            multiline
            minRows={2}
            maxRows={4}
            fullWidth
            size="small"
            placeholder="Text eingeben…"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.ctrlKey) handleGenerate()
            }}
          />

          {/* Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              onClick={handleGenerate}
              disabled={loading || !textInput.trim()}
              startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RecordVoiceOverIcon fontSize="small" />}
              sx={{ flex: 1 }}
            >
              {loading ? 'Generiere…' : 'Sprechen'}
            </Button>
            {audioUrl && !playing && (
              <Tooltip title="Abspielen">
                <IconButton size="small" color="primary" onClick={handlePlay}>
                  <PlayArrowIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {playing && (
              <Tooltip title="Stopp">
                <IconButton size="small" color="error" onClick={handleStop}>
                  <StopIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* Timing */}
          {generationTimeMs !== null && (
            <Typography variant="caption" color="text.secondary">
              Generiert in {(generationTimeMs / 1000).toFixed(1)} s
            </Typography>
          )}

          {/* Error */}
          {error && (
            <Typography variant="caption" color="error" sx={{ wordBreak: 'break-all' }}>
              {error}
            </Typography>
          )}
        </Box>
      </BaseTile>

      {/* Status log dialog */}
      <Dialog open={statusLogOpen} onClose={() => setStatusLogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
          <Box sx={{ flex: 1 }}>TTS Server Status Log</Box>
          <IconButton size="small" onClick={() => setStatusLogOpen(false)}>
            <CloseIcon fontSize="inherit" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {statusLog.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Noch keine Prüfungen durchgeführt.
            </Typography>
          ) : (
            <List dense disablePadding>
              {statusLog.map((entry, i) => (
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
                          {formatDate(entry.timestamp)}
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
