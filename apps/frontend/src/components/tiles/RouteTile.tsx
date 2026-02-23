import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Typography,
  CircularProgress,
  Divider,
  TextField,
  Button,
  Switch,
  FormControlLabel,
  List,
} from '@mui/material'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import SearchIcon from '@mui/icons-material/Search'
import EventIcon from '@mui/icons-material/Event'
import BaseTile from './BaseTile'
import CalendarEventItem from './CalendarEventItem'
import type { CalendarEventData } from './CalendarEventItem'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'
import { useGoogleAuthStore, isTokenValid } from '../../store/useGoogleAuthStore'
import { useCalendarEventsStore } from '../../store/useCalendarEventsStore'

interface RouteConfig {
  name?: string
  backgroundImage?: string
  // Start location (if empty, use global default)
  startName?: string
  startLat?: number
  startLon?: number
  // Destination
  destName?: string
  destLat?: number
  destLon?: number
  // Options
  useCalendar?: boolean
  showTimer?: boolean
  showCoordinates?: boolean
}

type CalendarEvent = CalendarEventData

async function geocodeName(name: string): Promise<{ lat: number; lon: number; name: string } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name.trim())}&count=1&language=de&format=json`,
    )
    const data = await res.json()
    if (data.results?.length) {
      return { lat: data.results[0].latitude, lon: data.results[0].longitude, name: data.results[0].name }
    }
  } catch { /* ignore */ }
  return null
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h} Std. ${m} Min.`
  return `${m} Min.`
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

interface RouteTileProps {
  tile: TileInstance
}

export default function RouteTile({ tile }: RouteTileProps) {
  const config = (tile.config ?? {}) as RouteConfig
  const defaultLat = useStore((s) => s.defaultLat)
  const defaultLon = useStore((s) => s.defaultLon)
  const defaultLocationName = useStore((s) => s.defaultLocationName)
  const debugMode = useStore((s) => s.debugMode)
  const { accessToken, tokenExpiry } = useGoogleAuthStore()
  const tokenOk = isTokenValid({ accessToken, tokenExpiry })
  const storeEvents = useCalendarEventsStore((s) => s.events)

  // Runtime state
  const [travelSeconds, setTravelSeconds] = useState<number | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)

  // Calendar mode
  const [nextEvent, setNextEvent] = useState<CalendarEvent | null>(null)
  const [nextEventAny, setNextEventAny] = useState<CalendarEvent | null>(null)
  const [eventLat, setEventLat] = useState<number | null>(null)
  const [eventLon, setEventLon] = useState<number | null>(null)
  const [calLoading, setCalLoading] = useState(false)

  // Countdown timer
  const [countdown, setCountdown] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Settings form state
  const [startInput, setStartInput] = useState(config.startName ?? '')
  const [startLat, setStartLat] = useState<number | undefined>(config.startLat)
  const [startLon, setStartLon] = useState<number | undefined>(config.startLon)
  const [startGeoName, setStartGeoName] = useState(config.startName ?? '')
  const [startGeoLoading, setStartGeoLoading] = useState(false)
  const [startGeoError, setStartGeoError] = useState<string | null>(null)

  const [destInput, setDestInput] = useState(config.destName ?? '')
  const [destLat, setDestLat] = useState<number | undefined>(config.destLat)
  const [destLon, setDestLon] = useState<number | undefined>(config.destLon)
  const [destGeoName, setDestGeoName] = useState(config.destName ?? '')
  const [destGeoLoading, setDestGeoLoading] = useState(false)
  const [destGeoError, setDestGeoError] = useState<string | null>(null)

  const [useCalendar, setUseCalendar] = useState(config.useCalendar ?? false)
  const [showTimer, setShowTimer] = useState(config.showTimer ?? false)
  const [showCoordinates, setShowCoordinates] = useState(config.showCoordinates ?? false)

  // Inline tile inputs (used when locations are not fixed in settings)
  const [tileStartInput, setTileStartInput] = useState('')
  const [tileDestInput, setTileDestInput] = useState('')
  const [tileStartGeoLoading, setTileStartGeoLoading] = useState(false)
  const [tileDestGeoLoading, setTileDestGeoLoading] = useState(false)
  const [tileStartLat, setTileStartLat] = useState<number | undefined>(undefined)
  const [tileStartLon, setTileStartLon] = useState<number | undefined>(undefined)
  const [tileStartName, setTileStartName] = useState<string | undefined>(undefined)
  const [tileDestLat, setTileDestLat] = useState<number | undefined>(undefined)
  const [tileDestLon, setTileDestLon] = useState<number | undefined>(undefined)
  const [tileDestName, setTileDestName] = useState<string | undefined>(undefined)

  // Effective start: tile-specific > global default > inline tile input
  // Always use lat/lon from the same source to avoid mismatched pairs
  const configHasStart = config.startLat !== undefined && config.startLon !== undefined
  const defaultHasLocation = defaultLat !== undefined && defaultLon !== undefined
  const tileHasStart = tileStartLat !== undefined && tileStartLon !== undefined
  const effectiveStartLat = configHasStart ? config.startLat : defaultHasLocation ? defaultLat : tileHasStart ? tileStartLat : undefined
  const effectiveStartLon = configHasStart ? config.startLon : defaultHasLocation ? defaultLon : tileHasStart ? tileStartLon : undefined
  const effectiveStartName = configHasStart ? config.startName : defaultHasLocation ? defaultLocationName : tileHasStart ? tileStartName : undefined

  // Effective dest for non-calendar mode: tile config > inline tile input
  const configHasDest = config.destLat !== undefined && config.destLon !== undefined
  const tileHasDest = tileDestLat !== undefined && tileDestLon !== undefined
  const effectiveDestLat = configHasDest ? config.destLat : tileHasDest ? tileDestLat : undefined
  const effectiveDestLon = configHasDest ? config.destLon : tileHasDest ? tileDestLon : undefined
  const effectiveDestName = configHasDest ? config.destName : tileHasDest ? tileDestName : undefined

  // ── Fetch route ───────────────────────────────────────────────────────────
  const fetchRoute = useCallback(async (lat1: number, lon1: number, lat2: number, lon2: number) => {
    setRouteLoading(true)
    setRouteError(null)
    try {
      const res = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`,
      )
      const data = await res.json()
      if (data.routes?.length) {
        setTravelSeconds(data.routes[0].duration)
      } else {
        setRouteError('Keine Route gefunden')
      }
    } catch {
      setRouteError('Route konnte nicht berechnet werden')
    } finally {
      setRouteLoading(false)
    }
  }, [])

  // ── Fetch next calendar event with location ───────────────────────────────
  const fetchNextCalendarEvent = useCallback(async (token: string) => {
    setCalLoading(true)
    try {
      const now = new Date()
      const timeMax = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString()
      const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events')
      url.searchParams.set('timeMin', now.toISOString())
      url.searchParams.set('timeMax', timeMax)
      url.searchParams.set('singleEvents', 'true')
      url.searchParams.set('orderBy', 'startTime')
      url.searchParams.set('maxResults', '10')
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const events: CalendarEvent[] = data.items ?? []
      const withLocation = events.find((e) => e.location?.trim())
      setNextEventAny(events[0] ?? null)
      setNextEvent(withLocation ?? null)
    } catch { /* ignore */ }
    finally { setCalLoading(false) }
  }, [])

  // ── Geocode calendar event location ──────────────────────────────────────
  useEffect(() => {
    if (!config.useCalendar || !nextEvent?.location) return
    geocodeName(nextEvent.location).then((r) => {
      if (r) {
        setEventLat(r.lat)
        setEventLon(r.lon)
      }
    })
  }, [config.useCalendar, nextEvent])

  // ── Fetch route when locations ready ─────────────────────────────────────
  useEffect(() => {
    if (effectiveStartLat === undefined || effectiveStartLon === undefined) return
    if (config.useCalendar) {
      if (eventLat !== null && eventLon !== null) {
        fetchRoute(effectiveStartLat, effectiveStartLon, eventLat, eventLon)
      }
    } else if (effectiveDestLat !== undefined && effectiveDestLon !== undefined) {
      fetchRoute(effectiveStartLat, effectiveStartLon, effectiveDestLat, effectiveDestLon)
    }
  }, [
    config.useCalendar,
    effectiveDestLat,
    effectiveDestLon,
    effectiveStartLat,
    effectiveStartLon,
    eventLat,
    eventLon,
    fetchRoute,
  ])

  // ── Sync calendar events from shared store or fetch directly ─────────────
  useEffect(() => {
    if (!config.useCalendar) return
    if (storeEvents.length > 0) {
      const now = new Date()
      const future = storeEvents
        .filter((e) => {
          const start = e.start.dateTime
            ? new Date(e.start.dateTime)
            : e.start.date
            ? new Date(e.start.date + 'T00:00:00')
            : null
          return start !== null && start >= now
        })
        .sort((a, b) => {
          const ta = a.start.dateTime ?? a.start.date ?? ''
          const tb = b.start.dateTime ?? b.start.date ?? ''
          return ta.localeCompare(tb)
        })
      setNextEventAny(future[0] ?? null)
      setNextEvent(future.find((e) => e.location?.trim()) ?? null)
    } else if (tokenOk && accessToken) {
      fetchNextCalendarEvent(accessToken)
    }
  }, [config.useCalendar, storeEvents, tokenOk, accessToken, fetchNextCalendarEvent])

  // ── Countdown timer ───────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (!config.showTimer || !config.useCalendar || !nextEvent?.start?.dateTime || travelSeconds === null) {
      setCountdown(null)
      return
    }
    const update = () => {
      const eventStart = new Date(nextEvent.start.dateTime!).getTime()
      const departureTime = eventStart - travelSeconds * 1000
      setCountdown(formatCountdown(departureTime - Date.now()))
    }
    update()
    timerRef.current = setInterval(update, 60000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [config.showTimer, config.useCalendar, nextEvent, travelSeconds])

  // ── Settings handlers ─────────────────────────────────────────────────────
  const handleSettingsOpen = () => {
    setStartInput(config.startName ?? '')
    setStartLat(config.startLat)
    setStartLon(config.startLon)
    setStartGeoName(config.startName ?? '')
    setStartGeoError(null)
    setDestInput(config.destName ?? '')
    setDestLat(config.destLat)
    setDestLon(config.destLon)
    setDestGeoName(config.destName ?? '')
    setDestGeoError(null)
    setUseCalendar(config.useCalendar ?? false)
    setShowTimer(config.showTimer ?? false)
    setShowCoordinates(config.showCoordinates ?? false)
  }

  const handleGeocodeStart = async () => {
    if (!startInput.trim()) return
    setStartGeoLoading(true)
    setStartGeoError(null)
    const r = await geocodeName(startInput)
    if (r) { setStartLat(r.lat); setStartLon(r.lon); setStartGeoName(r.name) }
    else setStartGeoError('Ort nicht gefunden')
    setStartGeoLoading(false)
  }

  const handleGeocodeDest = async () => {
    if (!destInput.trim()) return
    setDestGeoLoading(true)
    setDestGeoError(null)
    const r = await geocodeName(destInput)
    if (r) { setDestLat(r.lat); setDestLon(r.lon); setDestGeoName(r.name) }
    else setDestGeoError('Ort nicht gefunden')
    setDestGeoLoading(false)
  }

  const handleTileGeocodeStart = async () => {
    if (!tileStartInput.trim()) return
    setTileStartGeoLoading(true)
    const r = await geocodeName(tileStartInput)
    if (r) { setTileStartLat(r.lat); setTileStartLon(r.lon); setTileStartName(r.name) }
    setTileStartGeoLoading(false)
  }

  const handleTileGeocodeDest = async () => {
    if (!tileDestInput.trim()) return
    setTileDestGeoLoading(true)
    const r = await geocodeName(tileDestInput)
    if (r) { setTileDestLat(r.lat); setTileDestLon(r.lon); setTileDestName(r.name) }
    setTileDestGeoLoading(false)
  }

  const getExtraConfig = (): Record<string, unknown> => ({
    startName: startGeoName || startInput || undefined,
    startLat,
    startLon,
    destName: destGeoName || destInput || undefined,
    destLat,
    destLon,
    useCalendar,
    showTimer,
    showCoordinates,
  })

  // ── Display values ────────────────────────────────────────────────────────
  const displayDestName = config.useCalendar ? nextEvent?.location : effectiveDestName
  const displayDestLat = config.useCalendar ? eventLat ?? undefined : effectiveDestLat
  const displayDestLon = config.useCalendar ? eventLon ?? undefined : effectiveDestLon

  const departureTime =
    config.useCalendar && nextEvent?.start?.dateTime && travelSeconds !== null
      ? new Date(new Date(nextEvent.start.dateTime).getTime() - travelSeconds * 1000)
      : null

  // ── Settings content ──────────────────────────────────────────────────────
  const settingsContent = (
    <>
      <Divider sx={{ mb: 2 }}>Route</Divider>

      {/* Start */}
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Startpunkt (leer = Standard-Standort aus Einstellungen)
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
        <TextField
          fullWidth
          label="Start-Ort"
          placeholder="z.B. München"
          value={startInput}
          onChange={(e) => setStartInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleGeocodeStart() }}
          size="small"
        />
        <Button
          variant="outlined"
          onClick={handleGeocodeStart}
          disabled={startGeoLoading || !startInput.trim()}
          startIcon={startGeoLoading ? <CircularProgress size={14} /> : <SearchIcon />}
          sx={{ whiteSpace: 'nowrap', minWidth: 90 }}
        >
          Suchen
        </Button>
      </Box>
      {startGeoError && <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>{startGeoError}</Typography>}
      {startLat !== undefined && startLon !== undefined && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          ✓ {startGeoName} ({startLat.toFixed(3)}, {startLon.toFixed(3)})
        </Typography>
      )}

      {/* Destination */}
      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
        Ziel
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
        <TextField
          fullWidth
          label="Ziel-Ort"
          placeholder="z.B. Berlin"
          value={destInput}
          onChange={(e) => setDestInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleGeocodeDest() }}
          size="small"
        />
        <Button
          variant="outlined"
          onClick={handleGeocodeDest}
          disabled={destGeoLoading || !destInput.trim()}
          startIcon={destGeoLoading ? <CircularProgress size={14} /> : <SearchIcon />}
          sx={{ whiteSpace: 'nowrap', minWidth: 90 }}
        >
          Suchen
        </Button>
      </Box>
      {destGeoError && <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>{destGeoError}</Typography>}
      {destLat !== undefined && destLon !== undefined && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          ✓ {destGeoName} ({destLat.toFixed(3)}, {destLon.toFixed(3)})
        </Typography>
      )}

      <Divider sx={{ my: 1.5 }} />

      <FormControlLabel
        control={<Switch checked={useCalendar} onChange={(e) => setUseCalendar(e.target.checked)} />}
        label="Nächsten Kalendertermin mit Ort verwenden"
      />
      <FormControlLabel
        control={<Switch checked={showTimer} onChange={(e) => setShowTimer(e.target.checked)} />}
        label="Abfahrt-Timer anzeigen (HH:MM)"
      />
      <FormControlLabel
        control={<Switch checked={showCoordinates} onChange={(e) => setShowCoordinates(e.target.checked)} />}
        label="Koordinaten (Lat/Lon) auf der Kachel anzeigen"
      />
    </>
  )

  return (
    <BaseTile
      tile={tile}
      settingsChildren={settingsContent}
      getExtraConfig={getExtraConfig}
      onSettingsOpen={handleSettingsOpen}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 0.5 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <DirectionsCarIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight="bold">
            {(config.name as string) || 'Route'}
          </Typography>
          {config.useCalendar && (
            <EventIcon fontSize="small" color="action" sx={{ ml: 'auto' }} />
          )}
        </Box>

        {/* Start */}
        <Box>
          <Typography variant="caption" color="text.secondary">Start</Typography>
          {/* Show inline input when start is not fixed in settings and no global default */}
          {!configHasStart && !defaultHasLocation ? (
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25 }}>
              <TextField
                size="small"
                placeholder="Startort eingeben"
                value={tileStartInput}
                onChange={(e) => setTileStartInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleTileGeocodeStart() }}
                sx={{ flex: 1, '& .MuiInputBase-input': { py: 0.5, fontSize: '0.75rem' } }}
              />
              <Button
                size="small"
                variant="outlined"
                onClick={handleTileGeocodeStart}
                disabled={tileStartGeoLoading || !tileStartInput.trim()}
                sx={{ minWidth: 0, px: 1 }}
              >
                {tileStartGeoLoading ? <CircularProgress size={12} /> : <SearchIcon fontSize="small" />}
              </Button>
            </Box>
          ) : (
            <Typography variant="body2" noWrap>
              {effectiveStartName ?? '—'}
              {config.showCoordinates && effectiveStartLat !== undefined && effectiveStartLon !== undefined && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                  ({effectiveStartLat.toFixed(3)}, {effectiveStartLon.toFixed(3)})
                </Typography>
              )}
            </Typography>
          )}
        </Box>

        {/* Destination */}
        <Box>
          <Typography variant="caption" color="text.secondary">
            {config.useCalendar ? 'Nächster Termin' : 'Ziel'}
          </Typography>
          {config.useCalendar && calLoading && <CircularProgress size={14} />}
          {config.useCalendar && !calLoading && !nextEvent && (
            <Typography variant="body2" color="text.secondary">
              {tokenOk ? 'Kein Termin mit Ort gefunden' : 'Google Kalender nicht verbunden'}
            </Typography>
          )}
          {config.useCalendar && nextEvent && (
            <List dense disablePadding sx={{ mt: 0.25 }}>
              <CalendarEventItem ev={nextEvent} />
              {nextEvent.location && (
                <Typography variant="caption" color="text.secondary" noWrap sx={{ pl: 0.5 }}>
                  {nextEvent.location}
                  {config.showCoordinates && displayDestLat !== undefined && displayDestLon !== undefined && (
                    <span> ({displayDestLat.toFixed(3)}, {displayDestLon.toFixed(3)})</span>
                  )}
                </Typography>
              )}
            </List>
          )}
          {!config.useCalendar && configHasDest ? (
            <Typography variant="body2" noWrap>
              {displayDestName ?? '—'}
              {config.showCoordinates && displayDestLat !== undefined && displayDestLon !== undefined && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                  ({displayDestLat.toFixed(3)}, {displayDestLon.toFixed(3)})
                </Typography>
              )}
            </Typography>
          ) : !config.useCalendar && (
            /* Destination not fixed in settings – show inline input */
            tileHasDest ? (
              <Typography variant="body2" noWrap>
                {tileDestName ?? tileDestInput}
                {config.showCoordinates && tileDestLat !== undefined && tileDestLon !== undefined && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    ({tileDestLat.toFixed(3)}, {tileDestLon.toFixed(3)})
                  </Typography>
                )}
              </Typography>
            ) : (
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25 }}>
                <TextField
                  size="small"
                  placeholder="Zielort eingeben"
                  value={tileDestInput}
                  onChange={(e) => setTileDestInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleTileGeocodeDest() }}
                  sx={{ flex: 1, '& .MuiInputBase-input': { py: 0.5, fontSize: '0.75rem' } }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleTileGeocodeDest}
                  disabled={tileDestGeoLoading || !tileDestInput.trim()}
                  sx={{ minWidth: 0, px: 1 }}
                >
                  {tileDestGeoLoading ? <CircularProgress size={12} /> : <SearchIcon fontSize="small" />}
                </Button>
              </Box>
            )
          )}
        </Box>

        <Divider />

        {/* Travel time / departure */}
        {routeLoading && <CircularProgress size={20} />}
        {routeError && (
          <Typography variant="caption" color="error">{routeError}</Typography>
        )}
        {!routeLoading && travelSeconds !== null && (
          <Box>
            <Typography variant="body2">
              🚗 {formatDuration(travelSeconds)}
            </Typography>
            {departureTime && (
              <Typography variant="body2" color="primary">
                Abfahrt: {departureTime.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
              </Typography>
            )}
            {countdown !== null && (
              <Typography variant="h6" fontWeight="bold" color="secondary">
                ⏱ {countdown}
              </Typography>
            )}
          </Box>
        )}
        {!routeLoading && travelSeconds === null && !routeError && (
          <Typography variant="caption" color="text.secondary">
            {effectiveStartLat === undefined
              ? 'Startort eingeben oder Standard-Standort in Einstellungen setzen.'
              : !config.useCalendar && effectiveDestLat === undefined
              ? 'Zielort oben eingeben.'
              : ''}
          </Typography>
        )}

        {/* Debug: next calendar event as JSON */}
        {debugMode && config.useCalendar && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary" fontWeight="bold">
              Debug – Nächster Termin:
            </Typography>
            <Box
              component="pre"
              sx={{
                fontSize: '0.65rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                bgcolor: 'action.hover',
                p: 0.5,
                borderRadius: 1,
                mt: 0.25,
                maxHeight: 200,
                overflow: 'auto',
              }}
            >
              {JSON.stringify(nextEventAny, null, 2)}
            </Box>
          </Box>
        )}
      </Box>
    </BaseTile>
  )
}
