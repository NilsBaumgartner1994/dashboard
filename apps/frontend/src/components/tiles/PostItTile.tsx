import { useState, useEffect, useRef } from 'react'
import { Box, Button, FormControlLabel, Stack, Switch, Typography, useTheme } from '@mui/material'
import StickyNote2Icon from '@mui/icons-material/StickyNote2'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'
import { useTileFlowStore } from '../../store/useTileFlowStore'

export default function PostItTile({ tile }: { tile: TileInstance }) {
  const updateTile = useStore((s) => s.updateTile)
  const editMode = useStore((s) => s.editMode)
  const publishOutput = useTileFlowStore((s) => s.publishOutput)
  const theme = useTheme()

  const savedContent = (tile.config?.postItContent as string) ?? ''
  const [content, setContent] = useState(savedContent)
  const [autoOutputInput, setAutoOutputInput] = useState(
    tile.config?.autoOutputEnabled !== undefined ? (tile.config.autoOutputEnabled as boolean) : true,
  )
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local state in sync when tile config changes externally
  useEffect(() => {
    setContent((tile.config?.postItContent as string) ?? '')
  }, [tile.config?.postItContent])

  useEffect(() => {
    setAutoOutputInput(tile.config?.autoOutputEnabled !== undefined ? (tile.config.autoOutputEnabled as boolean) : true)
  }, [tile.config?.autoOutputEnabled])

  // Cleanup pending save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleChange = (value: string) => {
    setContent(value)

    const autoOutputEnabled = tile.config?.autoOutputEnabled !== undefined
      ? (tile.config.autoOutputEnabled as boolean)
      : true
    if (autoOutputEnabled && value.trim()) {
      publishOutput(tile.id, { content: value, dataType: 'text' })
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      updateTile(tile.id, { config: { ...tile.config, postItContent: value } })
    }, 600)
  }

  const handleSendOutput = () => {
    const trimmed = content.trim()
    if (!trimmed) return
    publishOutput(tile.id, { content: trimmed, dataType: 'text' })
  }

  const bgColor = theme.palette.mode === 'dark' ? '#4a4000' : '#fff9c4'
  const textColor = theme.palette.mode === 'dark' ? '#ffe57f' : '#424242'

  return (
    <BaseTile
      tile={tile}
      style={{ backgroundColor: bgColor }}
      onSettingsOpen={() => {
        setAutoOutputInput(tile.config?.autoOutputEnabled !== undefined ? (tile.config.autoOutputEnabled as boolean) : true)
      }}
      settingsChildren={(
        <Stack spacing={1} sx={{ mt: 1 }}>
          <FormControlLabel
            control={<Switch checked={autoOutputInput} onChange={(e) => setAutoOutputInput(e.target.checked)} />}
            label="Auto-Output bei Eingabeänderung senden"
          />
        </Stack>
      )}
      getExtraConfig={() => ({ autoOutputEnabled: autoOutputInput })}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0.5 }}>
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

        {!editMode && (
          <Button size="small" variant="outlined" onClick={handleSendOutput} disabled={!content.trim()}>
            Output senden
          </Button>
        )}
      </Box>
    </BaseTile>
  )
}
