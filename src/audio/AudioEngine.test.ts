import { describe, expect, it } from 'vitest'
import { createProject, updatePart } from '../project/ProjectModel'
import type { Part, PartIndex } from '../project/types'
import { AudioEngine } from './AudioEngine'
import { BUILTIN_SAMPLE_IDS, renderBuiltinSample } from './builtinSamples'
import { FakeAudioContext, FakeBufferSource, FakeOscillator } from './fakeAudio'
import { isAudible, midiToHz, semitonesToRate, velocityToGain } from './voiceMath'

function setup(mutate?: (parts: Part[]) => Part[]) {
  const ctx = new FakeAudioContext()
  const engine = new AudioEngine(() => ctx as unknown as BaseAudioContext)
  engine.start()
  let project = createProject()
  if (mutate) project = { ...project, parts: mutate(project.parts) }
  engine.setParts(project.parts)
  return { ctx, engine, project }
}

const KICK = 0 as PartIndex
const CLOSED_HH = 2 as PartIndex
const OPEN_HH = 3 as PartIndex
const BASS = 5 as PartIndex

describe('voiceMath', () => {
  it('converts pitch and velocity', () => {
    expect(midiToHz(69)).toBeCloseTo(440)
    expect(midiToHz(57)).toBeCloseTo(220)
    expect(semitonesToRate(12)).toBeCloseTo(2)
    expect(velocityToGain(127)).toBeCloseTo(1)
    expect(velocityToGain(0)).toBe(0)
    expect(velocityToGain(64)).toBeGreaterThan(0.3)
  })

  it('applies mute and solo', () => {
    const [a, b] = createProject().parts as [Part, Part]
    expect(isAudible(a, false)).toBe(true)
    expect(isAudible({ ...a, mute: true }, false)).toBe(false)
    expect(isAudible(a, true)).toBe(false)
    expect(isAudible({ ...b, solo: true }, true)).toBe(true)
  })
})

describe('built-in samples', () => {
  it('are deterministic, audible, and never clip', () => {
    for (const id of BUILTIN_SAMPLE_IDS) {
      const a = renderBuiltinSample(id, 48000)
      const b = renderBuiltinSample(id, 48000)
      expect(a).toEqual(b)
      const peak = a.reduce((m, s) => Math.max(m, Math.abs(s)), 0)
      expect(peak, id).toBeGreaterThan(0.05)
      expect(peak, id).toBeLessThanOrEqual(1)
      expect(Math.abs(a[0]!), `${id} starts silent`).toBeLessThan(1e-6)
    }
  })
})

describe('AudioEngine', () => {
  it('starts and reports stats', () => {
    const { engine } = setup()
    expect(engine.getStats()).toMatchObject({
      status: 'running',
      sampleRate: 48000,
      baseLatency: 0.005,
    })
  })

  it('plays a sample part with pitch applied', () => {
    const { ctx, engine } = setup((parts) => {
      parts[KICK] = { ...parts[KICK]!, pitchSemitones: 12 }
      return parts
    })
    engine.trigger(KICK, 100)
    const src = ctx.sources[0] as FakeBufferSource
    expect(src).toBeInstanceOf(FakeBufferSource)
    expect(src.buffer).not.toBeNull()
    expect(src.playbackRate.value).toBeCloseTo(2)
    expect(src.startedAt).toBeGreaterThan(0) // scheduled slightly ahead, never in the past
    expect(engine.activeVoices(KICK)).toBe(1)
  })

  it('plays several parts at once', () => {
    const { ctx, engine } = setup()
    for (let i = 0; i < 8; i++) engine.trigger(i as PartIndex, 100)
    expect(ctx.sources).toHaveLength(8)
    expect(ctx.sources.filter((s) => s instanceof FakeOscillator)).toHaveLength(2)
  })

  it('ignores velocity 0, muted parts, and non-soloed parts', () => {
    const { ctx, engine, project } = setup()
    engine.trigger(KICK, 0)
    engine.setParts(updatePart(project, KICK, { mute: true }).parts)
    engine.trigger(KICK, 100)
    engine.setParts(updatePart(project, BASS, { solo: true }).parts)
    engine.trigger(KICK, 100)
    expect(ctx.sources).toHaveLength(0)
    engine.trigger(BASS, 100)
    expect(ctx.sources).toHaveLength(1)
  })

  it('synth voices sustain until released, then stop after the release time', () => {
    const { ctx, engine } = setup()
    engine.trigger(BASS, 100, 40)
    const osc = ctx.sources[0] as FakeOscillator
    expect(osc.frequency.value).toBeCloseTo(midiToHz(40))
    expect(osc.stoppedAt).toBeNull()
    engine.release(BASS, 41) // different note: no effect
    expect(osc.stoppedAt).toBeNull()
    engine.release(BASS, 40)
    expect(osc.stoppedAt).toBeGreaterThan(0.1) // default release is 0.1 s
  })

  it('muting a part cuts its held voices immediately (no stuck notes)', () => {
    const { ctx, engine, project } = setup()
    engine.trigger(BASS, 100)
    engine.setParts(updatePart(project, BASS, { mute: true }).parts)
    const osc = ctx.sources[0] as FakeOscillator
    expect(osc.stoppedAt).not.toBeNull()
    expect(osc.stoppedAt!).toBeLessThan(0.05)
    expect(engine.activeVoices(BASS)).toBe(0)
  })

  it('one-shots ignore note-off but stop on panic', () => {
    const { ctx, engine } = setup()
    engine.trigger(KICK, 100)
    engine.trigger(BASS, 100)
    engine.release(KICK)
    expect(ctx.sources[0]!.stoppedAt).toBeNull()
    engine.panic()
    expect(ctx.sources.every((s) => s.stoppedAt !== null)).toBe(true)
    expect(engine.activeVoices(KICK) + engine.activeVoices(BASS)).toBe(0)
  })

  it('hi-hats choke each other', () => {
    const { ctx, engine } = setup()
    engine.trigger(OPEN_HH, 100)
    engine.trigger(CLOSED_HH, 100)
    expect(ctx.sources[0]!.stoppedAt).not.toBeNull()
    expect(ctx.sources[1]!.stoppedAt).toBeNull()
  })

  it('caps polyphony per part by stealing the oldest voice', () => {
    const { ctx, engine } = setup()
    for (let i = 0; i < 20; i++) engine.trigger(BASS, 100, 40 + i)
    expect(engine.activeVoices(BASS)).toBe(16)
    expect(ctx.sources.slice(0, 4).every((s) => s.stoppedAt !== null)).toBe(true)
  })

  it('cleans up finished voices', () => {
    const { ctx, engine } = setup()
    engine.trigger(KICK, 100)
    ctx.sources[0]!.end()
    expect(engine.activeVoices(KICK)).toBe(0)
  })

  it('reverse and trim select the right region', () => {
    const { ctx, engine } = setup((parts) => {
      const kick = parts[KICK]!
      if (kick.sound.kind === 'sample') {
        parts[KICK] = { ...kick, sound: { ...kick.sound, start: 0.25, end: 0.5, reverse: true } }
      }
      return parts
    })
    engine.trigger(KICK, 100)
    const src = ctx.sources[0] as FakeBufferSource
    const dur = src.buffer.duration as number
    expect(src.startArgs[1]).toBeCloseTo(0.5 * dur) // reversed: region starts at 1 - end
    expect(src.startArgs[2]).toBeCloseTo(0.25 * dur)
  })

  it('send() routes typed commands', () => {
    const { ctx, engine } = setup()
    engine.send({ type: 'trigger', part: BASS, velocity: 90, note: 50 })
    engine.send({ type: 'release', part: BASS, note: 50 })
    expect(ctx.sources[0]!.stoppedAt).not.toBeNull()
    engine.send({ type: 'setMasterVolume', volume: 2 })
    engine.send({ type: 'panic' })
  })

  it('reads a master peak', () => {
    const { engine } = setup()
    expect(engine.readPeak()).toBeCloseTo(0.25)
  })
})

describe('AudioEngine sequenced notes', () => {
  it('releases a timed synth note after its duration', () => {
    const { ctx, engine } = setup()
    engine.trigger(BASS, 100, 40, 1, 0.25)
    const osc = ctx.sources[0] as FakeOscillator
    expect(osc.startedAt).toBe(1)
    // release starts at 1.25 and lasts the part's release time (0.1 s)
    expect(osc.stoppedAt).toBeCloseTo(1.25 + 0.1 + 0.01)
  })

  it('cancelAfter silences voices scheduled in the future but not ones already playing', () => {
    const { ctx, engine } = setup()
    ctx.currentTime = 1
    engine.trigger(KICK, 100, undefined, 1.0)
    engine.trigger(KICK, 100, undefined, 1.3)
    engine.cancelAfter(1.1)
    const [now, later] = ctx.sources
    expect(now!.stoppedAt).toBeNull()
    expect(later!.stoppedAt).not.toBeNull()
    expect(engine.activeVoices(KICK)).toBe(1)
  })
})
