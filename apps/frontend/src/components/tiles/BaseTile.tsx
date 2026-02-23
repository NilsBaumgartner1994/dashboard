import { useState } from 'react'
import {
  Box,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  Typography,
  Divider,
  Button,
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import type { ReactNode } from 'react'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'

interface BaseTileProps {
  tile: TileInstance
  children?: ReactNode
  /** Tile-specific settings rendered inside the settings modal (shown first) */
  settingsChildren?: ReactNode
  /** Returns extra config fields to merge into the single save call */
  getExtraConfig?: () => Record<string, unknown>
  /** Called when the settings modal is opened (allows tiles to re-sync form state) */
  onSettingsOpen?: () => void
  /** Override background image (e.g. auto-resolved from API) when config backgroundImage is empty */
  overrideBackgroundImage?: string
  /** Called when the tile content area is clicked in non-edit mode */
  onTileClick?: () => void
  style?: React.CSSProperties
}

export default function BaseTile({
  tile,
  children,
  settingsChildren,
  getExtraConfig,
  onSettingsOpen,
  overrideBackgroundImage,
  onTileClick,
  style,
}: BaseTileProps) {
  const { updateTile, duplicateTile, removeTile, editMode, gridColumns } = useStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [nameInput, setNameInput] = useState((tile.config?.name as string) ?? '')
  const [bgInput, setBgInput] = useState((tile.config?.backgroundImage as string) ?? '')
  const [maxWidthInput, setMaxWidthInput] = useState(
    tile.config?.maxWidth != null ? String(tile.config.maxWidth) : ''
  )

  const handleOpenSettings = () => {
    setNameInput((tile.config?.name as string) ?? '')
    setBgInput((tile.config?.backgroundImage as string) ?? '')
    setMaxWidthInput(tile.config?.maxWidth != null ? String(tile.config.maxWidth) : '')
    onSettingsOpen?.()
    setSettingsOpen(true)
  }

  const handleSave = () => {
    const extraCfg = getExtraConfig?.() ?? {}
    const parsed = parseInt(maxWidthInput, 10)
    const parsedMaxWidth = maxWidthInput !== '' && !isNaN(parsed) ? Math.max(1, Math.min(gridColumns, parsed)) : undefined
    updateTile(tile.id, {
      config: { ...tile.config, name: nameInput, backgroundImage: bgInput, maxWidth: parsedMaxWidth, ...extraCfg },
    })
    setSettingsOpen(false)
  }

  const configBgImage = tile.config?.backgroundImage as string | undefined
  const bgImage = configBgImage || overrideBackgroundImage || undefined

  // Move/resize handlers – applied immediately without requiring Save
  const move = (dx: number, dy: number) => {
    const nx = Math.max(0, Math.min(gridColumns - tile.w, tile.x + dx))
    const ny = Math.max(0, tile.y + dy)
    updateTile(tile.id, { x: nx, y: ny })
  }

  const configMaxWidth = tile.config?.maxWidth != null ? (tile.config.maxWidth as number) : gridColumns
  const resize = (dw: number, dh: number) => {
    const nw = Math.max(1, Math.min(Math.min(configMaxWidth, gridColumns - tile.x), tile.w + dw))
    const nh = Math.max(1, tile.h + dh)
    updateTile(tile.id, { w: nw, h: nh })
  }

  return (
    <Paper
      elevation={2}
      sx={{
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
      }}
      style={style}
    >
      {/* Optional background image */}
      {bgImage && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}

      {/* Settings gear – only visible in edit mode */}
      {editMode && (
        <Tooltip title="Einstellungen">
          <IconButton
            size="small"
            onClick={handleOpenSettings}
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              zIndex: 10,
              backgroundColor: 'rgba(0,0,0,0.35)',
              color: '#fff',
              '&:hover': { backgroundColor: 'rgba(0,0,0,0.55)' },
            }}
          >
            <SettingsIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
      )}

      {/* Tile content */}
      <Box
        sx={{ flex: 1, overflow: 'auto', position: 'relative', p: 1, cursor: onTileClick && !editMode ? 'pointer' : undefined }}
        onClick={onTileClick && !editMode ? onTileClick : undefined}
      >{children}</Box>

      {/* Settings bottom sheet */}
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fullWidth
        maxWidth={false}
        PaperProps={{
          sx: {
            position: 'fixed',
            bottom: 0,
            m: 0,
            width: '100%',
            maxWidth: '100%',
            borderRadius: '16px 16px 0 0',
            maxHeight: '50vh',
          },
        }}
        sx={{ '& .MuiDialog-container': { alignItems: 'flex-end' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', pr: 1 }}>
          <Box sx={{ flex: 1 }}>Kachel Einstellungen</Box>
          <Tooltip title="Duplizieren">
            <IconButton
              size="small"
              onClick={() => {
                duplicateTile(tile.id)
                setSettingsOpen(false)
              }}
            >
              <ContentCopyIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Abbrechen">
            <IconButton size="small" onClick={() => setSettingsOpen(false)}>
              <CloseIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Speichern">
            <IconButton size="small" color="primary" onClick={handleSave}>
              <CheckIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        </DialogTitle>
        <DialogContent dividers>
          {/* Tile-specific settings first */}
          {settingsChildren}

          <Divider sx={{ my: 2 }}>Kachel</Divider>
          <TextField
            fullWidth
            label="Name"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Hintergrundbild URL"
            placeholder="https://example.com/image.jpg (leer = auto)"
            value={bgInput}
            onChange={(e) => setBgInput(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label={`Max. Breite (1–${gridColumns}, leer = unbegrenzt)`}
            placeholder={String(gridColumns)}
            value={maxWidthInput}
            onChange={(e) => setMaxWidthInput(e.target.value)}
            type="number"
            inputProps={{ min: 1, max: gridColumns }}
            sx={{ mb: 2 }}
          />

          {/* Position & size controls – applied immediately */}
          <Divider sx={{ my: 2 }}>Position & Größe</Divider>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ minWidth: 24 }}>X</Typography>
            <Tooltip title="Links">
              <IconButton size="small" onClick={() => move(-1, 0)}><ArrowBackIcon fontSize="inherit" /></IconButton>
            </Tooltip>
            <Typography variant="body2" sx={{ minWidth: 20, textAlign: 'center' }}>{tile.x}</Typography>
            <Tooltip title="Rechts">
              <IconButton size="small" onClick={() => move(1, 0)}><ArrowForwardIcon fontSize="inherit" /></IconButton>
            </Tooltip>
            <Box sx={{ flex: 1 }} />
            <Typography variant="body2">Breite</Typography>
            <Tooltip title="Schmaler">
              <IconButton size="small" onClick={() => resize(-1, 0)}><RemoveCircleOutlineIcon fontSize="inherit" /></IconButton>
            </Tooltip>
            <Typography variant="body2" sx={{ minWidth: 20, textAlign: 'center' }}>{tile.w}</Typography>
            <Tooltip title="Breiter">
              <IconButton size="small" onClick={() => resize(1, 0)}><AddCircleOutlineIcon fontSize="inherit" /></IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ minWidth: 24 }}>Y</Typography>
            <Tooltip title="Hoch">
              <IconButton size="small" onClick={() => move(0, -1)}><ArrowUpwardIcon fontSize="inherit" /></IconButton>
            </Tooltip>
            <Typography variant="body2" sx={{ minWidth: 20, textAlign: 'center' }}>{tile.y}</Typography>
            <Tooltip title="Runter">
              <IconButton size="small" onClick={() => move(0, 1)}><ArrowDownwardIcon fontSize="inherit" /></IconButton>
            </Tooltip>
            <Box sx={{ flex: 1 }} />
            <Typography variant="body2">Höhe</Typography>
            <Tooltip title="Kürzer">
              <IconButton size="small" onClick={() => resize(0, -1)}><RemoveCircleOutlineIcon fontSize="inherit" /></IconButton>
            </Tooltip>
            <Typography variant="body2" sx={{ minWidth: 20, textAlign: 'center' }}>{tile.h}</Typography>
            <Tooltip title="Länger">
              <IconButton size="small" onClick={() => resize(0, 1)}><AddCircleOutlineIcon fontSize="inherit" /></IconButton>
            </Tooltip>
          </Box>

          {/* Delete button at the bottom */}
          <Box sx={{ mt: 4, mb: 2, display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="contained"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => {
                removeTile(tile.id)
                setSettingsOpen(false)
              }}
            >
              Löschen
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </Paper>
  )
}
