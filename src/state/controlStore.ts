import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'

/** What the 8 pads do. */
export type PadMode = 'trigger' | 'mute' | 'select'
/** What the keyboard does. */
export type KeyMode = 'play' | 'step'

export const PAD_MODES: readonly PadMode[] = ['trigger', 'mute', 'select']

export interface ControlState {
  padMode: PadMode
  keyMode: KeyMode
}

export const controlStore = createStore<ControlState>()(() => ({
  padMode: 'trigger',
  keyMode: 'play',
}))

export function useControl<T>(selector: (s: ControlState) => T): T {
  return useStore(controlStore, selector)
}
