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
    }),
    {
      name: 'dashboard-store',
    },
  ),
)
