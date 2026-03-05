import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GoogleNotesState {
  /** The Google Drive file ID for the notes JSON file (null = not yet created/discovered). */
  driveFileId: string | null
  setDriveFileId: (id: string | null) => void
}

export const useGoogleNotesStore = create<GoogleNotesState>()(
  persist(
    (set) => ({
      driveFileId: null,
      setDriveFileId: (driveFileId) => set({ driveFileId }),
    }),
    {
      name: 'google-notes-store',
    },
  ),
)
