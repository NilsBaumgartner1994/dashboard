import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Typography,
  Box,
  Chip,
  MenuItem,
  TextField,
  Divider,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'

export interface ServerConfig {
  serverPreset?: string
  serverUrl?: string
  customName?: string
  checkInterval?: number // seconds
  backgroundImage?: string
  name?: string
  hideName?: boolean
  hideLastUpdate?: boolean
}

export const SERVER_PRESETS: Record<string, { label: string; url: string }> = {
  test: { label: 'test', url: 'https://test.rocket-meals.de/rocket-meals/api' },
  swosy: { label: 'swosy', url: 'https://swosy.rocket-meals.de/rocket-meals/api' },
  'studi-futter': {
    label: 'studi-futter',
    url: 'https://studi-futter.rocket-meals.de/rocket-meals/api',
  },
  custom: { label: 'Custom', url: '' },
}

type ServerStatus = 'online' | 'offline' | 'unknown' | 'checking'

function formatCheckedDate(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const mon = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = String(date.getFullYear())
  return `${hh}:${mm} ${dd}.${mon}.${yyyy}`
}

/** Resolved server URL from config (preset or custom). */
export function resolveServerUrl(cfg: ServerConfig): string {
  if (cfg.serverPreset && cfg.serverPreset !== 'custom') {
    return SERVER_PRESETS[cfg.serverPreset]?.url ?? ''
  }
  return cfg.serverUrl ?? ''
}

interface ServerTileProps {
  tile: TileInstance
  /** Override the display name (used by RocketMealsTile to supply project_name) */
  overrideName?: string
  /** Override background image (auto-resolved from API when config backgroundImage is empty) */
  overrideBackgroundImage?: string
  /** Extra settings content rendered below the server-specific settings */
  extraSettingsChildren?: React.ReactNode
  /** Returns extra config fields to merge from child tile (e.g. RocketMealsTile) */
  getChildExtraConfig?: () => Record<string, unknown>
  /** Called when settings modal opens (for subclass to re-sync inputs) */
  onExtraSettingsOpen?: () => void
  /** When true, the status chip is pinned to the bottom of the tile */
  statusAtBottom?: boolean
}

export default function ServerTile({
  tile,
  overrideName,
  overrideBackgroundImage,
  extraSettingsChildren,
  getChildExtraConfig,
  onExtraSettingsOpen,
  statusAtBottom,
}: ServerTileProps) {
  const config = (tile.config ?? {}) as ServerConfig

  const serverUrl = resolveServerUrl(config)
  const displayName =
    overrideName ||
    (config.customName ?? '') ||
    (config.name ?? '') ||
    (config.serverPreset && config.serverPreset !== 'custom'
      ? SERVER_PRESETS[config.serverPreset]?.label ?? ''
      : '') ||
    serverUrl

  const checkInterval = config.checkInterval ?? 60

  const hideName = config.hideName ?? false
  const hideLastUpdate = config.hideLastUpdate ?? false

  // Settings form state
  const [presetInput, setPresetInput] = useState(config.serverPreset ?? 'custom')
  const [urlInput, setUrlInput] = useState(config.serverUrl ?? '')
  const [nameInput, setNameInput] = useState(config.customName ?? '')
  const [intervalInput, setIntervalInput] = useState(String(checkInterval))

  // Status state
  const [status, setStatus] = useState<ServerStatus>('unknown')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkServer = useCallback(async () => {
    if (!serverUrl) return
    setStatus('checking')
    try {
      await fetch(serverUrl, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: AbortSignal.timeout(5000),
      })
      setStatus('online')
    } catch {
      setStatus('offline')
    }
    setLastChecked(new Date())
  }, [serverUrl])

  useEffect(() => {
    checkServer()
    const ms = Math.max(10, checkInterval) * 1000
    timerRef.current = setInterval(checkServer, ms)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [checkServer, checkInterval])

  const handleSettingsOpen = () => {
    setPresetInput(config.serverPreset ?? 'custom')
    setUrlInput(config.serverUrl ?? '')
    setNameInput(config.customName ?? '')
    setIntervalInput(String(config.checkInterval ?? 60))
    onExtraSettingsOpen?.()
  }

  const getServerExtraConfig = (): Record<string, unknown> => {
    const resolvedPreset = presetInput in SERVER_PRESETS ? presetInput : 'custom'
    return {
      serverPreset: resolvedPreset,
      serverUrl: resolvedPreset === 'custom' ? urlInput : SERVER_PRESETS[resolvedPreset].url,
      customName: nameInput,
      checkInterval: Math.max(10, Number(intervalInput) || 60),
      ...(getChildExtraConfig?.() ?? {}),
    }
  }

  const statusColor: 'success' | 'error' | 'default' =
    status === 'online' ? 'success' : status === 'offline' ? 'error' : 'default'
  const statusLabel =
    status === 'checking'
      ? 'Prüfe…'
      : status === 'online'
        ? 'Online'
        : status === 'offline'
          ? 'Offline'
          : 'Unbekannt'

  // Whether a background image is displayed (config value or override)
  const hasBgImage = !!(config.backgroundImage || overrideBackgroundImage)

  const statusChip = (
    <Chip
      size="small"
      label={statusLabel}
      color={statusColor}
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
  )

  const settingsContent = (
    <>
      <Divider sx={{ mb: 2 }}>Server</Divider>
      <TextField
        select
        fullWidth
        label="Server"
        value={presetInput}
        onChange={(e) => setPresetInput(e.target.value)}
        sx={{ mb: 2 }}
      >
        {Object.entries(SERVER_PRESETS).map(([key, { label }]) => (
          <MenuItem key={key} value={key}>
            {label}
          </MenuItem>
        ))}
      </TextField>
      {presetInput === 'custom' && (
        <TextField
          fullWidth
          label="Server URL"
          placeholder="https://my-server.example.com"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          sx={{ mb: 2 }}
        />
      )}
      <TextField
        fullWidth
        label="Anzeigename (optional)"
        value={nameInput}
        onChange={(e) => setNameInput(e.target.value)}
        sx={{ mb: 2 }}
      />
      <TextField
        fullWidth
        label="Prüfintervall (Sekunden)"
        type="number"
        inputProps={{ min: 10 }}
        value={intervalInput}
        onChange={(e) => setIntervalInput(e.target.value)}
        sx={{ mb: 2 }}
      />
      {extraSettingsChildren}
    </>
  )

  return (
    <BaseTile
      tile={tile}
      settingsChildren={settingsContent}
      getExtraConfig={getServerExtraConfig}
      onSettingsOpen={handleSettingsOpen}
      overrideBackgroundImage={overrideBackgroundImage}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Name */}
        {!hideName && displayName ? (
          <Box
            sx={{
              display: 'inline-block',
              backgroundColor: 'rgba(0,0,0,0.55)',
              borderRadius: 1,
              px: 1,
              py: 0.25,
              mb: 1,
              maxWidth: 'calc(100% - 32px)',
            }}
          >
            <Typography
              variant="subtitle2"
              fontWeight="bold"
              sx={{ color: '#fff', wordBreak: 'break-word' }}
            >
              {displayName}
            </Typography>
          </Box>
        ) : null}

        {/* Last checked */}
        {!hideLastUpdate && lastChecked && (
          hasBgImage ? (
            <Box
              sx={{
                display: 'inline-block',
                backgroundColor: 'rgba(0,0,0,0.55)',
                borderRadius: 1,
                px: 1,
                py: 0.25,
                mb: 0.5,
              }}
            >
              <Typography variant="caption" sx={{ color: '#fff', display: 'block' }}>
                {formatCheckedDate(lastChecked)}
              </Typography>
            </Box>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              {formatCheckedDate(lastChecked)}
            </Typography>
          )
        )}

        {!serverUrl && (
          <Typography variant="caption" color="text.secondary">
            Kein Server konfiguriert. ⚙ drücken.
          </Typography>
        )}

        {/* Status chip – bottom or inline */}
        <Box sx={statusAtBottom ? { mt: 'auto', pb: 0.5 } : { mt: 0.5 }}>
          {statusChip}
        </Box>
      </Box>
    </BaseTile>
  )
}
