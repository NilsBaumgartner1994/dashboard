import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Typography,
  FormControlLabel,
  Switch,
  Box,
  Chip,
  Divider,
  FormGroup,
  Checkbox,
} from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'
import ServerTile, { resolveServerUrl, SERVER_PRESETS } from './ServerTile'
import type { ServerConfig } from './ServerTile'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'

interface ProjectInfo {
  project_name: string | null
  project_logo: string | null
}

interface RocketMealsConfig extends ServerConfig {
  multiServer?: boolean
  /** Preset keys to monitor. Empty array means "all" presets. */
  selectedServers?: string[]
}

interface RocketMealsTileProps {
  tile: TileInstance
}

/** All preset keys that can be monitored in multi-server mode (excludes 'custom'). */
const MONITORABLE_PRESETS = Object.entries(SERVER_PRESETS)
  .filter(([key]) => key !== 'custom')
  .map(([key, { label, url }]) => ({ key, label, url }))

type ServerStatus = 'online' | 'offline' | 'unknown' | 'checking'

/** Multi-server status display used when multiServer mode is active. */
function MultiServerView({
  tile,
  selectedServers,
  settingsContent,
  getExtraConfig,
  onSettingsOpen,
}: {
  tile: TileInstance
  selectedServers: string[]
  settingsContent: React.ReactNode
  getExtraConfig: () => Record<string, unknown>
  onSettingsOpen: () => void
}) {
  const config = (tile.config ?? {}) as RocketMealsConfig
  const checkInterval = config.checkInterval ?? 60

  const serversToCheck =
    selectedServers.length === 0
      ? MONITORABLE_PRESETS
      : MONITORABLE_PRESETS.filter((p) => selectedServers.includes(p.key))

  const [statuses, setStatuses] = useState<Record<string, ServerStatus>>({})
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkAll = useCallback(async () => {
    setStatuses((prev) => {
      const next: Record<string, ServerStatus> = {}
      for (const { key } of serversToCheck) next[key] = prev[key] ?? 'checking'
      return next
    })
    await Promise.all(
      serversToCheck.map(async ({ key, url }) => {
        try {
          await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: AbortSignal.timeout(5000) })
          setStatuses((prev) => ({ ...prev, [key]: 'online' }))
        } catch {
          setStatuses((prev) => ({ ...prev, [key]: 'offline' }))
        }
      }),
    )
  }, [serversToCheck])

  useEffect(() => {
    checkAll()
    const ms = Math.max(10, checkInterval) * 1000
    timerRef.current = setInterval(checkAll, ms)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [checkAll, checkInterval])

  const offlineKeys = serversToCheck
    .map((p) => p.key)
    .filter((k) => statuses[k] === 'offline')
  const checkingAny = serversToCheck.some((p) => statuses[p.key] === 'checking' || statuses[p.key] === 'unknown')
  const allOnline = !checkingAny && offlineKeys.length === 0 && serversToCheck.length > 0

  return (
    <BaseTile
      tile={tile}
      settingsChildren={settingsContent}
      getExtraConfig={getExtraConfig}
      onSettingsOpen={onSettingsOpen}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {allOnline ? (
          <Chip
            size="small"
            color="success"
            icon={<CheckCircleIcon />}
            label="Alle Server erreichbar"
            sx={{ mt: 'auto' }}
          />
        ) : offlineKeys.length > 0 ? (
          <Box sx={{ mt: 'auto' }}>
            <Chip
              size="small"
              color="error"
              icon={<ErrorIcon />}
              label="Nicht erreichbar:"
              sx={{ mb: 0.5 }}
            />
            {offlineKeys.map((k) => (
              <Typography key={k} variant="caption" color="error" sx={{ display: 'block', ml: 0.5 }}>
                • {MONITORABLE_PRESETS.find((p) => p.key === k)?.label ?? k}
              </Typography>
            ))}
          </Box>
        ) : (
          <Chip
            size="small"
            color="default"
            icon={<HelpOutlineIcon />}
            label="Prüfe…"
            sx={{ mt: 'auto' }}
          />
        )}
      </Box>
    </BaseTile>
  )
}

export default function RocketMealsTile({ tile }: RocketMealsTileProps) {
  const config = (tile.config ?? {}) as RocketMealsConfig

  const serverUrl = resolveServerUrl(config)

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)

  // Settings state
  const [hideNameInput, setHideNameInput] = useState(config.hideName ?? false)
  const [hideLastUpdateInput, setHideLastUpdateInput] = useState(config.hideLastUpdate ?? false)
  const [multiServerInput, setMultiServerInput] = useState(config.multiServer ?? false)
  const [selectedServersInput, setSelectedServersInput] = useState<string[]>(
    config.selectedServers ?? [],
  )

  const fetchProjectInfo = useCallback(async () => {
    if (!serverUrl) return
    try {
      const res = await fetch(`${serverUrl}/server/info`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return
      const json = (await res.json()) as {
        data?: { project?: { project_name?: string; project_logo?: string } }
      }
      const proj = json?.data?.project
      if (proj) {
        setProjectInfo({
          project_name: proj.project_name ?? null,
          project_logo: proj.project_logo ?? null,
        })
      }
    } catch {
      // silently ignore – the ServerTile already shows offline status
    }
  }, [serverUrl])

  useEffect(() => {
    fetchProjectInfo()
  }, [fetchProjectInfo])

  // Auto-resolve background image: use API logo when config backgroundImage is empty/unset
  const autoBackgroundImage =
    serverUrl && projectInfo?.project_logo
      ? `${serverUrl}/assets/${projectInfo.project_logo}`
      : undefined

  // Display name: server customName > config.name > project_name from API
  const projectName = projectInfo?.project_name ?? null
  const overrideName =
    (config.customName ?? '').trim() ||
    (config.name ?? '').trim() ||
    projectName ||
    ''

  const handleExtraSettingsOpen = () => {
    setHideNameInput(config.hideName ?? false)
    setHideLastUpdateInput(config.hideLastUpdate ?? false)
    setMultiServerInput(config.multiServer ?? false)
    setSelectedServersInput(config.selectedServers ?? [])
  }

  const allPresetKeys = MONITORABLE_PRESETS.map((p) => p.key)
  const allSelected = selectedServersInput.length === 0

  const toggleAllServers = (checked: boolean) => {
    setSelectedServersInput(checked ? [] : [...allPresetKeys])
  }

  const toggleServer = (key: string, checked: boolean) => {
    if (checked) {
      const next = [...selectedServersInput, key]
      // If all presets are now selected, collapse to empty array (meaning "all")
      setSelectedServersInput(allPresetKeys.every((k) => next.includes(k)) ? [] : next)
    } else {
      // Deselecting from "all" → select all except this one
      const base = allSelected ? allPresetKeys : selectedServersInput
      setSelectedServersInput(base.filter((k) => k !== key))
    }
  }

  const getChildExtraConfig = (): Record<string, unknown> => ({
    hideName: hideNameInput,
    hideLastUpdate: hideLastUpdateInput,
    multiServer: multiServerInput,
    selectedServers: selectedServersInput,
  })

  const extraSettings = (
    <>
      <Divider sx={{ mb: 2 }}>Rocket Meals</Divider>
      {projectName && !multiServerInput ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Projektname: {projectName}
        </Typography>
      ) : null}
      <FormControlLabel
        control={
          <Switch
            checked={multiServerInput}
            onChange={(e) => setMultiServerInput(e.target.checked)}
          />
        }
        label="Mehrere Server überwachen"
        sx={{ display: 'block', mb: 1 }}
      />
      {multiServerInput && (
        <Box sx={{ mb: 1, pl: 1 }}>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={allSelected}
                  onChange={(e) => toggleAllServers(e.target.checked)}
                />
              }
              label="Alle Server"
            />
            {MONITORABLE_PRESETS.map(({ key, label }) => (
              <FormControlLabel
                key={key}
                control={
                  <Checkbox
                    checked={allSelected || selectedServersInput.includes(key)}
                    onChange={(e) => toggleServer(key, e.target.checked)}
                  />
                }
                label={label}
                sx={{ ml: 2 }}
              />
            ))}
          </FormGroup>
        </Box>
      )}
      {!multiServerInput && (
        <>
          <FormControlLabel
            control={
              <Switch
                checked={hideNameInput}
                onChange={(e) => setHideNameInput(e.target.checked)}
              />
            }
            label="Namen verbergen"
            sx={{ display: 'block', mb: 1 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={hideLastUpdateInput}
                onChange={(e) => setHideLastUpdateInput(e.target.checked)}
              />
            }
            label="Update-Zeit verbergen"
            sx={{ display: 'block', mb: 1 }}
          />
        </>
      )}
    </>
  )

  if (config.multiServer) {
    return (
      <MultiServerView
        tile={tile}
        selectedServers={config.selectedServers ?? []}
        settingsContent={extraSettings}
        getExtraConfig={getChildExtraConfig}
        onSettingsOpen={handleExtraSettingsOpen}
      />
    )
  }

  return (
    <ServerTile
      tile={tile}
      overrideName={overrideName || undefined}
      overrideBackgroundImage={autoBackgroundImage}
      statusAtBottom
      onExtraSettingsOpen={handleExtraSettingsOpen}
      getChildExtraConfig={getChildExtraConfig}
      extraSettingsChildren={extraSettings}
    />
  )
}
