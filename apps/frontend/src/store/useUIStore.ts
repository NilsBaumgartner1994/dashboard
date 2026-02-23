import { create } from 'zustand'

interface UIState {
  openModalCount: number
  openModal: () => void
  closeModal: () => void
}

export const useUIStore = create<UIState>()((set) => ({
  openModalCount: 0,
  openModal: () => set((s) => ({ openModalCount: s.openModalCount + 1 })),
  closeModal: () => set((s) => ({ openModalCount: Math.max(0, s.openModalCount - 1) })),
}))
