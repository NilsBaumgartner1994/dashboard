import { Box, Paper } from '@mui/material'
import type { ReactNode } from 'react'
import type { TileInstance } from '../../store/useStore'

interface BaseTileProps {
  tile: TileInstance
  children?: ReactNode
  style?: React.CSSProperties
}

export default function BaseTile({ tile, children, style }: BaseTileProps) {
  void tile // available for sub-components; not used in base layout
  return (
    <Paper
      elevation={2}
      sx={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        p: 1,
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
      }}
      style={style}
    >
      <Box sx={{ flex: 1, overflow: 'auto' }}>{children}</Box>
    </Paper>
  )
}
