import { useState } from 'react'
import {
  Box,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Divider,
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline'
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline'
import type { ReactNode } from 'react'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'

const GRID_COLS = 32
const GRID_ROWS = 18

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
  style?: React.CSSProperties
}

export default function BaseTile({
  tile,
  children,
  settingsChildren,
  getExtraConfig,
  onSettingsOpen,
  overrideBackgroundImage,
  style,
}: BaseTileProps) {
  const { updateTile, duplicateTile } = useStore()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [nameInput, setNameInput] = useState((tile.config?.name as string) ?? '')
  const [bgInput, setBgInput] = useState((tile.config?.backgroundImage as string) ?? '')

  const handleOpenSettings = () => {
    setNameInput((tile.config?.name as string) ?? '')
    setBgInput((tile.config?.backgroundImage as string) ?? '')
    onSettingsOpen?.()
    setSettingsOpen(true)
  }

  const handleSave = () => {
    const extraCfg = getExtraConfig?.() ?? {}
    updateTile(tile.id, {
      config: { ...tile.config, name: nameInput, backgroundImage: bgInput, ...extraCfg },
    })
    setSettingsOpen(false)
  }

  const configBgImage = tile.config?.backgroundImage as string | undefined
  const bgImage = configBgImage || overrideBackgroundImage || undefined

  // Move/resize handlers – applied immediately without requiring Save
  const move = (dx: number, dy: number) => {
    const nx = Math.max(0, Math.min(GRID_COLS - tile.w, tile.x + dx))
    const ny = Math.max(0, Math.min(GRID_ROWS - tile.h, tile.y + dy))
    updateTile(tile.id, { x: nx, y: ny })
  }

  const resize = (dw: number, dh: number) => {
    const nw = Math.max(1, Math.min(GRID_COLS - tile.x, tile.w + dw))
    const nh = Math.max(1, Math.min(GRID_ROWS - tile.y, tile.h + dh))
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

      {/* Always-visible settings gear – top right */}
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

      {/* Tile content */}
      <Box sx={{ flex: 1, overflow: 'auto', position: 'relative', p: 1 }}>{children}</Box>

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
            maxHeight: '80vh',
          },
        }}
        sx={{ '& .MuiDialog-container': { alignItems: 'flex-end' } }}
      >
        <DialogTitle>Kachel Einstellungen</DialogTitle>
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
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={<ContentCopyIcon />}
            onClick={() => {
              duplicateTile(tile.id)
              setSettingsOpen(false)
            }}
          >
            Duplizieren
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button onClick={() => setSettingsOpen(false)}>Abbrechen</Button>
          <Button onClick={handleSave} variant="contained">
            Speichern
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  )
}
