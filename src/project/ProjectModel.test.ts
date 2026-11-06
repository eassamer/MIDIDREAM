import { describe, expect, it } from 'vitest'
import {
  clearTrack,
  createProject,
  getActivePattern,
  setPartMute,
  setPatternLength,
  toggleStep,
} from './ProjectModel'
import { parseProject, ProjectParseError, serializeProject } from './ProjectSerializer'
import { MAX_PATTERN_BARS, PART_COUNT, STEPS_PER_BAR } from './types'

describe('createProject', () => {
  it('creates eight parts and one 1-bar pattern', () => {
    const project = createProject('Test')
    expect(project.name).toBe('Test')
    expect(project.parts).toHaveLength(PART_COUNT)
    expect(project.parts.map((p) => p.name)).toEqual([
      'KICK',
      'SNARE',
      'CLOSED HH',
      'OPEN HH',
      'PERC',
      'BASS',
      'SYNTH',
      'SAMPLE',
    ])
    const pattern = getActivePattern(project)
    expect(pattern.lengthBars).toBe(1)
    expect(pattern.tracks).toHaveLength(PART_COUNT)
    for (const track of pattern.tracks) expect(track.steps).toHaveLength(STEPS_PER_BAR)
  })

  it('gives hi-hats a shared choke group and pitched parts a synth source', () => {
    const { parts } = createProject()
    expect(parts[2]!.chokeGroup).not.toBeNull()
    expect(parts[2]!.chokeGroup).toBe(parts[3]!.chokeGroup)
    expect(parts[5]!.sound.kind).toBe('synth')
    expect(parts[0]!.sound.kind).toBe('sample')
  })
})

describe('step editing', () => {
  it('toggles a step without mutating the original project', () => {
    const before = createProject()
    const id = before.activePatternId
    const after = toggleStep(before, id, 0, 4)
    expect(getActivePattern(after).tracks[0]!.steps[4]!.active).toBe(true)
    expect(getActivePattern(before).tracks[0]!.steps[4]!.active).toBe(false)
    // Untouched tracks are shared, not copied.
    expect(getActivePattern(after).tracks[1]).toBe(getActivePattern(before).tracks[1])
  })

  it('ignores out-of-range steps', () => {
    const p = createProject()
    const next = toggleStep(p, p.activePatternId, 0, 999)
    expect(getActivePattern(next)).toEqual(getActivePattern(p))
  })

  it('clears a single track', () => {
    let p = createProject()
    p = toggleStep(p, p.activePatternId, 1, 0)
    p = toggleStep(p, p.activePatternId, 2, 0)
    p = clearTrack(p, p.activePatternId, 1)
    const pattern = getActivePattern(p)
    expect(pattern.tracks[1]!.steps.some((s) => s.active)).toBe(false)
    expect(pattern.tracks[2]!.steps[0]!.active).toBe(true)
  })
})

describe('setPatternLength', () => {
  it('grows and shrinks while preserving existing bars', () => {
    let p = createProject()
    p = toggleStep(p, p.activePatternId, 0, 0)
    p = setPatternLength(p, p.activePatternId, 4)
    let pattern = getActivePattern(p)
    expect(pattern.lengthBars).toBe(4)
    expect(pattern.tracks[0]!.steps).toHaveLength(4 * STEPS_PER_BAR)
    expect(pattern.tracks[0]!.steps[0]!.active).toBe(true)

    p = toggleStep(p, p.activePatternId, 0, 40)
    p = setPatternLength(p, p.activePatternId, 2)
    pattern = getActivePattern(p)
    expect(pattern.tracks[0]!.steps).toHaveLength(2 * STEPS_PER_BAR)
    expect(pattern.tracks[0]!.steps[0]!.active).toBe(true)
  })

  it('clamps to 1..16 bars', () => {
    const p = createProject()
    expect(getActivePattern(setPatternLength(p, p.activePatternId, 0)).lengthBars).toBe(1)
    expect(getActivePattern(setPatternLength(p, p.activePatternId, 99)).lengthBars).toBe(
      MAX_PATTERN_BARS,
    )
  })
})

describe('mute', () => {
  it('allows multiple parts to be muted at once', () => {
    let p = createProject()
    p = setPartMute(p, 0, true)
    p = setPartMute(p, 3, true)
    expect(p.parts.filter((x) => x.mute).map((x) => x.index)).toEqual([0, 3])
  })
})

describe('serialization', () => {
  it('round-trips through JSON', () => {
    let p = createProject('Round trip')
    p = toggleStep(p, p.activePatternId, 5, 7)
    p = setPatternLength(p, p.activePatternId, 3)
    expect(parseProject(serializeProject(p))).toEqual(p)
  })

  it('rejects malformed documents', () => {
    expect(() => parseProject('not json')).toThrow(ProjectParseError)
    expect(() => parseProject('{"schemaVersion": 99}')).toThrow(ProjectParseError)
    const p = createProject()
    const broken = { ...p, parts: p.parts.slice(0, 3) }
    expect(() => parseProject(JSON.stringify(broken))).toThrow(/8 parts/)
  })
})

import {
  addPattern,
  deletePattern,
  duplicatePattern,
  neighbourPatternId,
  renamePattern,
  selectPattern,
  setSwing,
  updateStep,
} from './ProjectModel'

describe('step settings and swing', () => {
  it('clamps step patches', () => {
    const p = createProject()
    const next = updateStep(p, p.activePatternId, 0, 3, {
      ratchet: 9,
      probability: 2,
      microtiming: -3,
      velocity: 0,
      accent: true,
    })
    expect(getActivePattern(next).tracks[0]!.steps[3]).toMatchObject({
      ratchet: 4,
      probability: 1,
      microtiming: -0.5,
      velocity: 0.05,
      accent: true,
    })
  })

  it('clamps swing to 0..1', () => {
    expect(setSwing(createProject(), 1.4).swing).toBe(1)
    expect(setSwing(createProject(), 0.333).swing).toBe(0.33)
  })
})

describe('patterns', () => {
  it('adds, duplicates (deep copy), renames, selects, and deletes', () => {
    let p = createProject()
    const first = p.activePatternId
    p = toggleStep(p, first, 0, 0)
    p = duplicatePattern(p, first)
    const copy = p.activePatternId
    expect(p.patterns.map((x) => x.name)).toEqual(['Pattern 1', 'Pattern 1 copy'])
    expect(getActivePattern(p).tracks[0]!.steps[0]!.active).toBe(true)
    // Editing the copy leaves the original alone.
    p = toggleStep(p, copy, 0, 0)
    expect(p.patterns[0]!.tracks[0]!.steps[0]!.active).toBe(true)

    p = addPattern(p)
    expect(p.patterns).toHaveLength(3)
    expect(getActivePattern(p).name).toBe('Pattern 3')
    p = renamePattern(p, p.activePatternId, '  Chorus  ')
    expect(getActivePattern(p).name).toBe('Chorus')
    expect(renamePattern(p, p.activePatternId, '   ')).toBe(p)

    p = selectPattern(p, first)
    expect(p.activePatternId).toBe(first)
    p = deletePattern(p, first)
    expect(p.patterns).toHaveLength(2)
    expect(p.patterns.some((x) => x.id === p.activePatternId)).toBe(true)
  })

  it('never deletes the last pattern', () => {
    const p = createProject()
    expect(deletePattern(p, p.activePatternId)).toBe(p)
  })

  it('finds neighbours with wrap-around', () => {
    let p = addPattern(addPattern(createProject()))
    const ids = p.patterns.map((x) => x.id)
    p = selectPattern(p, ids[0]!)
    expect(neighbourPatternId(p, ids[0]!, 1)).toBe(ids[1])
    expect(neighbourPatternId(p, ids[0]!, -1)).toBe(ids[2])
    expect(neighbourPatternId(p, ids[2]!, 1)).toBe(ids[0])
  })
})

import {
  assignSample,
  assignSynth,
  replaceSampleRef,
  setChokeGroup,
  updateSample,
} from './ProjectModel'

describe('sounds', () => {
  const ref = { id: 'user:1', name: 'Clap', origin: 'user' as const, path: '/clap.wav' }

  it('assigns a sample, resetting trim and reverse but keeping play mode', () => {
    let p = createProject()
    p = updateSample(p, 0, { start: 0.3, end: 0.6, reverse: true, playMode: 'gated' })
    p = assignSample(p, 0, ref)
    expect(p.parts[0]!.sound).toEqual({
      kind: 'sample',
      sample: ref,
      playMode: 'gated',
      start: 0,
      end: 1,
      reverse: false,
    })
  })

  it('turns a synth part into a sample part and back', () => {
    let p = assignSample(createProject(), 5, ref)
    expect(p.parts[5]!.sound).toMatchObject({ kind: 'sample', playMode: 'one-shot' })
    p = assignSynth(p, 5, 'square')
    expect(p.parts[5]!.sound).toEqual({ kind: 'synth', waveform: 'square' })
    expect(updateSample(p, 5, { start: 0.5 })).toBe(p) // no-op on synth parts
  })

  it('never lets start and end cross', () => {
    let p = createProject()
    p = updateSample(p, 0, { start: 0.7, end: 0.4 })
    const s = p.parts[0]!.sound
    expect(s.kind === 'sample' && s.end - s.start).toBeGreaterThan(0)
    p = updateSample(createProject(), 0, { end: 0.2 })
    p = updateSample(p, 0, { start: 0.5 })
    const t = p.parts[0]!.sound
    expect(t.kind === 'sample' && [t.start, t.end]).toEqual([0.5, expect.closeTo(0.501, 6)])
  })

  it('sets choke groups and repoints relinked samples', () => {
    let p = setChokeGroup(createProject(), 4, 2)
    expect(p.parts[4]!.chokeGroup).toBe(2)
    p = setChokeGroup(p, 4, null)
    expect(p.parts[4]!.chokeGroup).toBeNull()

    p = assignSample(p, 1, ref)
    const moved = { ...ref, path: '/moved/clap.wav' }
    p = replaceSampleRef(p, moved)
    expect(p.parts[1]!.sound).toMatchObject({ sample: moved })
    expect(replaceSampleRef(p, { ...ref, id: 'user:none' })).toBe(p)
  })
})
