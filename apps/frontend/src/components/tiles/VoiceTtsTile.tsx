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
  Card,
  CardActionArea,
  CardContent,
  InputAdornment,
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
import SearchIcon from '@mui/icons-material/Search'
import PersonIcon from '@mui/icons-material/Person'
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate'
import DeleteIcon from '@mui/icons-material/Delete'
import HideImageIcon from '@mui/icons-material/HideImage'
import BaseTile from './BaseTile'
import MyModal from './MyModal'
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
  has_image?: boolean
}

interface VoiceCardItem {
  name: string
  imageUrl?: string
  subtitle?: string
}

interface VoiceCardModalProps {
  open: boolean
  onClose: () => void
  title: string
  items: VoiceCardItem[]
  selected: string | null
  onSelect: (name: string) => void
  ttsUrl?: string
  manageImages?: boolean
  onImagesChanged?: () => void
}

function VoiceCardModal({ open, onClose, title, items, selected, onSelect, ttsUrl, manageImages, onImagesChanged }: VoiceCardModalProps) {
  const [search, setSearch] = useState('')
  const [imageUploading, setImageUploading] = useState<string | null>(null)
  const imageInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const filtered = items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))

  const handleImageUpload = async (name: string, file: File) => {
    if (!ttsUrl) return
    setImageUploading(name)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch(`${ttsUrl}/voices/${encodeURIComponent(name)}/image`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onImagesChanged?.()
    } catch (err) {
      console.error('Image upload failed:', err)
    } finally {
      setImageUploading(null)
    }
  }

  const handleImageDelete = async (name: string) => {
    if (!ttsUrl) return
    setImageUploading(name)
    try {
      const res = await fetch(`${ttsUrl}/voices/${encodeURIComponent(name)}/image`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      onImagesChanged?.()
    } catch (err) {
      console.error('Image delete failed:', err)
    } finally {
      setImageUploading(null)
    }
  }

  return (
    <MyModal open={open} onClose={onClose} title={title}>
      <Box sx={{ p: 2 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 2 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          {filtered.length === 0 && (
            <Typography variant="body2" color="text.secondary">Keine Stimmen gefunden.</Typography>
          )}
          {filtered.map((item) => (
            <Card
              key={item.name}
              variant="outlined"
              sx={{
                width: 130,
                cursor: 'pointer',
                border: selected === item.name ? '2px solid' : '1px solid',
                borderColor: selected === item.name ? 'primary.main' : 'divider',
                flexShrink: 0,
              }}
            >
              {manageImages && (
                <input
                  ref={(el) => { imageInputRefs.current[item.name] = el }}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleImageUpload(item.name, file)
                    e.target.value = ''
                  }}
                />
              )}
              <CardActionArea onClick={() => { onSelect(item.name); onClose() }}>
                <Box sx={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
                  {item.imageUrl ? (
                    <Box
                      component="img"
                      src={item.imageUrl}
                      alt={item.name}
                      sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                      <PersonIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                    </Box>
                  )}
                  {imageUploading === item.name && (
                    <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.4)' }}>
                      <CircularProgress size={24} sx={{ color: 'white' }} />
                    </Box>
                  )}
                  {/* Image upload overlay button (bottom-right) */}
                  {manageImages && (
                    <Tooltip title="Bild hochladen">
                      <Box
                        component="span"
                        onClick={(e) => { e.stopPropagation(); imageInputRefs.current[item.name]?.click() }}
                        sx={{ position: 'absolute', bottom: 2, right: 2 }}
                      >
                        <IconButton
                          size="small"
                          sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' }, p: '3px' }}
                          disabled={imageUploading === item.name}
                        >
                          <AddPhotoAlternateIcon sx={{ fontSize: '0.85rem' }} />
                        </IconButton>
                      </Box>
                    </Tooltip>
                  )}
                  {/* Image delete overlay button (top-right) – only for the image, not the voice */}
                  {manageImages && item.imageUrl && (
                    <Tooltip title="Bild entfernen">
                      <Box
                        component="span"
                        onClick={(e) => { e.stopPropagation(); handleImageDelete(item.name) }}
                        sx={{ position: 'absolute', top: 2, right: 2 }}
                      >
                        <IconButton
                          size="small"
                          sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'rgba(180,0,0,0.75)' }, p: '3px' }}
                          disabled={imageUploading === item.name}
                        >
                          <HideImageIcon sx={{ fontSize: '0.85rem' }} />
                        </IconButton>
                      </Box>
                    </Tooltip>
                  )}
                </Box>
                <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                  <Typography variant="caption" fontWeight="bold" sx={{ display: 'block', textAlign: 'center', wordBreak: 'break-word' }}>
                    {item.name}
                  </Typography>
                  {item.subtitle && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                      {item.subtitle}
                    </Typography>
                  )}
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      </Box>
    </MyModal>
  )
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
  const [newVoiceImageFile, setNewVoiceImageFile] = useState<File | null>(null)
  const [newVoiceImagePreview, setNewVoiceImagePreview] = useState<string | null>(null)
  const newVoiceImageInputRef = useRef<HTMLInputElement | null>(null)
  const newVoiceImagePreviewRef = useRef<string | null>(null)
  const [voicesRefreshKey, setVoicesRefreshKey] = useState(0)
  const [selectedVoiceImageUploading, setSelectedVoiceImageUploading] = useState(false)
  const selectedVoiceImageInputRef = useRef<HTMLInputElement | null>(null)

  // Modal state
  const [voiceSelectModalOpen, setVoiceSelectModalOpen] = useState(false)
  const [speakerSelectModalOpen, setSpeakerSelectModalOpen] = useState(false)

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
  }, [ttsUrl, selectedVoice, voicesRefreshKey])

  const getAvailableModelSizes = (): string[] => {
    if (ttsMode === 'voice_design') return ['1.7B']
    return ['0.6B', '1.7B']
  }

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      if (audioBlobUrlRef.current) URL.revokeObjectURL(audioBlobUrlRef.current)
      if (recordedBlobUrlRef.current) URL.revokeObjectURL(recordedBlobUrlRef.current)
      if (newVoiceImagePreviewRef.current) URL.revokeObjectURL(newVoiceImagePreviewRef.current)
      if (recordingStreamRef.current) recordingStreamRef.current.getTracks().forEach((t) => t.stop())
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    }
  }, [])

  const handleTranscribe = useCallback(async () => {
    if (!refAudioFile) return
    setTranscribing(true)
    setTranscribeError(null)
    try {
      const { pipeline } = await import('@xenova/transformers')
      const transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small')
      const objectUrl = URL.createObjectURL(refAudioFile)
      const result = await transcriber(objectUrl) as { text: string }
      URL.revokeObjectURL(objectUrl)
      setRefText(result.text.trim())
    } catch (err) {
      setTranscribeError(String(err))
    } finally {
      setTranscribing(false)
    }
  }, [refAudioFile])

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
      if (newVoiceImageFile) formData.append('voice_image', newVoiceImageFile)

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
      setNewVoiceImageFile(null)
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

  const handleSelectedVoiceImageUpload = async (file: File) => {
    if (!selectedVoice) return
    setSelectedVoiceImageUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await fetch(`${ttsUrl}/voices/${encodeURIComponent(selectedVoice)}/image`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setVoicesRefreshKey((k) => k + 1)
    } catch (err) {
      console.error('Image upload failed:', err)
    } finally {
      setSelectedVoiceImageUploading(false)
    }
  }

  const handleSelectedVoiceImageDelete = async () => {
    if (!selectedVoice) return
    setSelectedVoiceImageUploading(true)
    try {
      const res = await fetch(`${ttsUrl}/voices/${encodeURIComponent(selectedVoice)}/image`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setVoicesRefreshKey((k) => k + 1)
    } catch (err) {
      console.error('Image delete failed:', err)
    } finally {
      setSelectedVoiceImageUploading(false)
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
                  {/* Selected voice card */}
                  {selectedVoice ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                      <input
                        ref={selectedVoiceImageInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleSelectedVoiceImageUpload(file)
                          e.target.value = ''
                        }}
                      />
                      <Card
                        variant="outlined"
                        sx={{
                          width: 130,
                          cursor: 'pointer',
                          border: '2px solid',
                          borderColor: 'primary.main',
                          flexShrink: 0,
                        }}
                        onClick={() => setVoiceSelectModalOpen(true)}
                      >
                        <Box sx={{ position: 'relative', width: '100%', aspectRatio: '1 / 1' }}>
                          {voices.find((v) => v.name === selectedVoice)?.has_image ? (
                            <Box
                              component="img"
                              src={`${ttsUrl}/voices/${encodeURIComponent(selectedVoice)}/image`}
                              alt={selectedVoice}
                              sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                          ) : (
                            <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                              <PersonIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
                            </Box>
                          )}
                          {selectedVoiceImageUploading && (
                            <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.4)' }}>
                              <CircularProgress size={24} sx={{ color: 'white' }} />
                            </Box>
                          )}
                          {/* Image upload button (bottom-right) */}
                          <Tooltip title="Bild hochladen">
                            <Box
                              component="span"
                              onClick={(e) => { e.stopPropagation(); selectedVoiceImageInputRef.current?.click() }}
                              sx={{ position: 'absolute', bottom: 2, right: 2 }}
                            >
                              <IconButton
                                size="small"
                                sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'white', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' }, p: '3px' }}
                                disabled={selectedVoiceImageUploading}
                              >
                                <AddPhotoAlternateIcon sx={{ fontSize: '0.85rem' }} />
                              </IconButton>
                            </Box>
                          </Tooltip>
                          {/* Image delete button (top-right) – only shown when image exists */}
                          {voices.find((v) => v.name === selectedVoice)?.has_image && (
                            <Tooltip title="Bild entfernen">
                              <Box
                                component="span"
                                onClick={(e) => { e.stopPropagation(); handleSelectedVoiceImageDelete() }}
                                sx={{ position: 'absolute', top: 2, right: 2 }}
                              >
                                <IconButton
                                  size="small"
                                  sx={{ bgcolor: 'rgba(0,0,0,0.5)', color: 'error.main', '&:hover': { bgcolor: 'rgba(180,0,0,0.75)', color: 'white' }, p: '3px' }}
                                  disabled={selectedVoiceImageUploading}
                                >
                                  <HideImageIcon sx={{ fontSize: '0.85rem' }} />
                                </IconButton>
                              </Box>
                            </Tooltip>
                          )}
                        </Box>
                        <CardContent sx={{ p: 1, '&:last-child': { pb: 1 } }}>
                          <Typography variant="caption" fontWeight="bold" sx={{ display: 'block', textAlign: 'center', wordBreak: 'break-word' }}>
                            {selectedVoice}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                            Stimme wechseln…
                          </Typography>
                        </CardContent>
                      </Card>
                    </Box>
                  ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        fullWidth
                        onClick={() => setVoiceSelectModalOpen(true)}
                        disabled={loading}
                      >
                        Stimme auswählen…
                      </Button>
                    </Box>
                  )}
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
                  <Divider sx={{ my: 1 }}>
                    <Typography variant="caption" color="text.secondary">Voiceline</Typography>
                  </Divider>
                  <Box sx={{ mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <input type="file" accept="audio/*" onChange={(e) => { setRefAudioFile(e.target.files?.[0] || null); setRecordedAudioUrl(null) }} disabled={loading || transcribing || isRecording} style={{ fontSize: '12px', flex: 1, minWidth: 0 }} />
                      {!isRecording ? (
                        <Tooltip title="Über Browser aufnehmen">
                          <IconButton size="small" color="error" onClick={handleStartRecording} disabled={loading || transcribing}>
                            <MicIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Tooltip title="Aufnahme stoppen">
                          <IconButton size="small" color="error" onClick={handleStopRecording}>
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
                  <TextField fullWidth size="small" label="Reference Text" placeholder="Text the audio is speaking (optional)" value={refText} onChange={(e) => setRefText(e.target.value)} disabled={loading || transcribing} sx={{ mb: 1 }} />
                  <FormControlLabel
                    control={<Checkbox checked={useXVectorOnly} onChange={(e) => setUseXVectorOnly(e.target.checked)} disabled={loading || transcribing || !!refText} />}
                    label="Use x-vector only (no reference text needed, lower quality)"
                  />
                  <Divider sx={{ my: 1 }}>
                    <Typography variant="caption" color="text.secondary">Profilbild (optional)</Typography>
                  </Divider>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1 }}>
                    <Card variant="outlined" sx={{ width: 90, flexShrink: 0, cursor: 'pointer' }} onClick={() => newVoiceImageInputRef.current?.click()}>
                      <Box sx={{ width: '100%', aspectRatio: '1 / 1', position: 'relative', overflow: 'hidden' }}>
                        {newVoiceImagePreview ? (
                          <Box component="img" src={newVoiceImagePreview} alt="Profilbild Vorschau" sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        ) : (
                          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover' }}>
                            <PersonIcon sx={{ fontSize: 36, color: 'text.disabled' }} />
                          </Box>
                        )}
                      </Box>
                      <CardContent sx={{ p: 0.5, '&:last-child': { pb: 0.5 } }}>
                        <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', fontSize: '0.6rem', color: 'text.secondary' }}>
                          {newVoiceImageFile ? newVoiceImageFile.name.substring(0, 12) + (newVoiceImageFile.name.length > 12 ? '…' : '') : 'Kein Bild'}
                        </Typography>
                      </CardContent>
                    </Card>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <input
                        ref={newVoiceImageInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        disabled={loading}
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          setNewVoiceImageFile(file)
                          if (newVoiceImagePreviewRef.current) URL.revokeObjectURL(newVoiceImagePreviewRef.current)
                          const url = file ? URL.createObjectURL(file) : null
                          newVoiceImagePreviewRef.current = url
                          setNewVoiceImagePreview(url)
                        }}
                      />
                      <Button size="small" variant="outlined" onClick={() => newVoiceImageInputRef.current?.click()} disabled={loading} startIcon={<AddPhotoAlternateIcon fontSize="small" />}>
                        Hochladen
                      </Button>
                      {newVoiceImageFile && (
                        <Button size="small" color="error" variant="outlined" onClick={() => { setNewVoiceImageFile(null); if (newVoiceImagePreviewRef.current) { URL.revokeObjectURL(newVoiceImagePreviewRef.current); newVoiceImagePreviewRef.current = null } setNewVoiceImagePreview(null) }} disabled={loading} startIcon={<DeleteIcon fontSize="small" />}>
                          Entfernen
                        </Button>
                      )}
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                    <Button size="small" variant="contained" onClick={handleCreateVoice} disabled={loading || transcribing || !newVoiceName.trim() || !refAudioFile || (!refText && !useXVectorOnly)}>
                      Create & Continue
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => { setVoiceCloneSubMode('select'); setNewVoiceName(''); setRefAudioFile(null); setRefText(''); setNewVoiceImageFile(null); if (newVoiceImagePreviewRef.current) { URL.revokeObjectURL(newVoiceImagePreviewRef.current); newVoiceImagePreviewRef.current = null } setNewVoiceImagePreview(null) }} disabled={loading || transcribing}>
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
              <Button
                size="small"
                variant="outlined"
                fullWidth
                onClick={() => setSpeakerSelectModalOpen(true)}
                disabled={loading}
                startIcon={<PersonIcon fontSize="small" />}
              >
                {speaker || 'Speaker auswählen…'}
              </Button>
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

      {/* Voice Clone selection modal */}
      <VoiceCardModal
        open={voiceSelectModalOpen}
        onClose={() => setVoiceSelectModalOpen(false)}
        title="Stimme auswählen"
        items={voices.map((v) => ({
          name: v.name,
          imageUrl: v.has_image ? `${ttsUrl}/voices/${encodeURIComponent(v.name)}/image` : undefined,
          subtitle: v.has_reference_audio ? undefined : '⚠ kein Audio',
        }))}
        selected={selectedVoice}
        onSelect={setSelectedVoice}
        ttsUrl={ttsUrl}
        manageImages
        onImagesChanged={() => setVoicesRefreshKey((k) => k + 1)}
      />

      {/* Custom Voice speaker selection modal */}
      <VoiceCardModal
        open={speakerSelectModalOpen}
        onClose={() => setSpeakerSelectModalOpen(false)}
        title="Speaker auswählen"
        items={SPEAKERS.map((s) => ({ name: s }))}
        selected={speaker}
        onSelect={setSpeaker}
      />
    </>
  )
}
