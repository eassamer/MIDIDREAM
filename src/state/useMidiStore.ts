import { useStore } from 'zustand'
import { MidiController } from '../midi/MidiController'
import { preferences } from '../persistence/preferences'
import { midiStore, type MidiState } from './midiStore'

/** App-wide MIDI controller bound to the app-wide MIDI store. */
export const midiController = new MidiController(midiStore, preferences)

export function useMidiStore<T>(selector: (state: MidiState) => T): T {
  return useStore(midiStore, selector)
}
