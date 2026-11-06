import { describe, expect, it } from 'vitest'
import {
  MAPPINGS_SCHEMA_VERSION,
  assignBinding,
  bindingFromEvent,
  clearBinding,
  matchEvent,
  sanitizeMappings,
  type MidiMappings,
} from './mapping'
import { parseMidiMessage, type MidiEvent } from './messages'

const ev = (...bytes: number[]) => parseMidiMessage(bytes) as MidiEvent

describe('bindingFromEvent', () => {
  it('learns pads from note on, positive CC, or program change, not note off', () => {
    expect(bindingFromEvent('pad', ev(0x99, 36, 90))).toEqual({
      kind: 'note',
      channel: 10,
      note: 36,
    })
    expect(bindingFromEvent('pad', ev(0x89, 36, 0))).toBeNull()
    expect(bindingFromEvent('pad', ev(0xb0, 20, 127))).toEqual({
      kind: 'cc',
      channel: 1,
      controller: 20,
    })
    expect(bindingFromEvent('pad', ev(0xb0, 20, 0))).toBeNull()
    expect(bindingFromEvent('pad', ev(0xc0, 3))).toEqual({
      kind: 'program',
      channel: 1,
      program: 3,
    })
  })

  it('learns knobs only from CC', () => {
    expect(bindingFromEvent('knob', ev(0xb0, 70, 0))).toEqual({
      kind: 'cc',
      channel: 1,
      controller: 70,
    })
    expect(bindingFromEvent('knob', ev(0x90, 60, 100))).toBeNull()
  })

  it('learns joystick from pitch bend or CC and keyboard from note channel', () => {
    expect(bindingFromEvent('joystick', ev(0xe0, 0, 0x50))).toEqual({
      kind: 'pitchbend',
      channel: 1,
    })
    expect(bindingFromEvent('joystick', ev(0xb0, 1, 64))).toEqual({
      kind: 'cc',
      channel: 1,
      controller: 1,
    })
    expect(bindingFromEvent('keyboard', ev(0x90, 48, 80))).toEqual({
      kind: 'note-channel',
      channel: 1,
    })
  })
})

describe('matchEvent', () => {
  const mappings: MidiMappings = {
    pad1: { kind: 'note', channel: 1, note: 36 },
    knob1: { kind: 'cc', channel: 1, controller: 70 },
    keyboard: { kind: 'note-channel', channel: 1 },
    joyX: { kind: 'pitchbend', channel: 1 },
  }

  it('routes pad notes to the pad, not the keyboard, even on a shared channel', () => {
    expect(matchEvent(mappings, ev(0x90, 36, 100))).toEqual(['pad1'])
    expect(matchEvent(mappings, ev(0x80, 36, 0))).toEqual(['pad1'])
  })

  it('routes other notes on the keyboard channel to the keyboard', () => {
    expect(matchEvent(mappings, ev(0x90, 60, 100))).toEqual(['keyboard'])
    expect(matchEvent(mappings, ev(0x91, 60, 100))).toEqual([])
  })

  it('matches CC and pitch bend by channel', () => {
    expect(matchEvent(mappings, ev(0xb0, 70, 5))).toEqual(['knob1'])
    expect(matchEvent(mappings, ev(0xb1, 70, 5))).toEqual([])
    expect(matchEvent(mappings, ev(0xe0, 0, 0x60))).toEqual(['joyX'])
  })
})

describe('assignBinding / clearBinding', () => {
  it('moves a control to a new target instead of duplicating it', () => {
    let m: MidiMappings = { pad1: { kind: 'note', channel: 10, note: 36 } }
    m = assignBinding(m, 'pad2', { kind: 'note', channel: 10, note: 36 })
    expect(m).toEqual({ pad2: { kind: 'note', channel: 10, note: 36 } })
    m = clearBinding(m, 'pad2')
    expect(m).toEqual({})
  })
})

describe('sanitizeMappings', () => {
  it('keeps valid bindings, drops malformed ones and unknown targets', () => {
    const out = sanitizeMappings({
      version: MAPPINGS_SCHEMA_VERSION,
      mappings: {
        pad1: { kind: 'note', channel: 10, note: 36, extra: 'x' },
        pad2: { kind: 'note', channel: 0, note: 36 },
        knob1: { kind: 'cc', channel: 1, controller: 300 },
        joyX: { kind: 'pitchbend', channel: 1 },
        bogus: { kind: 'cc', channel: 1, controller: 1 },
      },
    })
    expect(out).toEqual({
      pad1: { kind: 'note', channel: 10, note: 36 },
      joyX: { kind: 'pitchbend', channel: 1 },
    })
  })

  it('ignores wrong versions and junk', () => {
    expect(sanitizeMappings(null)).toEqual({})
    expect(sanitizeMappings({ version: 99, mappings: {} })).toEqual({})
  })
})
