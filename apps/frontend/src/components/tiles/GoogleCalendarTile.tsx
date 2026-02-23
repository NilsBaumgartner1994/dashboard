import { useState, useEffect, useCallback } from 'react'
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google'
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Divider,
  List,
  ListItem,
  ListItemText,
  Chip,
} from '@mui/material'
import LoginIcon from '@mui/icons-material/Login'
import EventIcon from '@mui/icons-material/Event'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import { useGoogleAuthStore, isTokenValid } from '../../store/useGoogleAuthStore'

interface CalendarInfo {
  id: string
  summary: string
}

interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
}

interface GoogleCalendarConfig {
  name?: string
  backgroundImage?: string
  selectedCalendarIds?: string[]
}

// ─── Tile shown when no Google Client-ID is configured ────────────────────────

function GoogleCalendarTileUnconfigured({ tile }: { tile: TileInstance }) {
  return (
    <BaseTile tile={tile}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <EventIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" fontWeight="bold">
          {(tile.config?.name as string) || 'Google Kalender'}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary">
        Google Client-ID fehlt. Bitte in den Einstellungen konfigurieren.
      </Typography>
    </BaseTile>
  )
}

// ─── Inner component (needs GoogleOAuthProvider in tree) ──────────────────────

function GoogleCalendarTileInner({ tile }: { tile: TileInstance }) {
  const { accessToken, tokenExpiry, setToken, clearToken } = useGoogleAuthStore()
  const config = (tile.config ?? {}) as GoogleCalendarConfig
  const selectedCalendarIds: string[] = config.selectedCalendarIds ?? []

  const tokenOk = isTokenValid({ accessToken, tokenExpiry })

  // Events & calendars state
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Settings form state (calendar selection inside settings modal)
  const [settingsCalendars, setSettingsCalendars] = useState<(CalendarInfo & { selected: boolean })[]>([])

  // ── Google login (implicit flow) ─────────────────────────────────────────
  const login = useGoogleLogin({
    flow: 'implicit',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    onSuccess: (tokenResponse) => {
      setToken(tokenResponse.access_token, tokenResponse.expires_in ?? 3600)
      setError(null)
    },
    onError: () => setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.'),
  })

  // ── Fetch calendars ───────────────────────────────────────────────────────
  const fetchCalendars = useCallback(async (token: string): Promise<CalendarInfo[]> => {
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (res.status === 401) {
      clearToken()
      throw new Error('TOKEN_EXPIRED')
    }
    if (!res.ok) throw new Error(`Kalender laden fehlgeschlagen (${res.status})`)
    const data = await res.json()
    return (data.items ?? []).map((c: { id: string; summary: string }) => ({
      id: c.id,
      summary: c.summary,
    }))
  }, [clearToken])

  // ── Fetch today's events ─────────────────────────────────────────────────
  const fetchTodayEvents = useCallback(
    async (token: string, calIds: string[]): Promise<CalendarEvent[]> => {
      const now = new Date()
      const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString()

      const targetCals = calIds.length > 0 ? calIds : ['primary']
      const results = await Promise.all(
        targetCals.map(async (calId) => {
          const url = new URL(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events`,
          )
          url.searchParams.set('timeMin', timeMin)
          url.searchParams.set('timeMax', timeMax)
          url.searchParams.set('singleEvents', 'true')
          url.searchParams.set('orderBy', 'startTime')
          const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (res.status === 401) {
            clearToken()
            throw new Error('TOKEN_EXPIRED')
          }
          if (!res.ok) return []
          const data = await res.json()
          return (data.items ?? []) as CalendarEvent[]
        }),
      )
      return results.flat().sort((a, b) => {
        const ta = a.start.dateTime ?? a.start.date ?? ''
        const tb = b.start.dateTime ?? b.start.date ?? ''
        return ta.localeCompare(tb)
      })
    },
    [clearToken],
  )

  // ── Load data when token and calendar selection change ───────────────────
  useEffect(() => {
    if (!tokenOk || !accessToken) return
    setLoading(true)
    setError(null)
    fetchCalendars(accessToken)
      .then((cals) => {
        setCalendars(cals)
        const ids =
          selectedCalendarIds.length > 0
            ? selectedCalendarIds
            : cals.map((c) => c.id)
        return fetchTodayEvents(accessToken, ids)
      })
      .then(setEvents)
      .catch((err: Error) => {
        if (err.message !== 'TOKEN_EXPIRED') setError(err.message)
      })
      .finally(() => setLoading(false))
  // Re-run when token status, the token itself, or the selected calendar list changes.
  // fetchCalendars/fetchTodayEvents are stable (only depend on clearToken).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenOk, accessToken, selectedCalendarIds.join(','), fetchCalendars, fetchTodayEvents])

  // ── Settings helpers ─────────────────────────────────────────────────────
  const handleSettingsOpen = () => {
    setSettingsCalendars(
      calendars.map((c) => ({
        ...c,
        selected:
          selectedCalendarIds.length === 0 ? true : selectedCalendarIds.includes(c.id),
      })),
    )
  }

  const getExtraConfig = () => {
    const ids = settingsCalendars.filter((c) => c.selected).map((c) => c.id)
    return { selectedCalendarIds: ids }
  }

  const toggleCalendar = (id: string) => {
    setSettingsCalendars((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)),
    )
  }

  // ── Settings content ─────────────────────────────────────────────────────
  const settingsContent = (
    <>
      <Divider sx={{ mb: 2 }}>Google Kalender</Divider>
      {tokenOk ? (
        <>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Kalender auswählen (leer = alle)
          </Typography>
          {settingsCalendars.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Noch keine Kalender geladen.
            </Typography>
          )}
          <FormGroup>
            {settingsCalendars.map((cal) => (
              <FormControlLabel
                key={cal.id}
                control={
                  <Checkbox
                    checked={cal.selected}
                    onChange={() => toggleCalendar(cal.id)}
                  />
                }
                label={cal.summary}
              />
            ))}
          </FormGroup>
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

  // ── Event formatting helper ──────────────────────────────────────────────
  const formatTime = (ev: CalendarEvent): string => {
    if (ev.start.dateTime) {
      const d = new Date(ev.start.dateTime)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    return 'Ganztag'
  }

  // ── Tile body ────────────────────────────────────────────────────────────
  const today = new Date()
  const todayLabel = today.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  return (
    <BaseTile
      tile={tile}
      settingsChildren={settingsContent}
      getExtraConfig={getExtraConfig}
      onSettingsOpen={handleSettingsOpen}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <EventIcon fontSize="small" color="primary" />
        <Typography variant="subtitle2" fontWeight="bold">
          {(tile.config?.name as string) || 'Google Kalender'}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {todayLabel}
      </Typography>

      {/* Body */}
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

      {tokenOk && loading && <CircularProgress size={20} />}

      {tokenOk && error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}

      {tokenOk && !loading && !error && events.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Keine Ereignisse heute.
        </Typography>
      )}

      {tokenOk && !loading && events.length > 0 && (
        <List dense disablePadding>
          {events.map((ev) => (
            <ListItem key={ev.id} disableGutters disablePadding sx={{ mb: 0.5 }}>
              <Chip
                size="small"
                label={formatTime(ev)}
                sx={{ mr: 1, minWidth: 52, fontSize: '0.65rem' }}
              />
              <ListItemText
                primary={ev.summary}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
              />
            </ListItem>
          ))}
        </List>
      )}
    </BaseTile>
  )
}

// ─── Wrapper that provides GoogleOAuthProvider ────────────────────────────────

export default function GoogleCalendarTile({ tile }: { tile: TileInstance }) {
  const clientId = useGoogleAuthStore((s) => s.clientId)

  // When no clientId is configured, show a simplified tile that does not
  // initialise the OAuth provider (avoids using an invalid client ID).
  if (!clientId) {
    return <GoogleCalendarTileUnconfigured tile={tile} />
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      <GoogleCalendarTileInner tile={tile} />
    </GoogleOAuthProvider>
  )
}
