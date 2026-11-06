import { describe, expect, it } from 'vitest'
import { DEFAULT_KNOB_JOBS } from '../midi/knobJobs'
import { matchEvent, type MidiMappings } from '../midi/mapping'
import { parseMidiMessage, type MidiEvent } from '../midi/messages'
import { padModeFromValue, routeControl, type RoutingState } from './controlRouting'

// An example MPK-like layout. Numbers here are test data, not assumptions
// baked into the app: real bindings always come from MIDI Learn.
const mappings: MidiMappings = {
  pad1: { kind: 'note', channel: 10, note: 36 },
  pad2: { kind: 'note', channel: 10, note: 37 },
  btnPlay: { kind: 'note', channel: 10, note: 44 },
  btnPadMode: { kind: 'note', channel: 10, note: 45 },
  btnKeyMode: { kind: 'cc', channel: 1, controller: 20 },
  btnBarPrev: { kind: 'note', channel: 10, note: 46 },
  btnBarNext: { kind: 'note', channel: 10, note: 47 },
  btnClearPart: { kind: 'note', channel: 10, note: 48 },
  btnPanic: { kind: 'program', channel: 10, program: 7 },
  btnAccent: { kind: 'note', channel: 10, note: 49 },
  btnPatPrev: { kind: 'note', channel: 10, note: 50 },
  btnPatNext: { kind: 'note', channel: 10, note: 51 },
  btnPatDup: { kind: 'note', channel: 10, note: 52 },
  knob4: { kind: 'cc', channel: 1, controller: 73 },
  knob5: { kind: 'cc', channel: 1, controller: 74 },
  knob1: { kind: 'cc', channel: 1, controller: 70 },
  knob2: { kind: 'cc', channel: 1, controller: 71 },
  knob3: { kind: 'cc', channel: 1, controller: 72 },
  knob6: { kind: 'cc', channel: 1, controller: 75 },
  knob7: { kind: 'cc', channel: 1, controller: 76 },
  knob8: { kind: 'cc', channel: 1, controller: 77 },
  stepKeys: { kind: 'note-range', channel: 1, note: 48, count: 16 },
  keyboard: { kind: 'note-channel', channel: 1 },
}

const base: RoutingState = {
  padMode: 'trigger',
  keyMode: 'play',
  selectedPart: 2,
  visibleBar: 0,
  lengthBars: 2,
  mappings,
  knobJobs: DEFAULT_KNOB_JOBS,
}

const ev = (...bytes: number[]) => parseMidiMessage(bytes) as MidiEvent

function route(bytes: number[], state: Partial<RoutingState> = {}) {
  const e = ev(...bytes)
  return routeControl(matchEvent(mappings, e), e, { ...base, ...state })
}

describe('pads', () => {
  it('trigger mode plays the part with the pad velocity and releases on note-off', () => {
    expect(route([0x99, 36, 90])).toEqual([{ type: 'trigger', part: 0, velocity: 90 }])
    expect(route([0x89, 36, 0])).toEqual([{ type: 'release', part: 0 }])
  })

  it('mute mode toggles mute on press only; several parts can be muted', () => {
    expect(route([0x99, 36, 90], { padMode: 'mute' })).toEqual([{ type: 'toggleMute', part: 0 }])
    expect(route([0x99, 37, 90], { padMode: 'mute' })).toEqual([{ type: 'toggleMute', part: 1 }])
    expect(route([0x89, 36, 0], { padMode: 'mute' })).toEqual([])
  })

  it('select mode selects the part', () => {
    expect(route([0x99, 37, 90], { padMode: 'select' })).toEqual([{ type: 'selectPart', part: 1 }])
  })
})

describe('function buttons', () => {
  it('act on press, not release', () => {
    expect(route([0x99, 44, 100])).toEqual([{ type: 'togglePlay' }])
    expect(route([0x89, 44, 0])).toEqual([])
    expect(route([0xc9, 7])).toEqual([{ type: 'panic' }])
  })

  it('cycle pad mode and toggle keys mode (CC buttons too)', () => {
    expect(route([0x99, 45, 100])).toEqual([{ type: 'setPadMode', mode: 'mute' }])
    expect(route([0x99, 45, 100], { padMode: 'select' })).toEqual([
      { type: 'setPadMode', mode: 'trigger' },
    ])
    expect(route([0xb0, 20, 127])).toEqual([{ type: 'setKeyMode', mode: 'step' }])
    expect(route([0xb0, 20, 0])).toEqual([])
    expect(route([0xb0, 20, 127], { keyMode: 'step' })).toEqual([
      { type: 'setKeyMode', mode: 'play' },
    ])
  })

  it('move between bars within the pattern and clear the selected part', () => {
    expect(route([0x99, 47, 100])).toEqual([{ type: 'setVisibleBar', bar: 1 }])
    expect(route([0x99, 47, 100], { visibleBar: 1 })).toEqual([{ type: 'setVisibleBar', bar: 1 }])
    expect(route([0x99, 46, 100])).toEqual([{ type: 'setVisibleBar', bar: 0 }])
    expect(route([0x99, 48, 100])).toEqual([{ type: 'clearPart', part: 2 }])
  })
})

describe('keys', () => {
  it('play mode: step keys and other keys play notes', () => {
    expect(route([0x90, 50, 80])).toEqual([{ type: 'keyOn', note: 50, velocity: 80 }])
    expect(route([0x80, 50, 0])).toEqual([{ type: 'keyOff', note: 50 }])
    expect(route([0x90, 70, 80])).toEqual([{ type: 'keyOn', note: 70, velocity: 80 }])
  })

  it('step mode: step keys press/release the step on the visible bar', () => {
    expect(route([0x90, 48, 100], { keyMode: 'step' })).toEqual([
      { type: 'stepKeyDown', part: 2, step: 0, velocity: 100 },
    ])
    expect(route([0x90, 63, 30], { keyMode: 'step', visibleBar: 1 })).toEqual([
      { type: 'stepKeyDown', part: 2, step: 31, velocity: 30 },
    ])
    expect(route([0x80, 48, 0], { keyMode: 'step' })).toEqual([
      { type: 'stepKeyUp', part: 2, step: 0 },
    ])
  })

  it('step mode: keys outside the 16 still play', () => {
    expect(route([0x90, 64, 80], { keyMode: 'step' })).toEqual([
      { type: 'keyOn', note: 64, velocity: 80 },
    ])
  })
})

describe('knobs', () => {
  it('drive the selected part, tempo, master, and pad mode', () => {
    expect(route([0xb0, 70, 127])).toEqual([{ type: 'setPartVolume', part: 2, volume: 1 }])
    expect(route([0xb0, 71, 0])).toEqual([{ type: 'setPartPan', part: 2, pan: -1 }])
    expect(route([0xb0, 71, 64])).toEqual([{ type: 'setPartPan', part: 2, pan: 0 }])
    expect(route([0xb0, 72, 127])).toEqual([{ type: 'setPartPitch', part: 2, semitones: 24 }])
    expect(route([0xb0, 76, 0])).toEqual([{ type: 'setTempo', bpm: 60 }])
    expect(route([0xb0, 76, 127])).toEqual([{ type: 'setTempo', bpm: 200 }])
    expect(route([0xb0, 77, 0])).toEqual([{ type: 'setMasterVolume', volume: 0 }])
    expect(route([0xb0, 75, 64])).toEqual([{ type: 'setPadMode', mode: 'mute' }])
    expect(route([0xb0, 75, 64], { padMode: 'mute' })).toEqual([]) // no repeat
  })

  it('respects a changed job and "nothing"', () => {
    const knobJobs = { ...DEFAULT_KNOB_JOBS, knob1: 'tempo' as const, knob2: 'none' as const }
    expect(route([0xb0, 70, 127], { knobJobs })).toEqual([{ type: 'setTempo', bpm: 200 }])
    expect(route([0xb0, 71, 50], { knobJobs })).toEqual([])
  })

  it('splits the pad-mode knob into three zones', () => {
    expect([0, 42, 43, 85, 86, 127].map(padModeFromValue)).toEqual([
      'trigger',
      'trigger',
      'mute',
      'mute',
      'select',
      'select',
    ])
  })
})

describe('groove and pattern controls', () => {
  it('pattern and accent buttons', () => {
    expect(route([0x99, 49, 100])).toEqual([{ type: 'toggleAccent' }])
    expect(route([0x99, 50, 100])).toEqual([{ type: 'stepPattern', offset: -1 }])
    expect(route([0x99, 51, 100])).toEqual([{ type: 'stepPattern', offset: 1 }])
    expect(route([0x99, 52, 100])).toEqual([{ type: 'duplicatePattern' }])
  })

  it('default K4 edits step probability and K5 sets swing', () => {
    expect(route([0xb0, 73, 127])).toEqual([
      { type: 'editFocusedStep', job: 'stepProbability', value: 1 },
    ])
    expect(route([0xb0, 74, 0])).toEqual([{ type: 'setSwing', swing: 0 }])
  })
})
