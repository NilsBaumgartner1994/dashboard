import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  Chip,
  Divider,
  Tooltip,
  IconButton,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import AccessTimeIcon from '@mui/icons-material/AccessTime'
import PlaceIcon from '@mui/icons-material/Place'
import NotesIcon from '@mui/icons-material/Notes'
import type { CalendarEventData } from './CalendarEventItem'
import { shouldUseWhiteText } from './CalendarEventItem'

interface CalendarEventDetailModalProps {
  open: boolean
  onClose: () => void
  event: CalendarEventData | null
  /** Hex background color of the calendar this event belongs to */
  color?: string
}

function formatDateTime(dateTime?: string, date?: string): string {
  if (dateTime) {
    const d = new Date(dateTime)
    return d.toLocaleString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
  if (date) {
    const d = new Date(date + 'T00:00:00')
    return d.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }
  return 'Unbekannt'
}

export default function CalendarEventDetailModal({
  open,
  onClose,
  event,
  color,
}: CalendarEventDetailModalProps) {
  if (!event) return null

  const isAllDay = !event.start.dateTime
  const startLabel = formatDateTime(event.start.dateTime, event.start.date)
  const endLabel = event.end
    ? formatDateTime(event.end.dateTime, event.end.date)
    : null

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 3 } }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          pr: 1,
          backgroundColor: color ?? undefined,
          color: color ? (shouldUseWhiteText(color) ? '#fff' : '#000') : undefined,
        }}
      >
        <Box sx={{ flex: 1, pr: 1 }}>
          <Typography variant="h6" component="div" sx={{ lineHeight: 1.3 }}>
            {event.summary}
          </Typography>
          {isAllDay && (
            <Chip
              label="Ganztag"
              size="small"
              sx={{
                mt: 0.5,
                fontSize: '0.65rem',
                backgroundColor: 'rgba(255,255,255,0.25)',
              }}
            />
          )}
        </Box>
        <Tooltip title="Schließen">
          <IconButton
            size="small"
            onClick={onClose}
            sx={{ color: color ? (shouldUseWhiteText(color) ? '#fff' : '#000') : undefined }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {/* Time */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
          <AccessTimeIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
          <Box>
            <Typography variant="body2">{startLabel}</Typography>
            {endLabel && endLabel !== startLabel && (
              <Typography variant="body2" color="text.secondary">
                bis {endLabel}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Location */}
        {event.location && (
          <>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 1.5 }}>
              <PlaceIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {event.location}
              </Typography>
            </Box>
          </>
        )}

        {/* Description */}
        {event.description && (
          <>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <NotesIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {event.description}
              </Typography>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
