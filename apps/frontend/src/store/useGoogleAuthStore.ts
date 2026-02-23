import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GoogleAuthState {
  clientId: string
  accessToken: string | null
  tokenExpiry: number | null
  refreshToken: string | null
  setClientId: (clientId: string) => void
  setToken: (accessToken: string, expiresIn: number) => void
  setRefreshToken: (refreshToken: string) => void
  clearToken: () => void
}

export const useGoogleAuthStore = create<GoogleAuthState>()(
  persist(
    (set) => ({
      clientId: '',
      accessToken: null,
      tokenExpiry: null,
      refreshToken: null,
      setClientId: (clientId) => set({ clientId }),
      setToken: (accessToken, expiresIn) =>
        set({ accessToken, tokenExpiry: Date.now() + expiresIn * 1000 }),
      setRefreshToken: (refreshToken) => set({ refreshToken }),
      clearToken: () => set({ accessToken: null, tokenExpiry: null, refreshToken: null }),
    }),
    {
      name: 'google-auth-store',
    },
  ),
)

/** Returns true when the stored access token is present and not yet expired. */
export function isTokenValid(state: Pick<GoogleAuthState, 'accessToken' | 'tokenExpiry'>): boolean {
  return !!(state.accessToken && state.tokenExpiry && Date.now() < state.tokenExpiry)
}
