import { useState, useEffect, useCallback } from 'react'
import { Typography, FormControlLabel, Switch } from '@mui/material'
import ServerTile, { resolveServerUrl } from './ServerTile'
import type { ServerConfig } from './ServerTile'
import type { TileInstance } from '../../store/useStore'

interface ProjectInfo {
  project_name: string | null
  project_logo: string | null
}

interface RocketMealsTileProps {
  tile: TileInstance
}

export default function RocketMealsTile({ tile }: RocketMealsTileProps) {
  const config = (tile.config ?? {}) as ServerConfig

  const serverUrl = resolveServerUrl(config)

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)

  // Settings toggle state (synced to config on save)
  const [hideNameInput, setHideNameInput] = useState(config.hideName ?? false)
  const [hideLastUpdateInput, setHideLastUpdateInput] = useState(config.hideLastUpdate ?? false)

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
  }

  const getChildExtraConfig = (): Record<string, unknown> => ({
    hideName: hideNameInput,
    hideLastUpdate: hideLastUpdateInput,
  })

  return (
    <ServerTile
      tile={tile}
      overrideName={overrideName || undefined}
      overrideBackgroundImage={autoBackgroundImage}
      statusAtBottom
      onExtraSettingsOpen={handleExtraSettingsOpen}
      getChildExtraConfig={getChildExtraConfig}
      extraSettingsChildren={
        <>
          {projectName ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Projektname: {projectName}
            </Typography>
          ) : null}
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
      }
    />
  )
}
