import { useState, useEffect, useCallback, useRef } from 'react'
import { parse as parseHtml } from 'node-html-parser'
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
  Alert,
} from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import AddIcon from '@mui/icons-material/Add'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import DeleteIcon from '@mui/icons-material/Delete'
import SettingsIcon from '@mui/icons-material/Settings'
import BaseTile from './BaseTile'
import LargeModal from './LargeModal'
import ReloadIntervalBar from './ReloadIntervalBar'
import ReloadIntervalSettings from './ReloadIntervalSettings'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'
import { useUIStore } from '../../store/useUIStore'

// Pre-defined RSS feed presets
const FEED_PRESETS: Array<{ id: string; label: string; url: string }> = [
  { id: 'tagesschau', label: 'Tagesschau', url: 'https://www.tagesschau.de/infoservices/alle-meldungen-100~rss2.xml' },
  { id: 'zeit', label: 'Zeit Online', url: 'https://newsfeed.zeit.de/' },
]

// Build a Google News RSS feed URL for a given search query
const buildGoogleNewsUrl = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query).replace(/%20/g, '+')}`

// CORS proxies for browser RSS fetching (tried in order until one succeeds)
const CORS_PROXIES = [
  'https://api.allorigins.win/raw?url=',
  'https://corsproxy.io/?url=',
]

const MEDIA_NS = 'http://search.yahoo.com/mrss/'
const MAX_NEWS_ITEMS = 20
// Minimum title length used when extracting article titles from Google News HTML / JSON
const MIN_TITLE_LENGTH = 10
// How far back (in characters) to search within a script text for a title preceding an article URL
const MAX_SCRIPT_SEARCH_DISTANCE = 600

/** Return true when the URL points to a Google News HTML page (not an RSS endpoint). */
function isGoogleNewsHtmlUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.hostname === 'news.google.com' && !u.pathname.startsWith('/rss/')
  } catch {
    return false
  }
}

const resolveGoogleNewsHref = (raw: string): string => {
  if (!raw) return ''
  if (raw.startsWith('http')) return raw
  try { return new URL(raw, 'https://news.google.com').toString() } catch { return raw }
}

/**
 * Parse Google News HTML in the browser using node-html-parser.
 *
 * Google News is a JavaScript SPA – it has NO <article> elements.
 * Strategies tried in order until results are found:
 *  1. DOM: <h3>/<h4> whose parent is an <a href> (common Google News structure)
 *  2. DOM: <h3>/<h4> that contain an <a href> (alternative structure)
 *  3. DOM: any <a href*="articles"> / <a href*="CBMi"> anchor with text ≥ 5 chars
 *  4. Script JSON: extract from AF_initDataCallback embedded data (pure SPA case)
 */
function parseGoogleNewsHtml(html: string, sourceLabel: string): NewsItem[] {
  const doc = parseHtml(html)
  const results: NewsItem[] = []
  const seenLinks = new Set<string>()

  const addItem = (item: NewsItem) => {
    const key = item.link || item.title
    if (!key || seenLinks.has(key)) return
    seenLinks.add(key)
    results.push(item)
  }

  // Strategy 1 – <h3>/<h4> whose direct parent is an <a href> (typical Google News card)
  for (const heading of doc.querySelectorAll('h3, h4')) {
    if (results.length >= MAX_NEWS_ITEMS) break
    const parent = heading.parentNode
    if (!parent || parent.rawTagName?.toLowerCase() !== 'a') continue
    const rawHref = (parent as typeof heading).getAttribute?.('href') ?? ''
    if (!rawHref) continue
    const title = heading.text.trim()
    if (!title) continue
    const link = resolveGoogleNewsHref(rawHref)
    const timeEl = parent.parentNode?.querySelector('time')
    const pubDate = timeEl?.getAttribute('datetime') ?? timeEl?.text.trim() ?? ''
    addItem({ title, description: '', link, pubDate, source: sourceLabel, imageUrl: '' })
  }
  if (results.length > 0) return results

  // Strategy 2 – <h3>/<h4> that contain an <a href>
  for (const heading of doc.querySelectorAll('h3, h4')) {
    if (results.length >= MAX_NEWS_ITEMS) break
    const anchor = heading.querySelector('a[href]')
    if (!anchor) continue
    const title = heading.text.trim()
    const link = resolveGoogleNewsHref(anchor.getAttribute('href') ?? '')
    if (!title || !link) continue
    const container = heading.parentNode
    const timeEl = container?.querySelector('time')
    const pubDate = timeEl?.getAttribute('datetime') ?? timeEl?.text.trim() ?? ''
    addItem({ title, description: '', link, pubDate, source: sourceLabel, imageUrl: '' })
  }
  if (results.length > 0) return results

  // Strategy 3 – any <a> pointing to a Google News article URL with readable text
  for (const anchor of doc.querySelectorAll('a[href]')) {
    if (results.length >= MAX_NEWS_ITEMS) break
    const rawHref = anchor.getAttribute('href') ?? ''
    if (!rawHref.includes('/articles/') && !rawHref.includes('CBMi')) continue
    const title = anchor.text.trim()
    if (!title || title.length < 5) continue
    addItem({ title, description: '', link: resolveGoogleNewsHref(rawHref), pubDate: '', source: sourceLabel, imageUrl: '' })
  }
  if (results.length > 0) return results

  // Strategy 4 – extract article data from embedded AF_initDataCallback JSON (pure SPA)
  // Google News embeds article data in <script> tags as:
  //   AF_initDataCallback({..., data:function(){return [..., [["CBMiXXX","Title",...], ...],...]}})
  for (const script of doc.querySelectorAll('script')) {
    if (results.length >= MAX_NEWS_ITEMS) break
    const text = script.text
    if (!text.includes('CBMi')) continue

    // Primary: "CBMiXXX","Title" – article ID immediately followed by title
    const primaryRe = new RegExp(`"(CBMi[A-Za-z0-9_-]{5,})"\\s*,\\s*"([^"]{${MIN_TITLE_LENGTH},200})"`, 'g')
    for (const m of text.matchAll(primaryRe)) {
      if (results.length >= MAX_NEWS_ITEMS) break
      const [, articleId, title] = m
      if (title.startsWith('http') || title.startsWith('CBMi')) continue
      addItem({ title, description: '', link: `https://news.google.com/articles/${articleId}`, pubDate: '', source: sourceLabel, imageUrl: '' })
    }
    if (results.length > 0) break

    // Fallback: "Title",...,"./articles/CBMiXXX" – title appears before the article URL
    const urlRe = /"\.\/articles\/(CBMi[A-Za-z0-9_-]+)"/g
    for (const m of text.matchAll(urlRe)) {
      if (results.length >= MAX_NEWS_ITEMS) break
      const articleId = m[1]
      const pos = m.index ?? 0
      // Find start of array entry containing this URL
      let start = pos
      let depth = 0
      for (let i = pos - 1; i >= Math.max(0, pos - MAX_SCRIPT_SEARCH_DISTANCE); i--) {
        const ch = text[i]
        if (ch === ']') depth++
        else if (ch === '[') {
          if (depth === 0) { start = i + 1; break }
          depth--
        }
      }
      const ctx = text.slice(start, pos)
      // Find all quoted strings that look like article titles (contain spaces)
      const candidates = [...ctx.matchAll(/"([^"]{${MIN_TITLE_LENGTH},200})"/g)]
        .map((c) => c[1])
        .filter((s) => !s.startsWith('http') && !s.startsWith('CBMi') && s.includes(' '))
      const title = candidates.sort((a, b) => b.length - a.length)[0]
      if (!title) continue
      addItem({ title, description: '', link: `https://news.google.com/articles/${articleId}`, pubDate: '', source: sourceLabel, imageUrl: '' })
    }
    if (results.length > 0) break
  }

  return results
}

/** Format a RSS pubDate string into a human-readable German locale string. */
function formatPubDate(pubDate: string): string {
  if (!pubDate) return ''
  try {
    const d = new Date(pubDate)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

/** Try to extract an image URL from an RSS <item> element. */
function extractRssImage(item: Element): string {
  // media:content
  const mc = item.getElementsByTagNameNS(MEDIA_NS, 'content')[0]
  if (mc?.getAttribute('url')) return mc.getAttribute('url') ?? ''
  // media:thumbnail
  const mt = item.getElementsByTagNameNS(MEDIA_NS, 'thumbnail')[0]
  if (mt?.getAttribute('url')) return mt.getAttribute('url') ?? ''
  // enclosure (image/...)
  const enc = item.querySelector('enclosure')
  if (enc?.getAttribute('type')?.startsWith('image/')) {
    const u = enc.getAttribute('url')
    if (u) return u
  }
  // img tag inside <description> text (CDATA containing HTML)
  const rawDesc = item.querySelector('description')?.textContent ?? ''
  const m = rawDesc.match(/<img[^>]+src="([^"]+)"/i)
  if (m?.[1]) return m[1]
  return ''
}

interface NewsItem {
  title: string
  description: string
  link: string
  pubDate: string
  source: string
  imageUrl: string
}

interface NewsConfig {
  feeds?: string[]        // list of RSS URLs
  interval?: number       // seconds per item
  name?: string
  backgroundImage?: string
  reloadIntervalMinutes?: 1 | 5 | 60
  showReloadBar?: boolean
  showLastUpdate?: boolean
  maxAgeDays?: number     // maximum age of news items in days (0 = no limit)
}

interface NewsTileProps {
  tile: TileInstance
}

function getRssItemLink(item: Element): string {
  // Standard textContent approach
  const linkEl = item.querySelector('link')
  const fromTextContent = linkEl?.textContent?.trim() ?? ''
  if (fromTextContent) return fromTextContent

  // Some browsers treat <link> as a void element in XML; in that case the URL
  // ends up as a text node *after* the element rather than inside it.
  const linkNode = Array.from(item.childNodes).find((n) => n.nodeName === 'link')
  if (linkNode?.nextSibling?.nodeType === Node.TEXT_NODE) {
    const fromSibling = linkNode.nextSibling.textContent?.trim() ?? ''
    if (fromSibling) return fromSibling
  }

  // Final fallback: use <guid> value (Google News RSS guid contains the full URL)
  const guid = item.querySelector('guid')?.textContent?.trim() ?? ''
  if (guid.startsWith('http')) return guid

  return ''
}

function parseRssXml(xml: string, sourceLabel: string): NewsItem[] {
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(xml, 'text/xml')
    // Detect XML parse errors (DOMParser returns a <parseerror> document on failure)
    if (doc.querySelector('parsererror')) return []
    const items = Array.from(doc.querySelectorAll('item'))
    return items.slice(0, MAX_NEWS_ITEMS).map((item) => ({
      title: item.querySelector('title')?.textContent?.trim() ?? '',
      description: (() => {
        const raw = item.querySelector('description')?.textContent ?? ''
        try {
          return new DOMParser().parseFromString(raw, 'text/html').body.textContent?.trim() ?? ''
        } catch {
          return raw.trim()
        }
      })(),
      link: getRssItemLink(item),
      pubDate: item.querySelector('pubDate')?.textContent?.trim() ?? '',
      source: item.querySelector('source')?.textContent?.trim() || sourceLabel,
      imageUrl: extractRssImage(item),
    }))
  } catch {
    return []
  }
}

async function tryFetchText(fetchUrl: string): Promise<string | null> {
  try {
    const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

async function fetchFeed(url: string, backendUrl?: string): Promise<{ items: NewsItem[]; error: string | null; debugInfo: string[] }> {
  const debugInfo: string[] = []
  debugInfo.push(`URL: ${url}`)

  const sourceLabel = (() => {
    try { return new URL(url).hostname.replace('www.', '') }
    catch { return url }
  })()

  // Google News HTML pages (e.g. /topics/...) – fetch the HTML via proxy, parse in the browser
  if (isGoogleNewsHtmlUrl(url)) {
    let html: string | null = null
    for (const proxy of CORS_PROXIES) {
      html = await tryFetchText(`${proxy}${encodeURIComponent(url)}`)
      if (html) {
        debugInfo.push(`✓ Proxy erfolgreich: ${proxy}`)
        break
      } else {
        debugInfo.push(`✗ Proxy fehlgeschlagen: ${proxy}`)
      }
    }
    if (!html && backendUrl) {
      html = await tryFetchText(`${backendUrl}/cors-proxy?url=${encodeURIComponent(url)}`)
      if (html) {
        debugInfo.push(`✓ Backend-Proxy erfolgreich`)
      } else {
        debugInfo.push(`✗ Backend-Proxy fehlgeschlagen`)
      }
    }
    if (html) {
      debugInfo.push(`HTML geladen (${html.length} Zeichen)`)
      const items = parseGoogleNewsHtml(html, sourceLabel)
      debugInfo.push(`Artikel gefunden: ${items.length}`)
      if (items.length === 0) {
        debugInfo.push(`Kein Artikel konnte geparst werden – HTML-Struktur möglicherweise geändert`)
      }
      if (items.length > 0) return { items, error: null, debugInfo }
    }
    return { items: [], error: `Feed konnte nicht geladen werden: ${sourceLabel}`, debugInfo }
  }

  // For all other URLs (including Google News /rss/...) use the RSS path
  let text: string | null = null
  for (const proxy of CORS_PROXIES) {
    text = await tryFetchText(`${proxy}${encodeURIComponent(url)}`)
    if (text) {
      debugInfo.push(`✓ Proxy erfolgreich: ${proxy}`)
      break
    } else {
      debugInfo.push(`✗ Proxy fehlgeschlagen: ${proxy}`)
    }
  }
  if (!text && backendUrl) {
    text = await tryFetchText(`${backendUrl}/cors-proxy?url=${encodeURIComponent(url)}`)
    if (text) {
      debugInfo.push(`✓ Backend-Proxy erfolgreich`)
    } else {
      debugInfo.push(`✗ Backend-Proxy fehlgeschlagen`)
    }
  }
  if (text) {
    debugInfo.push(`XML geladen (${text.length} Zeichen)`)
    const items = parseRssXml(text, sourceLabel)
    debugInfo.push(`Einträge gefunden: ${items.length}`)
    return { items, error: null, debugInfo }
  }
  return { items: [], error: `Feed konnte nicht geladen werden: ${sourceLabel}`, debugInfo }
}

/** Asynchronously fetch the og:image from an article URL via CORS proxy. */
async function fetchArticleImage(articleUrl: string, backendUrl?: string): Promise<string> {
  const extractOgImage = (html: string): string => {
    const m =
      html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/) ??
      html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:image"/)
    return m?.[1] ?? ''
  }

  for (const proxy of CORS_PROXIES) {
    const html = await tryFetchText(`${proxy}${encodeURIComponent(articleUrl)}`)
    if (html) {
      const img = extractOgImage(html)
      if (img) return img
    }
  }

  if (backendUrl) {
    const html = await tryFetchText(`${backendUrl}/cors-proxy?url=${encodeURIComponent(articleUrl)}`)
    if (html) {
      const img = extractOgImage(html)
      if (img) return img
    }
  }

  return ''
}

export default function NewsTile({ tile }: NewsTileProps) {
  const config = (tile.config ?? {}) as NewsConfig
  const feeds: string[] = config.feeds ?? []
  const interval = config.interval ?? 10
  const reloadIntervalMinutes: 1 | 5 | 60 = config.reloadIntervalMinutes ?? 5
  const showReloadBar = config.showReloadBar ?? false
  const showLastUpdate = config.showLastUpdate ?? false
  const maxAgeDays = config.maxAgeDays ?? 14
  const backendUrl = useStore((s) => s.backendUrl)
  const debugMode = useStore((s) => s.debugMode)
  const openModal = useUIStore((s) => s.openModal)
  const closeModal = useUIStore((s) => s.closeModal)

  const [items, setItems] = useState<NewsItem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [fetchErrors, setFetchErrors] = useState<string[]>([])
  const [fetchDebugInfo, setFetchDebugInfo] = useState<string[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [imageCache, setImageCache] = useState<Record<string, string>>({})
  const [lastFeedUpdate, setLastFeedUpdate] = useState<number | null>(null)

  // Settings form state
  const [feedsInput, setFeedsInput] = useState<string[]>(config.feeds ?? [])
  const [customUrlInput, setCustomUrlInput] = useState('')
  const [googleSearchInput, setGoogleSearchInput] = useState('')
  const [intervalInput, setIntervalInput] = useState(String(config.interval ?? 10))
  const [reloadIntervalInput, setReloadIntervalInput] = useState<1 | 5 | 60>(reloadIntervalMinutes)
  const [showReloadBarInput, setShowReloadBarInput] = useState(showReloadBar)
  const [showLastUpdateInput, setShowLastUpdateInput] = useState(showLastUpdate)
  const [maxAgeDaysInput, setMaxAgeDaysInput] = useState(String(config.maxAgeDays ?? 14))

  // Timers / refs
  const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const settingsOpenerRef = useRef<(() => void) | null>(null)
  const imageCacheRef = useRef<Record<string, string>>({})
  const imageFetchingRef = useRef<Set<string>>(new Set())

  const handleModalOpen = () => {
    setModalOpen(true)
    openModal()
  }

  const handleModalClose = () => {
    setModalOpen(false)
    closeModal()
  }

  // Preload og:image from an article URL (current + next item while current is displayed)
  const prefetchImage = useCallback(async (item: NewsItem) => {
    if (!item.link) return
    // Item already has image from RSS – no need to fetch
    if (item.imageUrl) return
    // Already cached or in flight
    if (imageCacheRef.current[item.link] !== undefined) return
    if (imageFetchingRef.current.has(item.link)) return

    imageFetchingRef.current.add(item.link)
    try {
      const img = await fetchArticleImage(item.link, backendUrl)
      imageCacheRef.current[item.link] = img
      setImageCache((prev) => ({ ...prev, [item.link]: img }))
    } finally {
      imageFetchingRef.current.delete(item.link)
    }
  }, [backendUrl])

  // Prefetch images for current and next item whenever the displayed item changes
  useEffect(() => {
    if (items.length === 0) return
    const cur = items[currentIndex]
    const next = items[(currentIndex + 1) % items.length]
    if (cur) void prefetchImage(cur)
    if (next && next !== cur) void prefetchImage(next)
  }, [currentIndex, items, prefetchImage])

  // Fetch all feeds
  const fetchAllFeeds = useCallback(async (feedUrls: string[]) => {
    if (!feedUrls.length) return
    setLoading(true)
    setFetchErrors([])
    setFetchDebugInfo([])
    setImageCache({})
    imageCacheRef.current = {}
    imageFetchingRef.current.clear()
    try {
      const results = await Promise.all(feedUrls.map((url) => fetchFeed(url, backendUrl)))
      const rawItems = results.flatMap((r) => r.items).filter((item) => item.title)
      const cutoffMs = maxAgeDays > 0 ? Date.now() - maxAgeDays * 24 * 60 * 60 * 1000 : null
      const allItems = cutoffMs === null
        ? rawItems
        : rawItems.filter((item) => {
            if (!item.pubDate) return true
            const ts = Date.parse(item.pubDate)
            return isNaN(ts) || ts >= cutoffMs
          })
      const errors = results.map((r) => r.error).filter((e): e is string => e !== null)
      const debugLines = results.flatMap((r) => r.debugInfo)
      setItems(allItems)
      setFetchErrors(errors)
      setFetchDebugInfo(debugLines)
      setCurrentIndex(0)
      setLastFeedUpdate(Date.now())
    } finally {
      setLoading(false)
    }
  }, [backendUrl, maxAgeDays])

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

  // Settings helpers
  const handleSettingsOpen = () => {
    setFeedsInput(config.feeds ?? [])
    setCustomUrlInput('')
    setGoogleSearchInput('')
    setIntervalInput(String(config.interval ?? 10))
    setReloadIntervalInput(reloadIntervalMinutes)
    setShowReloadBarInput(showReloadBar)
    setShowLastUpdateInput(showLastUpdate)
    setMaxAgeDaysInput(String(config.maxAgeDays ?? 14))
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

  const addGoogleSearch = () => {
    const term = googleSearchInput.trim()
    if (!term) return
    const url = buildGoogleNewsUrl(term)
    if (!feedsInput.includes(url)) {
      setFeedsInput((prev) => [...prev, url])
    }
    setGoogleSearchInput('')
  }

  const removeUrl = (url: string) => {
    setFeedsInput((prev) => prev.filter((f) => f !== url))
  }

  const getExtraConfig = (): Record<string, unknown> => ({
    feeds: feedsInput,
    interval: Math.max(5, Number(intervalInput) || 10),
    reloadIntervalMinutes: reloadIntervalInput,
    showReloadBar: showReloadBarInput,
    showLastUpdate: showLastUpdateInput,
    maxAgeDays: Math.max(0, isNaN(Number(maxAgeDaysInput)) ? 14 : Number(maxAgeDaysInput)),
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
          label="RSS-URL oder Google News/Topics-URL"
          placeholder="https://example.com/feed.rss oder https://news.google.com/topics/..."
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

      {/* Google News keyword search */}
      <Divider sx={{ mb: 2 }}>Google News Suche</Divider>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Suchbegriff eingeben – lädt die Google News Seite für diesen Begriff und parst die Einträge.
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <TextField
          fullWidth
          size="small"
          label="Suchbegriff"
          placeholder="z.B. Dinklage"
          value={googleSearchInput}
          onChange={(e) => setGoogleSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGoogleSearch() } }}
        />
        <Button
          variant="outlined"
          onClick={addGoogleSearch}
          disabled={!googleSearchInput.trim()}
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
                    <Tooltip title="URL kopieren">
                      <IconButton size="small" onClick={() => navigator.clipboard.writeText(url)}>
                        <ContentCopyIcon fontSize="inherit" />
                      </IconButton>
                    </Tooltip>
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
      <Divider sx={{ mb: 2 }}>Filteroptionen</Divider>
      <TextField
        fullWidth
        size="small"
        label="Max. Alter der News (Tage, 0 = kein Limit)"
        type="number"
        inputProps={{ min: 0 }}
        value={maxAgeDaysInput}
        onChange={(e) => setMaxAgeDaysInput(e.target.value)}
        helperText="News ohne Datum werden immer angezeigt. Standard: 14 Tage."
        sx={{ mb: 2 }}
      />
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

  const currentItem = items[currentIndex] ?? null
  const currentImageUrl = currentItem
    ? (currentItem.imageUrl || imageCache[currentItem.link] || undefined)
    : undefined

  // Use a ref so the reload callback always sees the latest feeds without causing extra re-renders
  const feedsRef = useRef(feeds)
  useEffect(() => { feedsRef.current = feeds })
  const handleFeedsReload = useCallback(() => { fetchAllFeeds(feedsRef.current) }, [fetchAllFeeds])

  return (
    <>
      <BaseTile
        tile={tile}
        settingsChildren={settingsContent}
        getExtraConfig={getExtraConfig}
        onSettingsOpen={handleSettingsOpen}
        onTileClick={items.length > 0 ? handleModalOpen : undefined}
        overrideBackgroundImage={currentImageUrl}
        settingsOpenerRef={settingsOpenerRef}
        bottomBar={
          <ReloadIntervalBar
            show={showReloadBar}
            lastUpdate={lastFeedUpdate}
            intervalMs={reloadIntervalMinutes * 60 * 1000}
            showLastUpdate={showLastUpdate}
            label="Feeds"
            onReload={handleFeedsReload}
          />
        }
      >
        {/* No feeds configured */}
        {feeds.length === 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 1, flexDirection: 'column' }}>
            <Tooltip title="Feeds konfigurieren">
              <IconButton onClick={() => settingsOpenerRef.current?.()} sx={{ p: 1 }}>
                <SettingsIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
              </IconButton>
            </Tooltip>
            <Typography variant="body2" color="text.secondary" textAlign="center">
              Keine Feeds konfiguriert. Klicken zum Konfigurieren.
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
        {!loading && feeds.length > 0 && items.length === 0 && fetchErrors.length === 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Typography variant="body2" color="text.secondary">
              Keine Nachrichten gefunden.
            </Typography>
          </Box>
        )}

        {/* Feed errors */}
        {!loading && fetchErrors.length > 0 && items.length === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, p: 1, height: '100%', overflowY: 'auto' }}>
            {fetchErrors.map((err, idx) => (
              <Alert key={idx} severity="error" sx={{ fontSize: '0.7rem', py: 0 }}>
                {err}
              </Alert>
            ))}
            {debugMode && fetchDebugInfo.length > 0 && (
              <Box
                component="pre"
                sx={{
                  fontSize: '0.65rem',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  bgcolor: 'action.hover',
                  p: 0.5,
                  borderRadius: 1,
                  mt: 0.5,
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                {fetchDebugInfo.join('\n')}
              </Box>
            )}
          </Box>
        )}

        {currentItem && (
          <>
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                {currentItem.source && (
                  <Chip
                    label={currentItem.source}
                    size="small"
                    sx={{ height: 16, fontSize: '0.6rem', backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}
                  />
                )}
                <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {items.length > 1 && (
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                      {currentIndex + 1}/{items.length}
                    </Typography>
                  )}
                  {currentItem.link && (
                    <Tooltip title="Artikel öffnen">
                      <IconButton
                        size="small"
                        component="a"
                        href={currentItem.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        sx={{ color: 'rgba(255,255,255,0.7)', p: 0.25 }}
                      >
                        <OpenInNewIcon sx={{ fontSize: '0.9rem' }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </Box>
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
              {currentItem.pubDate && (
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', display: 'block', mt: 0.25 }}>
                  {formatPubDate(currentItem.pubDate)}
                </Typography>
              )}
            </Box>

            {/* Debug: current news item as JSON */}
            {debugMode && (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary" fontWeight="bold">
                  Debug – Aktueller Eintrag:
                </Typography>
                <Box
                  component="pre"
                  role="region"
                  aria-label="Debug JSON output"
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
                  {JSON.stringify(currentItem, null, 2)}
                </Box>
                {fetchDebugInfo.length > 0 && (
                  <>
                    <Typography variant="caption" color="text.secondary" fontWeight="bold" sx={{ mt: 0.5, display: 'block' }}>
                      Debug – Feed-Ladeprotokoll:
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
                        maxHeight: 150,
                        overflow: 'auto',
                      }}
                    >
                      {fetchDebugInfo.join('\n')}
                    </Box>
                  </>
                )}
              </Box>
            )}
          </>
        )}
      </BaseTile>

      {/* ── News detail modal ─────────────────────────────────────────────── */}
      <LargeModal
        open={modalOpen}
        onClose={handleModalClose}
        title={(config.name as string) || 'News'}
      >
        <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
          {items.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Keine Nachrichten geladen.
            </Typography>
          )}
          {items.map((item, idx) => (
            <Box key={idx} sx={{ mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
                <Box sx={{ flex: 1 }}>
                  {item.source && (
                    <Chip
                      label={item.source}
                      size="small"
                      sx={{ mb: 0.5, height: 18, fontSize: '0.6rem' }}
                    />
                  )}
                  <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.4 }}>
                    {item.title}
                  </Typography>
                  {item.pubDate && (
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.25 }}>
                      {formatPubDate(item.pubDate)}
                    </Typography>
                  )}
                  {item.description && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                      {item.description}
                    </Typography>
                  )}
                </Box>
                {item.link && (
                  <Tooltip title="Artikel öffnen">
                    <IconButton
                      size="small"
                      component="a"
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <OpenInNewIcon fontSize="inherit" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              <Divider />
            </Box>
          ))}
        </Box>
      </LargeModal>
    </>
  )
}
