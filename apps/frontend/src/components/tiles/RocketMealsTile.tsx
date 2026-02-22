import { useState, useEffect, useCallback } from 'react'
import {
  Typography,
  Box,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Chip,
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import RefreshIcon from '@mui/icons-material/Refresh'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'

interface RocketMealsConfig {
  serverUrl?: string
}

interface RocketMealsTileProps {
  tile: TileInstance
}

type ServerStatus = 'online' | 'offline' | 'unknown' | 'checking'

export default function RocketMealsTile({ tile }: RocketMealsTileProps) {
  const updateTile = useStore((s) => s.updateTile)
  const config = (tile.config ?? {}) as RocketMealsConfig

  const [configOpen, setConfigOpen] = useState(false)
  const [urlInput, setUrlInput] = useState(config.serverUrl ?? '')
  const [status, setStatus] = useState<ServerStatus>('unknown')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const checkServer = useCallback(async () => {
    if (!config.serverUrl) return
    setStatus('checking')
    try {
      // `no-cors` mode lets us detect unreachable servers (network errors/timeouts)
      // while avoiding CORS restrictions. A resolved opaque response means the server
      // is reachable; a thrown error means it is not.
      await fetch(config.serverUrl, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: AbortSignal.timeout(5000),
      })
      setStatus('online')
    } catch {
      setStatus('offline')
    }
    setLastChecked(new Date())
  }, [config.serverUrl])

  useEffect(() => {
    checkServer()
    const interval = setInterval(checkServer, 60_000)
    return () => clearInterval(interval)
  }, [checkServer])

  const handleSave = () => {
    updateTile(tile.id, { config: { ...config, serverUrl: urlInput } })
    setConfigOpen(false)
  }

  const handleOpenConfig = () => {
    setUrlInput(config.serverUrl ?? '')
    setConfigOpen(true)
  }

  const statusColor =
    status === 'online' ? 'success' : status === 'offline' ? 'error' : 'default'
  const statusLabel =
    status === 'checking'
      ? 'Checking…'
      : status === 'online'
        ? 'Online'
        : status === 'offline'
          ? 'Offline'
          : 'Unknown'

  const isValidUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'https:'
    } catch {
      return false
    }
  }

  return (
    <BaseTile tile={tile}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle1" fontWeight="bold">
          🚀 Rocket Meals
        </Typography>
        <Box>
          {config.serverUrl && (
            <Tooltip title="Refresh">
              <span>
                <IconButton
                  size="small"
                  onClick={checkServer}
                  disabled={status === 'checking'}
                >
                  <RefreshIcon fontSize="inherit" />
                </IconButton>
              </span>
            </Tooltip>
          )}
          <Tooltip title="Configure server">
            <IconButton size="small" onClick={handleOpenConfig}>
              <SettingsIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {config.serverUrl ? (
        <Box sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
            {config.serverUrl}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Chip
              size="small"
              label={statusLabel}
              color={statusColor as 'success' | 'error' | 'default'}
              icon={
                status === 'online' ? (
                  <CheckCircleIcon />
                ) : status === 'offline' ? (
                  <ErrorIcon />
                ) : (
                  <HelpOutlineIcon />
                )
              }
            />
          </Box>
          {lastChecked && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Last checked: {lastChecked.toLocaleTimeString()}
            </Typography>
          )}
        </Box>
      ) : (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          No server configured. Click ⚙ to set up.
        </Typography>
      )}

      <Dialog open={configOpen} onClose={() => setConfigOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Configure Rocket Meals Server</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Server URL"
            placeholder="https://your-server.rocket-meals.de"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            sx={{ mt: 1 }}
            helperText="Enter the URL of your Rocket Meals server (starting with https://)"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={!isValidUrl(urlInput)}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </BaseTile>
  )
}
