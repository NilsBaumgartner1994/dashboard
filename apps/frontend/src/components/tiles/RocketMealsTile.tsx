import { useState, useEffect, useCallback } from 'react'
import { Typography } from '@mui/material'
import ServerTile, { resolveServerUrl } from './ServerTile'
import type { ServerConfig } from './ServerTile'
import { useStore } from '../../store/useStore'
import type { TileInstance } from '../../store/useStore'

interface ProjectInfo {
  project_name: string | null
  project_logo: string | null
}

interface RocketMealsTileProps {
  tile: TileInstance
}

export default function RocketMealsTile({ tile }: RocketMealsTileProps) {
  const updateTile = useStore((s) => s.updateTile)
  const config = (tile.config ?? {}) as ServerConfig

  const serverUrl = resolveServerUrl(config)

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null)

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
        const info: ProjectInfo = {
          project_name: proj.project_name ?? null,
          project_logo: proj.project_logo ?? null,
        }
        setProjectInfo(info)

        // Persist logo as background image when none is set yet
        if (info.project_logo && !config.backgroundImage) {
          const logoUrl = `${serverUrl}/assets/${info.project_logo}`
          updateTile(tile.id, {
            config: { ...tile.config, backgroundImage: logoUrl },
          })
        }
      }
    } catch {
      // silently ignore – the ServerTile already shows offline status
    }
  }, [serverUrl, config.backgroundImage, tile.id, tile.config, updateTile])

  useEffect(() => {
    fetchProjectInfo()
  }, [fetchProjectInfo])

  // Display name: customName > config.name > project_name from API
  const projectName = projectInfo?.project_name ?? null
  const overrideName =
    (config.customName ?? '').trim() ||
    (config.name ?? '').trim() ||
    projectName ||
    ''

  return (
    <ServerTile
      tile={tile}
      overrideName={overrideName || undefined}
      extraSettingsChildren={
        projectName ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Projektname: {projectName}
          </Typography>
        ) : undefined
      }
    />
  )
}
