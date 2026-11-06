import type { PartIndex } from '../project/types'

/**
 * Typed command boundary between the UI/MIDI layers and the audio engine.
 * UI code sends these; it never touches Web Audio nodes directly.
 *
 * Implemented by AudioEngine.
 */
export type AudioCommand =
  | { type: 'trigger'; part: PartIndex; velocity: number; note?: number }
  | { type: 'release'; part: PartIndex; note?: number }
  | { type: 'panic' }
  | { type: 'setMasterVolume'; volume: number }

export interface AudioEngineApi {
  send(command: AudioCommand): void
}
