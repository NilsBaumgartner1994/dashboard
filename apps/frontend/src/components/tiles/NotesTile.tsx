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
import { useTileFlowStore } from '../../store/useTileFlowStore'
import { useGoogleAuthStore, isTokenValid } from '../../store/useGoogleAuthStore'

// ─── Constants ────────────────────────────────────────────────────────────────

const MY_NOTES_LIST_TITLE = 'My_Notes'
const TASKS_BASE = 'https://tasks.googleapis.com/tasks/v1'
const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/tasks'
/** Maximum number of notes loaded per sync. Google Tasks API page limit is 100. */
const MAX_NOTES = 100

// ─── Types ────────────────────────────────────────────────────────────────────

interface Note {
  id: string
  title: string
  content: string
  updatedAt: number
}

interface TaskList {
  id: string
  title: string
}

// ─── Google Tasks helpers ─────────────────────────────────────────────────────

async function tasksListTaskLists(token: string): Promise<TaskList[]> {
  const res = await fetch(`${TASKS_BASE}/users/@me/lists`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (!res.ok) {
    let body = ''
    try { body = await res.text() } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status} – ${res.statusText}\n${body}`)
  }
  const data = await res.json() as { items?: TaskList[] }
  return (data.items ?? []).map((l) => ({ id: l.id, title: l.title }))
}

async function tasksCreateTaskList(token: string, title: string): Promise<TaskList> {
  const res = await fetch(`${TASKS_BASE}/users/@me/lists`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (!res.ok) {
    let body = ''
    try { body = await res.text() } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status} – ${res.statusText}\n${body}`)
  }
  return (await res.json()) as TaskList
}

async function tasksFetchNotes(token: string, listId: string): Promise<Note[]> {
  const url = new URL(`${TASKS_BASE}/lists/${encodeURIComponent(listId)}/tasks`)
  url.searchParams.set('showCompleted', 'false')
  url.searchParams.set('showHidden', 'false')
  url.searchParams.set('maxResults', String(MAX_NOTES))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (!res.ok) {
    let body = ''
    try { body = await res.text() } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status} – ${res.statusText}\n${body}`)
  }
  const data = await res.json() as { items?: Array<{ id: string; title: string; notes?: string; updated?: string }> }
  return (data.items ?? []).map((t) => ({
    id: t.id,
    title: t.title ?? '',
    content: t.notes ?? '',
    updatedAt: t.updated ? new Date(t.updated).getTime() : Date.now(),
  }))
}

async function tasksCreateNote(token: string, listId: string, title: string, content: string): Promise<Note> {
  const body: { title: string; notes?: string } = { title }
  if (content) body.notes = content
  const res = await fetch(`${TASKS_BASE}/lists/${encodeURIComponent(listId)}/tasks`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (!res.ok) {
    let resBody = ''
    try { resBody = await res.text() } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status} – ${res.statusText}\n${resBody}`)
  }
  const t = await res.json() as { id: string; title: string; notes?: string; updated?: string }
  return { id: t.id, title: t.title ?? '', content: t.notes ?? '', updatedAt: t.updated ? new Date(t.updated).getTime() : Date.now() }
}

async function tasksUpdateNote(token: string, listId: string, taskId: string, title: string, content: string): Promise<Note> {
  const body: { title: string; notes: string } = { title, notes: content }
  const res = await fetch(`${TASKS_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (!res.ok) {
    let resBody = ''
    try { resBody = await res.text() } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status} – ${res.statusText}\n${resBody}`)
  }
  const t = await res.json() as { id: string; title: string; notes?: string; updated?: string }
  return { id: t.id, title: t.title ?? '', content: t.notes ?? '', updatedAt: t.updated ? new Date(t.updated).getTime() : Date.now() }
}

async function tasksDeleteNote(token: string, listId: string, taskId: string): Promise<void> {
  const res = await fetch(`${TASKS_BASE}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new Error('TOKEN_EXPIRED')
  if (res.status === 404) return // already deleted
  if (!res.ok) {
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

// ─── Inner tile component (needs GoogleOAuthProvider in tree) ─────────────────

function NotesTileInner({ tile }: { tile: TileInstance }) {
  const publishOutput = useTileFlowStore((s) => s.publishOutput)

  const clientId = useGoogleAuthStore((s) => s.clientId)
  const globalClientSecret = useGoogleAuthStore((s) => s.clientSecret)
  const tileClientSecret = (tile.config?.clientSecret as string | undefined)?.trim() ?? ''
  const clientSecret = tileClientSecret || globalClientSecret

  const { accessToken, tokenExpiry, refreshToken, setToken, setRefreshToken, clearToken } = useGoogleAuthStore()
  const tokenOk = isTokenValid({ accessToken, tokenExpiry })

  // Notes loaded from Google Tasks "My_Notes" list
  const [notes, setNotes] = useState<Note[]>([])
  const [myNotesListId, setMyNotesListId] = useState<string | null>(null)

  // Sync state
  const [loading, setLoading] = useState(false)
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

  // ── Find or create "My_Notes" list and load notes ─────────────────────────

  useEffect(() => {
    if (!tokenOk || !accessToken) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setSyncError(null)
      try {
        // Find or create the My_Notes task list
        const lists = await tasksListTaskLists(accessToken)
        let list = lists.find((l) => l.title === MY_NOTES_LIST_TITLE)
        if (!list) {
          list = await tasksCreateTaskList(accessToken, MY_NOTES_LIST_TITLE)
        }
        if (cancelled) return
        setMyNotesListId(list.id)
        const loaded = await tasksFetchNotes(accessToken, list.id)
        if (!cancelled) setNotes(loaded)
        setSyncError(null)
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = (err as Error).message
          if (msg === 'TOKEN_EXPIRED') {
            clearToken()
            setSyncError('Sitzung abgelaufen. Bitte erneut anmelden.')
          } else {
            setSyncError(msg)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // Run only when token becomes valid (on login)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenOk, accessToken])

  // ── Note CRUD ─────────────────────────────────────────────────────────────

  const handleNoteClick = (note: Note) => {
    const outputContent = note.content.trim() || note.title.trim()
    if (outputContent) publishOutput(tile.id, { content: outputContent, dataType: 'text' })
    setSelectedNote(note)
    setEditorOpen(true)
  }

  const handleSaveExisting = async (title: string, content: string) => {
    if (!selectedNote || !accessToken || !myNotesListId) return
    try {
      const updated = await tasksUpdateNote(accessToken, myNotesListId, selectedNote.id, title, content)
      setNotes((prev) => prev.map((n) => n.id === updated.id ? updated : n))
      const outputContent = content.trim() || title.trim()
      if (outputContent) publishOutput(tile.id, { content: outputContent, dataType: 'text' })
    } catch (err: unknown) {
      const msg = (err as Error).message
      if (msg === 'TOKEN_EXPIRED') { clearToken(); setSyncError('Sitzung abgelaufen (401). Bitte erneut anmelden.') }
      else setSyncError(msg)
    }
    setEditorOpen(false)
    setSelectedNote(null)
  }

  const handleDeleteNote = async () => {
    if (!selectedNote || !accessToken || !myNotesListId) return
    const noteId = selectedNote.id
    setEditorOpen(false)
    setSelectedNote(null)
    try {
      await tasksDeleteNote(accessToken, myNotesListId, noteId)
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
    } catch (err: unknown) {
      const msg = (err as Error).message
      if (msg === 'TOKEN_EXPIRED') { clearToken(); setSyncError('Sitzung abgelaufen (401). Bitte erneut anmelden.') }
      else setSyncError(msg)
    }
  }

  const handleSaveNew = async (title: string, content: string) => {
    if (!accessToken || !myNotesListId) return
    setNewNoteOpen(false)
    try {
      const created = await tasksCreateNote(accessToken, myNotesListId, title || 'Neue Notiz', content)
      setNotes((prev) => [created, ...prev])
      const outputContent = content.trim() || title.trim()
      if (outputContent) publishOutput(tile.id, { content: outputContent, dataType: 'text' })
    } catch (err: unknown) {
      const msg = (err as Error).message
      if (msg === 'TOKEN_EXPIRED') { clearToken(); setSyncError('Sitzung abgelaufen (401). Bitte erneut anmelden.') }
      else setSyncError(msg)
    }
  }

  const handleQuickAdd = async () => {
    const trimmed = quickTitle.trim()
    if (!trimmed || !accessToken || !myNotesListId) return
    setQuickTitle('')
    try {
      const created = await tasksCreateNote(accessToken, myNotesListId, trimmed, `# ${trimmed}`)
      setNotes((prev) => [created, ...prev])
      publishOutput(tile.id, { content: trimmed, dataType: 'text' })
    } catch (err: unknown) {
      const msg = (err as Error).message
      if (msg === 'TOKEN_EXPIRED') { clearToken(); setSyncError('Sitzung abgelaufen (401). Bitte erneut anmelden.') }
      else setSyncError(msg)
    }
  }

  const handleQuickAddKeyDown = (e: { key: string; stopPropagation: () => void }) => {
    if (e.key === 'Enter' && quickTitle.trim()) {
      e.stopPropagation()
      void handleQuickAdd()
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
      <Divider sx={{ mb: 2 }}>Google Aufgaben – Notizen</Divider>
      {tokenOk ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <CloudIcon fontSize="small" color="success" />
          <Typography variant="body2" color="success.main" sx={{ flex: 1 }}>
            Verbunden (Liste: {MY_NOTES_LIST_TITLE})
          </Typography>
          <Button
            variant="text"
            size="small"
            onClick={() => { clearToken(); setNotes([]); setMyNotesListId(null); setSyncError(null) }}
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
            <Tooltip title={loading ? 'Lädt…' : 'Mit Google Aufgaben verbunden'}>
              {loading ? (
                <CircularProgress size={14} sx={{ mr: 0.5 }} />
              ) : (
                <CloudIcon sx={{ fontSize: '0.9rem', color: 'success.main', mr: 0.5 }} />
              )}
            </Tooltip>
          )}
          {tokenOk && !loading && myNotesListId && (
            <Tooltip title="Neue Notiz (mit Details)">
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); setNewNoteOpen(true) }}
              >
                <AddIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          )}
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

        {/* Inline quick-add (only when connected and list is ready) */}
        {tokenOk && !loading && myNotesListId && (
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
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); void handleQuickAdd() }}>
                    <AddIcon fontSize="inherit" />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            }}
          />
        )}

        {/* Compact note list */}
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          {tokenOk && loading && <CircularProgress size={20} />}
          {tokenOk && !loading && notes.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Keine Notizen vorhanden.
            </Typography>
          )}
          {tokenOk && !loading && notes.length > 0 && (
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
          {myNotesListId && (
            <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={() => setNewNoteOpen(true)}>
              Neue Notiz
            </Button>
          )}
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
        onSave={(title, content) => { void handleSaveExisting(title, content) }}
        onDelete={() => { void handleDeleteNote() }}
      />

      {/* Editor for new note */}
      <NoteEditor
        note={null}
        open={newNoteOpen}
        onClose={() => setNewNoteOpen(false)}
        onSave={(title, content) => { void handleSaveNew(title, content) }}
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
