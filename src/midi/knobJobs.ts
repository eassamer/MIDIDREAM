import type { KnobId } from './mapping'

/** What a learned knob controls. Values arrive as absolute CC 0..127. */
export type KnobJob =
  | 'none'
  | 'partVolume'
  | 'partPan'
  | 'partPitch'
  | 'padMode'
  | 'tempo'
  | 'swing'
  | 'masterVolume'
  | 'stepVelocity'
  | 'stepProbability'
  | 'stepRatchet'
  | 'stepMicro'

/** Knob jobs that edit the focused step (hold a step key, or the last one touched). */
export const STEP_KNOB_JOBS = [
  'stepVelocity',
  'stepProbability',
  'stepRatchet',
  'stepMicro',
] as const
export type StepKnobJob = (typeof STEP_KNOB_JOBS)[number]

export const KNOB_JOB_LABELS: Record<KnobJob, string> = {
  none: '— Nothing —',
  partVolume: 'Part volume',
  partPan: 'Part pan',
  partPitch: 'Part pitch',
  padMode: 'Pad mode (Trigger / Mute / Select)',
  tempo: 'Tempo (60–200 BPM)',
  swing: 'Swing',
  masterVolume: 'Master volume',
  stepVelocity: 'Step: velocity',
  stepProbability: 'Step: probability',
  stepRatchet: 'Step: ratchet (1–4 hits)',
  stepMicro: 'Step: microtiming (early/late)',
}

export type KnobJobs = Record<KnobId, KnobJob>

export const DEFAULT_KNOB_JOBS: KnobJobs = {
  knob1: 'partVolume',
  knob2: 'partPan',
  knob3: 'partPitch',
  knob4: 'stepProbability',
  knob5: 'swing',
  knob6: 'padMode',
  knob7: 'tempo',
  knob8: 'masterVolume',
}

export function sanitizeKnobJobs(data: unknown): KnobJobs {
  const out = { ...DEFAULT_KNOB_JOBS }
  if (typeof data !== 'object' || data === null) return out
  for (const id of Object.keys(out) as KnobId[]) {
    const job = (data as Record<string, unknown>)[id]
    if (typeof job === 'string' && job in KNOB_JOB_LABELS) out[id] = job as KnobJob
  }
  return out
}
