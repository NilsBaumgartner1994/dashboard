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
  Checkbox,
  FormControlLabel,
  FormGroup,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@mui/material'
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import RssFeedIcon from '@mui/icons-material/RssFeed'
import BaseTile from './BaseTile'
import type { TileInstance } from '../../store/useStore'

// Pre-defined RSS feed presets
const FEED_PRESETS: Array<{ id: string; label: string; url: string }> = [
  { id: 'tagesschau', label: 'Tagesschau', url: 'https://www.tagesschau.de/xml/rss2/' },
  { id: 'zeit', label: 'Zeit Online', url: 'https://newsfeed.zeit.de/index' },
]

// CORS proxy for browser RSS fetching
const CORS_PROXY = 'https://api.allorigins.win/raw?url='

// Duration in ms before navigation controls auto-hide
const CONTROLS_HIDE_DELAY_MS = 10_000

interface NewsItem {
  title: string
  description: string
  link: string
  pubDate: string
  source: string
}

interface NewsConfig {
  feeds?: string[]        // list of RSS URLs
  interval?: number       // seconds per item
  name?: string
  backgroundImage?: string
}

interface NewsTileProps {
  tile: TileInstance
}

function parseRssXml(xml: string, sourceLabel: string): NewsItem[] {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')
    const items = Array.from(doc.querySelectorAll('item'))
    return items.slice(0, 20).map((item) => ({
      title: item.querySelector('title')?.textContent?.trim() ?? '',
      description: (() => {
        const raw = item.querySelector('description')?.textContent ?? ''
        try {
          return new DOMParser().parseFromString(raw, 'text/html').body.textContent?.trim() ?? ''
        } catch {
          return raw.trim()
        }
      })(),
      link: item.querySelector('link')?.textContent?.trim() ?? '',
      pubDate: item.querySelector('pubDate')?.textContent?.trim() ?? '',
      source: sourceLabel,
    }))
  } catch {
    return []
  }
}

async function fetchFeed(url: string): Promise<NewsItem[]> {
  // Try direct fetch first, then via CORS proxy
  const tryFetch = async (fetchUrl: string): Promise<string | null> => {
    try {
      const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) return null
      return await res.text()
    } catch {
      return null
    }
  }

  const sourceLabel = (() => {
    try { return new URL(url).hostname.replace('www.', '') }
    catch { return url }
  })()

  // Try via CORS proxy
  const text = await tryFetch(`${CORS_PROXY}${encodeURIComponent(url)}`)
  if (text) return parseRssXml(text, sourceLabel)

  return []
}

export default function NewsTile({ tile }: NewsTileProps) {
  const config = (tile.config ?? {}) as NewsConfig
  const feeds: string[] = config.feeds ?? []
  const interval = config.interval ?? 10

  const [items, setItems] = useState<NewsItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(false)

  // Settings form state
  const [feedsInput, setFeedsInput] = useState<string[]>(config.feeds ?? [])
  const [customUrlInput, setCustomUrlInput] = useState('')
  const [intervalInput, setIntervalInput] = useState(String(config.interval ?? 10))

  // Timers
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fetch all feeds
  const fetchAllFeeds = useCallback(async (feedUrls: string[]) => {
    if (!feedUrls.length) return
    setLoading(true)
    try {
      const results = await Promise.all(feedUrls.map((url) => fetchFeed(url)))
      const allItems = results.flat().filter((item) => item.title)
      setItems(allItems)
      setCurrentIndex(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAllFeeds(feeds)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeds.join(','), fetchAllFeeds])

  // Auto-cycle
  useEffect(() => {
    if (items.length === 0) return
    cycleTimerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % items.length)
    }, Math.max(5, interval) * 1000)
    return () => {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current)
    }
  }, [items.length, interval])

  // Show controls on click, reset hide-timer on any action
  const showControls = () => {
    setControlsVisible(true)
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current)
    hideControlsTimerRef.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY_MS)
  }

  const goBack = (e: React.MouseEvent) => {
    e.stopPropagation()
    showControls()
    setCurrentIndex((prev) => (prev - 1 + items.length) % items.length)
    // Reset cycle timer
    if (cycleTimerRef.current) {
      clearInterval(cycleTimerRef.current)
      cycleTimerRef.current = setInterval(() => {
        setCurrentIndex((p) => (p + 1) % items.length)
      }, Math.max(5, interval) * 1000)
    }
  }

  const goForward = (e: React.MouseEvent) => {
    e.stopPropagation()
    showControls()
    setCurrentIndex((prev) => (prev + 1) % items.length)
    if (cycleTimerRef.current) {
      clearInterval(cycleTimerRef.current)
      cycleTimerRef.current = setInterval(() => {
        setCurrentIndex((p) => (p + 1) % items.length)
      }, Math.max(5, interval) * 1000)
    }
  }

  const handleTileClick = () => {
    if (!controlsVisible) showControls()
  }

  // Settings helpers
  const handleSettingsOpen = () => {
    setFeedsInput(config.feeds ?? [])
    setCustomUrlInput('')
    setIntervalInput(String(config.interval ?? 10))
  }

  const togglePreset = (url: string) => {
    setFeedsInput((prev) =>
      prev.includes(url) ? prev.filter((f) => f !== url) : [...prev, url],
    )
  }

  const addCustomUrl = () => {
    const url = customUrlInput.trim()
    if (!url || feedsInput.includes(url)) return
    setFeedsInput((prev) => [...prev, url])
    setCustomUrlInput('')
  }

  const removeUrl = (url: string) => {
    setFeedsInput((prev) => prev.filter((f) => f !== url))
  }

  const getExtraConfig = (): Record<string, unknown> => ({
    feeds: feedsInput,
    interval: Math.max(5, Number(intervalInput) || 10),
  })

  // Settings content
  const settingsContent = (
    <>
      <Divider sx={{ mb: 2 }}>News-Quellen</Divider>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>Vorauswahl</Typography>
      <FormGroup row sx={{ mb: 2 }}>
        {FEED_PRESETS.map((preset) => (
          <FormControlLabel
            key={preset.id}
            control={
              <Checkbox
                checked={feedsInput.includes(preset.url)}
                onChange={() => togglePreset(preset.url)}
                size="small"
              />
            }
            label={preset.label}
          />
        ))}
      </FormGroup>

      {/* Custom URL input */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          label="Eigene RSS-URL"
          placeholder="https://example.com/feed.rss"
          value={customUrlInput}
          onChange={(e) => setCustomUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addCustomUrl() }}
        />
        <Button
          variant="outlined"
          onClick={addCustomUrl}
          disabled={!customUrlInput.trim()}
          startIcon={<AddIcon />}
          sx={{ whiteSpace: 'nowrap', minWidth: 80 }}
        >
          Hinzufügen
        </Button>
      </Box>

      {/* List of custom (non-preset) URLs */}
      {feedsInput.filter((url) => !FEED_PRESETS.some((p) => p.url === url)).length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Benutzerdefinierte Feeds
          </Typography>
          <List dense disablePadding sx={{ mb: 2 }}>
            {feedsInput
              .filter((url) => !FEED_PRESETS.some((p) => p.url === url))
              .map((url) => (
                <ListItem key={url} disableGutters dense>
                  <ListItemText
                    primary={url}
                    primaryTypographyProps={{ variant: 'caption', noWrap: true }}
                  />
                  <ListItemSecondaryAction>
                    <IconButton size="small" edge="end" onClick={() => removeUrl(url)}>
                      <DeleteIcon fontSize="inherit" />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
          </List>
        </>
      )}

      <Divider sx={{ mb: 2 }}>Wechselintervall</Divider>
      <TextField
        fullWidth
        size="small"
        label="Wechsel alle (Sekunden)"
        type="number"
        inputProps={{ min: 5 }}
        value={intervalInput}
        onChange={(e) => setIntervalInput(e.target.value)}
        sx={{ mb: 2 }}
      />
    </>
  )

  const currentItem = items[currentIndex] ?? null

  return (
    <BaseTile
      tile={tile}
      settingsChildren={settingsContent}
      getExtraConfig={getExtraConfig}
      onSettingsOpen={handleSettingsOpen}
    >
      {/* Tile click area */}
      <Box
        onClick={handleTileClick}
        sx={{ position: 'relative', height: '100%', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
      >
        {/* No feeds configured */}
        {feeds.length === 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1, flexDirection: 'column' }}>
            <RssFeedIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Keine Feeds konfiguriert.{'\n'}⚙ drücken und Quellen wählen.
            </Typography>
          </Box>
        )}

        {/* Loading */}
        {feeds.length > 0 && loading && items.length === 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {/* News content */}
        {!loading && feeds.length > 0 && items.length === 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" color="text.secondary">
              Keine Nachrichten gefunden.
            </Typography>
          </Box>
        )}

        {currentItem && (
          <>
            {/* Open-link icon – top left, appears with controls */}
            {controlsVisible && (
              <Tooltip title="Artikel öffnen">
                <IconButton
                  size="small"
                  component="a"
                  href={currentItem.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    zIndex: 20,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    '&:hover': { backgroundColor: 'rgba(0,0,0,0.7)' },
                  }}
                >
                  <OpenInNewIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            )}

            {/* Navigation – left arrow */}
            {controlsVisible && items.length > 1 && (
              <IconButton
                size="small"
                onClick={goBack}
                sx={{
                  position: 'absolute',
                  left: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 20,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  color: '#fff',
                  '&:hover': { backgroundColor: 'rgba(0,0,0,0.7)' },
                }}
              >
                <ArrowBackIosNewIcon fontSize="inherit" />
              </IconButton>
            )}

            {/* Navigation – right arrow */}
            {controlsVisible && items.length > 1 && (
              <IconButton
                size="small"
                onClick={goForward}
                sx={{
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 20,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  color: '#fff',
                  '&:hover': { backgroundColor: 'rgba(0,0,0,0.7)' },
                }}
              >
                <ArrowForwardIosIcon fontSize="inherit" />
              </IconButton>
            )}

            {/* Spacer pushes news text to the bottom */}
            <Box sx={{ flex: 1 }} />

            {/* News text – bottom with contrast background */}
            <Box
              sx={{
                backgroundColor: 'rgba(0,0,0,0.65)',
                borderRadius: 1,
                px: 1.5,
                py: 1,
                mx: -1,
                mb: -1,
              }}
            >
              {currentItem.source && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                  <Chip
                    label={currentItem.source}
                    size="small"
                    sx={{ height: 16, fontSize: '0.6rem', backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
                  />
                  {items.length > 1 && (
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', ml: 'auto' }}>
                      {currentIndex + 1}/{items.length}
                    </Typography>
                  )}
                </Box>
              )}
              <Typography
                variant="body2"
                sx={{
                  color: '#fff',
                  fontWeight: 600,
                  lineHeight: 1.3,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {currentItem.title}
              </Typography>
            </Box>
          </>
        )}
      </Box>
    </BaseTile>
  )
}
