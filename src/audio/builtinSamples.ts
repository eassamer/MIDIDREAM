import type { SampleRef } from '../project/types'

/**
 * Built-in one-shot sounds, synthesized into PCM at startup so the app ships
 * without third-party audio files. Pure functions: same input -> same samples.
 */

export type BuiltinSampleId =
  | 'builtin:kick'
  | 'builtin:snare'
  | 'builtin:closed-hh'
  | 'builtin:open-hh'
  | 'builtin:perc'
  | 'builtin:stab'

interface BuiltinDef {
  name: string
  seconds: number
  /** Output is normalized to this peak so levels are predictable and never clip. */
  peak: number
  render: (out: Float32Array, sampleRate: number) => void
}

/** Small deterministic PRNG (mulberry32) so generated noise is reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TAU = Math.PI * 2

/** Sine with an exponential pitch sweep and exponential amplitude decay. */
function sweptSine(
  out: Float32Array,
  sr: number,
  f0: number,
  f1: number,
  sweepS: number,
  decayS: number,
  amp: number,
): void {
  let phase = 0
  for (let i = 0; i < out.length; i++) {
    const t = i / sr
    const f = f1 + (f0 - f1) * Math.exp(-t / sweepS)
    phase += (TAU * f) / sr
    out[i]! += amp * Math.sin(phase) * Math.exp(-t / decayS)
  }
}

/** White noise through a one-pole high-pass, with exponential decay. */
function noise(
  out: Float32Array,
  sr: number,
  seed: number,
  hpHz: number,
  decayS: number,
  amp: number,
): void {
  const rand = prng(seed)
  const rc = 1 / (TAU * hpHz)
  const alpha = rc / (rc + 1 / sr)
  let prevIn = 0
  let prevOut = 0
  for (let i = 0; i < out.length; i++) {
    const x = rand() * 2 - 1
    const y = alpha * (prevOut + x - prevIn)
    prevIn = x
    prevOut = y
    out[i]! += amp * y * Math.exp(-i / sr / decayS)
  }
}

/** Short fade-in/out so one-shots never start or end with a click. */
function declick(out: Float32Array, sr: number): void {
  const n = Math.min(out.length, Math.round(sr * 0.003))
  for (let i = 0; i < n; i++) {
    out[i]! *= i / n
    out[out.length - 1 - i]! *= i / n
  }
}

const DEFS: Record<BuiltinSampleId, BuiltinDef> = {
  'builtin:kick': {
    name: 'Kick',
    peak: 0.95,
    seconds: 0.6,
    render: (o, sr) => {
      sweptSine(o, sr, 160, 45, 0.04, 0.32, 0.9)
      noise(o, sr, 1, 2000, 0.004, 0.25) // click
    },
  },
  'builtin:snare': {
    name: 'Snare',
    peak: 0.85,
    seconds: 0.35,
    render: (o, sr) => {
      sweptSine(o, sr, 240, 180, 0.02, 0.08, 0.45)
      noise(o, sr, 2, 1200, 0.11, 0.6)
    },
  },
  'builtin:closed-hh': {
    name: 'Closed Hat',
    peak: 0.7,
    seconds: 0.12,
    render: (o, sr) => noise(o, sr, 3, 7000, 0.03, 1),
  },
  'builtin:open-hh': {
    name: 'Open Hat',
    peak: 0.6,
    seconds: 0.7,
    render: (o, sr) => noise(o, sr, 4, 6500, 0.22, 1),
  },
  'builtin:perc': {
    name: 'Tom',
    peak: 0.85,
    seconds: 0.45,
    render: (o, sr) => {
      sweptSine(o, sr, 330, 200, 0.05, 0.16, 0.8)
      noise(o, sr, 5, 3000, 0.01, 0.15)
    },
  },
  'builtin:stab': {
    name: 'Chord Stab',
    peak: 0.7,
    seconds: 0.8,
    render: (o, sr) => {
      // Minor 7th chord (C3 Eb3 G3 Bb3), a few harmonics each.
      for (const f of [130.81, 155.56, 196.0, 233.08]) {
        for (let h = 1; h <= 4; h++) sweptSine(o, sr, f * h, f * h, 1, 0.3, 0.12 / h)
      }
    },
  },
}

export const BUILTIN_SAMPLE_IDS = Object.keys(DEFS) as BuiltinSampleId[]

export function builtinSampleRef(id: BuiltinSampleId): SampleRef {
  return { id, name: DEFS[id].name, origin: 'builtin', path: id }
}

export function renderBuiltinSample(id: BuiltinSampleId, sampleRate: number): Float32Array {
  const def = DEFS[id]
  const out = new Float32Array(Math.round(def.seconds * sampleRate))
  def.render(out, sampleRate)
  declick(out, sampleRate)
  let max = 0
  for (const v of out) max = Math.max(max, Math.abs(v))
  if (max > 0) {
    const gain = def.peak / max
    for (let i = 0; i < out.length; i++) out[i]! *= gain
  }
  return out
}

export function isBuiltinSampleId(id: string): id is BuiltinSampleId {
  return id in DEFS
}
