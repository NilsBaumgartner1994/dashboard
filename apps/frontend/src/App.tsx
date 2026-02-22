import { HashRouter, Routes, Route } from 'react-router-dom'
import { useMemo } from 'react'
import { createTheme, ThemeProvider, CssBaseline } from '@mui/material'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useStore } from './store/useStore'
import DrawerMenu from './components/DrawerMenu'
import StartScreen from './screens/StartScreen'
import DashboardScreen from './screens/DashboardScreen'
import SettingsScreen from './screens/SettingsScreen'

export default function App() {
  const themePref = useStore((s) => s.theme)
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)')

  const mode = useMemo(() => {
    if (themePref === 'auto') return prefersDark ? 'dark' : 'light'
    return themePref
  }, [themePref, prefersDark])

  const theme = useMemo(
    () => createTheme({ palette: { mode } }),
    [mode],
  )

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <HashRouter>
        <DrawerMenu />
        <Routes>
          <Route path="/" element={<StartScreen />} />
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
        </Routes>
      </HashRouter>
    </ThemeProvider>
  )
}
