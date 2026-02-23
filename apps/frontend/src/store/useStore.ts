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
  gridColumns: number
  setTheme: (t: 'light' | 'dark' | 'auto') => void
  setTiles: (tiles: TileInstance[]) => void
  toggleEditMode: () => void
  setGridColumns: (n: number) => void
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
      gridColumns: 32,
      setTheme: (theme) => set({ theme }),
      setTiles: (tiles) => set({ tiles }),
      toggleEditMode: () => set((s) => ({ editMode: !s.editMode })),
      setGridColumns: (gridColumns) => set({ gridColumns }),
      addTile: (type) =>
        set((s) => {
          const newH = ['server', 'rocketmeals', 'weather', 'news'].includes(type) ? 4 : 2
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
