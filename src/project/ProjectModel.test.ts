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
