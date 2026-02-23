import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GoogleTasksState {
  accessToken: string | null
  tokenExpiry: number | null
  setToken: (accessToken: string, expiresIn: number) => void
  clearToken: () => void
}

export const useGoogleTasksStore = create<GoogleTasksState>()(
  persist(
    (set) => ({
      accessToken: null,
      tokenExpiry: null,
      setToken: (accessToken, expiresIn) =>
        set({ accessToken, tokenExpiry: Date.now() + expiresIn * 1000 }),
      clearToken: () => set({ accessToken: null, tokenExpiry: null }),
    }),
    {
      name: 'google-tasks-store',
    },
  ),
)

/** Returns true when the stored access token is present and not yet expired. */
export function isTasksTokenValid(state: Pick<GoogleTasksState, 'accessToken' | 'tokenExpiry'>): boolean {
  return !!(state.accessToken && state.tokenExpiry && Date.now() < state.tokenExpiry)
}
