import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GoogleAuthState {
  clientId: string
  clientSecret: string
  accessToken: string | null
  tokenExpiry: number | null
  refreshToken: string | null
  tokenIssuedAt: number | null
  setClientId: (clientId: string) => void
  setClientSecret: (clientSecret: string) => void
  setToken: (accessToken: string, expiresIn: number) => void
  setRefreshToken: (refreshToken: string) => void
  clearToken: () => void
}

export const useGoogleAuthStore = create<GoogleAuthState>()(
  persist(
    (set) => ({
      clientId: '',
      clientSecret: '',
      accessToken: null,
      tokenExpiry: null,
      refreshToken: null,
      setRefreshToken: (refreshToken) => set({ refreshToken }),
      tokenIssuedAt: null,
      setClientId: (clientId) => set({ clientId }),
      setClientSecret: (clientSecret) => set({ clientSecret }),
      setToken: (accessToken, expiresIn) =>
        set({ accessToken, tokenExpiry: Date.now() + expiresIn * 1000, tokenIssuedAt: Date.now() }),
      clearToken: () => set({ accessToken: null, tokenExpiry: null, refreshToken: null, tokenIssuedAt: null }),
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
