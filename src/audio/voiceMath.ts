import type { Part } from '../project/types'

/** Pure helpers shared by the engine and its tests. */

export const DEFAULT_NOTE = 60

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

export function semitonesToRate(semitones: number): number {
  return Math.pow(2, semitones / 12)
}

/** MIDI velocity (1..127) -> linear gain, with a mild curve so soft hits stay audible. */
export function velocityToGain(velocity: number): number {
  const v = Math.min(127, Math.max(0, velocity)) / 127
  return Math.pow(v, 1.5)
}

/** Is a part audible given mute and the global solo state? */
export function isAudible(part: Part, anySolo: boolean): boolean {
  return !part.mute && (!anySolo || part.solo)
}

/** Default pitch a pitched part plays when triggered without a note. */
export function defaultNoteFor(part: Part): number {
  return part.role === 'bass' ? 36 : DEFAULT_NOTE
}
