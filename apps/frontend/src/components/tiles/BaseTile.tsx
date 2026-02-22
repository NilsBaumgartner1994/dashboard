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
} from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import type { ReactNode } from 'react'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'

interface BaseTileProps {
  tile: TileInstance
  children?: ReactNode
  /** Tile-specific settings rendered inside the settings modal */
  settingsChildren?: ReactNode
  /** Called when the modal "Save" button is clicked (after base settings are persisted) */
  onSaveSettings?: () => void
  /** Called when the settings modal is opened (allows tiles to re-sync form state) */
  onSettingsOpen?: () => void
  style?: React.CSSProperties
}

export default function BaseTile({
  tile,
  children,
  settingsChildren,
  onSaveSettings,
  onSettingsOpen,
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
    updateTile(tile.id, {
      config: { ...tile.config, name: nameInput, backgroundImage: bgInput },
    })
    onSaveSettings?.()
    setSettingsOpen(false)
  }

  const bgImage = tile.config?.backgroundImage as string | undefined

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
            placeholder="https://example.com/image.jpg"
            value={bgInput}
            onChange={(e) => setBgInput(e.target.value)}
            sx={{ mb: 2 }}
          />
          {settingsChildren}
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
