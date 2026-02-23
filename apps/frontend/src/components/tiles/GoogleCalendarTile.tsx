import { useState, useEffect, useCallback, useRef } from 'react'
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
  TextField,
  Tooltip,
  IconButton,
} from '@mui/material'
import LoginIcon from '@mui/icons-material/Login'
import EventIcon from '@mui/icons-material/Event'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import BaseTile from './BaseTile'
import LargeModal from './LargeModal'
import CalendarEventItem, { isCalendarWeekMarker } from './CalendarEventItem'
import CalendarEventDetailModal from './CalendarEventDetailModal'
import ReloadIntervalBar from './ReloadIntervalBar'
import ReloadIntervalSettings from './ReloadIntervalSettings'
import type { CalendarEventData } from './CalendarEventItem'
import type { TileInstance } from '../../store/useStore'
import { useGoogleAuthStore, isTokenValid } from '../../store/useGoogleAuthStore'
import { useCalendarEventsStore } from '../../store/useCalendarEventsStore'

interface CalendarInfo {
  id: string
  summary: string
  backgroundColor?: string
}

type CalendarEvent = CalendarEventData & {
  colorId?: string
}

interface GoogleCalendarConfig {
  name?: string
  backgroundImage?: string
  selectedCalendarIds?: string[]
  daysAhead?: number
  eventsReloadIntervalMinutes?: 1 | 5 | 60
  showReloadBars?: boolean
  showLastUpdate?: boolean
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
  const { accessToken, tokenExpiry, tokenIssuedAt, setToken, clearToken } = useGoogleAuthStore()
  const config = (tile.config ?? {}) as GoogleCalendarConfig
  const selectedCalendarIds: string[] = config.selectedCalendarIds ?? []
  const daysAhead = config.daysAhead ?? 7
  const eventsReloadIntervalMinutes: 1 | 5 | 60 = config.eventsReloadIntervalMinutes ?? 5
  const showReloadBars = config.showReloadBars ?? false
  const showLastUpdate = config.showLastUpdate ?? false

  const tokenOk = isTokenValid({ accessToken, tokenExpiry })
  const setCalendarEvents = useCalendarEventsStore((s) => s.setEvents)

  // Events & calendars state
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [lastEventsUpdate, setLastEventsUpdate] = useState<number | null>(null)
  // Incrementing this triggers an events reload
  const [reloadTrigger, setReloadTrigger] = useState(0)

  const triggerEventsReload = useCallback(() => setReloadTrigger((n) => n + 1), [])

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalWeekOffset, setModalWeekOffset] = useState(0)
  const [modalEvents, setModalEvents] = useState<CalendarEvent[]>([])
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)

  // Event detail state
  const [detailEvent, setDetailEvent] = useState<CalendarEvent | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

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
  const [settingsEventsInterval, setSettingsEventsInterval] = useState<1 | 5 | 60>(eventsReloadIntervalMinutes)
  const [settingsShowReloadBars, setSettingsShowReloadBars] = useState(showReloadBars)
  const [settingsShowLastUpdate, setSettingsShowLastUpdate] = useState(showLastUpdate)

  // ── Google login (implicit flow) ─────────────────────────────────────────
  const isSilentRefresh = useRef(false)

  const login = useGoogleLogin({
    flow: 'implicit',
    scope: 'https://www.googleapis.com/auth/calendar.readonly',
    onSuccess: (tokenResponse) => {
      isSilentRefresh.current = false
      setToken(tokenResponse.access_token, tokenResponse.expires_in ?? 3600)
      setError(null)
    },
    onError: () => {
      if (!isSilentRefresh.current) {
        setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.')
      }
      isSilentRefresh.current = false
    },
  })

  const loginRef = useRef(login)
  useEffect(() => { loginRef.current = login }, [login])

  // ── Automatic silent token refresh before expiry ─────────────────────────
  useEffect(() => {
    if (!tokenExpiry || !accessToken) return
    const msUntilExpiry = tokenExpiry - Date.now()
    const refreshDelay = Math.max(0, msUntilExpiry - 5 * 60 * 1000)
    const timer = setTimeout(() => {
      isSilentRefresh.current = true
      loginRef.current({ prompt: 'none' })
    }, refreshDelay)
    return () => clearTimeout(timer)
  }, [tokenExpiry, accessToken])

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

  // ── Fetch events for a custom time range ────────────────────────────────
  const fetchEventsForRange = useCallback(
    async (token: string, calIds: string[], timeMin: string, timeMax: string): Promise<CalendarEvent[]> => {
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

  // ── Fetch modal events for a given week offset ───────────────────────────
  const fetchModalEventsForOffset = useCallback(
    async (token: string, calIds: string[], weekOffset: number) => {
      setModalLoading(true)
      setModalError(null)
      try {
        const now = new Date()
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const startDate = new Date(startOfToday.getTime() + weekOffset * 7 * 24 * 3600 * 1000)
        const endDate = new Date(startDate.getTime() + 7 * 24 * 3600 * 1000)
        const calendarIds = calendars.map((c) => c.id)
        const ids = calIds.length > 0 ? calIds : (calendarIds.length > 0 ? calendarIds : ['primary'])
        const evts = await fetchEventsForRange(token, ids, startDate.toISOString(), endDate.toISOString())
        setModalEvents(evts)
      } catch (err: unknown) {
        if ((err as Error).message === 'TOKEN_EXPIRED') {
          setModalError('Sitzung abgelaufen (401). Bitte erneut anmelden.')
        } else {
          setModalError((err as Error).message)
        }
      } finally {
        setModalLoading(false)
      }
    },
    [fetchEventsForRange, calendars],
  )

  // ── Open modal ───────────────────────────────────────────────────────────
  const handleTileClick = () => {
    if (!tokenOk || !accessToken) return
    setModalOpen(true)
    setModalWeekOffset(0)
    fetchModalEventsForOffset(accessToken, selectedCalendarIds, 0)
  }

  // ── Navigate modal weeks ─────────────────────────────────────────────────
  const handleModalPrevWeek = () => {
    if (!accessToken) return
    const next = modalWeekOffset - 1
    setModalWeekOffset(next)
    fetchModalEventsForOffset(accessToken, selectedCalendarIds, next)
  }

  const handleModalNextWeek = () => {
    if (!accessToken) return
    const next = modalWeekOffset + 1
    setModalWeekOffset(next)
    fetchModalEventsForOffset(accessToken, selectedCalendarIds, next)
  }

  // ── Modal date range label ────────────────────────────────────────────────
  const modalDateRangeLabel = (() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startDate = new Date(startOfToday.getTime() + modalWeekOffset * 7 * 24 * 3600 * 1000)
    const endDate = new Date(startDate.getTime() + 6 * 24 * 3600 * 1000)
    const fmt = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    if (modalWeekOffset === 0) return `Diese Woche (${fmt(startDate)} – ${fmt(endDate)})`
    if (modalWeekOffset === 1) return `Nächste Woche (${fmt(startDate)} – ${fmt(endDate)})`
    if (modalWeekOffset === -1) return `Letzte Woche (${fmt(startDate)} – ${fmt(endDate)})`
    return `${fmt(startDate)} – ${fmt(endDate)}`
  })()

  // ── Group modal events by date ────────────────────────────────────────────
  type DateGroup = { dateLabel: string; events: CalendarEvent[] }
  const modalGrouped: DateGroup[] = []
  for (const ev of modalEvents.filter((e) => !isCalendarWeekMarker(e))) {
    const dateKey = ev.start.dateTime
      ? new Date(ev.start.dateTime).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
      : ev.start.date
      ? new Date(ev.start.date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Unbekannt'
    const existing = modalGrouped.find((g) => g.dateLabel === dateKey)
    if (existing) existing.events.push(ev)
    else modalGrouped.push({ dateLabel: dateKey, events: [ev] })
  }
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
      .then((evts) => {
        setEvents(evts)
        setCalendarEvents(evts)
        setLastEventsUpdate(Date.now())
      })
      .catch((err: Error) => {
        if (err.message === 'TOKEN_EXPIRED') {
          setError('Sitzung abgelaufen (401). Bitte erneut anmelden.')
        } else {
          setError(err.message)
        }
      })
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenOk, accessToken, selectedCalendarIds.join(','), daysAhead, fetchCalendars, fetchEvents, reloadTrigger])

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
    setSettingsEventsInterval(eventsReloadIntervalMinutes)
    setSettingsShowReloadBars(showReloadBars)
    setSettingsShowLastUpdate(showLastUpdate)
  }

  const getExtraConfig = () => {
    const ids = settingsCalendars.filter((c) => c.selected).map((c) => c.id)
    const parsed = parseInt(settingsDaysAhead, 10)
    return {
      selectedCalendarIds: ids,
      daysAhead: !isNaN(parsed) && parsed >= 1 ? parsed : 7,
      eventsReloadIntervalMinutes: settingsEventsInterval,
      showReloadBars: settingsShowReloadBars,
      showLastUpdate: settingsShowLastUpdate,
    }
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
      <ReloadIntervalSettings
        intervalMinutes={settingsEventsInterval}
        onIntervalChange={setSettingsEventsInterval}
        showBar={settingsShowReloadBars}
        onShowBarChange={setSettingsShowReloadBars}
        showLastUpdate={settingsShowLastUpdate}
        onShowLastUpdateChange={setSettingsShowLastUpdate}
        label="Aktualisierung"
      />
    </>
  )

  // ── Event formatting helper ──────────────────────────────────────────────
  // (formatEventTime is now in CalendarEventItem.tsx)

  // ── Calendar color lookup ────────────────────────────────────────────────
  const calColorMap: Record<string, string> = {}
  for (const cal of calendars) {
    if (cal.backgroundColor) calColorMap[cal.id] = cal.backgroundColor
  }

  // ── Group events by date ─────────────────────────────────────────────────
  const grouped: DateGroup[] = []
  for (const ev of events.filter((e) => !isCalendarWeekMarker(e))) {
    const dateKey = ev.start.dateTime
      ? new Date(ev.start.dateTime).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
      : ev.start.date
      ? new Date(ev.start.date + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Unbekannt'
    const existing = grouped.find((g) => g.dateLabel === dateKey)
    if (existing) existing.events.push(ev)
    else grouped.push({ dateLabel: dateKey, events: [ev] })
  }

  // Always include today at the top of the tile view
  const now = new Date()
  const todayLabel = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    .toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
  const groupedWithToday: DateGroup[] = grouped.find((g) => g.dateLabel === todayLabel)
    ? grouped
    : [{ dateLabel: todayLabel, events: [] }, ...grouped]

  // ── Tile body ────────────────────────────────────────────────────────────
  const tokenLifetimeMs = tokenIssuedAt && tokenExpiry ? tokenExpiry - tokenIssuedAt : 3600 * 1000

  return (
    <>
      <BaseTile
        tile={tile}
        settingsChildren={settingsContent}
        getExtraConfig={getExtraConfig}
        onSettingsOpen={handleSettingsOpen}
        onTileClick={tokenOk ? handleTileClick : undefined}
        footer={tokenOk ? (
          <>
            <ReloadIntervalBar
              show={showReloadBars}
              lastUpdate={lastEventsUpdate}
              intervalMs={eventsReloadIntervalMinutes * 60 * 1000}
              showLastUpdate={showLastUpdate}
              label="Events"
              onReload={triggerEventsReload}
            />
            <ReloadIntervalBar
              show={showReloadBars}
              lastUpdate={tokenIssuedAt}
              intervalMs={tokenLifetimeMs}
              showLastUpdate={showLastUpdate}
              label="Token"
            />
          </>
        ) : undefined}
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

      {tokenOk && !loading && grouped.length > 0 && (
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          {groupedWithToday.map((group) => (
            <Box key={group.dateLabel}>
              <Typography
                variant="caption"
                fontWeight="bold"
                color="text.secondary"
                sx={{ display: 'block', mt: 0.5, mb: 0.25, textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {group.dateLabel}
              </Typography>
              {group.events.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ pl: 0.5, mb: 0.5 }}>
                  Keine Termine
                </Typography>
              ) : (
                <List dense disablePadding>
                  {group.events.map((ev) => {
                    const evColor = ev.calendarId ? calColorMap[ev.calendarId] : undefined
                    return (
                      <CalendarEventItem
                        key={ev.id}
                        ev={ev}
                        color={evColor}
                      />
                    )
                  })}
                </List>
              )}
            </Box>
          ))}
        </Box>
      )}

      {tokenOk && !loading && !error && events.length === 0 && (
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          <Typography
            variant="caption"
            fontWeight="bold"
            color="text.secondary"
            sx={{ display: 'block', mt: 0.5, mb: 0.25, textTransform: 'uppercase', letterSpacing: 0.5 }}
          >
            {todayLabel}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ pl: 0.5 }}>
            Keine Termine
          </Typography>
        </Box>
      )}
    </BaseTile>

      {/* ── Calendar detail modal ────────────────────────────────────────── */}
      <LargeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={(tile.config?.name as string) || 'Google Kalender'}
      >
        {/* Week navigation */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 1.5,
            py: 1,
            flexShrink: 0,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <IconButton size="small" onClick={handleModalPrevWeek} disabled={modalLoading}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="subtitle2" sx={{ flex: 1, textAlign: 'center' }}>
            {modalDateRangeLabel}
          </Typography>
          <IconButton size="small" onClick={handleModalNextWeek} disabled={modalLoading}>
            <ChevronRightIcon />
          </IconButton>
        </Box>

        {/* Modal body */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
          {modalLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <CircularProgress />
            </Box>
          )}
          {modalError && !modalLoading && (
            <Typography color="error" variant="body2">{modalError}</Typography>
          )}
          {!modalLoading && !modalError && modalGrouped.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Keine Ereignisse in diesem Zeitraum.
            </Typography>
          )}
          {!modalLoading && modalGrouped.map((group) => (
            <Box key={group.dateLabel} sx={{ mb: 2 }}>
              <Typography
                variant="subtitle2"
                fontWeight="bold"
                color="primary"
                sx={{ mb: 0.5, textTransform: 'capitalize' }}
              >
                {group.dateLabel}
              </Typography>
              <Divider sx={{ mb: 0.5 }} />
              <List dense disablePadding>
                {group.events.map((ev) => {
                  const evColor = ev.calendarId ? calColorMap[ev.calendarId] : undefined
                  return (
                    <CalendarEventItem
                      key={ev.id}
                      ev={ev}
                      color={evColor}
                      noWrap={false}
                      onClick={() => {
                        setDetailEvent(ev)
                        setDetailOpen(true)
                      }}
                    />
                  )
                })}
              </List>
            </Box>
          ))}
        </Box>
      </LargeModal>

      {/* ── Event detail modal ───────────────────────────────────────────── */}
      <CalendarEventDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        event={detailEvent}
        color={detailEvent?.calendarId ? calColorMap[detailEvent.calendarId] : undefined}
      />
    </>
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
