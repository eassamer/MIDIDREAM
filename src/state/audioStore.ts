import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { EngineStats } from '../audio/AudioEngine'

export const audioStore = createStore<{ stats: EngineStats }>()(() => ({
  stats: { status: 'idle', sampleRate: 0, baseLatency: null, outputLatency: null, error: null },
}))

export function useAudioStats(): EngineStats {
  return useStore(audioStore, (s) => s.stats)
}
