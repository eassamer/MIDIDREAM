import type { KnobId } from './mapping'

/** What a learned knob controls. Values arrive as absolute CC 0..127. */
export type KnobJob =
  'none' | 'partVolume' | 'partPan' | 'partPitch' | 'padMode' | 'tempo' | 'masterVolume'

export const KNOB_JOB_LABELS: Record<KnobJob, string> = {
  none: '— Nothing —',
  partVolume: 'Part volume',
  partPan: 'Part pan',
  partPitch: 'Part pitch',
  padMode: 'Pad mode (Trigger / Mute / Select)',
  tempo: 'Tempo (60–200 BPM)',
  masterVolume: 'Master volume',
}

export type KnobJobs = Record<KnobId, KnobJob>

export const DEFAULT_KNOB_JOBS: KnobJobs = {
  knob1: 'partVolume',
  knob2: 'partPan',
  knob3: 'partPitch',
  knob4: 'none',
  knob5: 'none',
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
