import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
  editMode: boolean
  setTheme: (t: 'light' | 'dark' | 'auto') => void
  setTiles: (tiles: TileInstance[]) => void
  toggleEditMode: () => void
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
      editMode: false,
      setTheme: (theme) => set({ theme }),
      setTiles: (tiles) => set({ tiles }),
      toggleEditMode: () => set((s) => ({ editMode: !s.editMode })),
      addTile: (type) =>
        set((s) => ({
          tiles: [
            ...s.tiles,
            {
              id: `tile-${crypto.randomUUID()}`,
              type,
              x: 0,
              y: 0,
              w: 4,
              h: 2,
              hidden: false,
            },
          ],
        })),
      removeTile: (id) => set((s) => ({ tiles: s.tiles.filter((t) => t.id !== id) })),
      updateTile: (id, patch) =>
        set((s) => ({
          tiles: s.tiles.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      duplicateTile: (id) =>
        set((s) => {
          const src = s.tiles.find((t) => t.id === id)
          if (!src) return {}
          const copy: TileInstance = {
            ...src,
            id: `tile-${crypto.randomUUID()}`,
            x: Math.min(src.x + 1, 28),
            y: Math.min(src.y + 1, 16),
          }
          return { tiles: [...s.tiles, copy] }
        }),
    }),
    {
      name: 'dashboard-store',
    },
  ),
)
