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
  Checkbox,
  FormControlLabel,
  LinearProgress,
} from '@mui/material'
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import CloseIcon from '@mui/icons-material/Close'
import MicIcon from '@mui/icons-material/Mic'
import StopCircleIcon from '@mui/icons-material/StopCircle'
import DownloadIcon from '@mui/icons-material/Download'
import DeleteIcon from '@mui/icons-material/Delete'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'

const DEFAULT_CHECK_INTERVAL_S = 60
const MAX_STATUS_LOG_ENTRIES = 50

type ServerStatus = 'online' | 'offline' | 'checking' | 'unknown'
type TTSMode = 'voice_design' | 'voice_clone' | 'custom_voice'
type VoiceCloneSubMode = 'select' | 'create'

interface StatusLogEntry {
  timestamp: Date
  url: string
  result: 'online' | 'offline'
  detail?: string
}

interface Voice {
  name: string
  has_reference_audio: boolean
  has_training_data: boolean
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
  const [voiceCloneSubMode, setVoiceCloneSubMode] = useState<VoiceCloneSubMode>('select')
  const [textInput, setTextInput] = useState('')
  const [language, setLanguage] = useState('Auto')
  const [voiceDescription, setVoiceDescription] = useState('')
  const [modelSize, setModelSize] = useState('1.7B')
  const [speaker, setSpeaker] = useState('Ryan')
  const [styleInstruction, setStyleInstruction] = useState('')

  // Voice Clone state
  const [voices, setVoices] = useState<Voice[]>([])
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null)
  const [refAudioFile, setRefAudioFile] = useState<File | null>(null)
  const [refText, setRefText] = useState('')
  const [useXVectorOnly, setUseXVectorOnly] = useState(false)
  const [newVoiceName, setNewVoiceName] = useState('')

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false)
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Time estimation state
  const [estimatedTime, setEstimatedTime] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // Audio recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const audioUrl = URL.createObjectURL(audioBlob)
        setRecordedAudioUrl(audioUrl)

        // Convert blob to file and set as reference audio
        const audioFile = new File([audioBlob], 'recorded-audio.webm', { type: 'audio/webm' })
        setRefAudioFile(audioFile)

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      setIsRecording(true)
      setError(null)
    } catch (err) {
      setError(`Mikrofon-Fehler: ${String(err)}`)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const deleteRecording = () => {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl)
    }
    setRecordedAudioUrl(null)
    setRefAudioFile(null)
    audioChunksRef.current = []
  }

  const getAvailableModelSizes = (): string[] => {
    if (ttsMode === 'voice_design') return ['1.7B']
    return ['0.6B', '1.7B']
  }

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current)
      if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl)
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [recordedAudioUrl])

  const handleDownload = () => {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = `tts-${ttsMode}-${Date.now()}.wav`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleGenerate = async () => {
    if (!textInput.trim()) return
    if (ttsMode === 'voice_design' && !voiceDescription.trim()) return
    if (ttsMode === 'voice_clone' && voiceCloneSubMode === 'select' && !selectedVoice) return
    if (ttsMode === 'voice_clone' && voiceCloneSubMode === 'create' && (!refAudioFile || (!refText && !useXVectorOnly))) return

    setLoading(true)
    setError(null)
    setAudioUrl(null)
    setGenerationTimeMs(null)
    setPlaying(false)
    setElapsedTime(0)
    setEstimatedTime(null)

    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current)
      audioBlobUrlRef.current = null
    }

    // Fetch time estimation
    try {
      const estimateRes = await fetch(`${ttsUrl}/estimate-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textInput }),
      })
      if (estimateRes.ok) {
        const estimateData = await estimateRes.json()
        setEstimatedTime(estimateData.estimated_seconds)
      }
    } catch (err) {
      console.warn('Failed to fetch time estimation:', err)
    }

    // Start elapsed time timer
    const startTime = Date.now()
    timerRef.current = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    const start = Date.now()
    try {
      let res

      if (ttsMode === 'voice_design') {
        const requestBody = {
          text: textInput,
          mode: 'voice_design',
          language,
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
        if (voiceCloneSubMode === 'select') {
          // Use saved voice
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
          // Create new voice and generate
          const formData = new FormData()
          formData.append('ref_audio', refAudioFile!)
          formData.append('ref_text', refText || '')
          formData.append('target_text', textInput)
          formData.append('language', language)
          formData.append('use_xvector_only', String(useXVectorOnly))
          formData.append('model_size', modelSize)
          res = await fetch(`${ttsUrl}/voice-clone`, {
            method: 'POST',
            body: formData,
            signal: AbortSignal.timeout(120_000),
          })
        }
      } else if (ttsMode === 'custom_voice') {
        const formData = new FormData()
        formData.append('text', textInput)
        formData.append('language', language)
        formData.append('speaker', speaker)
        formData.append('instruct', styleInstruction)
        formData.append('model_size', modelSize)
        res = await fetch(`${ttsUrl}/custom-voice`, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(120_000),
        })
      }

      if (!res!.ok) {
        const body = await res!.text().catch(() => '')
        throw new Error(`HTTP ${res!.status}: ${body}`)
      }
      const elapsed = Date.now() - start
      const headerMs = res!.headers.get('X-Generation-Time-Ms')
      setGenerationTimeMs(headerMs ? parseInt(headerMs, 10) : elapsed)

      const blob = await res!.blob()
      const url = URL.createObjectURL(blob)
      audioBlobUrlRef.current = url
      setAudioUrl(url)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
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
      setVoiceCloneSubMode('select')
      setNewVoiceName('')
      setRefAudioFile(null)
      setRefText('')
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
          <Tabs value={ttsMode} onChange={(_, v) => setTtsMode(v)} variant="fullWidth" sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tab label="Voice Design" value="voice_design" />
            <Tab label="Voice Clone" value="voice_clone" />
            <Tab label="Custom Voice" value="custom_voice" />
          </Tabs>

          {/* VOICE DESIGN MODE */}
          {ttsMode === 'voice_design' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <TextField multiline minRows={2} maxRows={3} fullWidth size="small" label="Text to Synthesize" placeholder="Text eingeben…" value={textInput} onChange={(e) => setTextInput(e.target.value)} disabled={loading} onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate() }} />
              <FormControl fullWidth size="small">
                <InputLabel>Language</InputLabel>
                <Select value={language} label="Language" onChange={(e) => setLanguage(e.target.value)} disabled={loading}>
                  {LANGUAGES.map((lang) => (<MenuItem key={lang} value={lang}>{lang}</MenuItem>))}
                </Select>
              </FormControl>
              <TextField multiline minRows={2} maxRows={3} fullWidth size="small" label="Voice Description" placeholder="Describe the voice characteristics…" value={voiceDescription} onChange={(e) => setVoiceDescription(e.target.value)} disabled={loading} helperText="E.g., 'A natural female voice with a slight accent'" />
            </Box>
          )}

          {/* VOICE CLONE MODE */}
          {ttsMode === 'voice_clone' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {voiceCloneSubMode === 'select' ? (
                <>
                  <FormControl fullWidth size="small">
                    <InputLabel>Saved Voice</InputLabel>
                    <Select value={selectedVoice || ''} label="Saved Voice" onChange={(e) => setSelectedVoice(e.target.value)} disabled={loading}>
                      {voices.map((v) => (<MenuItem key={v.name} value={v.name}>{v.name} {v.has_reference_audio ? '✓' : '⚠'}</MenuItem>))}
                    </Select>
                  </FormControl>
                  <Button size="small" variant="outlined" onClick={() => setVoiceCloneSubMode('create')} disabled={loading}>
                    + Create New Voice
                  </Button>
                  {selectedVoice && (
                    <Button size="small" variant="outlined" color="error" onClick={() => handleDeleteVoice(selectedVoice)} disabled={loading}>
                      Delete "{selectedVoice}" Voice
                    </Button>
                  )}
                </>
              ) : (
                <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
                  <Typography variant="caption" fontWeight="bold" sx={{ mb: 1, display: 'block' }}>
                    Create New Voice Profile
                  </Typography>
                  <TextField fullWidth size="small" label="Voice Name" placeholder="e.g., Sarah" value={newVoiceName} onChange={(e) => setNewVoiceName(e.target.value)} disabled={loading} sx={{ mb: 1 }} />

                  {/* Audio Recording Section */}
                  <Box sx={{ mb: 1, p: 1, bgcolor: 'background.default', borderRadius: 1 }}>
                    <Typography variant="caption" sx={{ display: 'block', mb: 0.5, fontWeight: 'bold' }}>
                      Audio aufnehmen oder hochladen
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      {!isRecording && !recordedAudioUrl && (
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<MicIcon />}
                          onClick={startRecording}
                          disabled={loading}
                        >
                          Aufnahme starten
                        </Button>
                      )}
                      {isRecording && (
                        <Button
                          size="small"
                          variant="contained"
                          color="error"
                          startIcon={<StopCircleIcon />}
                          onClick={stopRecording}
                        >
                          Aufnahme stoppen
                        </Button>
                      )}
                      {recordedAudioUrl && (
                        <>
                          <Typography variant="caption" color="success.main">
                            ✓ Aufnahme bereit
                          </Typography>
                          <IconButton size="small" onClick={() => {
                            const audio = new Audio(recordedAudioUrl)
                            audio.play()
                          }} title="Anhören">
                            <PlayArrowIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={deleteRecording} title="Löschen" color="error">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<MicIcon />}
                            onClick={() => {
                              deleteRecording()
                              startRecording()
                            }}
                          >
                            Neu aufnehmen
                          </Button>
                        </>
                      )}
                    </Box>
                    {!recordedAudioUrl && (
                      <>
                        <Divider sx={{ my: 1 }}>oder</Divider>
                        <input
                          type="file"
                          accept="audio/*"
                          onChange={(e) => {
                            setRefAudioFile(e.target.files?.[0] || null)
                            if (recordedAudioUrl) {
                              URL.revokeObjectURL(recordedAudioUrl)
                              setRecordedAudioUrl(null)
                            }
                          }}
                          disabled={loading}
                          style={{ fontSize: '12px' }}
                        />
                      </>
                    )}
                    {refAudioFile && !recordedAudioUrl && (
                      <Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>
                        ✓ {refAudioFile.name}
                      </Typography>
                    )}
                  </Box>

                  <TextField fullWidth size="small" label="Reference Text" placeholder="Text the audio is speaking (optional)" value={refText} onChange={(e) => setRefText(e.target.value)} disabled={loading} sx={{ mb: 1 }} />
                  <FormControlLabel
                    control={<Checkbox checked={useXVectorOnly} onChange={(e) => setUseXVectorOnly(e.target.checked)} disabled={loading || !!refText} />}
                    label="Use x-vector only (no reference text needed, lower quality)"
                  />
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button size="small" variant="contained" onClick={handleCreateVoice} disabled={loading || !newVoiceName.trim() || !refAudioFile || (!refText && !useXVectorOnly)}>
                      Create & Continue
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => {
                      setVoiceCloneSubMode('select')
                      setNewVoiceName('')
                      setRefAudioFile(null)
                      setRefText('')
                      deleteRecording()
                    }} disabled={loading}>
                      Cancel
                    </Button>
                  </Box>
                </Box>
              )}
              {voices.length > 0 && (
                <>
                  <TextField multiline minRows={2} maxRows={3} fullWidth size="small" label="Text to Synthesize" placeholder="Text eingeben…" value={textInput} onChange={(e) => setTextInput(e.target.value)} disabled={loading} onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate() }} />
                  <FormControl fullWidth size="small">
                    <InputLabel>Language</InputLabel>
                    <Select value={language} label="Language" onChange={(e) => setLanguage(e.target.value)} disabled={loading}>
                      {LANGUAGES.map((lang) => (<MenuItem key={lang} value={lang}>{lang}</MenuItem>))}
                    </Select>
                  </FormControl>
                  <FormControl fullWidth size="small">
                    <InputLabel>Model Size</InputLabel>
                    <Select value={modelSize} label="Model Size" onChange={(e) => setModelSize(e.target.value)} disabled={loading}>
                      {getAvailableModelSizes().map((size) => (<MenuItem key={size} value={size}>{size}</MenuItem>))}
                    </Select>
                  </FormControl>
                </>
              )}
            </Box>
          )}

          {/* CUSTOM VOICE MODE */}
          {ttsMode === 'custom_voice' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <TextField multiline minRows={2} maxRows={3} fullWidth size="small" label="Text to Synthesize" placeholder="Text eingeben…" value={textInput} onChange={(e) => setTextInput(e.target.value)} disabled={loading} onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate() }} />
              <FormControl fullWidth size="small">
                <InputLabel>Language</InputLabel>
                <Select value={language} label="Language" onChange={(e) => setLanguage(e.target.value)} disabled={loading}>
                  {LANGUAGES.map((lang) => (<MenuItem key={lang} value={lang}>{lang}</MenuItem>))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>Speaker</InputLabel>
                <Select value={speaker} label="Speaker" onChange={(e) => setSpeaker(e.target.value)} disabled={loading}>
                  {SPEAKERS.map((s) => (<MenuItem key={s} value={s}>{s}</MenuItem>))}
                </Select>
              </FormControl>
              <TextField fullWidth size="small" label="Style Instruction" placeholder="e.g., speak slowly, cheerful tone" value={styleInstruction} onChange={(e) => setStyleInstruction(e.target.value)} disabled={loading} />
              <FormControl fullWidth size="small">
                <InputLabel>Model Size</InputLabel>
                <Select value={modelSize} label="Model Size" onChange={(e) => setModelSize(e.target.value)} disabled={loading}>
                  {getAvailableModelSizes().map((size) => (<MenuItem key={size} value={size}>{size}</MenuItem>))}
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
            {audioUrl && (
              <Tooltip title="Herunterladen">
                <IconButton size="small" color="success" onClick={handleDownload}>
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* Time Estimation Progress */}
          {loading && estimatedTime !== null && (
            <Box sx={{ mt: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Fortschritt: {elapsedTime}s / ~{Math.ceil(estimatedTime)}s
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {estimatedTime > 0 ? Math.min(100, Math.round((elapsedTime / estimatedTime) * 100)) : 0}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={estimatedTime > 0 ? Math.min(100, (elapsedTime / estimatedTime) * 100) : 0}
                sx={{ height: 6, borderRadius: 1 }}
              />
            </Box>
          )}

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
