import {
  Box,
  Typography,
  ToggleButton,
  ToggleButtonGroup,
  Paper,
} from '@mui/material'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto'
import { useStore } from '../store/useStore'

export default function SettingsScreen() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)

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
    </Box>
  )
}
