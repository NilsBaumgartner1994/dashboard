import { useState, useEffect, useCallback, useRef } from 'react'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'
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
  ToggleButtonGroup,
  ToggleButton,
  InputAdornment,
  CircularProgress,
  Divider,
} from '@mui/material'
import NoteIcon from '@mui/icons-material/Note'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import PreviewIcon from '@mui/icons-material/Preview'
import CloseIcon from '@mui/icons-material/Close'
import SearchIcon from '@mui/icons-material/Search'
import LoginIcon from '@mui/icons-material/Login'
import CloudIcon from '@mui/icons-material/Cloud'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import BaseTile from './BaseTile'
import LargeModal from './LargeModal'
import MyModal from './MyModal'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'
import type { Note } from '../../store/useStore'
import { useTileFlowStore } from '../../store/useTileFlowStore'
import { useGoogleAuthStore, isTokenValid } from '../../store/useGoogleAuthStore'
import { useGoogleKeepStore } from '../../store/useGoogleKeepStore'

// ─── Google Keep helpers ─────────────────────────────────────────────────────

const KEEP_BASE = 'https://keep.googleapis.com/v1'
const KEEP_NOTES_PREFIX = 'notes/'
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/keep https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.readonly'

interface KeepNote {
  name: string
  title: string
  body?: { text?: { text?: string } }
  createTime?: string
  updateTime?: string
}

async function keepListNotes(token: string): Promise<KeepNote[]> {
  const allNotes: KeepNote[] = []
  let pageToken: string | undefined
  do {
    const url = new URL(`${KEEP_BASE}/notes`)
    url.searchParams.set('filter', 'NOT trashed')
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      if (res.status === 401) throw new Error('TOKEN_EXPIRED')
      let body = ''
      try { body = await res.text() } catch { /* ignore */ }
      throw new Error(`HTTP ${res.status} – ${res.statusText}\n${body}`)
    }
    const data = await res.json() as { notes?: KeepNote[]; nextPageToken?: string }
    allNotes.push(...(data.notes ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)
  return allNotes
}

async function keepCreateNote(token: string, title: string, text: string): Promise<KeepNote> {
  const res = await fetch(`${KEEP_BASE}/notes`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body: { text: { text } } }),
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('TOKEN_EXPIRED')
    let body = ''
    try { body = await res.text() } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status} – ${res.statusText}\n${body}`)
  }
  return (await res.json()) as KeepNote
}

async function keepDeleteNote(token: string, keepName: string): Promise<void> {
  const res = await fetch(`https://keep.googleapis.com/v1/${keepName}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    if (res.status === 401) throw new Error('TOKEN_EXPIRED')
    if (res.status === 404) return // already deleted
    let body = ''
    try { body = await res.text() } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status} – ${res.statusText}\n${body}`)
  }
}

// ─── Note editor modal ────────────────────────────────────────────────────────

interface NoteEditorProps {
  note: Note | null
  open: boolean
  onClose: () => void
  onSave: (title: string, content: string) => void
  onDelete?: () => void
}

function NoteEditor({ note, open, onClose, onSave, onDelete }: NoteEditorProps) {
  const [content, setContent] = useState(note?.content ?? '')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')

  useEffect(() => {
    if (open) {
      setContent(note?.content ?? '')
      setMode('edit')
    }
  }, [note, open])

  const handleSave = () => {
    const firstLine = content.split('\n').find((line) => line.trim() !== '')?.replace(/^#+\s*/, '').trim() ?? ''
    onSave(firstLine || 'Neue Notiz', content)
  }

  return (
    <MyModal
      key={note?.id ?? 'new'}
      open={open}
      onClose={onClose}
      title={note ? note.title || 'Notiz bearbeiten' : 'Neue Notiz'}
      titleActions={
        <>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, val) => val && setMode(val)}
            size="small"
            sx={{ mr: 0.5 }}
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
        </>
      }
      actions={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="contained" onClick={handleSave}>
            Speichern
          </Button>
        </>
      }
    >
      <Box sx={{ flex: 1, overflow: 'auto', p: mode === 'preview' ? 3 : 1 }}>
        {mode === 'edit' ? (
          <TextField
            multiline
            fullWidth
            autoFocus
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
      </Box>
    </MyModal>
  )
}

// ─── Merge helper ─────────────────────────────────────────────────────────────

/**
 * Merges local and remote note lists.
 * For notes that exist in both, keeps the one with the higher updatedAt (last-write-wins).
 * Notes that only exist in one list are included as-is.
 */
function mergeNotes(local: Note[], remote: Note[]): Note[] {
  const map = new Map<string, Note>()
  for (const note of remote) map.set(note.id, note)
  for (const note of local) {
    const existing = map.get(note.id)
    if (!existing || note.updatedAt > existing.updatedAt) {
      map.set(note.id, note)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt)
}

// ─── Inner tile component (needs GoogleOAuthProvider in tree) ─────────────────

function NotesTileInner({ tile }: { tile: TileInstance }) {
  const notes = useStore((s) => s.notes)
  const setNotes = useStore((s) => s.setNotes)
  const publishOutput = useTileFlowStore((s) => s.publishOutput)

  const clientId = useGoogleAuthStore((s) => s.clientId)
  const globalClientSecret = useGoogleAuthStore((s) => s.clientSecret)
  const tileClientSecret = (tile.config?.clientSecret as string | undefined)?.trim() ?? ''
  const clientSecret = tileClientSecret || globalClientSecret

  const { accessToken, tokenExpiry, refreshToken, setToken, setRefreshToken, clearToken } = useGoogleAuthStore()
  const { noteIdToKeepName, setKeepName, removeKeepName, clearAll: clearKeepMapping } = useGoogleKeepStore()
  const tokenOk = isTokenValid({ accessToken, tokenExpiry })

  // Clear Keep name mappings whenever the auth token is explicitly cleared (accessToken → null).
  // This ensures the next login re-loads notes from Keep rather than using stale mappings.
  const prevAccessTokenRef = useRef<string | null>(accessToken)
  useEffect(() => {
    if (prevAccessTokenRef.current && !accessToken) {
      clearKeepMapping()
    }
    prevAccessTokenRef.current = accessToken
  }, [accessToken, clearKeepMapping])

  // Sync state
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  // Settings panel state
  const [settingsClientSecret, setSettingsClientSecret] = useState(tileClientSecret)
  const [showSettingsSecret, setShowSettingsSecret] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [newNoteOpen, setNewNoteOpen] = useState(false)

  const [quickTitle, setQuickTitle] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  // ── Token exchange helpers ────────────────────────────────────────────────

  const exchangeCodeForTokens = useCallback(async (code: string) => {
    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    })
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const body = await res.text()
    if (!res.ok) throw new Error(`Token-Austausch fehlgeschlagen: HTTP ${res.status}\n${body}`)
    return JSON.parse(body) as { access_token: string; expires_in: number; refresh_token?: string }
  }, [clientId, clientSecret])

  const refreshAccessToken = useCallback(async () => {
    if (!refreshToken || !clientSecret) throw new Error('Kein Refresh-Token oder Client-Secret vorhanden')
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const body = await res.text()
    if (!res.ok) throw new Error(`Access-Token Erneuerung fehlgeschlagen: HTTP ${res.status}\n${body}`)
    return JSON.parse(body) as { access_token: string; expires_in: number }
  }, [clientId, clientSecret, refreshToken])

  // ── Google login ──────────────────────────────────────────────────────────

  const isSilentRefresh = useRef(false)

  const loginImplicit = useGoogleLogin({
    flow: 'implicit',
    scope: GOOGLE_SCOPES,
    onSuccess: (tokenResponse) => {
      isSilentRefresh.current = false
      setToken(tokenResponse.access_token, tokenResponse.expires_in ?? 3600)
      setSyncError(null)
    },
    onError: () => {
      if (!isSilentRefresh.current) {
        setSyncError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.')
      }
      isSilentRefresh.current = false
    },
  })

  const loginAuthCode = useGoogleLogin({
    flow: 'auth-code',
    scope: GOOGLE_SCOPES,
    onSuccess: async (codeResponse) => {
      try {
        const tokens = await exchangeCodeForTokens(codeResponse.code)
        setToken(tokens.access_token, tokens.expires_in)
        if (tokens.refresh_token) setRefreshToken(tokens.refresh_token)
        setSyncError(null)
      } catch (err: unknown) {
        setSyncError((err as Error).message)
      }
    },
    onError: () => {
      setSyncError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.')
    },
  })

  const login = clientSecret ? loginAuthCode : loginImplicit
  const loginRef = useRef(login)
  useEffect(() => { loginRef.current = login }, [login])

  // ── Automatic token refresh ───────────────────────────────────────────────

  useEffect(() => {
    if (!tokenExpiry || !accessToken) return
    const msUntilExpiry = tokenExpiry - Date.now()
    const refreshDelay = Math.max(0, msUntilExpiry - 5 * 60 * 1000)
    if (refreshToken && clientSecret) {
      const timer = setTimeout(async () => {
        try {
          const tokens = await refreshAccessToken()
          setToken(tokens.access_token, tokens.expires_in)
          setSyncError(null)
        } catch (err: unknown) {
          const msg = (err as Error).message
          if (msg.includes('400') || msg.includes('401')) {
            clearToken()
            setSyncError('Refresh-Token ungültig oder abgelaufen. Bitte erneut anmelden.')
          }
        }
      }, refreshDelay)
      return () => clearTimeout(timer)
    } else {
      const timer = setTimeout(() => {
        isSilentRefresh.current = true
        loginRef.current({ prompt: 'none' })
      }, refreshDelay)
      return () => clearTimeout(timer)
    }
  }, [tokenExpiry, accessToken, refreshToken, clientSecret, refreshAccessToken, setToken, clearToken])

  // ── Google Keep sync helpers ──────────────────────────────────────────────

  /** Creates a new Keep note and stores the local→Keep name mapping. */
  const createKeepNote = useCallback(async (note: Note) => {
    if (!tokenOk || !accessToken) return
    setSyncing(true)
    try {
      const keepNote = await keepCreateNote(accessToken, note.title, note.content)
      setKeepName(note.id, keepNote.name)
      setSyncError(null)
    } catch (err: unknown) {
      const msg = (err as Error).message
      if (msg === 'TOKEN_EXPIRED') {
        clearToken()
        setSyncError('Sitzung abgelaufen (401). Bitte erneut anmelden.')
      } else {
        setSyncError(msg)
      }
    } finally {
      setSyncing(false)
    }
  }, [tokenOk, accessToken, setKeepName, clearToken])

  /**
   * Updates an existing Keep note.
   * Because Keep note bodies are immutable, this creates a replacement note
   * first, then deletes the old one only after the new one is successfully
   * created – preventing data loss on transient failures.
   */
  const updateKeepNote = useCallback(async (note: Note) => {
    if (!tokenOk || !accessToken) return
    setSyncing(true)
    try {
      const existingKeepName = noteIdToKeepName[note.id]
      // Create the new note first to avoid data loss if the create request fails
      const keepNote = await keepCreateNote(accessToken, note.title, note.content)
      setKeepName(note.id, keepNote.name)
      // Only delete the old note after the new one is safely created
      if (existingKeepName) {
        await keepDeleteNote(accessToken, existingKeepName)
      }
      setSyncError(null)
    } catch (err: unknown) {
      const msg = (err as Error).message
      if (msg === 'TOKEN_EXPIRED') {
        clearToken()
        setSyncError('Sitzung abgelaufen (401). Bitte erneut anmelden.')
      } else {
        setSyncError(msg)
      }
    } finally {
      setSyncing(false)
    }
  }, [tokenOk, accessToken, noteIdToKeepName, setKeepName, clearToken])

  /** Deletes a Keep note and removes the local→Keep name mapping. */
  const deleteKeepNote = useCallback(async (noteId: string) => {
    if (!tokenOk || !accessToken) return
    setSyncing(true)
    try {
      const existingKeepName = noteIdToKeepName[noteId]
      if (existingKeepName) {
        await keepDeleteNote(accessToken, existingKeepName)
        removeKeepName(noteId)
      }
      setSyncError(null)
    } catch (err: unknown) {
      const msg = (err as Error).message
      if (msg === 'TOKEN_EXPIRED') {
        clearToken()
        setSyncError('Sitzung abgelaufen (401). Bitte erneut anmelden.')
      } else {
        setSyncError(msg)
      }
    } finally {
      setSyncing(false)
    }
  }, [tokenOk, accessToken, noteIdToKeepName, removeKeepName, clearToken])

  // ── Load notes from Keep on connect ──────────────────────────────────────

  useEffect(() => {
    if (!tokenOk || !accessToken) return
    let cancelled = false
    ;(async () => {
      setSyncing(true)
      try {
        const keepNotes = await keepListNotes(accessToken)
        if (!cancelled) {
          const remoteNotes: Note[] = []
          for (const kn of keepNotes) {
            // Derive a stable local ID from the Keep name so re-loads are idempotent
            const noteId = kn.name.startsWith(KEEP_NOTES_PREFIX)
              ? kn.name.slice(KEEP_NOTES_PREFIX.length)
              : kn.name
            const localId = `keep-${noteId}`
            remoteNotes.push({
              id: localId,
              title: kn.title ?? '',
              content: kn.body?.text?.text ?? '',
              createdAt: kn.createTime ? new Date(kn.createTime).getTime() : Date.now(),
              updatedAt: kn.updateTime ? new Date(kn.updateTime).getTime() : Date.now(),
            })
            // Store the Keep name mapping for later update/delete operations
            setKeepName(localId, kn.name)
          }
          // Merge remote notes with local notes using getState() to avoid stale closure
          // (last-write-wins by updatedAt – see mergeNotes above)
          setNotes(mergeNotes(useStore.getState().notes, remoteNotes))
          setSyncError(null)
        }
      } catch (err: unknown) {
        const msg = (err as Error).message
        if (!cancelled) {
          if (msg === 'TOKEN_EXPIRED') {
            clearToken()
            setSyncError('Sitzung abgelaufen. Bitte erneut anmelden.')
          } else {
            setSyncError(msg)
          }
        }
      } finally {
        if (!cancelled) setSyncing(false)
      }
    })()
    return () => { cancelled = true }
    // Run only when token becomes valid (on login)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenOk, accessToken])

  // ── Note CRUD with Keep sync ──────────────────────────────────────────────

  const handleNoteClick = (note: Note) => {
    const outputContent = note.content.trim() || note.title.trim()
    if (outputContent) publishOutput(tile.id, { content: outputContent, dataType: 'text' })
    setSelectedNote(note)
    setEditorOpen(true)
  }

  const handleSaveExisting = (title: string, content: string) => {
    if (!selectedNote) return
    const updatedAt = Date.now()
    const updatedNote = { ...selectedNote, title, content, updatedAt }
    const updated = notes.map((n) =>
      n.id === selectedNote.id ? updatedNote : n,
    )
    setNotes(updated)
    const outputContent = content.trim() || title.trim()
    if (outputContent) publishOutput(tile.id, { content: outputContent, dataType: 'text' })
    setEditorOpen(false)
    setSelectedNote(null)
    void updateKeepNote(updatedNote)
  }

  const handleDeleteNote = () => {
    if (!selectedNote) return
    const updated = notes.filter((n) => n.id !== selectedNote.id)
    setNotes(updated)
    const noteIdToDelete = selectedNote.id
    setEditorOpen(false)
    setSelectedNote(null)
    void deleteKeepNote(noteIdToDelete)
  }

  const handleSaveNew = (title: string, content: string) => {
    const now = Date.now()
    const newNote: Note = {
      id: `note-${crypto.randomUUID()}`,
      title: title || 'Neue Notiz',
      content,
      createdAt: now,
      updatedAt: now,
    }
    const updated = [newNote, ...notes]
    setNotes(updated)
    const outputContent = content.trim() || title.trim()
    if (outputContent) publishOutput(tile.id, { content: outputContent, dataType: 'text' })
    setNewNoteOpen(false)
    void createKeepNote(newNote)
  }

  const handleQuickAdd = () => {
    const trimmed = quickTitle.trim()
    if (!trimmed) return
    const now = Date.now()
    const newNote: Note = {
      id: `note-${crypto.randomUUID()}`,
      title: trimmed,
      content: `# ${trimmed}`,
      createdAt: now,
      updatedAt: now,
    }
    const updated = [newNote, ...notes]
    setNotes(updated)
    publishOutput(tile.id, { content: trimmed, dataType: 'text' })
    setQuickTitle('')
    void createKeepNote(newNote)
  }

  const handleQuickAddKeyDown = (e: { key: string; stopPropagation: () => void }) => {
    if (e.key === 'Enter' && quickTitle.trim()) {
      e.stopPropagation()
      handleQuickAdd()
    }
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  const handleSettingsOpen = () => {
    setSettingsClientSecret(tileClientSecret)
  }

  const getExtraConfig = () => ({
    clientSecret: settingsClientSecret.trim(),
  })

  const settingsContent = (
    <>
      <Divider sx={{ mb: 2 }}>Google Keep Sync</Divider>
      {tokenOk ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <CloudIcon fontSize="small" color="success" />
          <Typography variant="body2" color="success.main" sx={{ flex: 1 }}>
            Mit Google Keep verbunden
          </Typography>
          <Button
            variant="text"
            size="small"
            onClick={() => { clearToken(); clearKeepMapping(); setSyncError(null) }}
          >
            Abmelden
          </Button>
        </Box>
      ) : (
        <Button
          variant="outlined"
          startIcon={<LoginIcon />}
          onClick={() => login()}
          sx={{ mb: 1 }}
        >
          Mit Google verbinden
        </Button>
      )}
      {syncError && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
          {syncError}
        </Typography>
      )}

      <Divider sx={{ my: 2 }}>Erweiterte Einstellungen</Divider>
      <TextField
        fullWidth
        label="Client Secret (optional, für Refresh-Token)"
        type={showSettingsSecret ? 'text' : 'password'}
        value={settingsClientSecret}
        onChange={(e) => setSettingsClientSecret(e.target.value)}
        size="small"
        sx={{ mb: 0.5 }}
        helperText="Leer lassen = globales Secret aus den Einstellungen verwenden."
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                size="small"
                onClick={() => setShowSettingsSecret((v) => !v)}
                edge="end"
              >
                {showSettingsSecret ? <VisibilityOffIcon fontSize="inherit" /> : <VisibilityIcon fontSize="inherit" />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 1, fontSize: '0.65rem' }}>
        ⚠️ Nur für selbst gehostete Instanzen geeignet. Das Client-Secret wird im Browser (localStorage) gespeichert und ist für Browser-Devtools sichtbar.
      </Typography>
    </>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  const filteredNotes = searchQuery.trim()
    ? notes.filter(
        (n) =>
          n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          n.content.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : notes

  const noteList = (
    <List dense disablePadding>
      {filteredNotes.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
          {searchQuery.trim() ? 'Keine Notizen gefunden.' : 'Keine Notizen vorhanden.'}
        </Typography>
      )}
      {filteredNotes.map((note) => (
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
      <BaseTile
        tile={tile}
        settingsChildren={clientId ? settingsContent : undefined}
        getExtraConfig={clientId ? getExtraConfig : undefined}
        onSettingsOpen={clientId ? handleSettingsOpen : undefined}
        onTileClick={() => setModalOpen(true)}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <NoteIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight="bold" sx={{ flex: 1 }}>
            {(tile.config?.name as string) || 'Notizen'}
          </Typography>
          {tokenOk && (
            <Tooltip title={syncing ? 'Synchronisiert…' : 'Mit Google Keep verbunden'}>
              {syncing ? (
                <CircularProgress size={14} sx={{ mr: 0.5 }} />
              ) : (
                <CloudIcon sx={{ fontSize: '0.9rem', color: 'success.main', mr: 0.5 }} />
              )}
            </Tooltip>
          )}
          <Tooltip title="Neue Notiz (mit Details)">
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); setNewNoteOpen(true) }}
            >
              <AddIcon fontSize="inherit" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Show sync error inline */}
        {syncError && (
          <Typography variant="caption" color="error" sx={{ display: 'block', mb: 0.5 }}>
            <CloudOffIcon sx={{ fontSize: '0.8rem', mr: 0.3, verticalAlign: 'middle' }} />
            {syncError}
          </Typography>
        )}

        {/* Connect button – shown when clientId is configured but not yet logged in */}
        {clientId && !tokenOk && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Nicht mit Google verbunden.
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<LoginIcon />}
              onClick={(e) => { e.stopPropagation(); login() }}
            >
              Mit Google verbinden
            </Button>
          </Box>
        )}

        {/* Inline quick-add */}
        <TextField
          size="small"
          fullWidth
          placeholder="Neue Notiz…"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={handleQuickAddKeyDown}
          sx={{ mb: 1 }}
          InputProps={{
            endAdornment: quickTitle.trim() ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleQuickAdd() }}>
                  <AddIcon fontSize="inherit" />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />

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
        <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, flexShrink: 0, borderBottom: 1, borderColor: 'divider', gap: 1 }}>
          <TextField
            size="small"
            placeholder="Suchen…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ flex: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')}>
                    <CloseIcon fontSize="inherit" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
          />
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

// ─── Tile shown when no Google Client-ID is configured ────────────────────────

function NotesTileUnconfigured({ tile }: { tile: TileInstance }) {
  return (
    <BaseTile tile={tile}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <NoteIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" fontWeight="bold">
          {(tile.config?.name as string) || 'Notizen'}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary">
        Google Client-ID fehlt. Bitte in den Einstellungen konfigurieren.
      </Typography>
    </BaseTile>
  )
}

// ─── Wrapper that provides GoogleOAuthProvider ────────────────────────────────

export default function NotesTile({ tile }: { tile: TileInstance }) {
  const clientId = useGoogleAuthStore((s) => s.clientId)

  // When no clientId is configured, show a simplified tile that does not
  // initialise the OAuth provider (avoids using an invalid client ID).
  if (!clientId) {
    return <NotesTileUnconfigured tile={tile} />
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <NotesTileInner tile={tile} />
    </GoogleOAuthProvider>
  )
}
