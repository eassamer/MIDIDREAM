/**
 * Core, serializable project data model.
 *
 * Rules:
 * - Plain data only (no class instances, functions, audio nodes, or Maps), so a
 *   project can round-trip through JSON unchanged.
 * - Normalized ranges are documented next to each field.
 * - Bump PROJECT_SCHEMA_VERSION whenever the shape changes incompatibly.
 */

export const PROJECT_SCHEMA_VERSION = 1

export const PART_COUNT = 8
export const STEPS_PER_BAR = 16
export const MIN_PATTERN_BARS = 1
export const MAX_PATTERN_BARS = 16

/** Index of a part, 0..7. */
export type PartIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

export type PartRole =
  'kick' | 'snare' | 'closed-hh' | 'open-hh' | 'perc' | 'bass' | 'synth' | 'sample'

/** Sample playback behavior. */
export type SamplePlayMode = 'one-shot' | 'gated' | 'loop'

/**
 * Reference to an audio file. The original file is never modified; trim,
 * reverse, and pitch are stored as parameters on the sound source.
 */
export interface SampleRef {
  /** Stable id within the project. */
  id: string
  /** Display name. */
  name: string
  /** 'builtin' samples ship with the app; 'user' samples live on disk. */
  origin: 'builtin' | 'user'
  /** Path relative to the project folder or sample library root. */
  path: string
}

export interface SampleSource {
  kind: 'sample'
  sample: SampleRef | null
  playMode: SamplePlayMode
  /** Normalized 0..1 position within the file. start < end. */
  start: number
  end: number
  reverse: boolean
}

export type OscillatorWaveform = 'sine' | 'triangle' | 'sawtooth' | 'square'

export interface SynthSource {
  kind: 'synth'
  waveform: OscillatorWaveform
}

export type SoundSource = SampleSource | SynthSource

export type FilterType = 'lowpass' | 'highpass' | 'bandpass'

export interface FilterSettings {
  type: FilterType
  /** Cutoff frequency in Hz, 20..20000. */
  cutoffHz: number
  /** Resonance (Q), 0..20. */
  resonance: number
}

/** Envelope times in seconds, sustain normalized 0..1. */
export interface Envelope {
  attack: number
  decay: number
  sustain: number
  release: number
}

export interface EffectSends {
  /** Normalized 0..1 send levels. */
  reverb: number
  delay: number
}

export interface Part {
  index: PartIndex
  name: string
  role: PartRole
  /** CSS color used for the part's visual identity. */
  color: string
  mute: boolean
  solo: boolean
  /** Linear gain 0..1. */
  volume: number
  /** -1 (left) .. 1 (right). */
  pan: number
  /** Pitch offset in semitones, -24..24. */
  pitchSemitones: number
  sound: SoundSource
  filter: FilterSettings
  ampEnvelope: Envelope
  sends: EffectSends
  /** Parts sharing a non-null choke group cut each other off. */
  chokeGroup: number | null
}

export interface Step {
  active: boolean
  /** 0..1 */
  velocity: number
  /** 0..1 chance the step fires. */
  probability: number
  /** Offset as a fraction of one step, -0.5..0.5. */
  microtiming: number
  /** Number of retriggers within the step, 1..4. */
  ratchet: number
  accent: boolean
  /** Note length as a fraction of one step, >0. */
  gate: number
  /** MIDI note numbers for pitched parts; empty for drum parts. */
  notes: number[]
}

/** Step data for one part within one pattern. */
export interface PartTrack {
  /** Length is always pattern.lengthBars * STEPS_PER_BAR. */
  steps: Step[]
}

export interface Pattern {
  id: string
  name: string
  /** 1..16 bars of 16 steps each. */
  lengthBars: number
  /** One track per part, indexed by PartIndex. Length is PART_COUNT. */
  tracks: PartTrack[]
}

export interface TimeSignature {
  beatsPerBar: number
  beatUnit: number
}

export interface Project {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION
  id: string
  name: string
  /** Tempo, 20..300 BPM. */
  bpm: number
  /** Swing amount 0..1 (0 = straight). */
  swing: number
  timeSignature: TimeSignature
  /** Exactly PART_COUNT parts. */
  parts: Part[]
  /** At least one pattern. */
  patterns: Pattern[]
  activePatternId: string
  /** Master linear gain, 0..1. */
  masterVolume: number
}
