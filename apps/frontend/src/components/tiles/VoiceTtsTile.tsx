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
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
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
type TTSMode = 'voice_design' | 'voice_clone'

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

const LANGUAGES = [
  'Auto',
  'Chinese',
  'English',
  'Japanese',
  'Korean',
  'French',
  'German',
  'Spanish',
  'Portuguese',
  'Russian',
]

const SPEAKERS = [
  'Aiden',
  'Dylan',
  'Eric',
  'Ono_anna',
  'Ryan',
  'Serena',
  'Sohee',
  'Uncle_fu',
  'Vivian',
]

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
  const [ttsMode, setTtsMode] = useState<TTSMode>('voice_design')
  const [textInput, setTextInput] = useState('')
  const [language, setLanguage] = useState('Auto')
  const [voice, setVoice] = useState('Ryan')
  const [voiceDescription, setVoiceDescription] = useState('')
  const [modelSize, setModelSize] = useState('1.7B')
  const [voices, setVoices] = useState<Array<{ name: string; has_reference_audio: boolean; has_training_data: boolean }>>([])
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null)
  const [refAudioFile, setRefAudioFile] = useState<File | null>(null)
  const [newVoiceName, setNewVoiceName] = useState('')
  const [showCreateVoice, setShowCreateVoice] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [generationTimeMs, setGenerationTimeMs] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioBlobUrlRef = useRef<string | null>(null)

  // Load voices on mount
  useEffect(() => {
    const loadVoices = async () => {
      try {
        const res = await fetch(`${ttsUrl}/voices`)
        if (res.ok) {
          const data = await res.json()
          setVoices(data.voices)
          if (data.voices.length > 0 && !selectedVoice) {
            setSelectedVoice(data.voices[0].name)
          }
        }
      } catch (err) {
        console.error('Failed to load voices:', err)
      }
    }
    loadVoices()
  }, [ttsUrl, selectedVoice])

  // Get available model sizes based on mode
  const getAvailableModelSizes = (): string[] => {
    if (ttsMode === 'voice_design') {
      return ['1.7B'] // Voice Design only supports 1.7B
    }
    return ['0.6B', '1.7B'] // Voice Clone and CustomVoice support both
  }

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current)
    }
  }, [])

  const handleGenerate = async () => {
    if (!textInput.trim()) return
    if (ttsMode === 'voice_design' && !voiceDescription.trim()) return
    if (ttsMode === 'voice_clone' && !selectedVoice) return

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
      let res

      if (ttsMode === 'voice_design') {
        const requestBody = {
          text: textInput,
          mode: 'voice_design',
          language: language,
          voice: voiceDescription,
          model_id: `Qwen/Qwen3-TTS-12Hz-${modelSize}-VoiceDesign`,
        }

        res = await fetch(`${ttsUrl}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(120_000),
        })
      } else if (ttsMode === 'voice_clone') {
        // Voice Clone using saved voice profile
        const formData = new FormData()
        formData.append('voice_name', selectedVoice || '')
        formData.append('text', textInput)
        formData.append('language', language)
        formData.append('model_size', modelSize)

        res = await fetch(`${ttsUrl}/voices/clone`, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(120_000),
        })
      } else {
        throw new Error('Invalid TTS mode')
      }

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

  const handleCreateVoice = async () => {
    if (!newVoiceName.trim()) {
      setError('Voice name cannot be empty')
      return
    }
    if (!refAudioFile) {
      setError('Please select an audio file')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('voice_name', newVoiceName)
      formData.append('reference_audio', refAudioFile)

      const res = await fetch(`${ttsUrl}/voices/create`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errorBody = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${errorBody}`)
      }

      const data = await res.json()
      setVoices([...voices, data.voice])
      setSelectedVoice(data.voice.name)
      setNewVoiceName('')
      setRefAudioFile(null)
      setShowCreateVoice(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteVoice = async (voiceName: string) => {
    if (!confirm(`Are you sure you want to delete voice "${voiceName}"?`)) return

    setLoading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('voice_name', voiceName)

      const res = await fetch(`${ttsUrl}/voices/delete`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errorBody = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}: ${errorBody}`)
      }

      setVoices(voices.filter((v) => v.name !== voiceName))
      if (selectedVoice === voiceName) {
        setSelectedVoice(voices.length > 1 ? voices[0].name : null)
      }
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

          {/* Mode Tabs */}
          <Tabs
            value={ttsMode}
            onChange={(_, newValue) => setTtsMode(newValue as TTSMode)}
            variant="fullWidth"
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label="Voice Design" value="voice_design" />
            <Tab label="Voice Clone" value="voice_clone" />
          </Tabs>

          {/* Voice Design Mode */}
          {ttsMode === 'voice_design' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {/* Text to Synthesize */}
              <TextField
                multiline
                minRows={2}
                maxRows={3}
                fullWidth
                size="small"
                label="Text to Synthesize"
                placeholder="Text eingeben…"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) handleGenerate()
                }}
              />

              {/* Language Dropdown */}
              <FormControl fullWidth size="small">
                <InputLabel>Language</InputLabel>
                <Select
                  value={language}
                  label="Language"
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={loading}
                >
                  {LANGUAGES.map((lang) => (
                    <MenuItem key={lang} value={lang}>
                      {lang}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Voice/Speaker Dropdown */}
              <FormControl fullWidth size="small">
                <InputLabel>Voice</InputLabel>
                <Select
                  value={voice}
                  label="Voice"
                  onChange={(e) => setVoice(e.target.value)}
                  disabled={loading}
                >
                  {SPEAKERS.map((speaker) => (
                    <MenuItem key={speaker} value={speaker}>
                      {speaker}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Model Size Dropdown */}
              <FormControl fullWidth size="small">
                <InputLabel>Model Size</InputLabel>
                <Select
                  value={modelSize}
                  label="Model Size"
                  onChange={(e) => setModelSize(e.target.value)}
                  disabled={loading}
                >
                  {getAvailableModelSizes().map((size) => (
                    <MenuItem key={size} value={size}>
                      {size}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Voice Description */}
              <TextField
                multiline
                minRows={2}
                maxRows={3}
                fullWidth
                size="small"
                label="Voice Description"
                placeholder="Describe the voice characteristics…"
                value={voiceDescription}
                onChange={(e) => setVoiceDescription(e.target.value)}
                disabled={loading}
                helperText="E.g., 'A natural female voice with a slight accent'"
              />
            </Box>
          )}

          {/* Voice Clone Mode */}
          {ttsMode === 'voice_clone' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {/* Saved Voices Selection */}
              <FormControl fullWidth size="small">
                <InputLabel>Saved Voice</InputLabel>
                <Select
                  value={selectedVoice || ''}
                  label="Saved Voice"
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  disabled={loading}
                >
                  {voices.map((v) => (
                    <MenuItem key={v.name} value={v.name}>
                      {v.name} {v.has_reference_audio ? '✓' : '⚠'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Create New Voice */}
              {!showCreateVoice && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setShowCreateVoice(true)}
                  disabled={loading}
                >
                  + Create New Voice
                </Button>
              )}

              {/* Create Voice Form */}
              {showCreateVoice && (
                <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                  <Typography variant="caption" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
                    Create New Voice Profile
                  </Typography>

                  <TextField
                    fullWidth
                    size="small"
                    label="Voice Name"
                    placeholder="e.g., My Voice, Sarah"
                    value={newVoiceName}
                    onChange={(e) => setNewVoiceName(e.target.value)}
                    disabled={loading}
                    sx={{ mb: 1 }}
                  />

                  <Box sx={{ mb: 1 }}>
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => setRefAudioFile(e.target.files?.[0] || null)}
                      disabled={loading}
                      style={{ fontSize: '12px' }}
                    />
                    {refAudioFile && (
                      <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>
                        ✓ {refAudioFile.name}
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={handleCreateVoice}
                      disabled={loading || !newVoiceName.trim() || !refAudioFile}
                    >
                      Create
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setShowCreateVoice(false)
                        setNewVoiceName('')
                        setRefAudioFile(null)
                      }}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                  </Box>
                </Box>
              )}

              {/* Delete Voice */}
              {selectedVoice && !showCreateVoice && (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  onClick={() => handleDeleteVoice(selectedVoice)}
                  disabled={loading}
                >
                  Delete "{selectedVoice}" Voice
                </Button>
              )}

              {/* Text to Synthesize */}
              <TextField
                multiline
                minRows={2}
                maxRows={3}
                fullWidth
                size="small"
                label="Text to Synthesize"
                placeholder="Text eingeben…"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.ctrlKey) handleGenerate()
                }}
              />

              {/* Language Dropdown */}
              <FormControl fullWidth size="small">
                <InputLabel>Language</InputLabel>
                <Select
                  value={language}
                  label="Language"
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={loading}
                >
                  {LANGUAGES.map((lang) => (
                    <MenuItem key={lang} value={lang}>
                      {lang}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Model Size Dropdown */}
              <FormControl fullWidth size="small">
                <InputLabel>Model Size</InputLabel>
                <Select
                  value={modelSize}
                  label="Model Size"
                  onChange={(e) => setModelSize(e.target.value)}
                  disabled={loading}
                >
                  {getAvailableModelSizes().map((size) => (
                    <MenuItem key={size} value={size}>
                      {size}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

          {/* Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              onClick={handleGenerate}
              disabled={
                loading ||
                !textInput.trim() ||
                (ttsMode === 'voice_design' && !voiceDescription.trim()) ||
                (ttsMode === 'voice_clone' && !selectedVoice)
              }
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
