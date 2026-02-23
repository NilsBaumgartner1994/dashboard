import { useState, useEffect, useRef } from 'react'
import { Box, Typography, useTheme } from '@mui/material'
import StickyNote2Icon from '@mui/icons-material/StickyNote2'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'

export default function PostItTile({ tile }: { tile: TileInstance }) {
  const updateTile = useStore((s) => s.updateTile)
  const editMode = useStore((s) => s.editMode)
  const theme = useTheme()

  const savedContent = (tile.config?.postItContent as string) ?? ''
  const [content, setContent] = useState(savedContent)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local state in sync when tile config changes externally
  useEffect(() => {
    setContent((tile.config?.postItContent as string) ?? '')
  }, [tile.config?.postItContent])

  // Cleanup pending save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleChange = (value: string) => {
    setContent(value)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      updateTile(tile.id, { config: { ...tile.config, postItContent: value } })
    }, 600)
  }

  const bgColor = theme.palette.mode === 'dark' ? '#4a4000' : '#fff9c4'
  const textColor = theme.palette.mode === 'dark' ? '#ffe57f' : '#424242'

  return (
    <BaseTile tile={tile} style={{ backgroundColor: bgColor }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5, flexShrink: 0 }}>
          <StickyNote2Icon fontSize="small" sx={{ color: textColor, opacity: 0.6 }} />
          <Typography variant="caption" sx={{ color: textColor, opacity: 0.6, fontWeight: 'bold' }}>
            {(tile.config?.name as string) || 'Notizzettel'}
          </Typography>
        </Box>

        {/* Text area */}
        <Box
          component="textarea"
          value={content}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleChange(e.target.value)}
          onClick={(e: React.MouseEvent) => { if (!editMode) e.stopPropagation() }}
          placeholder="Notizen, Links, Ideen…"
          sx={{
            flex: 1,
            width: '100%',
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'inherit',
            fontSize: '0.85rem',
            lineHeight: 1.5,
            color: textColor,
            cursor: editMode ? 'grab' : 'text',
            '&::placeholder': { color: textColor, opacity: 0.45 },
          }}
          readOnly={editMode}
        />
      </Box>
    </BaseTile>
  )
}
