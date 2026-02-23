import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import {
  Box,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  Tooltip,
  TextField,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material'
import NoteIcon from '@mui/icons-material/Note'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import PreviewIcon from '@mui/icons-material/Preview'
import CloseIcon from '@mui/icons-material/Close'
import BaseTile from './BaseTile'
import LargeModal from './LargeModal'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'
import type { Note } from '../../store/useStore'

// ─── Note editor modal ────────────────────────────────────────────────────────

interface NoteEditorProps {
  note: Note | null
  open: boolean
  onClose: () => void
  onSave: (title: string, content: string) => void
  onDelete?: () => void
}

function NoteEditor({ note, open, onClose, onSave, onDelete }: NoteEditorProps) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')

  const handleSave = () => {
    onSave(title.trim() || 'Neue Notiz', content)
  }

  return (
    <Dialog
      key={note?.id ?? 'new'}
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { height: '80vh', display: 'flex', flexDirection: 'column' } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1 }}>
        <TextField
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel"
          variant="standard"
          sx={{ flex: 1, '& input': { fontSize: '1.1rem', fontWeight: 'bold' } }}
          inputProps={{ 'aria-label': 'Notiz Titel' }}
        />
        <ToggleButtonGroup
          value={mode}
          exclusive
          onChange={(_, val) => val && setMode(val)}
          size="small"
        >
          <ToggleButton value="edit" aria-label="Bearbeiten">
            <EditIcon fontSize="inherit" />
          </ToggleButton>
          <ToggleButton value="preview" aria-label="Vorschau">
            <PreviewIcon fontSize="inherit" />
          </ToggleButton>
        </ToggleButtonGroup>
        {onDelete && (
          <Tooltip title="Notiz löschen">
            <IconButton size="small" color="error" onClick={onDelete}>
              <DeleteIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Schließen">
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ flex: 1, overflow: 'auto', p: mode === 'preview' ? 3 : 1 }}>
        {mode === 'edit' ? (
          <TextField
            multiline
            fullWidth
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Notiz in Markdown eingeben…"
            variant="outlined"
            inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.9rem' } }}
            sx={{ height: '100%', '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' } }}
            minRows={10}
          />
        ) : (
          <Box
            sx={{
              '& h1, & h2, & h3': { mt: 1, mb: 0.5 },
              '& p': { my: 0.5 },
              '& ul, & ol': { pl: 3 },
              '& code': { fontFamily: 'monospace', bgcolor: 'action.hover', px: 0.5, borderRadius: 0.5 },
              '& pre': { bgcolor: 'action.hover', p: 1, borderRadius: 1, overflow: 'auto' },
              '& blockquote': { borderLeft: '3px solid', borderColor: 'divider', pl: 1.5, ml: 0, color: 'text.secondary' },
            }}
          >
            <ReactMarkdown>{content || '*Keine Inhalte*'}</ReactMarkdown>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button variant="contained" onClick={handleSave}>
          Speichern
        </Button>
      </DialogActions>
    </Dialog>
  )
}

// ─── Notes tile ───────────────────────────────────────────────────────────────

export default function NotesTile({ tile }: { tile: TileInstance }) {
  const notes = useStore((s) => s.notes)
  const addNote = useStore((s) => s.addNote)
  const updateNote = useStore((s) => s.updateNote)
  const removeNote = useStore((s) => s.removeNote)

  const [modalOpen, setModalOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [newNoteOpen, setNewNoteOpen] = useState(false)

  const handleNoteClick = (note: Note) => {
    setSelectedNote(note)
    setEditorOpen(true)
  }

  const handleSaveExisting = (title: string, content: string) => {
    if (selectedNote) {
      updateNote(selectedNote.id, { title, content })
    }
    setEditorOpen(false)
    setSelectedNote(null)
  }

  const handleDeleteNote = () => {
    if (selectedNote) {
      removeNote(selectedNote.id)
    }
    setEditorOpen(false)
    setSelectedNote(null)
  }

  const handleSaveNew = (title: string, content: string) => {
    addNote(title, content)
    setNewNoteOpen(false)
  }

  const noteList = (
    <List dense disablePadding>
      {notes.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
          Keine Notizen vorhanden.
        </Typography>
      )}
      {notes.map((note) => (
        <ListItemButton
          key={note.id}
          dense
          onClick={() => handleNoteClick(note)}
          sx={{ borderRadius: 1, px: 1 }}
        >
          <ListItemText
            primary={note.title}
            primaryTypographyProps={{ variant: 'body2', noWrap: true }}
            secondary={new Date(note.updatedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })}
            secondaryTypographyProps={{ variant: 'caption' }}
          />
        </ListItemButton>
      ))}
    </List>
  )

  return (
    <>
      <BaseTile tile={tile} onTileClick={() => setModalOpen(true)}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <NoteIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight="bold" sx={{ flex: 1 }}>
            {(tile.config?.name as string) || 'Notizen'}
          </Typography>
          <Tooltip title="Neue Notiz">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); setNewNoteOpen(true) }}
            >
              <AddIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Compact note list */}
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          {notes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Keine Notizen vorhanden.
            </Typography>
          ) : (
            <List dense disablePadding>
              {notes.slice(0, 5).map((note) => (
                <ListItemButton
                  key={note.id}
                  dense
                  onClick={(e) => { e.stopPropagation(); handleNoteClick(note) }}
                  sx={{ borderRadius: 1, px: 0.5 }}
                >
                  <ListItemText
                    primary={note.title}
                    primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                  />
                </ListItemButton>
              ))}
              {notes.length > 5 && (
                <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
                  +{notes.length - 5} weitere…
                </Typography>
              )}
            </List>
          )}
        </Box>
      </BaseTile>

      {/* Full note list modal */}
      <LargeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={(tile.config?.name as string) || 'Notizen'}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            {notes.length === 0 ? 'Keine Notizen' : `${notes.length} Notiz${notes.length === 1 ? '' : 'en'}`}
          </Typography>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setNewNoteOpen(true)}>
            Neue Notiz
          </Button>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', p: 1 }}>
          {noteList}
        </Box>
      </LargeModal>

      {/* Editor for existing note */}
      <NoteEditor
        note={selectedNote}
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setSelectedNote(null) }}
        onSave={handleSaveExisting}
        onDelete={handleDeleteNote}
      />

      {/* Editor for new note */}
      <NoteEditor
        note={null}
        open={newNoteOpen}
        onClose={() => setNewNoteOpen(false)}
        onSave={handleSaveNew}
      />
    </>
  )
}
