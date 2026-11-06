import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

export interface TransportState {
  playing: boolean
  /** Pattern step currently audible (0-based), or null when stopped. */
  playheadStep: number | null
}

export const transportStore = createStore<TransportState>()(() => ({
  playing: false,
  playheadStep: null,
}))

export function useTransport<T>(selector: (s: TransportState) => T): T {
  return useStore(transportStore, selector)
}
