import { create } from 'zustand'

export interface TileFlowPayload {
  content: string
  dataType: 'text' | 'audio' | 'json'
  timestamp: number
}

interface TileFlowState {
  outputs: Record<string, TileFlowPayload>
  publishOutput: (tileId: string, payload: Omit<TileFlowPayload, 'timestamp'>) => void
  clearOutput: (tileId: string) => void
}

export const useTileFlowStore = create<TileFlowState>((set) => ({
  outputs: {},
  publishOutput: (tileId, payload) =>
    set((state) => ({
      outputs: {
        ...state.outputs,
        [tileId]: {
          ...payload,
          timestamp: Date.now(),
        },
      },
    })),
  clearOutput: (tileId) =>
    set((state) => {
      if (!state.outputs[tileId]) return state
      const next = { ...state.outputs }
      delete next[tileId]
      return { outputs: next }
    }),
}))
