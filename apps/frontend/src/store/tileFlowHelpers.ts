import type { TileInstance } from './useStore'
import type { TileFlowPayload } from './useTileFlowStore'

function normalizeOutputTargets(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    return trimmed
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
  }

  return []
}

export function getOutputTargets(tile: TileInstance): string[] {
  const outputTargets = normalizeOutputTargets(tile.config?.outputTargets)
  if (outputTargets.length > 0) return outputTargets
  // Backward compatibility for older tile configs.
  return normalizeOutputTargets(tile.config?.outputTarget)
}

export function getConnectedSourceIds(tiles: TileInstance[], targetTileId: string): string[] {
  return tiles
    .filter((tile) => getOutputTargets(tile).includes(targetTileId))
    .map((tile) => tile.id)
}

export function getLatestConnectedPayload(
  tiles: TileInstance[],
  outputs: Record<string, TileFlowPayload>,
  targetTileId: string,
): TileFlowPayload | null {
  const sourceIds = getConnectedSourceIds(tiles, targetTileId)
  let latest: TileFlowPayload | null = null

  sourceIds.forEach((id) => {
    const payload = outputs[id]
    if (!payload) return
    if (!latest || payload.timestamp > latest.timestamp) {
      latest = payload
    }
  })

  return latest
}
