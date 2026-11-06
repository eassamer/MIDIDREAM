import { describe, expect, it } from 'vitest'
import type { PreferenceStore } from '../persistence/preferences'
import { createMidiStore } from '../state/midiStore'
import { FakeAccess, FakeInput } from './fakeMidi'
import { MidiController, PREF_MIDI_INPUT, PREF_MIDI_MAPPINGS } from './MidiController'
import { MidiManager } from './MidiManager'

function memoryPrefs(initial: Record<string, unknown> = {}): PreferenceStore & {
  data: Record<string, unknown>
} {
  const data = { ...initial }
  return {
    data,
    get: async <T>(k: string) => (k in data ? (data[k] as T) : null),
    set: async (k, v) => {
      data[k] = v
    },
  }
}

async function setup(prefs = memoryPrefs()) {
  const access = new FakeAccess()
  const mpk = new FakeInput('in1', 'MPK mini 3')
  access.ports.push(mpk)
  const store = createMidiStore()
  const controller = new MidiController(
    store,
    prefs,
    new MidiManager(() => Promise.resolve(access)),
  )
  await controller.start()
  return { access, mpk, store, controller, prefs }
}

describe('MidiController', () => {
  it('learns a pad from a real message and persists it', async () => {
    const { mpk, store, controller, prefs } = await setup()
    controller.beginLearn('pad1')
    mpk.send([0x80, 40, 0]) // a release does not complete learning
    expect(store.getState().learning).toBe('pad1')
    mpk.send([0x99, 40, 100])
    expect(store.getState().learning).toBeNull()
    expect(store.getState().mappings.pad1).toEqual({ kind: 'note', channel: 10, note: 40 })
    expect(prefs.data[PREF_MIDI_MAPPINGS]).toEqual({
      version: 1,
      mappings: { pad1: { kind: 'note', channel: 10, note: 40 } },
    })
  })

  it('restores mappings and device from preferences (survives restart)', async () => {
    const first = await setup()
    first.controller.beginLearn('knob3')
    first.mpk.send([0xb0, 72, 10])
    const saved = first.prefs.data

    const second = await setup(memoryPrefs(saved))
    expect(second.store.getState().mappings.knob3).toEqual({
      kind: 'cc',
      channel: 1,
      controller: 72,
    })
    expect(saved[PREF_MIDI_INPUT]).toBe('MPK mini 3')
  })

  it('records activity and values for learned controls', async () => {
    const { mpk, store, controller } = await setup()
    controller.beginLearn('knob1')
    mpk.send([0xb0, 70, 5])
    mpk.send([0xb0, 70, 99])
    expect(store.getState().activity.knob1).toBe(2)
    expect(store.getState().values.knob1).toBe('99')
  })

  it('logs messages in newest-first order and hides realtime by default', async () => {
    const { mpk, store, controller } = await setup()
    mpk.send([0x90, 60, 100])
    mpk.send([0xf8])
    mpk.send([0x80, 60, 0])
    controller.flushLog()
    const log = store.getState().log
    expect(log).toHaveLength(2)
    expect(log[0]!.text).toMatch(/Note Off/)
    expect(log[1]!.text).toMatch(/Note On/)
    controller.dispose()
  })

  it('cancel and clear work', async () => {
    const { mpk, store, controller } = await setup()
    controller.beginLearn('joyX')
    controller.cancelLearn()
    mpk.send([0xe0, 0, 0x50])
    expect(store.getState().mappings.joyX).toBeUndefined()
    controller.beginLearn('joyX')
    mpk.send([0xe0, 0, 0x50])
    controller.clearMapping('joyX')
    expect(store.getState().mappings).toEqual({})
  })
})

describe('knob jobs', () => {
  it('default, change, persist, and restore', async () => {
    const first = await setup()
    expect(first.store.getState().knobJobs.knob7).toBe('tempo')
    first.controller.setKnobJob('knob7', 'partPan')
    const second = await setup(memoryPrefs(first.prefs.data))
    expect(second.store.getState().knobJobs.knob7).toBe('partPan')
    expect(second.store.getState().knobJobs.knob1).toBe('partVolume')
  })
})
