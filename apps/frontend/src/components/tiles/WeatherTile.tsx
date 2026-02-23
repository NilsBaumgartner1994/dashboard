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
import type { TileInstance } from '../../store/useStore'

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

const DAY_NAMES = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.']

interface WeatherConfig {
  location?: string
  lat?: number
  lon?: number
  name?: string
  backgroundImage?: string
}

interface WeatherData {
  current: { temp: number; code: number }
  daily: Array<{ date: string; code: number; maxTemp: number }>
}

interface WeatherTileProps {
  tile: TileInstance
}

export default function WeatherTile({ tile }: WeatherTileProps) {
  const config = (tile.config ?? {}) as WeatherConfig

  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Settings form state
  const [locationInput, setLocationInput] = useState(config.location ?? '')
  const [geocodedLat, setGeocodedLat] = useState<number | undefined>(config.lat)
  const [geocodedLon, setGeocodedLon] = useState<number | undefined>(config.lon)
  const [geocodedName, setGeocodedName] = useState<string>(config.location ?? '')
  const [geocodeLoading, setGeocodeLoading] = useState(false)
  const [geocodeError, setGeocodeError] = useState<string | null>(null)

  const fetchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
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
      setWeather({
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
      })
    } catch {
      setError('Wetter konnte nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (config.lat !== undefined && config.lon !== undefined) {
      fetchWeather(config.lat, config.lon)
      // Refresh every 30 minutes
      fetchIntervalRef.current = setInterval(() => fetchWeather(config.lat!, config.lon!), 30 * 60 * 1000)
    }
    return () => {
      if (fetchIntervalRef.current) clearInterval(fetchIntervalRef.current)
    }
  }, [config.lat, config.lon, fetchWeather])

  const handleSettingsOpen = () => {
    setLocationInput(config.location ?? '')
    setGeocodedLat(config.lat)
    setGeocodedLon(config.lon)
    setGeocodedName(config.location ?? '')
    setGeocodeError(null)
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
  })

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
    </>
  )

  // ── Render helpers ────────────────────────────────────────────────────────
  const hasLocation = config.lat !== undefined && config.lon !== undefined
  const currentInfo = weather ? getWeatherInfo(weather.current.code) : null

  return (
    <BaseTile
      tile={tile}
      settingsChildren={settingsContent}
      getExtraConfig={getExtraConfig}
      onSettingsOpen={handleSettingsOpen}
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
              <IconButton size="small" onClick={() => fetchWeather(config.lat!, config.lon!)}>
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
              {config.location && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {config.location}
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
  )
}
