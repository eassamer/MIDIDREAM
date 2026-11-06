import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

export interface TransportState {
  playing: boolean
  /** Pattern step currently audible (0-based), or null when stopped. */
  playheadStep: number | null
  /** Pattern waiting to start at the end of the current loop. */
  queuedPatternId: string | null
}

export const transportStore = createStore<TransportState>()(() => ({
  playing: false,
  playheadStep: null,
  queuedPatternId: null,
}))

export function useTransport<T>(selector: (s: TransportState) => T): T {
  return useStore(transportStore, selector)
}
