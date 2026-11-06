import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

/** A user sample known to the library (the file itself is never modified). */
export interface LibraryEntry {
  /** Stable id, kept when the file is relinked to a new path. */
  id: string
  name: string
  /** Absolute path on this Mac. */
  path: string
}

export type SampleLoadState = 'idle' | 'loading' | 'ready' | 'missing' | 'error'

export interface SampleStatus {
  state: SampleLoadState
  message?: string
  duration?: number
}

export interface SampleState {
  library: LibraryEntry[]
  status: Record<string, SampleStatus>
  /** Browser search text. */
  search: string
}

export const sampleStore = createStore<SampleState>()(() => ({
  library: [],
  status: {},
  search: '',
}))

export function useSamples<T>(selector: (s: SampleState) => T): T {
  return useStore(sampleStore, selector)
}
