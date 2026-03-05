import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GoogleNotesState {
  accessToken: string | null
  tokenExpiry: number | null
  refreshToken: string | null
  /** The Google Drive file ID for the notes JSON file (null = not yet created/discovered). */
  driveFileId: string | null
  setToken: (accessToken: string, expiresIn: number) => void
  setRefreshToken: (refreshToken: string) => void
  clearToken: () => void
  setDriveFileId: (id: string | null) => void
}

export const useGoogleNotesStore = create<GoogleNotesState>()(
  persist(
    (set) => ({
      accessToken: null,
      tokenExpiry: null,
      refreshToken: null,
      driveFileId: null,
      setToken: (accessToken, expiresIn) =>
        set({ accessToken, tokenExpiry: Date.now() + expiresIn * 1000 }),
      setRefreshToken: (refreshToken) => set({ refreshToken }),
      clearToken: () => set({ accessToken: null, tokenExpiry: null, refreshToken: null }),
      setDriveFileId: (driveFileId) => set({ driveFileId }),
    }),
    {
      name: 'google-notes-store',
    },
  ),
)

/** Returns true when the stored access token is present and not yet expired. */
export function isNotesTokenValid(state: Pick<GoogleNotesState, 'accessToken' | 'tokenExpiry'>): boolean {
  return !!(state.accessToken && state.tokenExpiry && Date.now() < state.tokenExpiry)
}
