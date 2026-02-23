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
  TextField,
  Tooltip,
  IconButton,
} from '@mui/material'
import LoginIcon from '@mui/icons-material/Login'
import EventIcon from '@mui/icons-material/Event'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'
import { useGoogleAuthStore, isTokenValid } from '../../store/useGoogleAuthStore'

interface CalendarInfo {
  id: string
  summary: string
  backgroundColor?: string
}

interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  colorId?: string
  calendarId?: string
}

interface GoogleCalendarConfig {
  name?: string
  backgroundImage?: string
  selectedCalendarIds?: string[]
  daysAhead?: number
}

/** Returns true if white text has sufficient contrast on the given hex background color. */
function shouldUseWhiteText(hexColor: string): boolean {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance < 0.179
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

// ─── Reusable error display with copy button ──────────────────────────────────

function ErrorMessage({ message, copied, onCopy }: { message: string; copied: boolean; onCopy: () => void }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5, width: '100%' }}>
      <Typography
        variant="body2"
        color="error"
        sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', flex: 1, fontFamily: 'monospace', fontSize: '0.7rem' }}
      >
        {message}
      </Typography>
      <Tooltip title={copied ? 'Kopiert!' : 'Fehlermeldung kopieren'}>
        <IconButton size="small" onClick={onCopy}>
          {copied ? <CheckIcon fontSize="inherit" color="success" /> : <ContentCopyIcon fontSize="inherit" />}
        </IconButton>
      </Tooltip>
    </Box>
  )
}

// ─── Inner component (needs GoogleOAuthProvider in tree) ──────────────────────

function GoogleCalendarTileInner({ tile }: { tile: TileInstance }) {
  const { accessToken, tokenExpiry, setToken, clearToken } = useGoogleAuthStore()
  const config = (tile.config ?? {}) as GoogleCalendarConfig
  const selectedCalendarIds: string[] = config.selectedCalendarIds ?? []
  const daysAhead = config.daysAhead ?? 7

  const tokenOk = isTokenValid({ accessToken, tokenExpiry })

  // Events & calendars state
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCopyError = () => {
    if (error) {
      navigator.clipboard.writeText(error).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }).catch(() => { /* clipboard unavailable */ })
    }
  }

  // Settings form state (calendar selection inside settings modal)
  const [settingsCalendars, setSettingsCalendars] = useState<(CalendarInfo & { selected: boolean })[]>([])
  const [settingsDaysAhead, setSettingsDaysAhead] = useState(String(daysAhead))

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
    if (!res.ok) {
      let body = ''
      try { body = await res.text() } catch { /* ignore */ }
      throw new Error(`HTTP ${res.status} – ${res.statusText}\n\n${body}`)
    }
    const data = await res.json()
    return (data.items ?? []).map((c: CalendarInfo & { backgroundColor?: string }) => ({
      id: c.id,
      summary: c.summary,
      backgroundColor: c.backgroundColor,
    }))
  }, [clearToken])

  // ── Fetch events for N days ahead ────────────────────────────────────────
  const fetchEvents = useCallback(
    async (token: string, calIds: string[], days: number): Promise<CalendarEvent[]> => {
      const now = new Date()
      const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).toISOString()

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
          if (!res.ok) {
            let body = ''
            try { body = await res.text() } catch { /* ignore */ }
            throw new Error(`HTTP ${res.status} – ${res.statusText} (${calId})\n\n${body}`)
          }
          const data = await res.json()
          return ((data.items ?? []) as CalendarEvent[]).map((ev) => ({ ...ev, calendarId: calId }))
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
        return fetchEvents(accessToken, ids, daysAhead)
      })
      .then(setEvents)
      .catch((err: Error) => {
        if (err.message === 'TOKEN_EXPIRED') {
          setError('Sitzung abgelaufen (401). Bitte erneut anmelden.')
        } else {
          setError(err.message)
        }
      })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenOk, accessToken, selectedCalendarIds.join(','), daysAhead, fetchCalendars, fetchEvents])

  // ── Settings helpers ─────────────────────────────────────────────────────
  const handleSettingsOpen = () => {
    setSettingsCalendars(
      calendars.map((c) => ({
        ...c,
        selected:
          selectedCalendarIds.length === 0 ? true : selectedCalendarIds.includes(c.id),
      })),
    )
    setSettingsDaysAhead(String(daysAhead))
  }

  const getExtraConfig = () => {
    const ids = settingsCalendars.filter((c) => c.selected).map((c) => c.id)
    const parsed = parseInt(settingsDaysAhead, 10)
    return { selectedCalendarIds: ids, daysAhead: !isNaN(parsed) && parsed >= 1 ? parsed : 7 }
  }

  const toggleCalendar = (id: string) => {
    setSettingsCalendars((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)),
    )
  }

  const handleTokenReset = () => {
    clearToken()
    setError(null)
  }

  // ── Settings content ─────────────────────────────────────────────────────
  const settingsContent = (
    <>
      <Divider sx={{ mb: 2 }}>Google Kalender</Divider>
      {error && (
        <Box sx={{ mb: 2 }}>
          <ErrorMessage message={error} copied={copied} onCopy={handleCopyError} />
        </Box>
      )}
      {tokenOk ? (
        <>
          <TextField
            fullWidth
            label="Tage im Voraus laden"
            type="number"
            inputProps={{ min: 1, max: 30 }}
            value={settingsDaysAhead}
            onChange={(e) => setSettingsDaysAhead(e.target.value)}
            size="small"
            sx={{ mb: 2 }}
          />
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
                    sx={cal.backgroundColor ? { color: cal.backgroundColor, '&.Mui-checked': { color: cal.backgroundColor } } : undefined}
                  />
                }
                label={cal.summary}
              />
            ))}
          </FormGroup>
        </>
      ) : (
        <>
          <Button
            variant="outlined"
            startIcon={<LoginIcon />}
            onClick={() => login()}
            sx={{ mb: 1 }}
          >
            Mit Google anmelden
          </Button>
          <Button
            variant="text"
            onClick={handleTokenReset}
            sx={{ mb: 1 }}
          >
            Token zurücksetzen
          </Button>
        </>
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

  // ── Calendar color lookup ────────────────────────────────────────────────
  const calColorMap: Record<string, string> = {}
  for (const cal of calendars) {
    if (cal.backgroundColor) calColorMap[cal.id] = cal.backgroundColor
  }

  // ── Group events by date ─────────────────────────────────────────────────
  type DateGroup = { dateLabel: string; events: CalendarEvent[] }
  const grouped: DateGroup[] = []
  for (const ev of events) {
    const dateKey = ev.start.dateTime
      ? new Date(ev.start.dateTime).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
      : ev.start.date
      ? new Date(ev.start.date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Unbekannt'
    const existing = grouped.find((g) => g.dateLabel === dateKey)
    if (existing) existing.events.push(ev)
    else grouped.push({ dateLabel: dateKey, events: [ev] })
  }

  // ── Tile body ────────────────────────────────────────────────────────────
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

      {/* Body */}
      {!tokenOk && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
          {error ? (
            <Box sx={{ width: '100%' }}>
              <ErrorMessage message={error} copied={copied} onCopy={handleCopyError} />
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Nicht angemeldet.
            </Typography>
          )}
          <Button
            size="small"
            variant="outlined"
            startIcon={<LoginIcon />}
            onClick={() => login()}
          >
            Mit Google anmelden
          </Button>
          <Button
            size="small"
            variant="text"
            onClick={handleTokenReset}
          >
            Token zurücksetzen
          </Button>
        </Box>
      )}

      {tokenOk && loading && <CircularProgress size={20} />}

      {tokenOk && error && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1, width: '100%' }}>
          <ErrorMessage message={error} copied={copied} onCopy={handleCopyError} />
          <Button
            size="small"
            variant="text"
            onClick={handleTokenReset}
          >
            Token zurücksetzen
          </Button>
        </Box>
      )}

      {tokenOk && !loading && !error && events.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Keine Ereignisse in den nächsten {daysAhead} Tagen.
        </Typography>
      )}

      {tokenOk && !loading && grouped.length > 0 && (
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          {grouped.map((group) => (
            <Box key={group.dateLabel}>
              <Typography
                variant="caption"
                fontWeight="bold"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5, mb: 0.25, textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {group.dateLabel}
              </Typography>
              <List dense disablePadding>
                {group.events.map((ev) => {
                  const evColor = ev.calendarId ? calColorMap[ev.calendarId] : undefined
                  return (
                    <ListItem key={ev.id} disableGutters disablePadding sx={{ mb: 0.5 }}>
                      <Chip
                        size="small"
                        label={formatTime(ev)}
                        sx={{
                          mr: 1,
                          minWidth: 52,
                          fontSize: '0.65rem',
                          backgroundColor: evColor ?? undefined,
                          color: evColor ? (shouldUseWhiteText(evColor) ? '#fff' : '#000') : undefined,
                        }}
                      />
                      <ListItemText
                        primary={ev.summary}
                        primaryTypographyProps={{ variant: 'body2', noWrap: true }}
                      />
                    </ListItem>
                  )
                })}
              </List>
            </Box>
          ))}
        </Box>
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
