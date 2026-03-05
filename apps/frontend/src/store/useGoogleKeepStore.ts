import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GoogleKeepState {
  /** Maps local note IDs to Google Keep resource names (e.g. "notes/ABCDEF"). */
  noteIdToKeepName: Record<string, string>
  setKeepName: (localId: string, keepName: string) => void
  removeKeepName: (localId: string) => void
  clearAll: () => void
}

export const useGoogleKeepStore = create<GoogleKeepState>()(
  persist(
    (set) => ({
      noteIdToKeepName: {},
      setKeepName: (localId, keepName) =>
        set((s) => ({ noteIdToKeepName: { ...s.noteIdToKeepName, [localId]: keepName } })),
      removeKeepName: (localId) =>
        set((s) => {
          const { [localId]: _, ...rest } = s.noteIdToKeepName
          return { noteIdToKeepName: rest }
        }),
      clearAll: () => set({ noteIdToKeepName: {} }),
    }),
    { name: 'google-keep-store' },
  ),
)
