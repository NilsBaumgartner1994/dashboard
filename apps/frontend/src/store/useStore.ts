import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Note {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface TileInstance {
  id: string
  type: string
  x: number
  y: number
  w: number
  h: number
  hidden: boolean
  config?: Record<string, unknown>
}

interface AppState {
  theme: 'light' | 'dark' | 'auto'
  tiles: TileInstance[]
  notes: Note[]
  editMode: boolean
  gridColumns: number
  defaultLat?: number
  defaultLon?: number
  defaultLocationName?: string
  debugMode: boolean
  backendUrl: string
  setTheme: (t: 'light' | 'dark' | 'auto') => void
  setTiles: (tiles: TileInstance[]) => void
  setNotes: (notes: Note[]) => void
  addNote: (title: string, content: string) => void
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'content'>>) => void
  removeNote: (id: string) => void
  toggleEditMode: () => void
  setGridColumns: (n: number) => void
  setDefaultLocation: (lat: number, lon: number, name: string) => void
  setDebugMode: (v: boolean) => void
  setBackendUrl: (url: string) => void
  addTile: (type: string) => void
  removeTile: (id: string) => void
  updateTile: (id: string, patch: Partial<TileInstance>) => void
  duplicateTile: (id: string) => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'auto',
      tiles: [
        { id: 'tile-1', type: 'sample', x: 0, y: 0, w: 4, h: 2, hidden: false },
        { id: 'tile-2', type: 'sample', x: 4, y: 0, w: 4, h: 2, hidden: false },
      ],
      notes: [],
      editMode: false,
      gridColumns: 32,
      defaultLat: undefined,
      defaultLon: undefined,
      defaultLocationName: undefined,
      debugMode: false,
      backendUrl: 'https://test.rocket-meals.de/my-dashboard/api',
      setTheme: (theme) => set({ theme }),
      setTiles: (tiles) => set({ tiles }),
      setNotes: (notes) => set({ notes }),
      addNote: (title, content) =>
        set((s) => ({
          notes: [
            ...s.notes,
            {
              id: `note-${crypto.randomUUID()}`,
              title: title || 'Neue Notiz',
              content,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        })),
      updateNote: (id, patch) =>
        set((s) => ({
          notes: s.notes.map((n) =>
            n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n,
          ),
        })),
      removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
      toggleEditMode: () => set((s) => ({ editMode: !s.editMode })),
      setGridColumns: (gridColumns) => set({ gridColumns }),
      setDefaultLocation: (defaultLat, defaultLon, defaultLocationName) =>
        set({ defaultLat, defaultLon, defaultLocationName }),
      setDebugMode: (debugMode) => set({ debugMode }),
      setBackendUrl: (backendUrl) => set({ backendUrl }),
      addTile: (type) =>
        set((s) => {
          const newH = ['server', 'rocketmeals', 'weather', 'news', 'route', 'tasks', 'notes'].includes(type) ? 4 : 2
          const bottomY = s.tiles.reduce((max, t) => Math.max(max, t.y + t.h), 0)
          return {
            tiles: [
              ...s.tiles,
              {
                id: `tile-${crypto.randomUUID()}`,
                type,
                x: 0,
                y: bottomY,
                w: 4,
                h: newH,
                hidden: false,
              },
            ],
          }
        }),
      removeTile: (id) => set((s) => ({ tiles: s.tiles.filter((t) => t.id !== id) })),
      updateTile: (id, patch) =>
        set((s) => ({
          tiles: s.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      duplicateTile: (id) =>
        set((s) => {
          const src = s.tiles.find((t) => t.id === id)
          if (!src) return {}
          const bottomY = s.tiles.reduce((max, t) => Math.max(max, t.y + t.h), 0)
          const copy: TileInstance = {
            ...src,
            id: `tile-${crypto.randomUUID()}`,
            x: 0,
            y: bottomY,
          }
          return { tiles: [...s.tiles, copy] }
        }),
    }),
    {
      name: 'dashboard-store',
    },
  ),
)
