import { useEffect, useRef, useState } from 'react'
import { Box, LinearProgress, Typography } from '@mui/material'

interface ReloadIntervalBarProps {
  /** Whether to render the bar at all. */
  show: boolean
  /** Unix timestamp (ms) of the last successful data load, or null if never loaded. */
  lastUpdate: number | null
  /** Reload interval in milliseconds. */
  intervalMs: number
  /** Whether to show "Zuletzt: HH:MM:SS" text. */
  showLastUpdate?: boolean
  /** Short label shown left of the countdown. */
  label?: string
  /** Called when the interval elapses. Should be a stable reference (e.g. wrapped in useCallback). */
  onReload?: () => void
  /** Optional custom bar colour (CSS value). */
  color?: string
}

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function ReloadIntervalBar({
  show,
  lastUpdate,
  intervalMs,
  showLastUpdate,
  label,
  onReload,
  color,
}: ReloadIntervalBarProps) {
  const [now, setNow] = useState(() => Date.now())
  const onReloadRef = useRef(onReload)
  useEffect(() => { onReloadRef.current = onReload }, [onReload])

  // Tick every second when visible
  useEffect(() => {
    if (!show) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [show])

  // Schedule reload when lastUpdate + intervalMs is reached
  useEffect(() => {
    if (!show || !lastUpdate || !onReloadRef.current) return
    const elapsed = Date.now() - lastUpdate
    const delay = Math.max(0, intervalMs - elapsed)
    const timer = setTimeout(() => onReloadRef.current?.(), delay)
    return () => clearTimeout(timer)
  }, [show, lastUpdate, intervalMs])

  if (!show) return null

  const elapsed = lastUpdate ? now - lastUpdate : intervalMs
  const remaining = lastUpdate ? Math.max(0, lastUpdate + intervalMs - now) : 0
  const progress = Math.min(100, (elapsed / intervalMs) * 100)

  return (
    <Box sx={{ px: 0.5, pt: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', lineHeight: 1.4 }}>
          {label ? `${label}: ` : ''}{formatMs(remaining)}
        </Typography>
        {showLastUpdate && lastUpdate ? (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', lineHeight: 1.4 }}>
            Zuletzt: {formatTime(lastUpdate)}
          </Typography>
        ) : null}
      </Box>
      <LinearProgress
        variant="determinate"
        value={progress}
        sx={{
          height: 3,
          borderRadius: 1,
          mt: 0.25,
          backgroundColor: 'rgba(128,128,128,0.2)',
          '& .MuiLinearProgress-bar': color ? { backgroundColor: color } : undefined,
        }}
      />
    </Box>
  )
}
