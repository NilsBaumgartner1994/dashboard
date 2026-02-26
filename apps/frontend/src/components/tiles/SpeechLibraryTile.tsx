import { useEffect, useRef, useState } from 'react'
import { Box, Button, List, ListItem, ListItemText, Stack, TextField, Typography } from '@mui/material'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import StopIcon from '@mui/icons-material/Stop'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import { useTileFlowStore } from '../../store/useTileFlowStore'

interface SavedSpeech {
  id: string
  name: string
  audioDataUrl: string
  createdAt: number
}

export default function SpeechLibraryTile({ tile }: { tile: TileInstance }) {
  const publishOutput = useTileFlowStore((s) => s.publishOutput)
  const [speechName, setSpeechName] = useState('Neue Aufnahme')
  const [recording, setRecording] = useState(false)
  const [saved, setSaved] = useState<SavedSpeech[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`speech-library-${tile.id}`)
      setSaved(raw ? (JSON.parse(raw) as SavedSpeech[]) : [])
    } catch {
      setSaved([])
    }
  }, [tile.id])

  const persist = (entries: SavedSpeech[]) => {
    setSaved(entries)
    try {
      localStorage.setItem(`speech-library-${tile.id}`, JSON.stringify(entries))
    } catch {
      // ignore persistence errors
    }
  }

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
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
        createdAt: Date.now(),
      }
      persist([entry, ...saved])
      stream.getTracks().forEach((track) => track.stop())
    }
    mediaRecorderRef.current = recorder
    recorder.start()
    setRecording(true)
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const playAndSend = (entry: SavedSpeech) => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }
    audioRef.current.src = entry.audioDataUrl
    void audioRef.current.play()
    publishOutput(tile.id, { content: entry.audioDataUrl, dataType: 'audio' })
  }

  return (
    <BaseTile tile={tile}>
      <Stack spacing={1}>
        <Typography variant="subtitle2" fontWeight={700}>Speech Aufnahme & Library</Typography>
        <TextField
          size="small"
          label="Name"
          value={speechName}
          onChange={(e) => setSpeechName(e.target.value)}
        />
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="contained" startIcon={<FiberManualRecordIcon />} onClick={startRecording} disabled={recording}>Aufnehmen</Button>
          <Button size="small" variant="outlined" startIcon={<StopIcon />} onClick={stopRecording} disabled={!recording}>Stop</Button>
        </Stack>
        <List dense sx={{ maxHeight: 200, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          {saved.map((entry) => (
            <ListItem key={entry.id} secondaryAction={<Button size="small" startIcon={<PlayArrowIcon />} onClick={() => playAndSend(entry)}>Abspielen</Button>}>
              <ListItemText primary={entry.name} secondary={new Date(entry.createdAt).toLocaleString()} />
            </ListItem>
          ))}
          {saved.length === 0 && <Box sx={{ p: 1.5 }}><Typography variant="caption" color="text.secondary">Noch keine Aufnahmen.</Typography></Box>}
        </List>
      </Stack>
    </BaseTile>
  )
}
