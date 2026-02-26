import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import SpeechToText from 'speech-to-text'

interface SpeechToTextTileProps {
  tile: TileInstance
}

type SpeechListener = {
  startListening: () => void
  stopListening: () => void
}

export default function SpeechToTextTile({ tile }: SpeechToTextTileProps) {
  const [interimText, setInterimText] = useState('')
  const [finalTexts, setFinalTexts] = useState<string[]>([])
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listenerRef = useRef<SpeechListener | null>(null)
  const [languageInput, setLanguageInput] = useState((tile.config?.language as string) || 'de-DE')

  const language = (tile.config?.language as string) || 'de-DE'

  useEffect(() => {
    const onFinalised = (text: string) => {
      if (!text.trim()) return
      setFinalTexts((prev) => [text, ...prev])
      setInterimText('')
    }

    const onEndEvent = () => {
      if (listening) listenerRef.current?.startListening()
    }

    const onAnythingSaid = (text: string) => {
      setInterimText(text)
    }

    try {
      listenerRef.current = new SpeechToText(onFinalised, onEndEvent, onAnythingSaid, language) as SpeechListener
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Speech-to-text konnte nicht initialisiert werden.'
      setError(message)
    }

    return () => {
      listenerRef.current?.stopListening()
      listenerRef.current = null
    }
  }, [language, listening])

  const transcript = useMemo(() => finalTexts.join('\n'), [finalTexts])

  const handleStart = () => {
    try {
      listenerRef.current?.startListening()
      setListening(true)
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Start fehlgeschlagen.'
      setError(message)
    }
  }

  const handleStop = () => {
    listenerRef.current?.stopListening()
    setListening(false)
  }

  const handleCopy = async () => {
    if (!transcript) return
    try {
      await navigator.clipboard.writeText(transcript)
    } catch {
      setError('Konnte den Text nicht in die Zwischenablage kopieren.')
    }
  }

  return (
    <BaseTile
      tile={tile}
      onSettingsOpen={() => setLanguageInput(language)}
      settingsChildren={
        <TextField
          fullWidth
          label="Sprache"
          helperText="BCP-47 Sprachcode, z. B. de-DE oder en-US"
          value={languageInput}
          onChange={(e) => setLanguageInput(e.target.value)}
          sx={{ mt: 1 }}
        />
      }
      getExtraConfig={() => ({ language: languageInput || 'de-DE' })}
    >
      <Stack spacing={1.2}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight={700}>Speech to Text</Typography>
          <Chip color={listening ? 'success' : 'default'} size="small" label={listening ? 'Hört zu' : 'Gestoppt'} />
        </Box>

        {error && <Alert severity="warning">{error}</Alert>}

        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<MicIcon />}
            onClick={handleStart}
            disabled={listening || !!error}
          >
            Start
          </Button>
          <Button
            variant="outlined"
            size="small"
            color="inherit"
            startIcon={<StopIcon />}
            onClick={handleStop}
            disabled={!listening}
          >
            Stop
          </Button>
          <Button
            variant="text"
            size="small"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopy}
            disabled={!transcript}
          >
            Kopieren
          </Button>
          <Button
            variant="text"
            size="small"
            startIcon={<DeleteSweepIcon />}
            onClick={() => {
              setFinalTexts([])
              setInterimText('')
            }}
            disabled={!transcript && !interimText}
          >
            Leeren
          </Button>
        </Stack>

        <TextField
          label="Zwischenergebnis"
          size="small"
          multiline
          minRows={2}
          value={interimText}
          InputProps={{ readOnly: true }}
        />

        <TextField
          label="Finales Transkript"
          size="small"
          multiline
          minRows={4}
          value={transcript}
          InputProps={{ readOnly: true }}
          placeholder="Final erkannter Text erscheint hier…"
        />
      </Stack>
    </BaseTile>
  )
}
