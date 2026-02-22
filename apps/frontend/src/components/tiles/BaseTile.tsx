import { Box, Paper } from '@mui/material'
import type { ReactNode } from 'react'
import type { TileInstance } from '../../store/useStore'

interface BaseTileProps {
  tile: TileInstance
  children?: ReactNode
  style?: React.CSSProperties
}

export default function BaseTile({ tile, children, style }: BaseTileProps) {
  return (
    <Paper
      elevation={2}
      sx={{
        gridColumn: `${tile.x + 1} / span ${tile.w}`,
        gridRow: `${tile.y + 1} / span ${tile.h}`,
        overflow: 'hidden',
        display: tile.hidden ? 'none' : 'flex',
        flexDirection: 'column',
        position: 'relative',
        p: 1,
        boxSizing: 'border-box',
      }}
      style={style}
    >
      <Box sx={{ flex: 1, overflow: 'auto' }}>{children}</Box>
    </Paper>
  )
}
