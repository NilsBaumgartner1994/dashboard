import { Chip, ListItem, ListItemText } from '@mui/material'

export interface CalendarEventData {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  location?: string
  description?: string
  calendarId?: string
}

/** Returns true if white text has sufficient contrast on the given hex background color. */
export function shouldUseWhiteText(hexColor: string): boolean {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16) / 255
  const g = parseInt(hex.slice(2, 4), 16) / 255
  const b = parseInt(hex.slice(4, 6), 16) / 255
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const luminance = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  return luminance < 0.179
}

/** Returns a formatted time string for a calendar event (HH:MM or "Ganztag"). */
export function formatEventTime(ev: CalendarEventData): string {
  if (ev.start.dateTime) {
    const d = new Date(ev.start.dateTime)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return 'Ganztag'
}

/**
 * Returns true if the event is a calendar-week all-day marker
 * (e.g. "Ganztag Kalenderwoche 12") that should be filtered out.
 */
export function isCalendarWeekMarker(ev: CalendarEventData): boolean {
  if (ev.start.dateTime) return false // not an all-day event
  const s = (ev.summary ?? '').toLowerCase()
  return /kalendarwoche|kalenderwoche|kw\s*\d+/.test(s)
}

interface CalendarEventItemProps {
  ev: CalendarEventData
  /** Hex background color of the calendar this event belongs to */
  color?: string
  /** Whether the item should appear clickable */
  onClick?: () => void
  /** Extra sx on the ListItem wrapper */
  sx?: object
  /** Whether to wrap the summary text (default: true = noWrap) */
  noWrap?: boolean
}

export default function CalendarEventItem({
  ev,
  color,
  onClick,
  sx,
  noWrap = true,
}: CalendarEventItemProps) {
  return (
    <ListItem
      disableGutters
      disablePadding
      onClick={onClick}
      sx={{
        mb: 0.5,
        alignItems: 'flex-start',
        cursor: onClick ? 'pointer' : undefined,
        borderRadius: 1,
        '&:hover': onClick ? { backgroundColor: 'action.hover' } : undefined,
        px: onClick ? 0.5 : 0,
        ...sx,
      }}
    >
      <Chip
        size="small"
        label={formatEventTime(ev)}
        sx={{
          mr: 1,
          mt: 0.25,
          minWidth: 52,
          flexShrink: 0,
          fontSize: '0.65rem',
          backgroundColor: color ?? undefined,
          color: color ? (shouldUseWhiteText(color) ? '#fff' : '#000') : undefined,
        }}
      />
      <ListItemText
        primary={ev.summary}
        primaryTypographyProps={{ variant: 'body2', noWrap }}
      />
    </ListItem>
  )
}
