import {
  MAX_PATTERN_BARS,
  MIN_PATTERN_BARS,
  PART_COUNT,
  PROJECT_SCHEMA_VERSION,
  STEPS_PER_BAR,
  type Part,
  type PartIndex,
  type PartRole,
  type PartTrack,
  type Pattern,
  type Project,
  type Step,
} from './types'

/**
 * Pure factories and immutable update helpers for the project model.
 * Nothing here touches audio, MIDI, React, or storage.
 */

let idCounter = 0
export function createId(prefix: string): string {
  idCounter += 1
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${Date.now().toString(36)}${rand}${idCounter}`
}

const DEFAULT_PARTS: ReadonlyArray<{ name: string; role: PartRole; color: string }> = [
  { name: 'KICK', role: 'kick', color: '#ff5a4e' },
  { name: 'SNARE', role: 'snare', color: '#ff9f43' },
  { name: 'CLOSED HH', role: 'closed-hh', color: '#ffd23f' },
  { name: 'OPEN HH', role: 'open-hh', color: '#9be564' },
  { name: 'PERC', role: 'perc', color: '#3ddbd9' },
  { name: 'BASS', role: 'bass', color: '#4f9dff' },
  { name: 'SYNTH', role: 'synth', color: '#a879ff' },
  { name: 'SAMPLE', role: 'sample', color: '#ff6fb5' },
]

/** Open and closed hi-hats choke each other by default. */
const HIHAT_CHOKE_GROUP = 1

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function isPartIndex(n: number): n is PartIndex {
  return Number.isInteger(n) && n >= 0 && n < PART_COUNT
}

export function createStep(): Step {
  return {
    active: false,
    velocity: 0.8,
    probability: 1,
    microtiming: 0,
    ratchet: 1,
    accent: false,
    gate: 1,
    notes: [],
  }
}

export function createTrack(lengthBars: number): PartTrack {
  return {
    steps: Array.from({ length: lengthBars * STEPS_PER_BAR }, createStep),
  }
}

export function createPart(index: PartIndex): Part {
  const preset = DEFAULT_PARTS[index]!
  const pitched = preset.role === 'bass' || preset.role === 'synth'
  const isHat = preset.role === 'closed-hh' || preset.role === 'open-hh'
  return {
    index,
    name: preset.name,
    role: preset.role,
    color: preset.color,
    mute: false,
    solo: false,
    volume: 0.8,
    pan: 0,
    pitchSemitones: 0,
    sound: pitched
      ? { kind: 'synth', waveform: preset.role === 'bass' ? 'sawtooth' : 'square' }
      : { kind: 'sample', sample: null, playMode: 'one-shot', start: 0, end: 1, reverse: false },
    filter: { type: 'lowpass', cutoffHz: 20000, resonance: 0.7 },
    ampEnvelope: { attack: 0.001, decay: 0.2, sustain: pitched ? 0.6 : 0, release: 0.1 },
    sends: { reverb: 0, delay: 0 },
    chokeGroup: isHat ? HIHAT_CHOKE_GROUP : null,
  }
}

export function createPattern(name = 'Pattern 1', lengthBars = 1): Pattern {
  const bars = clamp(Math.round(lengthBars), MIN_PATTERN_BARS, MAX_PATTERN_BARS)
  return {
    id: createId('pat'),
    name,
    lengthBars: bars,
    tracks: Array.from({ length: PART_COUNT }, () => createTrack(bars)),
  }
}

export function createProject(name = 'Untitled'): Project {
  const pattern = createPattern()
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: createId('proj'),
    name,
    bpm: 120,
    swing: 0,
    timeSignature: { beatsPerBar: 4, beatUnit: 4 },
    parts: Array.from({ length: PART_COUNT }, (_, i) => createPart(i as PartIndex)),
    patterns: [pattern],
    activePatternId: pattern.id,
    masterVolume: 0.8,
  }
}

export function getActivePattern(project: Project): Pattern {
  const pattern = project.patterns.find((p) => p.id === project.activePatternId)
  if (!pattern) throw new Error(`Active pattern ${project.activePatternId} not found`)
  return pattern
}

function updatePattern(project: Project, patternId: string, fn: (p: Pattern) => Pattern): Project {
  let found = false
  const patterns = project.patterns.map((p) => {
    if (p.id !== patternId) return p
    found = true
    return fn(p)
  })
  if (!found) throw new Error(`Pattern ${patternId} not found`)
  return { ...project, patterns }
}

/** Toggle one step on/off. Out-of-range step indexes are ignored. */
export function toggleStep(
  project: Project,
  patternId: string,
  part: PartIndex,
  stepIndex: number,
): Project {
  return updatePattern(project, patternId, (pattern) => {
    const track = pattern.tracks[part]!
    const step = track.steps[stepIndex]
    if (!step) return pattern
    const steps = track.steps.slice()
    steps[stepIndex] = { ...step, active: !step.active }
    const tracks = pattern.tracks.slice()
    tracks[part] = { steps }
    return { ...pattern, tracks }
  })
}

/** Clear all steps of one part in a pattern. */
export function clearTrack(project: Project, patternId: string, part: PartIndex): Project {
  return updatePattern(project, patternId, (pattern) => {
    const tracks = pattern.tracks.slice()
    tracks[part] = createTrack(pattern.lengthBars)
    return { ...pattern, tracks }
  })
}

/**
 * Change a pattern's length. Growing appends empty bars; shrinking truncates
 * trailing bars (their data is discarded).
 */
export function setPatternLength(project: Project, patternId: string, lengthBars: number): Project {
  const bars = clamp(Math.round(lengthBars), MIN_PATTERN_BARS, MAX_PATTERN_BARS)
  const stepCount = bars * STEPS_PER_BAR
  return updatePattern(project, patternId, (pattern) => ({
    ...pattern,
    lengthBars: bars,
    tracks: pattern.tracks.map((track) => ({
      steps:
        track.steps.length >= stepCount
          ? track.steps.slice(0, stepCount)
          : [...track.steps, ...Array.from({ length: stepCount - track.steps.length }, createStep)],
    })),
  }))
}

export function setPartMute(project: Project, part: PartIndex, mute: boolean): Project {
  const parts = project.parts.slice()
  parts[part] = { ...parts[part]!, mute }
  return { ...project, parts }
}
