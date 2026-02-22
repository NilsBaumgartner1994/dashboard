import { Typography } from '@mui/material'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'

interface SampleTileProps {
  tile: TileInstance
}

export default function SampleTile({ tile }: SampleTileProps) {
  return (
    <BaseTile tile={tile}>
      <Typography variant="subtitle1" fontWeight="bold">
        Sample Tile
      </Typography>
      <Typography variant="body2" color="text.secondary">
        id: {tile.id}
      </Typography>
    </BaseTile>
  )
}
