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
  ListItem,
  TextField,
  Tooltip,
  IconButton,
  Switch,
  Paper,
  InputAdornment,
} from '@mui/material'
import LoginIcon from '@mui/icons-material/Login'
import EventIcon from '@mui/icons-material/Event'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckIcon from '@mui/icons-material/Check'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import BugReportIcon from '@mui/icons-material/BugReport'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import BaseTile from './BaseTile'
import LargeModal from './LargeModal'
import CalendarEventItem, { isCalendarWeekMarker, formatEventTime, shouldUseWhiteText } from './CalendarEventItem'
import CalendarEventDetailModal from './CalendarEventDetailModal'
import ReloadIntervalBar from './ReloadIntervalBar'
import ReloadIntervalSettings from './ReloadIntervalSettings'
import type { CalendarEventData } from './CalendarEventItem'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'
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
  clientSecret?: string
  debugMode?: boolean
  eventsReloadIntervalMinutes?: 1 | 5 | 60
  showReloadBars?: boolean
  showLastUpdate?: boolean
  calculateTravelTime?: boolean
  showEventLinks?: boolean
  showEventCodes?: boolean
}

// ─── Geocoding + routing helpers (shared with RouteTile) ──────────────────────

const NOMINATIM_USER_AGENT = 'NilsBaumgartner1994-dashboard/1.0 (https://github.com/NilsBaumgartner1994/dashboard)'

/** In-memory geocoding cache to avoid redundant Nominatim requests. */
const geocodeCache = new Map<string, { lat: number; lon: number } | null>()

/**
 * Geocode a location name. Returns coords and whether the result was served
 * from the in-memory cache (callers can use this to skip rate-limit delays).
 */
async function geocodeLocation(name: string): Promise<{ lat: number; lon: number; cached: boolean } | null> {
  const cacheKey = name.trim().toLowerCase()
  if (geocodeCache.has(cacheKey)) {
    const cached = geocodeCache.get(cacheKey)!
    return cached ? { ...cached, cached: true } : null
  }
  let query = name.trim()
  while (query) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=0`,
        { headers: { 'User-Agent': NOMINATIM_USER_AGENT } },
      )
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
          geocodeCache.set(cacheKey, result)
          return { ...result, cached: false }
        }
      }
    } catch { /* ignore */ }
    const commaIdx = query.indexOf(',')
    if (commaIdx === -1) break
    query = query.slice(commaIdx + 1).trim()
  }
  geocodeCache.set(cacheKey, null)
  return null
}

async function fetchOsrmDurationSeconds(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`,
    )
    if (!res.ok) return null
    const data = await res.json()
    if (data.routes?.length) return data.routes[0].duration as number
  } catch { /* ignore */ }
  return null
}

/** Round up seconds to the nearest 5 minutes and return total minutes. */
function roundUpToFiveMinutes(seconds: number): number {
  const minutes = seconds / 60
  return Math.ceil(minutes / 5) * 5
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
  const { accessToken, tokenExpiry, tokenIssuedAt, refreshToken, setToken, setRefreshToken, clearToken } = useGoogleAuthStore()
  const clientId = useGoogleAuthStore((s) => s.clientId)
  const globalClientSecret = useGoogleAuthStore((s) => s.clientSecret)
  const config = (tile.config ?? {}) as GoogleCalendarConfig
  const selectedCalendarIds: string[] = config.selectedCalendarIds ?? []
  const daysAhead = config.daysAhead ?? 7
  // Tile-specific secret takes priority; falls back to global secret
  const clientSecret = config.clientSecret?.trim() ? config.clientSecret.trim() : globalClientSecret
  const debugMode = config.debugMode ?? false
  const eventsReloadIntervalMinutes: 1 | 5 | 60 = config.eventsReloadIntervalMinutes ?? 5
  const showReloadBars = config.showReloadBars ?? false
  const showLastUpdate = config.showLastUpdate ?? false
  const calculateTravelTime = config.calculateTravelTime ?? false
  const showEventLinks = config.showEventLinks ?? false
  const showEventCodes = config.showEventCodes ?? false

  // Global default location (for travel time calculation)
  const defaultLat = useStore((s) => s.defaultLat)
  const defaultLon = useStore((s) => s.defaultLon)

  const tokenOk = isTokenValid({ accessToken, tokenExpiry })
  const setCalendarEvents = useCalendarEventsStore((s) => s.setEvents)

  // ── Debug log state ───────────────────────────────────────────────────────
  const [debugLogs, setDebugLogs] = useState<string[]>([])
  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setDebugLogs((prev) => [`[${ts}] ${msg}`, ...prev].slice(0, 100))
  }, [])

  // Log initial token state on mount / reload
  useEffect(() => {
    const now = Date.now()
    if (accessToken && tokenExpiry) {
      const expiresInSec = Math.round((tokenExpiry - now) / 1000)
      if (expiresInSec > 0) {
        addLog(`Gespeicherter Access-Token gefunden (läuft ab in ${expiresInSec}s, Ende: ${new Date(tokenExpiry).toLocaleTimeString('de-DE')})`)
      } else {
        addLog(`Gespeicherter Access-Token abgelaufen (vor ${Math.round(-expiresInSec)}s)`)
      }
    } else {
      addLog('Kein Access-Token im Speicher gefunden')
    }
    if (refreshToken) {
      addLog(`Gespeicherter Refresh-Token gefunden: ...${refreshToken.slice(-8)}`)
    } else {
      addLog('Kein Refresh-Token im Speicher gefunden')
    }
    if (clientSecret) {
      addLog('Client-Secret konfiguriert → Auth-Code-Flow mit Refresh-Token aktiv')
    } else {
      addLog('Kein Client-Secret → Implicit-Flow (kein Refresh-Token)')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Events & calendars state
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
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
  const [settingsClientSecret, setSettingsClientSecret] = useState(clientSecret)
  const [showSettingsSecret, setShowSettingsSecret] = useState(false)
  const [settingsDebugMode, setSettingsDebugMode] = useState(debugMode)
  const [settingsEventsInterval, setSettingsEventsInterval] = useState<1 | 5 | 60>(eventsReloadIntervalMinutes)
  const [settingsShowReloadBars, setSettingsShowReloadBars] = useState(showReloadBars)
  const [settingsShowLastUpdate, setSettingsShowLastUpdate] = useState(showLastUpdate)
  const [settingsCalculateTravelTime, setSettingsCalculateTravelTime] = useState(calculateTravelTime)
  const [settingsShowEventLinks, setSettingsShowEventLinks] = useState(showEventLinks)
  const [settingsShowEventCodes, setSettingsShowEventCodes] = useState(showEventCodes)

  // ── Travel time state (event id → rounded minutes) ────────────────────────
  const [eventTravelMinutes, setEventTravelMinutes] = useState<Record<string, number>>({})

  // ── Token exchange helpers ────────────────────────────────────────────────

  const exchangeCodeForTokens = useCallback(async (code: string): Promise<{
    access_token: string
    expires_in: number
    refresh_token?: string
    token_type: string
  }> => {
    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    })
    addLog(`Token-Austausch gestartet (code: ...${code.slice(-8)})`)
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const body = await res.text()
    addLog(`Token-Austausch Antwort: HTTP ${res.status}`)
    if (!res.ok) {
      throw new Error(`Token-Austausch fehlgeschlagen: HTTP ${res.status}\n${body}`)
    }
    return JSON.parse(body)
  }, [clientId, clientSecret, addLog])

  const refreshAccessToken = useCallback(async (): Promise<{
    access_token: string
    expires_in: number
    token_type: string
  }> => {
    if (!refreshToken || !clientSecret) throw new Error('Kein Refresh-Token oder Client-Secret vorhanden')
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    })
    addLog('Verwende Refresh-Token zum Erneuern des Access-Tokens...')
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const body = await res.text()
    addLog(`Refresh-Token Antwort: HTTP ${res.status}`)
    if (!res.ok) {
      throw new Error(`Access-Token Erneuerung fehlgeschlagen: HTTP ${res.status}\n${body}`)
    }
    return JSON.parse(body)
  }, [clientId, clientSecret, refreshToken, addLog])

  // ── Google login – implicit flow ──────────────────────────────────────────
  const isSilentRefresh = useRef(false)

  const loginImplicit = useGoogleLogin({
    flow: 'implicit',
    scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks',
    onSuccess: (tokenResponse) => {
      isSilentRefresh.current = false
      addLog(`Access-Token empfangen (läuft ab in ${tokenResponse.expires_in ?? 3600}s), gespeichert`)
      setToken(tokenResponse.access_token, tokenResponse.expires_in ?? 3600)
      setError(null)
    },
    onError: () => {
      if (!isSilentRefresh.current) {
        addLog('Anmeldung fehlgeschlagen (implicit flow)')
        setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.')
      } else {
        addLog('Stille Erneuerung fehlgeschlagen (prompt: none) – Anmeldung erforderlich')
      }
      isSilentRefresh.current = false
    },
  })

  // ── Google login – auth-code flow (used when clientSecret is set) ─────────
  const loginAuthCode = useGoogleLogin({
    flow: 'auth-code',
    scope: 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks',
    onSuccess: async (codeResponse) => {
      addLog(`Autorisierungscode empfangen, tausche gegen Tokens aus...`)
      try {
        const tokens = await exchangeCodeForTokens(codeResponse.code)
        const hasRefresh = !!tokens.refresh_token
        addLog(
          `Tokens erhalten: access_token (läuft ab in ${tokens.expires_in}s)` +
          (hasRefresh ? ', refresh_token gespeichert' : ' (kein refresh_token in Antwort)')
        )
        setToken(tokens.access_token, tokens.expires_in)
        if (tokens.refresh_token) {
          setRefreshToken(tokens.refresh_token)
        }
        setError(null)
      } catch (err: unknown) {
        addLog(`Token-Austausch Fehler: ${(err as Error).message}`)
        setError((err as Error).message)
      }
    },
    onError: (err) => {
      addLog(`Anmeldung fehlgeschlagen (auth-code flow): ${err.error ?? 'unbekannt'}`)
      setError('Anmeldung fehlgeschlagen. Bitte erneut versuchen.')
    },
  })

  // Use auth-code flow when clientSecret is configured, otherwise implicit
  const login = clientSecret ? loginAuthCode : loginImplicit

  const loginRef = useRef(login)
  useEffect(() => { loginRef.current = login }, [login])

  // ── Automatic token refresh ───────────────────────────────────────────────
  // If a refresh token is available (auth-code flow), use it to silently refresh.
  // Otherwise fall back to implicit silent refresh (prompt: none).
  useEffect(() => {
    if (!tokenExpiry || !accessToken) return
    const msUntilExpiry = tokenExpiry - Date.now()
    const refreshDelay = Math.max(0, msUntilExpiry - 5 * 60 * 1000)

    if (refreshToken && clientSecret) {
      // Refresh token path: call Google token endpoint directly
      const timer = setTimeout(async () => {
        addLog(`Access-Token läuft in 5 min ab, erneuere über Refresh-Token...`)
        try {
          const tokens = await refreshAccessToken()
          addLog(`Access-Token erneuert (läuft ab in ${tokens.expires_in}s)`)
          setToken(tokens.access_token, tokens.expires_in)
          setError(null)
        } catch (err: unknown) {
          const msg = (err as Error).message
          addLog(`Refresh-Token Fehler: ${msg}`)
          if (msg.includes('400') || msg.includes('401')) {
            clearToken()
            setError('Refresh-Token ungültig oder abgelaufen. Bitte erneut anmelden.')
          }
        }
      }, refreshDelay)
      return () => clearTimeout(timer)
    } else {
      // Implicit silent refresh fallback
      const timer = setTimeout(() => {
        addLog('Stille Erneuerung via Google-Popup (prompt: none)...')
        isSilentRefresh.current = true
        loginRef.current({ prompt: 'none' })
      }, refreshDelay)
      return () => clearTimeout(timer)
    }
  }, [tokenExpiry, accessToken, refreshToken, clientSecret, refreshAccessToken, setToken, clearToken, addLog])

  // ── Fetch calendars ───────────────────────────────────────────────────────
  const fetchCalendars = useCallback(async (token: string): Promise<CalendarInfo[]> => {
    addLog('Lade Kalenderliste...')
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { Authorization: `Bearer ${token}` } },
    )
    addLog(`Kalenderliste Antwort: HTTP ${res.status}`)
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
    const cals = (data.items ?? []).map((c: CalendarInfo & { backgroundColor?: string }) => ({
      id: c.id,
      summary: c.summary,
      backgroundColor: c.backgroundColor,
    }))
    addLog(`Kalenderliste geladen: ${cals.length} Kalender`)
    return cals
  }, [clearToken, addLog])

  // ── Fetch events for N days ahead ────────────────────────────────────────
  const fetchEvents = useCallback(
    async (token: string, calIds: string[], days: number): Promise<CalendarEvent[]> => {
      const now = new Date()
      const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const timeMax = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days).toISOString()

      const targetCals = calIds.length > 0 ? calIds : ['primary']
      addLog(`Lade Events (${days} Tage, ${targetCals.length} Kalender)...`)
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
            addLog(`Events Antwort: HTTP 401 für Kalender ${calId} – Token abgelaufen`)
            clearToken()
            throw new Error('TOKEN_EXPIRED')
          }
          if (!res.ok) {
            let body = ''
            try { body = await res.text() } catch { /* ignore */ }
            addLog(`Events Antwort: HTTP ${res.status} für Kalender ${calId}`)
            throw new Error(`HTTP ${res.status} – ${res.statusText} (${calId})\n\n${body}`)
          }
          const data = await res.json()
          return ((data.items ?? []) as CalendarEvent[]).map((ev) => ({ ...ev, calendarId: calId }))
        }),
      )
      const flat = results.flat().sort((a, b) => {
        const ta = a.start.dateTime ?? a.start.date ?? ''
        const tb = b.start.dateTime ?? b.start.date ?? ''
        return ta.localeCompare(tb)
      })
      addLog(`Events geladen: ${flat.length} Ereignisse`)
      return flat
    },
    [clearToken, addLog],
  )

  // ── Fetch events for a custom time range ────────────────────────────────
  const fetchEventsForRange = useCallback(
    async (token: string, calIds: string[], timeMin: string, timeMax: string): Promise<CalendarEvent[]> => {
      const targetCals = calIds.length > 0 ? calIds : ['primary']
      addLog(`Lade Events (Bereich: ${timeMin.slice(0, 10)} – ${timeMax.slice(0, 10)}, ${targetCals.length} Kalender)...`)
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
            addLog(`Events Antwort: HTTP 401 für Kalender ${calId} – Token abgelaufen`)
            clearToken()
            throw new Error('TOKEN_EXPIRED')
          }
          if (!res.ok) {
            let body = ''
            try { body = await res.text() } catch { /* ignore */ }
            addLog(`Events Antwort: HTTP ${res.status} für Kalender ${calId}`)
            throw new Error(`HTTP ${res.status} – ${res.statusText} (${calId})\n\n${body}`)
          }
          const data = await res.json()
          return ((data.items ?? []) as CalendarEvent[]).map((ev) => ({ ...ev, calendarId: calId }))
        }),
      )
      const flat = results.flat().sort((a, b) => {
        const ta = a.start.dateTime ?? a.start.date ?? ''
        const tb = b.start.dateTime ?? b.start.date ?? ''
        return ta.localeCompare(tb)
      })
      addLog(`Events geladen: ${flat.length} Ereignisse`)
      return flat
    },
    [clearToken, addLog],
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

  // ── Compute travel times for events with locations ────────────────────────
  useEffect(() => {
    if (!calculateTravelTime || defaultLat === undefined || defaultLon === undefined) {
      setEventTravelMinutes({})
      return
    }
    const eventsWithLocation = events.filter((e) => e.start.dateTime && e.location?.trim())
    if (eventsWithLocation.length === 0) return
    let cancelled = false
    const compute = async () => {
      // Process sequentially to respect Nominatim's 1 req/s policy
      for (const ev of eventsWithLocation) {
        if (cancelled) break
        const geoResult = await geocodeLocation(ev.location!)
        if (!geoResult || cancelled) continue
        const seconds = await fetchOsrmDurationSeconds(defaultLat!, defaultLon!, geoResult.lat, geoResult.lon)
        if (seconds === null || cancelled) continue
        setEventTravelMinutes((prev) => ({ ...prev, [ev.id]: roundUpToFiveMinutes(seconds) }))
        // Respect Nominatim usage policy (max 1 req/s) only after uncached requests
        if (!geoResult.cached) await new Promise((resolve) => setTimeout(resolve, 1100))
      }
    }
    compute()
    return () => { cancelled = true }
  }, [calculateTravelTime, defaultLat, defaultLon, events])

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
    setSettingsClientSecret(clientSecret)
    setSettingsDebugMode(debugMode)
    setSettingsEventsInterval(eventsReloadIntervalMinutes)
    setSettingsShowReloadBars(showReloadBars)
    setSettingsShowLastUpdate(showLastUpdate)
    setSettingsCalculateTravelTime(calculateTravelTime)
    setSettingsShowEventLinks(showEventLinks)
    setSettingsShowEventCodes(showEventCodes)
  }

  const getExtraConfig = () => {
    const ids = settingsCalendars.filter((c) => c.selected).map((c) => c.id)
    const parsed = parseInt(settingsDaysAhead, 10)
    return {
      selectedCalendarIds: ids,
      daysAhead: !isNaN(parsed) && parsed >= 1 ? parsed : 7,
      clientSecret: settingsClientSecret.trim(),
      debugMode: settingsDebugMode,
      eventsReloadIntervalMinutes: settingsEventsInterval,
      showReloadBars: settingsShowReloadBars,
      showLastUpdate: settingsShowLastUpdate,
      calculateTravelTime: settingsCalculateTravelTime,
      showEventLinks: settingsShowEventLinks,
      showEventCodes: settingsShowEventCodes,
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
      <FormControlLabel
        control={
          <Switch
            checked={settingsDebugMode}
            onChange={(e) => setSettingsDebugMode(e.target.checked)}
            size="small"
          />
        }
        label="Debug-Modus anzeigen"
        sx={{ display: 'block', mb: 1 }}
      />
      <ReloadIntervalSettings
        intervalMinutes={settingsEventsInterval}
        onIntervalChange={setSettingsEventsInterval}
        showBar={settingsShowReloadBars}
        onShowBarChange={setSettingsShowReloadBars}
        showLastUpdate={settingsShowLastUpdate}
        onShowLastUpdateChange={setSettingsShowLastUpdate}
        label="Aktualisierung"
      />
      <FormControlLabel
        control={
          <Switch
            checked={settingsCalculateTravelTime}
            onChange={(e) => setSettingsCalculateTravelTime(e.target.checked)}
            size="small"
          />
        }
        label="Fahrtzeit berechnen (benötigt globalen Startort)"
        sx={{ display: 'block', mt: 1 }}
      />
      <FormControlLabel
        control={
          <Switch
            checked={settingsShowEventLinks}
            onChange={(e) => setSettingsShowEventLinks(e.target.checked)}
            size="small"
          />
        }
        label="Links für den Tag anzeigen (nur heutige Termine)"
        sx={{ display: 'block', mt: 1 }}
      />
      <FormControlLabel
        control={
          <Switch
            checked={settingsShowEventCodes}
            onChange={(e) => setSettingsShowEventCodes(e.target.checked)}
            size="small"
          />
        }
        label="Kenncodes anzeigen (z.B. Kenncode: XXXX in Beschreibung)"
        sx={{ display: 'block', mt: 1 }}
      />
    </>
  )

  // ── Event formatting helper ──────────────────────────────────────────────
  // (formatEventTime is now in CalendarEventItem.tsx)

  // ── Helper: extract URLs from event description ──────────────────────────
  const extractEventLinks = (description?: string): string[] => {
    if (!description) return []
    const urlRegex = /https?:\/\/[^\s<>")\]]+/g
    return Array.from(description.matchAll(urlRegex))
      .map((m) => m[0].replace(/[.,;:!?]+$/, ''))
  }

  // ── Helper: extract Kenncode from event description ──────────────────────
  const extractKenncode = (description?: string): string | null => {
    if (!description) return null
    const match = description.match(/Kenncode:\s*(\S+)/i)
    return match ? match[1] : null
  }

  // ── Shared link action handlers ──────────────────────────────────────────
  const handleOpenLink = (link: string) => window.open(link, '_blank', 'noopener,noreferrer')
  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link)
      .then(() => { setCopiedLink(link); setTimeout(() => setCopiedLink(null), 2000) })
      .catch(() => {})
  }

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
        bottomBar={tokenOk ? (
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
        <Typography variant="subtitle2" fontWeight="bold" sx={{ flex: 1 }}>
          {(tile.config?.name as string) || 'Google Kalender'}
        </Typography>
        <Tooltip title="Monatsansicht öffnen">
          <IconButton
            size="small"
            onClick={() => window.open('https://calendar.google.com/calendar/u/0/r', '_blank', 'noopener,noreferrer')}
          >
            <CalendarMonthIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
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
          {groupedWithToday.map((group) => {
            const isToday = group.dateLabel === todayLabel
            return (
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
                    const travelMin = calculateTravelTime && ev.location?.trim() ? eventTravelMinutes[ev.id] : undefined
                    const links = isToday && showEventLinks ? extractEventLinks(ev.description) : []
                    const kenncode = isToday && showEventCodes ? extractKenncode(ev.description) : null
                    const hasExtras = links.length > 0 || kenncode !== null
                    if (travelMin !== undefined && ev.start.dateTime) {
                      const arrivalDate = new Date(ev.start.dateTime)
                      const departureDate = new Date(arrivalDate.getTime() - travelMin * 60 * 1000)
                      const deptStr = `${String(departureDate.getHours()).padStart(2, '0')}:${String(departureDate.getMinutes()).padStart(2, '0')}`
                      const arrStr = formatEventTime(ev)
                      return (
                        <Box key={ev.id}>
                          <ListItem
                            disableGutters
                            disablePadding
                            sx={{ mb: hasExtras ? 0 : 0.5, alignItems: 'flex-start', borderRadius: 1 }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, width: '100%' }}>
                              <Box
                                component="span"
                                sx={{
                                  fontSize: '0.65rem',
                                  bgcolor: evColor ?? 'action.selected',
                                  color: evColor ? (shouldUseWhiteText(evColor) ? '#fff' : '#000') : undefined,
                                  borderRadius: '12px',
                                  px: 1,
                                  py: 0.25,
                                  fontWeight: 'bold',
                                  flexShrink: 0,
                                }}
                              >
                                {deptStr}
                              </Box>
                              <ArrowForwardIcon sx={{ fontSize: '0.75rem', color: 'text.secondary', flexShrink: 0 }} />
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
                                <DirectionsCarIcon sx={{ fontSize: '0.85rem', color: 'text.secondary' }} />
                                <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                                  {travelMin} Min.
                                </Typography>
                              </Box>
                              <ArrowForwardIcon sx={{ fontSize: '0.75rem', color: 'text.secondary', flexShrink: 0 }} />
                              <Box
                                component="span"
                                sx={{
                                  fontSize: '0.65rem',
                                  bgcolor: evColor ?? 'action.selected',
                                  color: evColor ? (shouldUseWhiteText(evColor) ? '#fff' : '#000') : undefined,
                                  borderRadius: '12px',
                                  px: 1,
                                  py: 0.25,
                                  flexShrink: 0,
                                }}
                              >
                                {arrStr}
                              </Box>
                              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, fontSize: '0.8rem' }}>
                                {ev.summary}
                              </Typography>
                            </Box>
                          </ListItem>
                          {hasExtras && (
                            <Box sx={{ pl: 0.5, pb: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                              {links.map((link, i) => (
                                <Box key={i} sx={{ display: 'flex', gap: 0.25 }}>
                                  <Tooltip title="Link öffnen">
                                    <IconButton size="small" onClick={() => handleOpenLink(link)} sx={{ p: '2px' }}>
                                      <OpenInNewIcon sx={{ fontSize: '0.75rem', color: 'primary.main' }} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title={copiedLink === link ? 'Kopiert!' : 'Link kopieren'}>
                                    <IconButton size="small" onClick={() => handleCopyLink(link)} sx={{ p: '2px' }}>
                                      {copiedLink === link ? <CheckIcon sx={{ fontSize: '0.75rem', color: 'success.main' }} /> : <ContentCopyIcon sx={{ fontSize: '0.75rem', color: 'text.secondary' }} />}
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              ))}
                              {kenncode && (
                                <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                                  {kenncode}
                                </Typography>
                              )}
                            </Box>
                          )}
                        </Box>
                      )
                    }
                    return (
                      <Box key={ev.id}>
                        <CalendarEventItem
                          ev={ev}
                          color={evColor}
                          sx={hasExtras ? { mb: 0 } : undefined}
                        />
                        {hasExtras && (
                          <Box sx={{ pl: 0.5, pb: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                            {links.map((link, i) => (
                              <Box key={i} sx={{ display: 'flex', gap: 0.25 }}>
                                <Tooltip title="Link öffnen">
                                  <IconButton size="small" onClick={() => handleOpenLink(link)} sx={{ p: '2px' }}>
                                    <OpenInNewIcon sx={{ fontSize: '0.75rem', color: 'primary.main' }} />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title={copiedLink === link ? 'Kopiert!' : 'Link kopieren'}>
                                  <IconButton size="small" onClick={() => handleCopyLink(link)} sx={{ p: '2px' }}>
                                    {copiedLink === link ? <CheckIcon sx={{ fontSize: '0.75rem', color: 'success.main' }} /> : <ContentCopyIcon sx={{ fontSize: '0.75rem', color: 'text.secondary' }} />}
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            ))}
                            {kenncode && (
                              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                                {kenncode}
                              </Typography>
                            )}
                          </Box>
                        )}
                      </Box>
                    )
                  })}
                </List>
              )}
            </Box>
            )
          })}
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

      {/* ── Debug panel ─────────────────────────────────────────────────── */}
      {debugMode && (
        <Paper
          variant="outlined"
          sx={{ mt: 1, p: 0.75, bgcolor: 'action.hover', borderRadius: 1 }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <BugReportIcon sx={{ fontSize: '0.85rem', color: 'warning.main' }} />
            <Typography variant="caption" fontWeight="bold" color="warning.main" sx={{ fontSize: '0.65rem' }}>
              DEBUG
            </Typography>
          </Box>
          {/* Token status */}
          <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.6rem', color: 'text.secondary' }}>
            Flow: {clientSecret ? 'auth-code + refresh' : 'implicit (kein refresh)'}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.6rem', color: tokenOk ? 'success.main' : 'error.main' }}>
            {(() => {
              if (!accessToken) return 'Access-Token: fehlt'
              const expiryStr = tokenExpiry && tokenExpiry > Date.now()
                ? `läuft ab ${new Date(tokenExpiry).toLocaleTimeString('de-DE')}`
                : 'ABGELAUFEN'
              return `Access-Token: ...${accessToken.slice(-8)} (${expiryStr})`
            })()}
          </Typography>
          <Typography variant="caption" sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.6rem', color: refreshToken ? 'success.main' : 'text.disabled' }}>
            Refresh-Token: {refreshToken ? `gespeichert (...${refreshToken.slice(-8)})` : 'fehlt'}
          </Typography>
          {/* Log entries */}
          <Box
            sx={{
              mt: 0.5,
              maxHeight: 90,
              overflow: 'auto',
              borderTop: 1,
              borderColor: 'divider',
              pt: 0.5,
            }}
          >
            {debugLogs.length === 0 ? (
              <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.6rem', color: 'text.disabled' }}>
                Noch keine Logs
              </Typography>
            ) : (
              debugLogs.map((log, i) => (
                <Typography
                  key={i}
                  variant="caption"
                  sx={{ display: 'block', fontFamily: 'monospace', fontSize: '0.6rem', color: 'text.secondary', lineHeight: 1.3 }}
                >
                  {log}
                </Typography>
              ))
            )}
          </Box>
        </Paper>
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
