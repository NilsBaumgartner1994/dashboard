import { create } from 'zustand'
import type { CalendarEventData } from '../components/tiles/CalendarEventItem'

/**
 * Non-persisted store for calendar events fetched by GoogleCalendarTile.
 * Other tiles (e.g. RouteTile) can read from this store to avoid duplicate
 * API calls and to benefit from the full set of calendars already loaded.
 */
interface CalendarEventsState {
  events: CalendarEventData[]
  setEvents: (events: CalendarEventData[]) => void
}

export const useCalendarEventsStore = create<CalendarEventsState>()((set) => ({
  events: [],
  setEvents: (events) => set({ events }),
}))
