import { useState } from 'react'
import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
  TextField,
  Button,
} from '@mui/material'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto'
import { useStore } from '../store/useStore'
import { useGoogleAuthStore } from '../store/useGoogleAuthStore'

export default function SettingsScreen() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)
  const { clientId, setClientId, clearToken } = useGoogleAuthStore()
  const [clientIdInput, setClientIdInput] = useState(clientId)

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
          Google Kalender – OAuth Client-ID
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Trage hier deine Google OAuth 2.0 Client-ID ein. Sie wird von allen Google Kalender Kacheln
          gemeinsam genutzt.
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
