import { useMemo, useRef, useState } from 'react'
import { Alert, Box, Button, Chip, Stack, TextField, Typography } from '@mui/material'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import GraphicEqIcon from '@mui/icons-material/GraphicEq'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import { pipeline } from '@xenova/transformers'

interface SpeechToTextTileProps {
  tile: TileInstance
}

type SpeechRecognitionResultItem = {
  transcript: string
}

type SpeechRecognitionResultListItem = {
  0: SpeechRecognitionResultItem
  isFinal: boolean
}

type SpeechRecognitionEventLike = Event & {
  resultIndex: number
  results: {
    [index: number]: SpeechRecognitionResultListItem
    length: number
  }
}

type SpeechRecognitionLike = EventTarget & {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: Event & { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionCtor
  webkitSpeechRecognition?: SpeechRecognitionCtor
}

type AsrResult = { text?: string }
type AsrTranscriber = (audio: string, options?: { chunk_length_s?: number; stride_length_s?: number }) => Promise<AsrResult>

let transcriberPromise: Promise<AsrTranscriber> | null = null

const getTranscriber = async (): Promise<AsrTranscriber> => {
  if (!transcriberPromise) {
    transcriberPromise = pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', {
      quantized: true,
    }) as Promise<AsrTranscriber>
  }

  return transcriberPromise
}

function getSpeechRecognitionCtor() {
  const browserWindow = window as WindowWithSpeechRecognition
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition
}

export default function SpeechToTextTile({ tile }: SpeechToTextTileProps) {
  const [interimText, setInterimText] = useState('')
  const [finalTexts, setFinalTexts] = useState<string[]>([])
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadProcessing, setUploadProcessing] = useState(false)
  const [languageInput, setLanguageInput] = useState((tile.config?.language as string) || 'de-DE')
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const shouldKeepListeningRef = useRef(false)

  const language = (tile.config?.language as string) || 'de-DE'

  const transcript = useMemo(() => finalTexts.join('\n'), [finalTexts])

  const stopListeningInternal = () => {
    shouldKeepListeningRef.current = false
    recognitionRef.current?.stop()
    setListening(false)
  }

  const handleStart = async () => {
    const SpeechRecognition = getSpeechRecognitionCtor()

    if (!SpeechRecognition) {
      setError('Dieser Browser unterstützt Speech-to-Text nicht (Safari benötigt iOS 14.5+).')
      return
    }

    if (!window.isSecureContext) {
      setError('Speech-to-Text funktioniert nur über HTTPS oder auf localhost.')
      return
    }

    if (!recognitionRef.current) {
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognitionRef.current = recognition
    }

    const recognition = recognitionRef.current
    recognition.lang = language

    recognition.onresult = (event) => {
      let latestInterim = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        const text = result[0]?.transcript?.trim() ?? ''
        if (!text) continue

        if (result.isFinal) {
          setFinalTexts((prev) => [text, ...prev])
          latestInterim = ''
        } else {
          latestInterim = text
        }
      }

      setInterimText(latestInterim)
    }

    recognition.onerror = (event) => {
      const normalizedError = event.error ?? 'unknown'
      if (normalizedError === 'no-speech') return
      shouldKeepListeningRef.current = false
      setListening(false)
      setError(
        normalizedError === 'not-allowed'
          ? 'Mikrofonzugriff verweigert. Bitte in Safari erlauben.'
          : `Speech-to-Text Fehler: ${normalizedError}`,
      )
    }

    recognition.onend = () => {
      if (!shouldKeepListeningRef.current) {
        setListening(false)
        return
      }

      try {
        recognition.start()
      } catch {
        // Safari/iOS can throw when restarting too quickly after pause.
      }
    }

    try {
      setError(null)
      shouldKeepListeningRef.current = true
      recognition.start()
      setListening(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Start fehlgeschlagen.'
      shouldKeepListeningRef.current = false
      setListening(false)
      setError(message)
    }
  }

  const handleStop = () => {
    stopListeningInternal()
  }

  const handleCopy = async () => {
    if (!transcript) return
    try {
      await navigator.clipboard.writeText(transcript)
    } catch {
      setError('Konnte den Text nicht in die Zwischenablage kopieren.')
    }
  }

  const handleUploadedAudioTranscription = async () => {
    if (!uploadFile) return

    setUploadProcessing(true)
    setError(null)

    try {
      const objectUrl = URL.createObjectURL(uploadFile)
      const transcriber = await getTranscriber()
      const result = await transcriber(objectUrl, { chunk_length_s: 20, stride_length_s: 4 })
      URL.revokeObjectURL(objectUrl)

      const text = result.text?.trim()
      if (!text) {
        setError('Die Datei konnte nicht transkribiert werden.')
        return
      }

      setFinalTexts((prev) => [text, ...prev])
      setInterimText('')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transkription fehlgeschlagen.'
      setError(message)
    } finally {
      setUploadProcessing(false)
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

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button component="label" variant="outlined" size="small" startIcon={<UploadFileIcon />} disabled={uploadProcessing}>
            Audio auswählen
            <input
              hidden
              type="file"
              accept="audio/mpeg,audio/mp3,audio/*"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
            />
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<GraphicEqIcon />}
            disabled={!uploadFile || uploadProcessing}
            onClick={handleUploadedAudioTranscription}
          >
            {uploadProcessing ? 'Wandle um…' : 'MP3 umwandeln'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {uploadFile ? uploadFile.name : 'Keine Datei ausgewählt'}
          </Typography>
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
