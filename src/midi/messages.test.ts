import { describe, expect, it } from 'vitest'
import { isRealtime, noteName, parseMidiMessage } from './messages'

describe('parseMidiMessage', () => {
  it('parses note on with channel 1..16 and velocity', () => {
    expect(parseMidiMessage([0x90, 60, 100], 5)).toEqual({
      type: 'noteon',
      channel: 1,
      note: 60,
      velocity: 100,
      time: 5,
    })
    expect(parseMidiMessage([0x99, 36, 127])).toMatchObject({ type: 'noteon', channel: 10 })
  })

  it('treats note on with velocity 0 as note off', () => {
    expect(parseMidiMessage([0x90, 60, 0])).toMatchObject({
      type: 'noteoff',
      note: 60,
      velocity: 0,
    })
    expect(parseMidiMessage([0x80, 60, 64])).toMatchObject({ type: 'noteoff', velocity: 64 })
  })

  it('parses CC, program change, pressure', () => {
    expect(parseMidiMessage([0xb0, 70, 12])).toMatchObject({
      type: 'cc',
      controller: 70,
      value: 12,
    })
    expect(parseMidiMessage([0xc1, 5])).toMatchObject({ type: 'program', channel: 2, program: 5 })
    expect(parseMidiMessage([0xd0, 40])).toMatchObject({ type: 'channelpressure', pressure: 40 })
  })

  it('parses 14-bit pitch bend centered at 0', () => {
    expect(parseMidiMessage([0xe0, 0x00, 0x40])).toMatchObject({ type: 'pitchbend', value: 0 })
    expect(parseMidiMessage([0xe0, 0x00, 0x00])).toMatchObject({ value: -8192 })
    expect(parseMidiMessage([0xe0, 0x7f, 0x7f])).toMatchObject({ value: 8191 })
  })

  it('flags realtime system messages and ignores data-only bytes', () => {
    const clock = parseMidiMessage([0xf8])!
    expect(clock.type).toBe('system')
    expect(isRealtime(clock)).toBe(true)
    expect(isRealtime(parseMidiMessage([0x90, 1, 1])!)).toBe(false)
    expect(parseMidiMessage([0x40, 0x10])).toBeNull()
    expect(parseMidiMessage([])).toBeNull()
  })

  it('names notes with C3 = 60', () => {
    expect(noteName(60)).toBe('C3')
    expect(noteName(61)).toBe('C#3')
    expect(noteName(36)).toBe('C1')
  })
})
