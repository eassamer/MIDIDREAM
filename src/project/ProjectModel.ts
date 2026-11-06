import { builtinSampleRef, type BuiltinSampleId } from '../audio/builtinSamples'
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

const DEFAULT_SAMPLES: Partial<Record<PartRole, BuiltinSampleId>> = {
  kick: 'builtin:kick',
  snare: 'builtin:snare',
  'closed-hh': 'builtin:closed-hh',
  'open-hh': 'builtin:open-hh',
  perc: 'builtin:perc',
  sample: 'builtin:stab',
}

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
      : {
          kind: 'sample',
          sample: builtinSampleRef(DEFAULT_SAMPLES[preset.role]!),
          playMode: 'one-shot',
          start: 0,
          end: 1,
          reverse: false,
        },
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

/** Editable per-part mixer and sound fields. */
export type PartPatch = Partial<
  Pick<Part, 'name' | 'mute' | 'solo' | 'volume' | 'pan' | 'pitchSemitones' | 'sound'>
>

export function updatePart(project: Project, part: PartIndex, patch: PartPatch): Project {
  const current = project.parts[part]!
  const next: Part = { ...current, ...patch }
  next.volume = clamp(next.volume, 0, 1)
  next.pan = clamp(next.pan, -1, 1)
  next.pitchSemitones = clamp(Math.round(next.pitchSemitones), -24, 24)
  const parts = project.parts.slice()
  parts[part] = next
  return { ...project, parts }
}

export function setMasterVolume(project: Project, volume: number): Project {
  return { ...project, masterVolume: clamp(volume, 0, 1) }
}

export const MIN_BPM = 20
export const MAX_BPM = 300

/** Set tempo, clamped to 20..300 and rounded to 0.1 BPM. */
export function setBpm(project: Project, bpm: number): Project {
  if (!Number.isFinite(bpm)) return project
  return { ...project, bpm: Math.round(clamp(bpm, MIN_BPM, MAX_BPM) * 10) / 10 }
}

/** Set one step's velocity (0..1). Turning velocity up does not activate the step. */
export function setStepVelocity(
  project: Project,
  patternId: string,
  part: PartIndex,
  stepIndex: number,
  velocity: number,
): Project {
  return updatePattern(project, patternId, (pattern) => {
    const track = pattern.tracks[part]!
    const step = track.steps[stepIndex]
    if (!step) return pattern
    const steps = track.steps.slice()
    steps[stepIndex] = { ...step, velocity: clamp(velocity, 0.05, 1) }
    const tracks = pattern.tracks.slice()
    tracks[part] = { steps }
    return { ...pattern, tracks }
  })
}

/** Clear every part's steps in a pattern (length is kept). */
export function clearPattern(project: Project, patternId: string): Project {
  return updatePattern(project, patternId, (pattern) => ({
    ...pattern,
    tracks: pattern.tracks.map(() => createTrack(pattern.lengthBars)),
  }))
}

/**
 * Double a pattern's length by repeating its content (1 -> 2 -> 4 -> 8 -> 16
 * bars). No-op when the result would exceed 16 bars.
 */
export function doublePattern(project: Project, patternId: string): Project {
  return updatePattern(project, patternId, (pattern) => {
    if (pattern.lengthBars * 2 > MAX_PATTERN_BARS) return pattern
    return {
      ...pattern,
      lengthBars: pattern.lengthBars * 2,
      tracks: pattern.tracks.map((t) => ({
        steps: [...t.steps, ...t.steps.map((s) => ({ ...s, notes: [...s.notes] }))],
      })),
    }
  })
}

// ---------------------------------------------------------------- step params

/** Per-step fields editable from the inspector or the MPK knobs. */
export type StepPatch = Partial<
  Pick<Step, 'velocity' | 'probability' | 'ratchet' | 'microtiming' | 'accent' | 'gate'>
>

export const MAX_RATCHET = 4

/** Clamp a step patch to valid ranges. */
export function normalizeStepPatch(patch: StepPatch): StepPatch {
  const out: StepPatch = { ...patch }
  if (out.velocity !== undefined) out.velocity = clamp(out.velocity, 0.05, 1)
  if (out.probability !== undefined) out.probability = clamp(out.probability, 0, 1)
  if (out.ratchet !== undefined) out.ratchet = clamp(Math.round(out.ratchet), 1, MAX_RATCHET)
  if (out.microtiming !== undefined) out.microtiming = clamp(out.microtiming, -0.5, 0.5)
  if (out.gate !== undefined) out.gate = clamp(out.gate, 0.05, 16)
  return out
}

export function updateStep(
  project: Project,
  patternId: string,
  part: PartIndex,
  stepIndex: number,
  patch: StepPatch,
): Project {
  return updatePattern(project, patternId, (pattern) => {
    const track = pattern.tracks[part]!
    const step = track.steps[stepIndex]
    if (!step) return pattern
    const steps = track.steps.slice()
    steps[stepIndex] = { ...step, ...normalizeStepPatch(patch) }
    const tracks = pattern.tracks.slice()
    tracks[part] = { steps }
    return { ...pattern, tracks }
  })
}

/** Swing 0..1: delays every second 16th by up to half a step (50%..75% swing). */
export function setSwing(project: Project, swing: number): Project {
  if (!Number.isFinite(swing)) return project
  return { ...project, swing: Math.round(clamp(swing, 0, 1) * 100) / 100 }
}

// ---------------------------------------------------------------- patterns

export const MAX_PATTERNS = 64

function nextPatternName(project: Project): string {
  const used = new Set(project.patterns.map((p) => p.name))
  for (let n = project.patterns.length + 1; ; n++) {
    if (!used.has(`Pattern ${n}`)) return `Pattern ${n}`
  }
}

/** Make a pattern active (immediately; queuing during playback is the app's job). */
export function selectPattern(project: Project, patternId: string): Project {
  if (!project.patterns.some((p) => p.id === patternId)) return project
  return { ...project, activePatternId: patternId }
}

/** Add an empty 1-bar pattern after the active one and make it active. */
export function addPattern(project: Project): Project {
  if (project.patterns.length >= MAX_PATTERNS) return project
  const pattern = createPattern(nextPatternName(project))
  const at = project.patterns.findIndex((p) => p.id === project.activePatternId) + 1
  const patterns = [...project.patterns.slice(0, at), pattern, ...project.patterns.slice(at)]
  return { ...project, patterns, activePatternId: pattern.id }
}

/** Copy a pattern (all parts, all steps) right after it and make the copy active. */
export function duplicatePattern(project: Project, patternId: string): Project {
  if (project.patterns.length >= MAX_PATTERNS) return project
  const index = project.patterns.findIndex((p) => p.id === patternId)
  const source = project.patterns[index]
  if (!source) return project
  const copy: Pattern = {
    ...source,
    id: createId('pat'),
    name: `${source.name} copy`,
    tracks: source.tracks.map((t) => ({
      steps: t.steps.map((s) => ({ ...s, notes: [...s.notes] })),
    })),
  }
  const patterns = [
    ...project.patterns.slice(0, index + 1),
    copy,
    ...project.patterns.slice(index + 1),
  ]
  return { ...project, patterns, activePatternId: copy.id }
}

/** Delete a pattern; the last remaining pattern cannot be deleted. */
export function deletePattern(project: Project, patternId: string): Project {
  if (project.patterns.length <= 1) return project
  const index = project.patterns.findIndex((p) => p.id === patternId)
  if (index < 0) return project
  const patterns = project.patterns.filter((p) => p.id !== patternId)
  const activePatternId =
    project.activePatternId === patternId
      ? patterns[Math.min(index, patterns.length - 1)]!.id
      : project.activePatternId
  return { ...project, patterns, activePatternId }
}

export function renamePattern(project: Project, patternId: string, name: string): Project {
  const trimmed = name.trim().slice(0, 32)
  if (!trimmed) return project
  return updatePattern(project, patternId, (p) => ({ ...p, name: trimmed }))
}

/** Id of the pattern `offset` places from `patternId`, wrapping around. */
export function neighbourPatternId(project: Project, patternId: string, offset: number): string {
  const n = project.patterns.length
  const index = project.patterns.findIndex((p) => p.id === patternId)
  return project.patterns[(((index + offset) % n) + n) % n]!.id
}
