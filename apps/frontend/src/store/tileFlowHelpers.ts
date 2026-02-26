import type { TileInstance } from './useStore'
import type { TileFlowPayload } from './useTileFlowStore'

function getOutputTargets(tile: TileInstance): string[] {
  const raw = tile.config?.outputTargets
  if (!Array.isArray(raw)) return []
  return raw.filter((v): v is string => typeof v === 'string' && v.length > 0)
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
