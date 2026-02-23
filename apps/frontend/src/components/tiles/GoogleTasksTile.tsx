import { useState, useEffect, useCallback } from 'react'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Checkbox,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  TextField,
  Tooltip,
  Divider,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import LoginIcon from '@mui/icons-material/Login'
import AssignmentIcon from '@mui/icons-material/Assignment'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import CheckIcon from '@mui/icons-material/Check'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CloseIcon from '@mui/icons-material/Close'
import BaseTile from './BaseTile'
import LargeModal from './LargeModal'
import type { TileInstance } from '../../store/useStore'
import { useGoogleAuthStore } from '../../store/useGoogleAuthStore'
import { useGoogleTasksStore, isTasksTokenValid } from '../../store/useGoogleTasksStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string
  title: string
  notes?: string
  due?: string
  status: 'needsAction' | 'completed'
  completed?: string
}

interface TaskList {
  id: string
  title: string
}

const REPEAT_OPTIONS = [
  { value: 'never', label: 'Nie' },
  { value: 'daily', label: 'Täglich' },
  { value: 'weekly', label: 'Wöchentlich' },
  { value: 'monthly', label: 'Monatlich' },
  { value: 'yearly', label: 'Jährlich' },
]

const REPEAT_PREFIX = '🔄 Wiederholen: '

// ─── Tile shown when no Google Client-ID is configured ────────────────────────

function GoogleTasksTileUnconfigured({ tile }: { tile: TileInstance }) {
  return (
    <BaseTile tile={tile}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <AssignmentIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" fontWeight="bold">
          {(tile.config?.name as string) || 'Aufgaben'}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary">
        Google Client-ID fehlt. Bitte in den Einstellungen konfigurieren.
      </Typography>
    </BaseTile>
  )
}

// ─── Helper: format a due date string for display ─────────────────────────────

function formatDue(due: string | undefined): string | null {
  if (!due) return null
  try {
    const d = new Date(due)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    if (sameDay(d, today)) return 'Heute'
    if (sameDay(d, tomorrow)) return 'Morgen'
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return null
  }
}

// ─── Helper: extract repeat info from notes ───────────────────────────────────

function extractRepeat(notes: string | undefined): { repeat: string; cleanNotes: string } {
  if (!notes) return { repeat: 'never', cleanNotes: '' }
  const lines = notes.split('\n')
  const repeatLine = lines.find((l) => l.startsWith(REPEAT_PREFIX))
  if (!repeatLine) return { repeat: 'never', cleanNotes: notes }
  const label = repeatLine.slice(REPEAT_PREFIX.length).trim()
  const option = REPEAT_OPTIONS.find((o) => o.label === label)
  const cleanNotes = lines.filter((l) => !l.startsWith(REPEAT_PREFIX)).join('\n').trim()
  return { repeat: option?.value ?? 'never', cleanNotes }
}

// ─── Inner component (needs GoogleOAuthProvider in tree) ──────────────────────

function GoogleTasksTileInner({ tile }: { tile: TileInstance }) {
  const { accessToken: tasksToken, tokenExpiry, setToken, clearToken } = useGoogleTasksStore()

  const tokenOk = isTasksTokenValid({ accessToken: tasksToken, tokenExpiry })

  // Task data
  const [taskLists, setTaskLists] = useState<TaskList[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Selected task list (stored in tile config)
  const selectedListId = (tile.config?.selectedListId as string) || '@default'

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)

  // Add task dialog state
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newRepeat, setNewRepeat] = useState('never')
  const [addLoading, setAddLoading] = useState(false)

  // Settings
  const [settingsListId, setSettingsListId] = useState(selectedListId)

  // ── Google login (implicit flow, tasks scope) ──────────────────────────────
  const login = useGoogleLogin({
    flow: 'implicit',
    scope: 'https://www.googleapis.com/auth/tasks',
    onSuccess: (tokenResponse) => {
      setToken(tokenResponse.access_token, tokenResponse.expires_in ?? 3600)
      setError(null)
    },
    onError: () => setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.'),
  })

  // ── Fetch task lists ───────────────────────────────────────────────────────
  const fetchTaskLists = useCallback(
    async (token: string): Promise<TaskList[]> => {
      const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        clearToken()
        throw new Error('TOKEN_EXPIRED')
      }
      if (!res.ok) {
        let body = ''
        try { body = await res.text() } catch { /* ignore */ }
        throw new Error(`HTTP ${res.status} – ${res.statusText}\n\n${body}`)
      }
      const data = await res.json()
      return (data.items ?? []).map((l: TaskList) => ({ id: l.id, title: l.title }))
    },
    [clearToken],
  )

  // ── Fetch tasks ────────────────────────────────────────────────────────────
  const fetchTasks = useCallback(
    async (token: string, listId: string): Promise<Task[]> => {
      const url = new URL(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
      )
      url.searchParams.set('showCompleted', 'false')
      url.searchParams.set('showHidden', 'false')
      url.searchParams.set('maxResults', '100')
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        clearToken()
        throw new Error('TOKEN_EXPIRED')
      }
      if (!res.ok) {
        let body = ''
        try { body = await res.text() } catch { /* ignore */ }
        throw new Error(`HTTP ${res.status} – ${res.statusText}\n\n${body}`)
      }
      const data = await res.json()
      return (data.items ?? []) as Task[]
    },
    [clearToken],
  )

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!tokenOk || !tasksToken) return
    setLoading(true)
    setError(null)
    try {
      const [lists, taskItems] = await Promise.all([
        fetchTaskLists(tasksToken),
        fetchTasks(tasksToken, selectedListId),
      ])
      setTaskLists(lists)
      setTasks(taskItems)
    } catch (err: unknown) {
      if ((err as Error).message === 'TOKEN_EXPIRED') {
        setError('Sitzung abgelaufen (401). Bitte erneut anmelden.')
      } else {
        setError((err as Error).message)
      }
    } finally {
      setLoading(false)
    }
  }, [tokenOk, tasksToken, selectedListId, fetchTaskLists, fetchTasks])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Complete task ──────────────────────────────────────────────────────────
  const handleComplete = async (task: Task) => {
    if (!tasksToken) return
    try {
      const res = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(selectedListId)}/tasks/${encodeURIComponent(task.id)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${tasksToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'completed' }),
        },
      )
      if (res.status === 401) { clearToken(); setError('Sitzung abgelaufen (401). Bitte erneut anmelden.'); return }
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== task.id))
      }
    } catch { /* ignore */ }
  }

  // ── Delete task ────────────────────────────────────────────────────────────
  const handleDelete = async (task: Task) => {
    if (!tasksToken) return
    try {
      const res = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(selectedListId)}/tasks/${encodeURIComponent(task.id)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tasksToken}` },
        },
      )
      if (res.status === 401) { clearToken(); setError('Sitzung abgelaufen (401). Bitte erneut anmelden.'); return }
      if (res.ok || res.status === 204) {
        setTasks((prev) => prev.filter((t) => t.id !== task.id))
      }
    } catch { /* ignore */ }
  }

  // ── Add task ───────────────────────────────────────────────────────────────
  const handleAddTask = async () => {
    if (!tasksToken || !newTitle.trim()) return
    setAddLoading(true)
    try {
      let notes = newNotes.trim()
      if (newRepeat !== 'never') {
        const repeatLabel = REPEAT_OPTIONS.find((o) => o.value === newRepeat)?.label ?? ''
        notes = notes ? `${notes}\n${REPEAT_PREFIX}${repeatLabel}` : `${REPEAT_PREFIX}${repeatLabel}`
      }

      const body: Partial<Task> & { due?: string; notes?: string } = {
        title: newTitle.trim(),
      }
      if (notes) body.notes = notes
      if (newDue) body.due = new Date(newDue + 'T00:00:00').toISOString()

      const res = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(selectedListId)}/tasks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tasksToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      )
      if (res.status === 401) { clearToken(); setError('Sitzung abgelaufen (401). Bitte erneut anmelden.'); return }
      if (res.ok) {
        const created: Task = await res.json()
        setTasks((prev) => [created, ...prev])
        setAddOpen(false)
        setNewTitle('')
        setNewNotes('')
        setNewDue('')
        setNewRepeat('never')
      }
    } catch { /* ignore */ } finally {
      setAddLoading(false)
    }
  }

  const openAddDialog = () => {
    setNewTitle('')
    setNewNotes('')
    setNewDue('')
    setNewRepeat('never')
    setAddOpen(true)
  }

  const setDueToday = () => {
    const d = new Date()
    setNewDue(d.toISOString().split('T')[0])
  }

  const setDueTomorrow = () => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    setNewDue(d.toISOString().split('T')[0])
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const tomorrowStr = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] })()

  const handleCopyError = () => {
    if (error) {
      navigator.clipboard.writeText(error).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => { /* clipboard unavailable */ })
    }
  }

  // ── Settings content ────────────────────────────────────────────────────────
  const handleSettingsOpen = () => {
    setSettingsListId(selectedListId)
  }

  const getExtraConfig = () => ({ selectedListId: settingsListId })

  const settingsContent = (
    <>
      <Divider sx={{ mb: 2 }}>Google Aufgaben</Divider>
      {tokenOk ? (
        <>
          {taskLists.length > 0 && (
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Aufgabenliste</InputLabel>
              <Select
                value={settingsListId}
                label="Aufgabenliste"
                onChange={(e) => setSettingsListId(e.target.value)}
              >
                {taskLists.map((list) => (
                  <MenuItem key={list.id} value={list.id}>{list.title}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <Button variant="text" size="small" onClick={() => { clearToken(); setError(null) }}>
            Abmelden
          </Button>
        </>
      ) : (
        <Button
          variant="outlined"
          startIcon={<LoginIcon />}
          onClick={() => login()}
          sx={{ mb: 1 }}
        >
          Mit Google anmelden
        </Button>
      )}
    </>
  )

  // ── Task list renderer ──────────────────────────────────────────────────────
  const renderTaskList = (taskItems: Task[]) => (
    <List dense disablePadding>
      {taskItems.map((task) => {
        const dueLabel = formatDue(task.due)
        const { cleanNotes, repeat } = extractRepeat(task.notes)
        const repeatLabel = repeat !== 'never'
          ? REPEAT_OPTIONS.find((o) => o.value === repeat)?.label
          : null
        return (
          <ListItem key={task.id} disableGutters dense sx={{ alignItems: 'flex-start', pr: 4 }}>
            <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
              <Checkbox
                edge="start"
                checked={task.status === 'completed'}
                size="small"
                onChange={() => handleComplete(task)}
                sx={{ p: 0 }}
              />
            </ListItemIcon>
            <ListItemText
              primary={task.title}
              secondary={
                <>
                  {dueLabel && (
                    <Typography component="span" variant="caption" color="primary" sx={{ mr: 1 }}>
                      📅 {dueLabel}
                    </Typography>
                  )}
                  {repeatLabel && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                      🔄 {repeatLabel}
                    </Typography>
                  )}
                  {cleanNotes && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {cleanNotes}
                    </Typography>
                  )}
                </>
              }
              primaryTypographyProps={{ variant: 'body2', sx: { wordBreak: 'break-word' } }}
            />
            <Tooltip title="Löschen">
              <IconButton
                size="small"
                edge="end"
                onClick={() => handleDelete(task)}
                sx={{ position: 'absolute', right: 0, top: 4 }}
              >
                <DeleteIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          </ListItem>
        )
      })}
    </List>
  )

  // ── Tile body ────────────────────────────────────────────────────────────
  return (
    <>
      <BaseTile
        tile={tile}
        settingsChildren={settingsContent}
        getExtraConfig={getExtraConfig}
        onSettingsOpen={handleSettingsOpen}
        onTileClick={tokenOk ? () => setModalOpen(true) : undefined}
      >
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <AssignmentIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight="bold" sx={{ flex: 1 }}>
            {(tile.config?.name as string) || 'Aufgaben'}
          </Typography>
          {tokenOk && (
            <Tooltip title="Aufgabe hinzufügen">
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); openAddDialog() }}>
                <AddIcon fontSize="inherit" />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Not logged in */}
        {!tokenOk && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Nicht angemeldet.
            </Typography>
            <Button
              size="small"
              variant="outlined"
              startIcon={<LoginIcon />}
              onClick={() => login()}
            >
              Mit Google anmelden
            </Button>
          </Box>
        )}

        {/* Loading */}
        {tokenOk && loading && <CircularProgress size={20} />}

        {/* Error */}
        {tokenOk && error && (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, width: '100%' }}>
            <Typography
              variant="body2"
              color="error"
              sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.7rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
            >
              {error}
            </Typography>
            <Tooltip title={copied ? 'Kopiert!' : 'Fehlermeldung kopieren'}>
              <IconButton size="small" onClick={handleCopyError}>
                {copied ? <CheckIcon fontSize="inherit" color="success" /> : <ContentCopyIcon fontSize="inherit" />}
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {/* Task list (compact) */}
        {tokenOk && !loading && !error && tasks.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            Keine offenen Aufgaben.
          </Typography>
        )}

        {tokenOk && !loading && !error && tasks.length > 0 && (
          <Box sx={{ overflow: 'auto', flex: 1 }}>
            {renderTaskList(tasks.slice(0, 5))}
            {tasks.length > 5 && (
              <Typography variant="caption" color="text.secondary">
                +{tasks.length - 5} weitere…
              </Typography>
            )}
          </Box>
        )}
      </BaseTile>

      {/* ── Full task list modal ─────────────────────────────────────────── */}
      <LargeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={(tile.config?.name as string) || 'Aufgaben'}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            {tasks.length === 0 ? 'Keine offenen Aufgaben' : `${tasks.length} Aufgabe${tasks.length === 1 ? '' : 'n'}`}
          </Typography>
          <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openAddDialog}>
            Neue Aufgabe
          </Button>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <CircularProgress />
            </Box>
          )}
          {!loading && tasks.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Keine offenen Aufgaben.
            </Typography>
          )}
          {!loading && renderTaskList(tasks)}
        </Box>
      </LargeModal>

      {/* ── Add task dialog ──────────────────────────────────────────────── */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
          <Box sx={{ flex: 1 }}>Neue Aufgabe</Box>
          <IconButton size="small" onClick={() => setAddOpen(false)}>
            <CloseIcon fontSize="inherit" />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Titel"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newTitle.trim()) handleAddTask() }}
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            fullWidth
            label="Details"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            multiline
            rows={2}
            sx={{ mb: 2 }}
          />
          {/* Due date */}
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            Fälligkeitsdatum
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button size="small" variant={newDue === todayStr ? 'contained' : 'outlined'} onClick={setDueToday}>
              Heute
            </Button>
            <Button
              size="small"
              variant={newDue === tomorrowStr ? 'contained' : 'outlined'}
              onClick={setDueTomorrow}
            >
              Morgen
            </Button>
            <TextField
              size="small"
              type="date"
              value={newDue}
              onChange={(e) => setNewDue(e.target.value)}
              inputProps={{ min: todayStr }}
              sx={{ flex: 1, minWidth: 140 }}
            />
            {newDue && (
              <IconButton size="small" onClick={() => setNewDue('')}>
                <DeleteIcon fontSize="inherit" />
              </IconButton>
            )}
          </Box>
          {/* Wiederholen */}
          <FormControl fullWidth size="small">
            <InputLabel>Wiederholen</InputLabel>
            <Select
              value={newRepeat}
              label="Wiederholen"
              onChange={(e) => setNewRepeat(e.target.value)}
            >
              {REPEAT_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Abbrechen</Button>
          <Button
            variant="contained"
            onClick={handleAddTask}
            disabled={!newTitle.trim() || addLoading}
            startIcon={addLoading ? <CircularProgress size={14} /> : <CheckIcon />}
          >
            Hinzufügen
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

// ─── Wrapper that provides GoogleOAuthProvider ────────────────────────────────

export default function GoogleTasksTile({ tile }: { tile: TileInstance }) {
  const clientId = useGoogleAuthStore((s) => s.clientId)

  if (!clientId) {
    return <GoogleTasksTileUnconfigured tile={tile} />
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <GoogleTasksTileInner tile={tile} />
    </GoogleOAuthProvider>
  )
}
