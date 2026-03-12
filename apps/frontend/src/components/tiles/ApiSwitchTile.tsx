import { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Divider, FormControlLabel, Switch, TextField, Typography } from '@mui/material'
import ServerTile from './ServerTile'
import type { ServerConfig } from './ServerTile'
import type { TileInstance } from '../../store/useStore'
import { useStore } from '../../store/useStore'

interface ApiSwitchConfig extends ServerConfig {
  requestUrl?: string
  valuePath?: string
  threshold?: number
  imageWhenAbove?: string
  imageWhenBelow?: string
  textWhenNull?: string
  useBackendProxy?: boolean
  datePath?: string
  maxAgeMinutes?: number
  imageWhenOutdated?: string
}

function tokenizePath(path: string): string[] {
  const normalized = path.replace(/\?\./g, '.').trim()
  if (!normalized) return []
  return normalized
    .split('.')
    .flatMap((part) => {
      const tokens: string[] = []
      const key = part.split('[')[0]
      if (key) tokens.push(key)
      for (const match of part.matchAll(/\[(\d+)\]/g)) {
        tokens.push(match[1])
      }
      return tokens
    })
}

function readPathValue(payload: unknown, path: string): unknown {
  if (!path.trim()) return payload
  let current: unknown = payload
  for (const token of tokenizePath(path)) {
    if (current == null) return null
    if (Array.isArray(current)) {
      const idx = Number(token)
      current = Number.isInteger(idx) ? current[idx] : null
      continue
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[token]
      continue
    }
    return null
  }
  return current
}

const MS_PER_MINUTE = 60000

export default function ApiSwitchTile({ tile }: { tile: TileInstance }) {
  const config = (tile.config ?? {}) as ApiSwitchConfig
  const backendUrl = useStore((s) => s.backendUrl)

  const [requestUrlInput, setRequestUrlInput] = useState(config.requestUrl ?? '')
  const [valuePathInput, setValuePathInput] = useState(config.valuePath ?? 'data?.[0]?.moisture_percentage')
  const [thresholdInput, setThresholdInput] = useState(String(config.threshold ?? 90))
  const [imageWhenAboveInput, setImageWhenAboveInput] = useState(config.imageWhenAbove ?? '')
  const [imageWhenBelowInput, setImageWhenBelowInput] = useState(config.imageWhenBelow ?? '')
  const [textWhenNullInput, setTextWhenNullInput] = useState(config.textWhenNull ?? 'Kein Messwert verfügbar')
  const [useBackendProxyInput, setUseBackendProxyInput] = useState(config.useBackendProxy ?? true)
  const [datePathInput, setDatePathInput] = useState(config.datePath ?? '')
  const [maxAgeMinutesInput, setMaxAgeMinutesInput] = useState(config.maxAgeMinutes?.toString() ?? '')
  const [imageWhenOutdatedInput, setImageWhenOutdatedInput] = useState(config.imageWhenOutdated ?? '')

  const [resolvedValue, setResolvedValue] = useState<unknown>(null)
  const [resolvedDate, setResolvedDate] = useState<unknown>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const requestUrl = config.requestUrl?.trim() ?? ''
  const valuePath = config.valuePath?.trim() || 'data?.[0]?.moisture_percentage'
  const threshold = Number(config.threshold ?? 90)
  const imageWhenAbove = config.imageWhenAbove?.trim() ?? ''
  const imageWhenBelow = config.imageWhenBelow?.trim() ?? ''
  const textWhenNull = config.textWhenNull?.trim() || 'Kein Messwert verfügbar'
  const useBackendProxy = config.useBackendProxy ?? true
  const checkInterval = config.checkInterval ?? 60
  const datePath = config.datePath?.trim() ?? ''
  const maxAgeMinutes = config.maxAgeMinutes != null ? Number(config.maxAgeMinutes) : null
  const imageWhenOutdated = config.imageWhenOutdated?.trim() ?? ''

  const fetchValue = useCallback(async () => {
    if (!requestUrl) {
      setResolvedValue(null)
      setResolvedDate(null)
      setFetchError('Keine Request-URL konfiguriert.')
      return
    }

    const targetUrl = useBackendProxy && backendUrl
      ? `${backendUrl}/cors-proxy?url=${encodeURIComponent(requestUrl)}`
      : requestUrl

    try {
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(10000) })
      if (!res.ok) {
        const responseBody = await res.text().catch(() => '')
        const detailedHttpError = `HTTP ${res.status}${responseBody ? ` - ${responseBody}` : ''}`
        setFetchError(detailedHttpError)
        console.error('[ApiSwitchTile] Fehler beim Abruf der API:', {
          requestUrl,
          targetUrl,
          status: res.status,
          body: responseBody,
        })
        return
      }
      const json = (await res.json()) as unknown
      setResolvedValue(readPathValue(json, valuePath))
      setResolvedDate(datePath ? readPathValue(json, datePath) : null)
      setFetchError(null)
    } catch (err) {
      setFetchError(String(err))
      console.error('[ApiSwitchTile] Fehler beim Abruf der API:', err)
    }
  }, [backendUrl, requestUrl, useBackendProxy, valuePath, datePath])

  useEffect(() => {
    fetchValue()
    const ms = Math.max(10, checkInterval) * 1000
    timerRef.current = setInterval(fetchValue, ms)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [checkInterval, fetchValue])

  const handleSettingsOpen = () => {
    setRequestUrlInput(config.requestUrl ?? '')
    setValuePathInput(config.valuePath ?? 'data?.[0]?.moisture_percentage')
    setThresholdInput(String(config.threshold ?? 90))
    setImageWhenAboveInput(config.imageWhenAbove ?? '')
    setImageWhenBelowInput(config.imageWhenBelow ?? '')
    setTextWhenNullInput(config.textWhenNull ?? 'Kein Messwert verfügbar')
    setUseBackendProxyInput(config.useBackendProxy ?? true)
    setDatePathInput(config.datePath ?? '')
    setMaxAgeMinutesInput(config.maxAgeMinutes?.toString() ?? '')
    setImageWhenOutdatedInput(config.imageWhenOutdated ?? '')
  }

  const getExtraConfig = (): Record<string, unknown> => ({
    requestUrl: requestUrlInput,
    valuePath: valuePathInput,
    threshold: Number(thresholdInput) || 90,
    imageWhenAbove: imageWhenAboveInput,
    imageWhenBelow: imageWhenBelowInput,
    textWhenNull: textWhenNullInput,
    useBackendProxy: useBackendProxyInput,
    datePath: datePathInput,
    maxAgeMinutes: maxAgeMinutesInput !== '' ? Number(maxAgeMinutesInput) : undefined,
    imageWhenOutdated: imageWhenOutdatedInput,
  })

  const numericValue = typeof resolvedValue === 'number' ? resolvedValue : Number(resolvedValue)
  const hasNumericValue = Number.isFinite(numericValue)

  // Date handling
  const dateString = resolvedDate != null && resolvedDate !== '' ? String(resolvedDate) : null
  const parsedDate = dateString ? new Date(dateString) : null
  const validDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null
  const formattedDate = validDate
    ? validDate.toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null
  const isOutdated = validDate != null && maxAgeMinutes != null && Number.isFinite(maxAgeMinutes)
    ? (Date.now() - validDate.getTime()) / MS_PER_MINUTE > maxAgeMinutes
    : false

  let imageToShow = ''
  let textToShow = ''
  if (resolvedValue == null || resolvedValue === '') {
    textToShow = textWhenNull
  } else if (hasNumericValue) {
    switch (true) {
      case numericValue >= threshold:
        imageToShow = imageWhenAbove
        textToShow = `${numericValue}`
        break
      case numericValue < threshold:
        imageToShow = imageWhenBelow
        textToShow = `${numericValue}`
        break
      default:
        textToShow = `${numericValue}`
    }
  } else {
    textToShow = String(resolvedValue)
  }

  // Outdated image overrides the current image if set and data is outdated
  if (isOutdated && imageWhenOutdated) {
    imageToShow = imageWhenOutdated
  }

  return (
    <ServerTile
      tile={tile}
      statusAtBottom
      onExtraSettingsOpen={handleSettingsOpen}
      getChildExtraConfig={getExtraConfig}
      extraSettingsChildren={(
        <>
          <Divider sx={{ mb: 2 }}>API Auswertung</Divider>
          <TextField
            fullWidth
            label="Request URL"
            value={requestUrlInput}
            onChange={(e) => setRequestUrlInput(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Value Path"
            helperText="Beispiel: data?.[0]?.moisture_percentage"
            value={valuePathInput}
            onChange={(e) => setValuePathInput(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            type="number"
            label="Threshold (>=)"
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Bild URL wenn Wert >= Threshold"
            value={imageWhenAboveInput}
            onChange={(e) => setImageWhenAboveInput(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Bild URL wenn Wert < Threshold"
            value={imageWhenBelowInput}
            onChange={(e) => setImageWhenBelowInput(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Text wenn Wert null"
            value={textWhenNullInput}
            onChange={(e) => setTextWhenNullInput(e.target.value)}
            sx={{ mb: 2 }}
          />
          <Divider sx={{ mb: 2 }}>Datum & Veraltet-Prüfung</Divider>
          <TextField
            fullWidth
            label="Datum-Feld Pfad"
            helperText="Beispiel: data?.[0]?.date_created"
            value={datePathInput}
            onChange={(e) => setDatePathInput(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            type="number"
            label="Maximales Alter (Minuten)"
            helperText="Warnung wenn Datum älter als diese Minuten"
            value={maxAgeMinutesInput}
            onChange={(e) => setMaxAgeMinutesInput(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            fullWidth
            label="Bild URL wenn Daten veraltet"
            helperText="Überschreibt das aktuelle Bild wenn Daten veraltet sind"
            value={imageWhenOutdatedInput}
            onChange={(e) => setImageWhenOutdatedInput(e.target.value)}
            sx={{ mb: 2 }}
          />
          <FormControlLabel
            control={(
              <Switch
                checked={useBackendProxyInput}
                onChange={(e) => setUseBackendProxyInput(e.target.checked)}
              />
            )}
            label="Über Backend-CORS-Proxy abrufen (empfohlen für Self-Signed HTTPS)"
          />
        </>
      )}
      contentChildren={(
        <Box sx={{ mt: 1, mb: 1 }}>
          {fetchError ? (
            <Typography variant="caption" color="error" sx={{ display: 'block', mb: 0.5 }}>
              Fehler: {fetchError}
            </Typography>
          ) : null}
          {imageToShow ? (
            <Box
              component="img"
              src={imageToShow}
              alt="Sensor Zustand"
              sx={{ width: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 1, mb: 0.5 }}
            />
          ) : null}
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            {textToShow || '—'}
          </Typography>
          {formattedDate ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {formattedDate}
            </Typography>
          ) : null}
          {isOutdated ? (
            <Typography variant="caption" color="warning.main" sx={{ display: 'block', fontWeight: 700 }}>
              ⚠ Daten veraltet
            </Typography>
          ) : null}
          {hasNumericValue ? (
            <Typography variant="caption" color="text.secondary">
              Schwellwert: {threshold}
            </Typography>
          ) : null}
        </Box>
      )}
    />
  )
}
