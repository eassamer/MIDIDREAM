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
  /** Step that knobs/Accent edit (held or last-touched step key, or clicked). */
  focusedStep: { part: number; step: number } | null
}

export const controlStore = createStore<ControlState>()(() => ({
  padMode: 'trigger',
  keyMode: 'play',
  focusedStep: null,
}))

export function useControl<T>(selector: (s: ControlState) => T): T {
  return useStore(controlStore, selector)
}

export const PREF_CONTROL_MODES = 'control.modes'

export interface StoredModes {
  padMode: PadMode
  keyMode: KeyMode
}

/** Validate saved modes; anything unknown falls back to the defaults. */
export function sanitizeModes(data: unknown): StoredModes {
  const d = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  return {
    padMode: PAD_MODES.includes(d['padMode'] as PadMode) ? (d['padMode'] as PadMode) : 'trigger',
    keyMode: d['keyMode'] === 'step' ? 'step' : 'play',
  }
}
