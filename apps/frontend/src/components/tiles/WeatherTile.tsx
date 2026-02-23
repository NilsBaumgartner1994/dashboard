import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Typography,
  CircularProgress,
  Divider,
  TextField,
  Button,
  IconButton,
  Tooltip,
} from '@mui/material'
import WbSunnyIcon from '@mui/icons-material/WbSunny'
import WbCloudyIcon from '@mui/icons-material/WbCloudy'
import CloudIcon from '@mui/icons-material/Cloud'
import GrainIcon from '@mui/icons-material/Grain'
import AcUnitIcon from '@mui/icons-material/AcUnit'
import ThunderstormIcon from '@mui/icons-material/Thunderstorm'
import WaterDropIcon from '@mui/icons-material/WaterDrop'
import RefreshIcon from '@mui/icons-material/Refresh'
import SearchIcon from '@mui/icons-material/Search'
import BaseTile from './BaseTile'
import LargeModal from './LargeModal'
import ReloadIntervalBar from './ReloadIntervalBar'
import ReloadIntervalSettings from './ReloadIntervalSettings'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'

const WEATHER_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

function getWeatherCacheKey(tileId: string) {
  return `weather-cache-${tileId}`
}

function loadWeatherCache(tileId: string): { data: WeatherData; ts: number } | null {
  try {
    const raw = localStorage.getItem(getWeatherCacheKey(tileId))
    if (!raw) return null
    return JSON.parse(raw) as { data: WeatherData; ts: number }
  } catch {
    return null
  }
}

function saveWeatherCache(tileId: string, data: WeatherData) {
  try {
    localStorage.setItem(getWeatherCacheKey(tileId), JSON.stringify({ data, ts: Date.now() }))
  } catch { /* ignore */ }
}

// WMO Weather interpretation codes
// https://open-meteo.com/en/docs#weathervariables
function getWeatherInfo(code: number): { label: string; Icon: React.ElementType; color: string } {
  if (code === 0) return { label: 'Klar', Icon: WbSunnyIcon, color: '#FFB300' }
  if (code === 1) return { label: 'Meist klar', Icon: WbSunnyIcon, color: '#FFB300' }
  if (code === 2) return { label: 'Teilweise bewölkt', Icon: WbCloudyIcon, color: '#90A4AE' }
  if (code === 3) return { label: 'Bedeckt', Icon: CloudIcon, color: '#78909C' }
  if (code === 45 || code === 48) return { label: 'Nebelig', Icon: CloudIcon, color: '#90A4AE' }
  if (code >= 51 && code <= 55) return { label: 'Nieselregen', Icon: GrainIcon, color: '#42A5F5' }
  if (code >= 61 && code <= 67) return { label: 'Regen', Icon: WaterDropIcon, color: '#1E88E5' }
  if (code >= 71 && code <= 77) return { label: 'Schnee', Icon: AcUnitIcon, color: '#90CAF9' }
  if (code >= 80 && code <= 82) return { label: 'Regenschauer', Icon: GrainIcon, color: '#1E88E5' }
  if (code >= 85 && code <= 86) return { label: 'Schneeschauer', Icon: AcUnitIcon, color: '#90CAF9' }
  if (code >= 95 && code <= 99) return { label: 'Gewitter', Icon: ThunderstormIcon, color: '#7B1FA2' }
  return { label: 'Unbekannt', Icon: WbSunnyIcon, color: '#90A4AE' }
}

function getTempBarColor(temp: number): string {
  if (temp <= 0) return '#90CAF9'
  if (temp <= 10) return '#64B5F6'
  if (temp <= 20) return '#FFB74D'
  if (temp <= 30) return '#FF7043'
  return '#F44336'
}

const DAY_NAMES = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.']
const DAY_NAMES_FULL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const MONTH_NAMES = ['Jan.', 'Feb.', 'Mär.', 'Apr.', 'Mai', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.']

interface WeatherConfig {
  location?: string
  lat?: number
  lon?: number
  name?: string
  backgroundImage?: string
  reloadIntervalMinutes?: 1 | 5 | 60
  showReloadBar?: boolean
  showLastUpdate?: boolean
}

interface WeatherData {
  current: { temp: number; code: number }
  daily: Array<{ date: string; code: number; maxTemp: number }>
}

interface HourData {
  time: string
  temp: number
  code: number
}

interface DayDetailData {
  date: string
  code: number
  maxTemp: number
  minTemp: number
  hours: HourData[]
}

interface WeatherTileProps {
  tile: TileInstance
}

export default function WeatherTile({ tile }: WeatherTileProps) {
  const config = (tile.config ?? {}) as WeatherConfig
  const defaultLat = useStore((s) => s.defaultLat)
  const defaultLon = useStore((s) => s.defaultLon)
  const defaultLocationName = useStore((s) => s.defaultLocationName)

  // Effective location: tile-specific first, then global default
  const effectiveLat = config.lat ?? defaultLat
  const effectiveLon = config.lon ?? defaultLon
  const effectiveName = config.location ?? defaultLocationName

  const reloadIntervalMinutes: 1 | 5 | 60 = config.reloadIntervalMinutes ?? 60
  const showReloadBar = config.showReloadBar ?? false
  const showLastUpdate = config.showLastUpdate ?? false
  const reloadIntervalMs = reloadIntervalMinutes * 60 * 1000

  const [weather, setWeather] = useState<WeatherData | null>(() => {
    const cached = loadWeatherCache(tile.id)
    if (cached && Date.now() - cached.ts < reloadIntervalMs) return cached.data
    return null
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastWeatherUpdate, setLastWeatherUpdate] = useState<number | null>(() => {
    const cached = loadWeatherCache(tile.id)
    if (cached && Date.now() - cached.ts < reloadIntervalMs) return cached.ts
    return null
  })

  // Settings form state
  const [locationInput, setLocationInput] = useState(config.location ?? '')
  const [geocodedLat, setGeocodedLat] = useState<number | undefined>(config.lat)
  const [geocodedLon, setGeocodedLon] = useState<number | undefined>(config.lon)
  const [geocodedName, setGeocodedName] = useState<string>(config.location ?? '')
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)
  const [reloadIntervalInput, setReloadIntervalInput] = useState<1 | 5 | 60>(reloadIntervalMinutes)
  const [showReloadBarInput, setShowReloadBarInput] = useState(showReloadBar)
  const [showLastUpdateInput, setShowLastUpdateInput] = useState(showLastUpdate)

  // Detail modal state
  const [detailOpen, setDetailOpen] = useState(false)
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [detailDays, setDetailDays] = useState<DayDetailData[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const detailTsRef = useRef<number>(0)

  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchWeather = useCallback(async (lat: number, lon: number, force = false) => {
    if (!force) {
      const cached = loadWeatherCache(tile.id)
      if (cached && Date.now() - cached.ts < reloadIntervalMs) {
        setWeather(cached.data)
        setLastWeatherUpdate(cached.ts)
        return
      }
    }
    setLoading(true)
    setError(null)
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weathercode` +
        `&daily=weathercode,temperature_2m_max` +
        `&forecast_days=4&timezone=auto`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const result: WeatherData = {
        current: {
          temp: Math.round(data.current.temperature_2m),
          code: data.current.weathercode,
        },
        // Skip index 0 (today) for the daily forecast shown below
        daily: data.daily.time.slice(1, 4).map((date: string, i: number) => ({
          date,
          code: data.daily.weathercode[i + 1],
          maxTemp: Math.round(data.daily.temperature_2m_max[i + 1]),
        })),
      }
      setWeather(result)
      saveWeatherCache(tile.id, result)
      setLastWeatherUpdate(Date.now())
    } catch {
      setError('Wetter konnte nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [tile.id, reloadIntervalMs])

  const fetchDetailWeather = useCallback(async (lat: number, lon: number) => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&hourly=temperature_2m,weathercode` +
        `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
        `&forecast_days=7&timezone=auto`
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const days: DayDetailData[] = (data.daily.time as string[]).map((date, i) => {
        const hours: HourData[] = []
        ;(data.hourly.time as string[]).forEach((t, hi) => {
          if (t.startsWith(date)) {
            hours.push({
              time: t.substring(11, 16),
              temp: Math.round(data.hourly.temperature_2m[hi]),
              code: data.hourly.weathercode[hi],
            })
          }
        })
        return {
          date,
          code: data.daily.weathercode[i],
          maxTemp: Math.round(data.daily.temperature_2m_max[i]),
          minTemp: Math.round(data.daily.temperature_2m_min[i]),
          hours,
        }
      })
      setDetailDays(days)
      detailTsRef.current = Date.now()
    } catch {
      setDetailError('Detaildaten konnten nicht geladen werden')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    if (effectiveLat !== undefined && effectiveLon !== undefined) {
      fetchWeather(effectiveLat, effectiveLon)
      // Refresh every configured interval
      fetchIntervalRef.current = setInterval(
        () => fetchWeather(effectiveLat!, effectiveLon!, true),
        reloadIntervalMs,
      )
    }
    return () => {
      if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current)
    }
  }, [effectiveLat, effectiveLon, fetchWeather, reloadIntervalMs])

  const handleSettingsOpen = () => {
    setLocationInput(config.location ?? '')
    setGeocodedLat(config.lat)
    setGeocodedLon(config.lon)
    setGeocodedName(config.location ?? '')
    setGeocodeError(null)
    setReloadIntervalInput(reloadIntervalMinutes)
    setShowReloadBarInput(showReloadBar)
    setShowLastUpdateInput(showLastUpdate)
  }

  const handleGeocode = async () => {
    if (!locationInput.trim()) return
    setGeocodeLoading(true)
    setGeocodeError(null)
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationInput.trim())}&count=1&language=de&format=json`,
      )
      const data = await res.json()
      if (data.results?.length) {
        setGeocodedLat(data.results[0].latitude)
        setGeocodedLon(data.results[0].longitude)
        setGeocodedName(data.results[0].name)
        setGeocodeError(null)
      } else {
        setGeocodeError('Ort nicht gefunden')
      }
    } catch {
      setGeocodeError('Geocodierung fehlgeschlagen')
    } finally {
      setGeocodeLoading(false)
    }
  }

  const getExtraConfig = (): Record<string, unknown> => ({
    location: geocodedName || locationInput,
    lat: geocodedLat,
    lon: geocodedLon,
    reloadIntervalMinutes: reloadIntervalInput,
    showReloadBar: showReloadBarInput,
    showLastUpdate: showLastUpdateInput,
  })

  const hasLocation = effectiveLat !== undefined && effectiveLon !== undefined
  const currentInfo = weather ? getWeatherInfo(weather.current.code) : null

  const handleTileClick = () => {
    if (!hasLocation) return
    setDetailOpen(true)
    setSelectedDayIndex(0)
    if (!detailDays || Date.now() - detailTsRef.current > WEATHER_CACHE_TTL_MS) {
      fetchDetailWeather(effectiveLat!, effectiveLon!)
    }
  }

  // ── Settings content ──────────────────────────────────────────────────────
  const settingsContent = (
    <>
      <Divider sx={{ mb: 2 }}>Wetter</Divider>
      <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
        <TextField
          fullWidth
          label="Ort / Stadt"
          placeholder="z.B. Berlin"
          value={locationInput}
          onChange={(e) => setLocationInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleGeocode() }}
          size="small"
        />
        <Button
          variant="outlined"
          onClick={handleGeocode}
          disabled={geocodeLoading || !locationInput.trim()}
          startIcon={geocodeLoading ? <CircularProgress size={14} /> : <SearchIcon />}
          sx={{ whiteSpace: 'nowrap', minWidth: 100 }}
        >
          Suchen
        </Button>
      </Box>
      {geocodeError && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mb: 1 }}>
          {geocodeError}
        </Typography>
      )}
      {geocodedLat !== undefined && geocodedLon !== undefined && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          ✓ {geocodedName} ({geocodedLat.toFixed(3)}, {geocodedLon.toFixed(3)})
        </Typography>
      )}
      <ReloadIntervalSettings
        intervalMinutes={reloadIntervalInput}
        onIntervalChange={setReloadIntervalInput}
        showBar={showReloadBarInput}
        onShowBarChange={setShowReloadBarInput}
        showLastUpdate={showLastUpdateInput}
        onShowLastUpdateChange={setShowLastUpdateInput}
        label="Aktualisierung"
      />
    </>
  )

  // ── Render helpers ────────────────────────────────────────────────────────
  const selectedDay = detailDays?.[selectedDayIndex]
  const MAX_BAR_HEIGHT = 80
  const MIN_BAR_HEIGHT = 4
  const hourBarMinTemp = selectedDay && selectedDay.hours.length ? Math.min(...selectedDay.hours.map((h) => h.temp)) : 0
  const hourBarMaxTemp = selectedDay && selectedDay.hours.length ? Math.max(...selectedDay.hours.map((h) => h.temp)) : 1
  const hourRange = hourBarMaxTemp - hourBarMinTemp || 1

  const handleWeatherReload = useCallback(() => {
    if (effectiveLat !== undefined && effectiveLon !== undefined) {
      fetchWeather(effectiveLat, effectiveLon, true)
    }
  }, [effectiveLat, effectiveLon, fetchWeather])

  return (
    <>
      <BaseTile
        tile={tile}
        settingsChildren={settingsContent}
        getExtraConfig={getExtraConfig}
        onSettingsOpen={handleSettingsOpen}
        onTileClick={handleTileClick}
        footer={
          <ReloadIntervalBar
            show={showReloadBar}
            lastUpdate={lastWeatherUpdate}
            intervalMs={reloadIntervalMs}
            showLastUpdate={showLastUpdate}
            label="Wetter"
            onReload={handleWeatherReload}
          />
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          {/* No location configured */}
          {!hasLocation && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Typography variant="body2" color="text.secondary" textAlign="center">
                Kein Ort konfiguriert.{'\n'}⚙ drücken und Ort suchen.
              </Typography>
            </Box>
          )}

          {/* Loading */}
          {hasLocation && loading && !weather && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <CircularProgress size={32} />
            </Box>
          )}

          {/* Error */}
          {hasLocation && error && !weather && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1 }}>
              <Typography variant="body2" color="error">{error}</Typography>
              <Tooltip title="Neu laden">
                <IconButton size="small" onClick={() => fetchWeather(effectiveLat!, effectiveLon!, true)}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}

          {/* Weather data */}
          {weather && currentInfo && (
            <>
              {/* Upper 2/3 – today */}
              <Box
                sx={{
                  flex: '0 0 66%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.5,
                  pb: 1,
                }}
              >
                {effectiveName && (
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {effectiveName}
                  </Typography>
                )}
                <currentInfo.Icon sx={{ fontSize: 56, color: currentInfo.color }} />
                <Typography variant="h5" fontWeight="bold" lineHeight={1}>
                  {weather.current.temp}°C
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {currentInfo.label}
                </Typography>
              </Box>

              {/* Divider */}
              <Divider />

              {/* Lower 1/3 – next 3 days */}
              <Box
                sx={{
                  flex: '0 0 34%',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  pt: 0.5,
                }}
              >
                {weather.daily.map((day) => {
                  const dayInfo = getWeatherInfo(day.code)
                  const date = new Date(day.date)
                  const dayName = DAY_NAMES[date.getDay()]
                  return (
                    <Box
                      key={day.date}
                      sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}
                    >
                      <Typography variant="caption" fontWeight="bold">{dayName}</Typography>
                      <dayInfo.Icon sx={{ fontSize: 20, color: dayInfo.color }} />
                      <Typography variant="caption">{day.maxTemp}°C</Typography>
                    </Box>
                  )
                })}
              </Box>
            </>
          )}
        </Box>
      </BaseTile>

      {/* ── Weather detail modal ─────────────────────────────────────────── */}
      <LargeModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={effectiveName ? `Wetter – ${effectiveName}` : 'Wetter'}
      >
          {/* Loading */}
          {detailLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <CircularProgress />
            </Box>
          )}

          {/* Error */}
          {detailError && !detailLoading && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 1 }}>
              <Typography color="error">{detailError}</Typography>
              <Button onClick={() => fetchDetailWeather(effectiveLat!, effectiveLon!)}>Erneut versuchen</Button>
            </Box>
          )}

          {/* Detail content */}
          {detailDays && !detailLoading && (
            <>
              {/* Day selector */}
              <Box
                sx={{
                  display: 'flex',
                  gap: 1,
                  p: 1.5,
                  overflowX: 'auto',
                  flexShrink: 0,
                  borderBottom: 1,
                  borderColor: 'divider',
                  '&::-webkit-scrollbar': { height: 4 },
                }}
              >
                {detailDays.map((day, idx) => {
                  const date = new Date(day.date)
                  const isToday = idx === 0
                  const dayShort = isToday ? 'Heute' : DAY_NAMES[date.getDay()]
                  const dayInfo = getWeatherInfo(day.code)
                  return (
                    <Button
                      key={day.date}
                      variant={idx === selectedDayIndex ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => setSelectedDayIndex(idx)}
                      sx={{ flexShrink: 0, flexDirection: 'column', gap: 0.25, py: 0.5, minWidth: 72 }}
                    >
                      <Typography variant="caption" fontWeight="bold" lineHeight={1}>{dayShort}</Typography>
                      <dayInfo.Icon sx={{ fontSize: 18, color: idx === selectedDayIndex ? 'inherit' : dayInfo.color }} />
                      <Typography variant="caption" lineHeight={1}>{day.maxTemp}°/{day.minTemp}°</Typography>
                    </Button>
                  )
                })}
              </Box>

              {/* Selected day info + hourly chart */}
              {selectedDay && (
                <>
                  <Box sx={{ px: 2, py: 1.5, flexShrink: 0 }}>
                    {(() => {
                      const date = new Date(selectedDay.date)
                      const dayFull = DAY_NAMES_FULL[date.getDay()]
                      const dayOfMonth = date.getDate()
                      const month = MONTH_NAMES[date.getMonth()]
                      const dayInfo = getWeatherInfo(selectedDay.code)
                      return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <dayInfo.Icon sx={{ fontSize: 36, color: dayInfo.color }} />
                          <Box>
                            <Typography variant="subtitle1" fontWeight="bold">
                              {selectedDayIndex === 0 ? 'Heute' : `${dayFull}, ${dayOfMonth}. ${month}`}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {dayInfo.label} · {selectedDay.maxTemp}°C / {selectedDay.minTemp}°C
                            </Typography>
                          </Box>
                        </Box>
                      )
                    })()}
                  </Box>

                  <Divider />

                  {/* Hourly temperature bars */}
                  <Box sx={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-end',
                        gap: 0.5,
                        px: 1.5,
                        pb: 1,
                        pt: 2,
                        minWidth: 'max-content',
                        height: '100%',
                      }}
                    >
                      {selectedDay.hours.map((hour) => {
                        const barHeight = Math.max(
                          MIN_BAR_HEIGHT,
                          Math.round(((hour.temp - hourBarMinTemp) / hourRange) * MAX_BAR_HEIGHT),
                        )
                        const barColor = getTempBarColor(hour.temp)
                        const hourInfo = getWeatherInfo(hour.code)
                        return (
                          <Box
                            key={hour.time}
                            sx={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              width: 40,
                              gap: 0.25,
                            }}
                          >
                            <Typography variant="caption" sx={{ fontSize: '0.65rem', lineHeight: 1.2 }}>
                              {hour.temp}°
                            </Typography>
                            <Tooltip title={hourInfo.label}>
                              <hourInfo.Icon aria-label={hourInfo.label} sx={{ fontSize: 16, color: hourInfo.color }} />
                            </Tooltip>
                            <Box sx={{ height: MAX_BAR_HEIGHT, display: 'flex', alignItems: 'flex-end' }}>
                              <Box
                                sx={{
                                  width: 28,
                                  height: barHeight,
                                  backgroundColor: barColor,
                                  borderRadius: '4px 4px 0 0',
                                  transition: 'height 0.3s ease',
                                }}
                              />
                            </Box>
                            <Typography variant="caption" sx={{ fontSize: '0.65rem', lineHeight: 1.2 }}>
                              {hour.time}
                            </Typography>
                          </Box>
                        )
                      })}
                    </Box>
                  </Box>
                </>
              )}
            </>
          )}
      </LargeModal>
    </>
  )
}
