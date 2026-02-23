import { useState } from 'react'
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  TextField,
  Button,
  CircularProgress,
} from '@mui/material'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto'
import SearchIcon from '@mui/icons-material/Search'
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
  const { clientId, setClientId, clearToken } = useGoogleAuthStore()
  const [clientIdInput, setClientIdInput] = useState(clientId)
  const [gridColumnsInput, setGridColumnsInput] = useState(String(gridColumns))
  const [locationInput, setLocationInput] = useState(defaultLocationName ?? '')
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)

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
    </Box>
  )
}
