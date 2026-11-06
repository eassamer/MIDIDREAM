import { describe, expect, it } from 'vitest'
import {
  createProject,
  getActivePattern,
  setPatternLength,
  setStepVelocity,
  toggleStep,
} from '../project/ProjectModel'
import type { PartIndex, Project } from '../project/types'
import { Sequencer, stepDuration, type NoteSink } from './Sequencer'

interface Played {
  part: PartIndex
  velocity: number
  note: number | undefined
  when: number
  duration: number
}

function setup(edit: (p: Project) => Project = (p) => p, options = {}) {
  let project = edit(createProject())
  let now = 0
  const played: Played[] = []
  const calls: string[] = []
  const sink: NoteSink = {
    playNote: (part, velocity, note, when, duration) =>
      played.push({ part, velocity, note, when, duration }),
    cancelAfter: (t) => calls.push(`cancelAfter:${t}`),
    releaseAll: () => calls.push('releaseAll'),
  }
  const seq = new Sequencer(
    { now: () => now },
    { getPattern: () => getActivePattern(project), getBpm: () => project.bpm },
    sink,
    // Manual timer: tests drive tick() themselves.
    { timer: { set: () => 1, clear: () => {} }, lookahead: 0.1, startDelay: 0.05, ...options },
  )
  return {
    seq,
    played,
    calls,
    advanceTo(t: number) {
      // Wake the scheduler every 25 ms of simulated time, like the real timer.
      while (now < t) {
        now = Math.min(t, now + 0.025)
        seq.tick()
      }
    },
    jumpTo(t: number) {
      now = t
    },
    setProject(fn: (p: Project) => Project) {
      project = fn(project)
    },
    get project() {
      return project
    },
  }
}

const on = (part: PartIndex, step: number) => (p: Project) =>
  toggleStep(p, p.activePatternId, part, step)

describe('stepDuration', () => {
  it('is a 16th note', () => {
    expect(stepDuration(120)).toBeCloseTo(0.125)
    expect(stepDuration(60)).toBeCloseTo(0.25)
  })
})

describe('Sequencer', () => {
  it('schedules active steps at exact audio-clock times', () => {
    const t = setup((p) => on(1, 4)(on(0, 0)(p)))
    t.seq.start()
    t.advanceTo(1)
    expect(t.played.map((n) => [n.part, n.when])).toEqual([
      [0, 0.05],
      [1, 0.05 + 4 * 0.125],
    ])
    expect(t.played[0]).toMatchObject({ velocity: 102, note: undefined, duration: 0.125 })
  })

  it('never schedules more than the lookahead ahead', () => {
    const t = setup((p) => on(0, 8)(p))
    t.seq.start()
    t.advanceTo(0.9) // step 8 is at 1.05; lookahead 0.1 reaches only 1.0
    expect(t.played).toHaveLength(0)
    t.advanceTo(0.975)
    expect(t.played).toHaveLength(1)
  })

  it('loops a one-bar pattern every 16 steps without drift', () => {
    const t = setup((p) => on(0, 0)(p))
    t.seq.start()
    t.advanceTo(2 * 100 + 0.1) // 100 bars at 120 BPM
    expect(t.played).toHaveLength(101)
    t.played.forEach((n, i) => expect(n.when).toBeCloseTo(0.05 + i * 2, 9))
  })

  it('loops multi-bar patterns at the right length', () => {
    const t = setup((p) => on(0, 20)(setPatternLength(p, p.activePatternId, 2)))
    t.seq.start()
    t.advanceTo(10.6) // 2-bar loop = 4 s at 120 BPM; hits at 2.55, 6.55, 10.55
    expect(t.played.map((n) => n.when)).toEqual(
      [0, 1, 2].map((bar) => expect.closeTo(0.05 + 20 * 0.125 + bar * 4, 9)),
    )
  })

  it('applies edits made during playback to upcoming steps', () => {
    const t = setup()
    t.seq.start()
    t.advanceTo(0.5)
    t.setProject(on(2, 8)) // step 8 is at 1.05, not yet scheduled
    t.advanceTo(1.2)
    expect(t.played.map((n) => n.part)).toEqual([2])
  })

  it('handles the pattern shrinking under the playhead', () => {
    const t = setup((p) => on(0, 0)(setPatternLength(p, p.activePatternId, 2)))
    t.seq.start()
    t.advanceTo(3) // inside bar 2
    t.setProject((p) => setPatternLength(p, p.activePatternId, 1))
    expect(() => t.advanceTo(6)).not.toThrow()
    expect(t.played.length).toBeGreaterThanOrEqual(2)
  })

  it('applies tempo changes from the next step', () => {
    const t = setup((p) => on(0, 0)(on(0, 1)(on(0, 2)(p))))
    t.seq.start()
    t.advanceTo(0.06) // step 0 at 0.05 and step 1 at 0.175 are scheduled
    t.setProject((p) => ({ ...p, bpm: 60 }))
    t.advanceTo(1)
    const times = t.played.map((n) => n.when)
    expect(times[1]! - times[0]!).toBeCloseTo(0.125)
    expect(times[2]! - times[1]!).toBeCloseTo(0.25)
  })

  it('maps velocity and multiple notes', () => {
    const t = setup((p) => {
      let q = on(5, 0)(p)
      q = setStepVelocity(q, q.activePatternId, 5, 0, 0.5)
      const pattern = getActivePattern(q)
      const steps = pattern.tracks[5]!.steps.slice()
      steps[0] = { ...steps[0]!, notes: [36, 43], gate: 0.5 }
      const tracks = pattern.tracks.slice()
      tracks[5] = { steps }
      return { ...q, patterns: [{ ...pattern, tracks }] }
    })
    t.seq.start()
    t.advanceTo(0.1)
    expect(t.played).toEqual([
      { part: 5, velocity: 64, note: 36, when: 0.05, duration: 0.0625 },
      { part: 5, velocity: 64, note: 43, when: 0.05, duration: 0.0625 },
    ])
  })

  it('stop cancels pending notes, releases held ones, and schedules nothing more', () => {
    const t = setup((p) => on(0, 0)(on(0, 8)(p)))
    t.seq.start()
    t.advanceTo(0.5)
    t.seq.stop()
    expect(t.calls).toEqual(['cancelAfter:0.5', 'releaseAll'])
    t.advanceTo(3)
    expect(t.played).toHaveLength(1)
    expect(t.seq.stepAt(3)).toBeNull()
  })

  it('restarts from step 1 on play', () => {
    const t = setup((p) => on(0, 0)(p))
    t.seq.start()
    t.advanceTo(0.7)
    t.seq.stop()
    t.seq.start()
    t.advanceTo(0.8)
    expect(t.played.map((n) => n.when)).toEqual([0.05, expect.closeTo(0.75, 9)])
  })

  it('skips steps missed during a stall instead of bursting them', () => {
    const t = setup((p) => {
      let q = p
      for (let i = 0; i < 16; i++) q = on(0, i)(q)
      return q
    })
    t.seq.start()
    t.advanceTo(0.2)
    const before = t.played.length
    t.jumpTo(1.2) // the scheduler did not run for 1 s
    t.seq.tick()
    const after = t.played.slice(before)
    // Only steps inside [now - 50 ms, now + lookahead] are played, all on the grid.
    expect(after.every((n) => n.when >= 1.15 && n.when < 1.3)).toBe(true)
    after.forEach((n) => expect(((n.when - 0.05) / 0.125) % 1).toBeCloseTo(0, 6))
    expect(t.seq.skippedSteps).toBeGreaterThan(5)
  })

  it('reports the playhead step for a given audio time', () => {
    const t = setup()
    t.seq.start()
    t.advanceTo(1)
    expect(t.seq.stepAt(0.0)).toBeNull()
    expect(t.seq.stepAt(0.05)?.step).toBe(0)
    expect(t.seq.stepAt(0.3)?.step).toBe(2)
    expect(t.seq.stepAt(1.0)?.step).toBe(7)
  })
})
