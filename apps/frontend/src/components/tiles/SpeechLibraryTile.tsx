import { useEffect, useRef, useState } from 'react'
import { Alert, Box, Button, FormControlLabel, List, ListItem, ListItemButton, ListItemText, Stack, Switch, TextField, Typography } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import StopIcon from '@mui/icons-material/Stop'
import DeleteIcon from '@mui/icons-material/Delete'
import BaseTile from './BaseTile'
import RecordingAudioIndicator from './RecordingAudioIndicator'
import type { TileInstance } from '../../store/useStore'
import { useTileFlowStore } from '../../store/useTileFlowStore'

interface SavedSpeech {
  id: string
  name: string
  audioDataUrl: string
}

export default function SpeechLibraryTile({ tile }: { tile: TileInstance }) {
  const publishOutput = useTileFlowStore((s) => s.publishOutput)
  const [speechName, setSpeechName] = useState('Neue Aufnahme')
  const [autoOutputInput, setAutoOutputInput] = useState(
    tile.config?.autoOutputEnabled !== undefined ? (tile.config.autoOutputEnabled as boolean) : true,
  )
  const [recording, setRecording] = useState(false)
  const [saved, setSaved] = useState<SavedSpeech[]>([])
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const recordingStreamRef = useRef<MediaStream | null>(null)
  const recordingAudioContextRef = useRef<AudioContext | null>(null)
  const recordingAnalyserRef = useRef<AnalyserNode | null>(null)
  const recordingAnimationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`speech-library-${tile.id}`)
      setSaved(raw ? (JSON.parse(raw) as SavedSpeech[]) : [])
    } catch {
      setSaved([])
    }
  }, [tile.id])

  useEffect(() => {
    return () => {
      if (recordingAnimationFrameRef.current) cancelAnimationFrame(recordingAnimationFrameRef.current)
      if (recordingAudioContextRef.current) recordingAudioContextRef.current.close().catch(() => undefined)
      if (recordingStreamRef.current) recordingStreamRef.current.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const persist = (entries: SavedSpeech[]) => {
    setSaved(entries)
    try {
      localStorage.setItem(`speech-library-${tile.id}`, JSON.stringify(entries))
    } catch {
      // ignore persistence errors
    }
  }

  const startAudioLevelMonitor = (stream: MediaStream) => {
    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.85
    source.connect(analyser)

    recordingAudioContextRef.current = audioContext
    recordingAnalyserRef.current = analyser

    const dataArray = new Uint8Array(analyser.fftSize)
    const renderAudioLevel = () => {
      if (!recordingAnalyserRef.current) return
      recordingAnalyserRef.current.getByteTimeDomainData(dataArray)
      let sum = 0
      for (let i = 0; i < dataArray.length; i += 1) {
        const normalized = (dataArray[i] - 128) / 128
        sum += normalized * normalized
      }
      const rms = Math.sqrt(sum / dataArray.length)
      setAudioLevel(Math.min(1, rms * 5))
      recordingAnimationFrameRef.current = requestAnimationFrame(renderAudioLevel)
    }

    recordingAnimationFrameRef.current = requestAnimationFrame(renderAudioLevel)
  }

  const stopAudioLevelMonitor = () => {
    if (recordingAnimationFrameRef.current) {
      cancelAnimationFrame(recordingAnimationFrameRef.current)
      recordingAnimationFrameRef.current = null
    }
    if (recordingAudioContextRef.current) {
      recordingAudioContextRef.current.close().catch(() => undefined)
      recordingAudioContextRef.current = null
    }
    recordingAnalyserRef.current = null
    setAudioLevel(0)
  }

  const startRecording = async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordingStreamRef.current = stream

      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(String(reader.result || ''))
          reader.readAsDataURL(blob)
        })
        const entry: SavedSpeech = {
          id: `speech-${crypto.randomUUID()}`,
          name: speechName.trim() || 'Aufnahme',
          audioDataUrl: dataUrl,
        }
        persist([entry, ...saved])
        stream.getTracks().forEach((track) => track.stop())
        recordingStreamRef.current = null
        stopAudioLevelMonitor()
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecording(true)
      startAudioLevelMonitor(stream)
    } catch (err) {
      setError(`Mikrofon-Zugriff fehlgeschlagen: ${String(err)}`)
      setRecording(false)
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const autoOutputEnabled = tile.config?.autoOutputEnabled !== undefined ? (tile.config.autoOutputEnabled as boolean) : true

  const playAndSend = (entry: SavedSpeech) => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    audioRef.current.src = entry.audioDataUrl
    void audioRef.current.play()
    if (autoOutputEnabled) {
      publishOutput(tile.id, { content: entry.audioDataUrl, dataType: 'audio' })
    }
  }

  const startRename = (entry: SavedSpeech) => {
    setRenameId(entry.id)
    setRenameValue(entry.name)
  }

  const submitRename = () => {
    if (!renameId) return
    const nextName = renameValue.trim()
    if (!nextName) {
      setRenameId(null)
      setRenameValue('')
      return
    }
    persist(saved.map((entry) => (entry.id === renameId ? { ...entry, name: nextName } : entry)))
    setRenameId(null)
    setRenameValue('')
  }

  const deleteEntry = (entryId: string) => {
    persist(saved.filter((entry) => entry.id !== entryId))
    if (renameId === entryId) {
      setRenameId(null)
      setRenameValue('')
    }
  }

  return (
    <BaseTile
      tile={tile}
      onSettingsOpen={() => {
        setAutoOutputInput(tile.config?.autoOutputEnabled !== undefined ? (tile.config.autoOutputEnabled as boolean) : true)
      }}
      settingsChildren={(
        <FormControlLabel
          sx={{ mt: 1 }}
          control={<Switch checked={autoOutputInput} onChange={(e) => setAutoOutputInput(e.target.checked)} />}
          label="Auto-Output beim Abspielen senden"
        />
      )}
      getExtraConfig={() => ({ autoOutputEnabled: autoOutputInput })}
    >
      <Stack spacing={1}>
        <Typography variant="subtitle2" fontWeight={700}>Speech Aufnahme & Library</Typography>
        <TextField
          size="small"
          label="Name"
          value={speechName}
          onChange={(e) => setSpeechName(e.target.value)}
        />
        {error && <Alert severity="warning">{error}</Alert>}
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" startIcon={<FiberManualRecordIcon />} onClick={startRecording} disabled={recording}>Aufnehmen</Button>
          <Button size="small" variant="outlined" startIcon={<StopIcon />} onClick={stopRecording} disabled={!recording}>Stop</Button>
        </Stack>
        {recording && <RecordingAudioIndicator level={audioLevel} />}
        <List dense sx={{ maxHeight: 220, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          {saved.map((entry) => (
            <ListItem
              key={entry.id}
              disablePadding
              secondaryAction={(
                <Stack direction="row" spacing={0.5}>
                  <Button size="small" variant="contained" startIcon={<PlayArrowIcon />} onClick={() => playAndSend(entry)}>
                    Start
                  </Button>
                  <Button size="small" variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => deleteEntry(entry.id)}>
                    Löschen
                  </Button>
                </Stack>
              )}
            >
              {renameId === entry.id ? (
                <Box sx={{ width: '100%', py: 0.5, pr: 24 }}>
                  <TextField
                    size="small"
                    fullWidth
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={submitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename()
                      if (e.key === 'Escape') {
                        setRenameId(null)
                        setRenameValue('')
                      }
                    }}
                  />
                </Box>
              ) : (
                <ListItemButton onClick={() => startRename(entry)} sx={{ pr: 24 }}>
                  <ListItemText primary={entry.name} secondary="Zum Umbenennen antippen" />
                </ListItemButton>
              )}
            </ListItem>
          ))}
          {saved.length === 0 && <Box sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">Noch keine Aufnahmen.</Typography></Box>}
        </List>
      </Stack>
    </BaseTile>
  )
}
