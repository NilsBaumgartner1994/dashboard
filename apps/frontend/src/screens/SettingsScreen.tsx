import { useState, useRef } from 'react'
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  TextField,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto'
import SearchIcon from '@mui/icons-material/Search'
import DownloadIcon from '@mui/icons-material/Download'
import UploadIcon from '@mui/icons-material/Upload'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import { useStore } from '../store/useStore'
import { useGoogleAuthStore } from '../store/useGoogleAuthStore'

export default function SettingsScreen() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const gridColumns = useStore((s) => s.gridColumns)
  const setGridColumns = useStore((s) => s.setGridColumns)
  const defaultLat = useStore((s) => s.defaultLat)
  const defaultLon = useStore((s) => s.defaultLon)
  const defaultLocationName = useStore((s) => s.defaultLocationName)
  const setDefaultLocation = useStore((s) => s.setDefaultLocation)
  const setTiles = useStore((s) => s.setTiles)
  const { clientId, setClientId, clearToken } = useGoogleAuthStore()
  const [clientIdInput, setClientIdInput] = useState(clientId)
  const [gridColumnsInput, setGridColumnsInput] = useState(String(gridColumns))
  const [locationInput, setLocationInput] = useState(defaultLocationName ?? '')
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)

  // Export / Import state
  const [copied, setCopied] = useState(false)
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSaveGridColumns = () => {
    const parsed = parseInt(gridColumnsInput, 10)
    if (!isNaN(parsed) && parsed >= 1) {
      setGridColumns(parsed)
    }
  }

  const handleGeocode = async () => {
    if (!locationInput.trim()) return
    setGeocodeLoading(true)
    setGeocodeError(null)
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationInput.trim())}&count=1&language=de&format=json`,
      )
      const data = await res.json()
      if (data.results?.length) {
        setDefaultLocation(data.results[0].latitude, data.results[0].longitude, data.results[0].name)
        setLocationInput(data.results[0].name)
        setGeocodeError(null)
      } else {
        setGeocodeError('Ort nicht gefunden')
      }
    } catch {
      setGeocodeError('Geocodierung fehlgeschlagen')
    } finally {
      setGeocodeLoading(false)
    }
  }

  // ── Export helpers ──────────────────────────────────────────────────────

  const buildExportData = () => ({
    exportedAt: new Date().toISOString(),
    store: {
      theme,
      tiles: useStore.getState().tiles,
      gridColumns: useStore.getState().gridColumns,
      defaultLat: useStore.getState().defaultLat,
      defaultLon: useStore.getState().defaultLon,
      defaultLocationName: useStore.getState().defaultLocationName,
    },
    googleAuth: {
      clientId: useGoogleAuthStore.getState().clientId,
    },
  })

  const handleCopyExport = () => {
    const json = JSON.stringify(buildExportData(), null, 2)
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      setImportError('Kopieren fehlgeschlagen – bitte manuell kopieren.')
    })
  }

  const handleDownloadExport = () => {
    const json = JSON.stringify(buildExportData(), null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dashboard-settings-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Import helpers ──────────────────────────────────────────────────────

  const applyImport = (json: string) => {
    setImportError(null)
    setImportSuccess(false)
    try {
      const data = JSON.parse(json)
      if (!data.store) throw new Error('Ungültiges Format: "store" fehlt')
      const s = data.store
      if (s.theme) setTheme(s.theme)
      if (Array.isArray(s.tiles)) setTiles(s.tiles)
      if (typeof s.gridColumns === 'number') setGridColumns(s.gridColumns)
      if (typeof s.defaultLat === 'number' && typeof s.defaultLon === 'number') {
        setDefaultLocation(s.defaultLat, s.defaultLon, s.defaultLocationName ?? '')
      }
      if (data.googleAuth?.clientId) {
        setClientId(data.googleAuth.clientId)
        setClientIdInput(data.googleAuth.clientId)
      }
      setImportSuccess(true)
      setImportJson('')
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleImportPaste = () => applyImport(importJson)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      applyImport(ev.target?.result as string)
    }
    reader.readAsText(file)
    // reset so same file can be re-selected
    e.target.value = ''
  }

  return (
    <Box sx={{ p: 4, pt: 8 }}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>
      <Paper sx={{ p: 3, maxWidth: 400 }}>
        <Typography variant="subtitle1" gutterBottom>
          Theme
        </Typography>
        <ToggleButtonGroup
          value={theme}
          exclusive
          onChange={(_, val) => val && setTheme(val)}
          aria-label="theme selector"
        >
          <ToggleButton value="light" aria-label="light mode">
            <LightModeIcon sx={{ mr: 1 }} /> Light
          </ToggleButton>
          <ToggleButton value="dark" aria-label="dark mode">
            <DarkModeIcon sx={{ mr: 1 }} /> Dark
          </ToggleButton>
          <ToggleButton value="auto" aria-label="auto mode">
            <BrightnessAutoIcon sx={{ mr: 1 }} /> Auto
          </ToggleButton>
        </ToggleButtonGroup>
      </Paper>

      <Paper sx={{ p: 3, maxWidth: 400, mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Standard-Standort
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Dieser Standort wird als Standard für Wetter- und Routenkacheln genutzt.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
          <TextField
            fullWidth
            label="Ort / Stadt"
            placeholder="z.B. Berlin"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleGeocode() }}
            size="small"
          />
          <Button
            variant="outlined"
            onClick={handleGeocode}
            disabled={geocodeLoading || !locationInput.trim()}
            startIcon={geocodeLoading ? <CircularProgress size={14} /> : <SearchIcon />}
            sx={{ whiteSpace: 'nowrap', minWidth: 100 }}
          >
            Suchen
          </Button>
        </Box>
        {geocodeError && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
            {geocodeError}
          </Typography>
        )}
        {defaultLat !== undefined && defaultLon !== undefined && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            ✓ {defaultLocationName} ({defaultLat.toFixed(3)}, {defaultLon.toFixed(3)})
          </Typography>
        )}
      </Paper>

      <Paper sx={{ p: 3, maxWidth: 400, mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Dashboard Breiten-Begrenzung (Spalten)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Legt die maximale Anzahl an Rasterspalten fest (z. B. 32 = volle Breite). Kacheln können
          nicht breiter als dieser Wert sein.
        </Typography>
        <TextField
          fullWidth
          label="Anzahl Spalten"
          value={gridColumnsInput}
          onChange={(e) => setGridColumnsInput(e.target.value)}
          type="number"
          inputProps={{ min: 1 }}
          sx={{ mb: 2 }}
        />
        <Button variant="contained" onClick={handleSaveGridColumns}>
          Speichern
        </Button>
      </Paper>

      <Paper sx={{ p: 3, maxWidth: 400, mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Google Kalender – OAuth Client-ID
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Trage hier deine Google OAuth 2.0 Client-ID ein. Sie wird von allen Google Kalender Kacheln
          gemeinsam genutzt.
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Beim Erstellen der Credentials in der{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Cloud Console
          </a>{' '}
          (Typ: <em>Webanwendung</em>) trage folgende Werte ein:
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          <strong>Autorisierte JavaScript-Quellen:</strong>
          <br />
          <code>{window.location.origin}</code>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          <strong>Autorisierte Weiterleitungs-URIs:</strong>
          <br />
          <code>{window.location.origin + window.location.pathname}</code>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Außerdem muss die{' '}
          <a
            href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Calendar API
          </a>{' '}
          aktiviert sein. Im{' '}
          <a
            href="https://console.cloud.google.com/apis/credentials/consent"
            target="_blank"
            rel="noopener noreferrer"
          >
            OAuth-Consent-Screen
          </a>{' '}
          muss der folgende Scope hinzugefügt werden:
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          <code>https://www.googleapis.com/auth/calendar.readonly</code>
        </Typography>
        <TextField
          fullWidth
          label="Google OAuth Client-ID"
          placeholder="xxxx.apps.googleusercontent.com"
          value={clientIdInput}
          onChange={(e) => setClientIdInput(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            onClick={() => {
              setClientId(clientIdInput.trim())
              clearToken()
            }}
          >
            Speichern
          </Button>
          {clientId && (
            <Button
              variant="outlined"
              color="error"
              onClick={() => {
                clearToken()
              }}
            >
              Abmelden
            </Button>
          )}
        </Box>
      </Paper>

      {/* ── Export / Import ──────────────────────────────────────────────── */}
      <Paper sx={{ p: 3, maxWidth: 400, mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Einstellungen exportieren
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Exportiere alle Einstellungen (Kacheln, Layout, Standort, Google Client-ID) als JSON, um
          sie auf einem anderen Gerät zu importieren. Das Zugriffstoken wird nicht exportiert.
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={copied ? <CheckIcon /> : <ContentCopyIcon />}
            onClick={handleCopyExport}
            color={copied ? 'success' : 'primary'}
          >
            {copied ? 'Kopiert!' : 'Als Text kopieren'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadExport}
          >
            JSON herunterladen
          </Button>
        </Box>
      </Paper>

      <Paper sx={{ p: 3, maxWidth: 400, mt: 3 }}>
        <Typography variant="subtitle1" gutterBottom>
          Einstellungen importieren
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Importiere Einstellungen aus einer JSON-Datei oder füge den JSON-Text direkt ein.
        </Typography>
        {importError && (
          <Alert severity="error" sx={{ mb: 2 }}>{importError}</Alert>
        )}
        {importSuccess && (
          <Alert severity="success" sx={{ mb: 2 }}>Einstellungen erfolgreich importiert!</Alert>
        )}
        <TextField
          fullWidth
          multiline
          minRows={4}
          maxRows={10}
          label="JSON einfügen"
          placeholder='{"exportedAt": "...", "store": {...}, ...}'
          value={importJson}
          onChange={(e) => { setImportJson(e.target.value); setImportError(null); setImportSuccess(false) }}
          sx={{ mb: 1.5 }}
        />
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<UploadIcon />}
            onClick={handleImportPaste}
            disabled={!importJson.trim()}
          >
            JSON importieren
          </Button>
          <Button
            variant="outlined"
            component="label"
            startIcon={<UploadIcon />}
          >
            Datei auswählen
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={handleFileSelect}
            />
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
