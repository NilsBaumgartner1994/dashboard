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
} from '@mui/material'
import GraphicEqIcon from '@mui/icons-material/GraphicEq'
import RecordVoiceOverIcon from '@mui/icons-material/RecordVoiceOver'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import CloseIcon from '@mui/icons-material/Close'
import MicIcon from '@mui/icons-material/Mic'
import DownloadIcon from '@mui/icons-material/Download'
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
  const [voiceCloneDescription, setVoiceCloneDescription] = useState('')
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeError, setTranscribeError] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [generationTimeMs, setGenerationTimeMs] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioBlobUrlRef = useRef<string | null>(null)

  // Browser recording state (for Voice Clone create mode)
  const [isRecording, setIsRecording] = useState(false)
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingChunksRef = useRef<Blob[]>([])
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordedBlobUrlRef = useRef<string | null>(null)
  const recordingPlaybackRef = useRef<HTMLAudioElement | null>(null)

  // YouTube audio import state
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [youtubeStartTime, setYoutubeStartTime] = useState('')
  const [youtubeEndTime, setYoutubeEndTime] = useState('')
  const [youtubeLoading, setYoutubeLoading] = useState(false)
  const [youtubeError, setYoutubeError] = useState<string | null>(null)

  // Generation time estimation state
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const getAvailableModelSizes = (): string[] => {
    if (ttsMode === 'voice_design') return ['1.7B']
    return ['0.6B', '1.7B']
  }

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current)
      if (recordedBlobUrlRef.current) URL.revokeObjectURL(recordedBlobUrlRef.current)
      if (recordingStreamRef.current) recordingStreamRef.current.getTracks().forEach((t) => t.stop())
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    }
  }, [])

  const handleTranscribe = useCallback(async () => {
    if (!refAudioFile) return
    setTranscribing(true)
    setTranscribeError(null)
    try {
      const formData = new FormData()
      formData.append('audio', refAudioFile)
      const res = await fetch(`${ttsUrl}/transcribe`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        if (res.status === 404) {
          throw new Error(
            'Der TTS-Server unterstützt keine Transkription (/transcribe-Endpunkt nicht gefunden). ' +
            'Bitte gib den Referenztext manuell ein.'
          )
        }
        throw new Error(`Transkription fehlgeschlagen (HTTP ${res.status}): ${body}`)
      }
      const data = await res.json()
      setRefText((data.text || data.transcription || '').trim())
    } catch (err) {
      const msg = String(err)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('fetch')) {
        setTranscribeError('Verbindung zum TTS-Server fehlgeschlagen. Bitte prüfe die Server-URL.')
      } else if (msg.includes('AbortError') || msg.includes('timeout')) {
        setTranscribeError('Transkription hat zu lange gedauert (Timeout). Bitte versuche es erneut.')
      } else {
        setTranscribeError(msg)
      }
    } finally {
      setTranscribing(false)
    }
  }, [refAudioFile, ttsUrl])

  // Browser audio recording handlers
  const handleStartRecording = useCallback(async () => {
    try {
      if (recordedBlobUrlRef.current) {
        URL.revokeObjectURL(recordedBlobUrlRef.current)
        recordedBlobUrlRef.current = null
      }
      setRecordedAudioUrl(null)
      setRefAudioFile(null)
      recordingChunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordingStreamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], 'recording.webm', { type: 'audio/webm' })
        setRefAudioFile(file)
        const url = URL.createObjectURL(blob)
        recordedBlobUrlRef.current = url
        setRecordedAudioUrl(url)
        stream.getTracks().forEach((t) => t.stop())
        recordingStreamRef.current = null
      }

      recorder.start()
      setIsRecording(true)
    } catch (err) {
      setError(`Mikrofon-Zugriff fehlgeschlagen: ${String(err)}`)
    }
  }, [])

  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [isRecording])

  const handlePlayRecording = useCallback(() => {
    if (!recordedAudioUrl) return
    if (recordingPlaybackRef.current) {
      recordingPlaybackRef.current.pause()
      recordingPlaybackRef.current = null
    }
    const audio = new Audio(recordedAudioUrl)
    recordingPlaybackRef.current = audio
    audio.play().catch((err) => setError(String(err)))
  }, [recordedAudioUrl])

  const handleDiscardRecording = useCallback(() => {
    if (recordingPlaybackRef.current) {
      recordingPlaybackRef.current.pause()
      recordingPlaybackRef.current = null
    }
    if (recordedBlobUrlRef.current) {
      URL.revokeObjectURL(recordedBlobUrlRef.current)
      recordedBlobUrlRef.current = null
    }
    setRecordedAudioUrl(null)
    setRefAudioFile(null)
  }, [])

  const handleYoutubeImport = useCallback(async () => {
    if (!youtubeUrl.trim()) return
    setYoutubeLoading(true)
    setYoutubeError(null)
    try {
      const params: Record<string, string> = { url: youtubeUrl.trim() }
      if (youtubeStartTime.trim()) params.start = youtubeStartTime.trim()
      if (youtubeEndTime.trim()) params.end = youtubeEndTime.trim()
      const res = await fetch(`${ttsUrl}/youtube-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        if (res.status === 404) {
          throw new Error('Der TTS-Server unterstützt keinen YouTube-Import (/youtube-audio-Endpunkt nicht gefunden).')
        }
        throw new Error(`YouTube-Import fehlgeschlagen (HTTP ${res.status}): ${body}`)
      }
      const blob = await res.blob()
      const filename = `youtube_audio.${blob.type.includes('wav') ? 'wav' : blob.type.includes('mp3') ? 'mp3' : 'webm'}`
      const file = new File([blob], filename, { type: blob.type })
      if (recordedBlobUrlRef.current) {
        URL.revokeObjectURL(recordedBlobUrlRef.current)
        recordedBlobUrlRef.current = null
      }
      const url = URL.createObjectURL(blob)
      recordedBlobUrlRef.current = url
      setRefAudioFile(file)
      setRecordedAudioUrl(url)
      setYoutubeUrl('')
    } catch (err) {
      const msg = String(err)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        setYoutubeError('Verbindung zum TTS-Server fehlgeschlagen. Bitte prüfe die Server-URL.')
      } else if (msg.includes('AbortError') || msg.includes('timeout')) {
        setYoutubeError('YouTube-Import hat zu lange gedauert (Timeout). Bitte versuche es erneut.')
      } else {
        setYoutubeError(msg)
      }
    } finally {
      setYoutubeLoading(false)
    }
  }, [youtubeUrl, youtubeStartTime, youtubeEndTime, ttsUrl])

  const handleDownload = useCallback(() => {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = 'generated_audio.wav'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }, [audioUrl])

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
    setElapsedSeconds(0)
    setEstimatedSeconds(null)
    if (audioBlobUrlRef.current) {
      URL.revokeObjectURL(audioBlobUrlRef.current)
      audioBlobUrlRef.current = null
    }

    // Fetch time estimate before generating
    try {
      const estimateRes = await fetch(`${ttsUrl}/estimate-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textInput }),
        signal: AbortSignal.timeout(5000),
      })
      if (estimateRes.ok) {
        const estimateData = await estimateRes.json()
        setEstimatedSeconds(estimateData.estimated_seconds)
      }
    } catch {
      // Ignore estimate errors, generation continues regardless
    }

    // Start elapsed time counter
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    elapsedTimerRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)

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
          if (voiceCloneDescription.trim()) formData.append('voice_description', voiceCloneDescription)
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
          if (voiceCloneDescription.trim()) formData.append('voice_description', voiceCloneDescription)
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
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current)
        elapsedTimerRef.current = null
      }
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
                  <Box sx={{ mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <input type="file" accept="audio/*" onChange={(e) => { setRefAudioFile(e.target.files?.[0] || null); setRecordedAudioUrl(null) }} disabled={loading || transcribing || isRecording} style={{ fontSize: '12px', flex: 1, minWidth: 0 }} />
                      {!isRecording ? (
                        <Tooltip title="Über Browser aufnehmen">
                          <IconButton size="small" color="primary" onClick={handleStartRecording} disabled={loading || transcribing}>
                            <MicIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Aufnahme stoppen">
                          <IconButton size="small" color="primary" onClick={handleStopRecording}>
                            <StopIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                    {isRecording && (
                      <Typography variant="caption" color="error" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                        ● Aufnahme läuft…
                      </Typography>
                    )}
                    {recordedAudioUrl && !isRecording && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Typography variant="caption" color="success.main">✓ Aufnahme vorhanden</Typography>
                        <Tooltip title="Aufnahme abspielen">
                          <IconButton size="small" onClick={handlePlayRecording}>
                            <PlayArrowIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Aufnahme verwerfen & neu aufnehmen">
                          <IconButton size="small" onClick={handleDiscardRecording}>
                            <MicIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    )}
                    {refAudioFile && !recordedAudioUrl && (<Typography variant="caption" color="success.main" sx={{ display: 'block', mt: 0.5 }}>✓ {refAudioFile.name}</Typography>)}
                    {refAudioFile && (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={transcribing ? <CircularProgress size={12} color="inherit" /> : <GraphicEqIcon fontSize="small" />}
                        onClick={handleTranscribe}
                        disabled={loading || transcribing}
                        sx={{ mt: 0.5, fontSize: '0.7rem' }}
                      >
                        {transcribing ? 'Transkribiere…' : 'Transkribieren'}
                      </Button>
                    )}
                    {transcribeError && (<Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5, wordBreak: 'break-all' }}>{transcribeError}</Typography>)}
                  </Box>
                  {/* YouTube audio import */}
                  <Box sx={{ mb: 1, p: 1, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                    <Typography variant="caption" fontWeight="bold" sx={{ display: 'block', mb: 0.5 }}>
                      🎬 YouTube-Audio importieren
                    </Typography>
                    <TextField
                      fullWidth
                      size="small"
                      label="YouTube-URL"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      disabled={loading || youtubeLoading || isRecording}
                      sx={{ mb: 0.5 }}
                    />
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                      <TextField
                        size="small"
                        label="Start (s)"
                        placeholder="0"
                        value={youtubeStartTime}
                        onChange={(e) => setYoutubeStartTime(e.target.value)}
                        disabled={loading || youtubeLoading || isRecording}
                        sx={{ flex: 1 }}
                        inputProps={{ type: 'number', min: 0 }}
                      />
                      <TextField
                        size="small"
                        label="Ende (s)"
                        placeholder="30"
                        value={youtubeEndTime}
                        onChange={(e) => setYoutubeEndTime(e.target.value)}
                        disabled={loading || youtubeLoading || isRecording}
                        sx={{ flex: 1 }}
                        inputProps={{ type: 'number', min: 0 }}
                      />
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleYoutubeImport}
                      disabled={loading || youtubeLoading || isRecording || !youtubeUrl.trim()}
                      startIcon={youtubeLoading ? <CircularProgress size={12} color="inherit" /> : undefined}
                      sx={{ fontSize: '0.7rem' }}
                    >
                      {youtubeLoading ? 'Lade Audio…' : 'Audio laden'}
                    </Button>
                    {youtubeError && (
                      <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5, wordBreak: 'break-all' }}>
                        {youtubeError}
                      </Typography>
                    )}
                  </Box>
                  <TextField fullWidth size="small" label="Reference Text" placeholder="Text the audio is speaking (optional)" value={refText} onChange={(e) => setRefText(e.target.value)} disabled={loading || transcribing} sx={{ mb: 1 }} />
                  <FormControlLabel
                    control={<Checkbox checked={useXVectorOnly} onChange={(e) => setUseXVectorOnly(e.target.checked)} disabled={loading || transcribing || !!refText} />}
                    label="Use x-vector only (no reference text needed, lower quality)"
                  />
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button size="small" variant="contained" onClick={handleCreateVoice} disabled={loading || transcribing || !newVoiceName.trim() || !refAudioFile || (!refText && !useXVectorOnly)}>
                      Create & Continue
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => { setVoiceCloneSubMode('select'); setNewVoiceName(''); setRefAudioFile(null); setRefText(''); }} disabled={loading || transcribing}>
                      Cancel
                    </Button>
                  </Box>
                </Box>
              )}
              {voices.length > 0 && (
                <>
                  <TextField multiline minRows={2} maxRows={3} fullWidth size="small" label="Text to Synthesize" placeholder="Text eingeben…" value={textInput} onChange={(e) => setTextInput(e.target.value)} disabled={loading} onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate() }} />
                  <TextField fullWidth size="small" label="Voice Description (optional)" placeholder="z.B. überrascht, fröhlich, traurig…" value={voiceCloneDescription} onChange={(e) => setVoiceCloneDescription(e.target.value)} disabled={loading} helperText="Beschreibe den gewünschten Sprachstil oder Emotionen" />
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
                <IconButton size="small" color="primary" onClick={handleDownload}>
                  <DownloadIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          {/* Elapsed / estimated time counter */}
          {loading && (
            <Typography variant="caption" color="text.secondary">
              {elapsedSeconds}s{estimatedSeconds !== null ? ` / ~${estimatedSeconds.toFixed(0)}s` : ''}
            </Typography>
          )}

          {/* Timing */}
          {!loading && generationTimeMs !== null && (
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
