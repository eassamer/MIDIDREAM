import { createStore } from 'zustand/vanilla'
import type { MidiSnapshot } from '../midi/MidiManager'
import type { LearnTargetId, MidiMappings } from '../midi/mapping'
import { DEFAULT_KNOB_JOBS, type KnobJobs } from '../midi/knobJobs'

export interface MidiLogEntry {
  id: number
  /** performance.now() based timestamp in ms. */
  time: number
  text: string
  realtime: boolean
  /** Learned controls this message matched. */
  targets: LearnTargetId[]
}

export const MIDI_LOG_LIMIT = 200

export interface MidiState {
  snapshot: MidiSnapshot
  mappings: MidiMappings
  /** Target waiting for a physical control, or null. */
  learning: LearnTargetId | null
  log: MidiLogEntry[]
  showRealtime: boolean
  /** Increments every time a learned control sends a message (drives activity LEDs). */
  activity: Partial<Record<LearnTargetId, number>>
  /** Last human-readable value per learned control. */
  values: Partial<Record<LearnTargetId, string>>
  /** What each learned knob controls. */
  knobJobs: KnobJobs
}

export function createMidiStore() {
  return createStore<MidiState>()(() => ({
    snapshot: {
      status: 'idle',
      error: null,
      inputs: [],
      preferredName: null,
      connectedId: null,
    },
    mappings: {},
    learning: null,
    log: [],
    showRealtime: false,
    activity: {},
    values: {},
    knobJobs: { ...DEFAULT_KNOB_JOBS },
  }))
}

export type MidiStore = ReturnType<typeof createMidiStore>

export const midiStore = createMidiStore()
