import type { KnobJob, KnobJobs, StepKnobJob } from '../midi/knobJobs'
import type { ControlBinding, KnobId, LearnTargetId, MidiMappings } from '../midi/mapping'
import type { MidiEvent } from '../midi/messages'
import { STEPS_PER_BAR, type PartIndex } from '../project/types'
import { PAD_MODES, type KeyMode, type PadMode } from '../state/controlStore'

/**
 * Pure translation from "a learned control sent this message" to app
 * actions, given the current modes. No side effects, so every rule here is
 * unit-tested; src/app/wiring.ts executes the returned actions.
 */

export interface RoutingState {
  padMode: PadMode
  keyMode: KeyMode
  selectedPart: PartIndex
  visibleBar: number
  lengthBars: number
  mappings: MidiMappings
  knobJobs: KnobJobs
}

export type AppAction =
  | { type: 'trigger'; part: PartIndex; velocity: number }
  | { type: 'release'; part: PartIndex }
  /** Keyboard note; the executor decides the part (selected part at note-on). */
  | { type: 'keyOn'; note: number; velocity: number }
  | { type: 'keyOff'; note: number }
  | { type: 'toggleMute'; part: PartIndex }
  | { type: 'selectPart'; part: PartIndex }
  /** Step key pressed: focus the step; a tap (no knob turned) toggles it on release. */
  | { type: 'stepKeyDown'; part: PartIndex; step: number; velocity: number }
  | { type: 'stepKeyUp'; part: PartIndex; step: number }
  /** Knob edit of the focused step; `value` is 0..1 from the knob. */
  | { type: 'editFocusedStep'; job: StepKnobJob; value: number }
  | { type: 'toggleAccent' }
  | { type: 'setSwing'; swing: number }
  /** Change pattern by offset (queued to loop end while playing). */
  | { type: 'stepPattern'; offset: number }
  | { type: 'duplicatePattern' }
  | { type: 'stepSound'; offset: number }
  /** Absolute knob position (0..1) across the sound list. */
  | { type: 'pickSound'; value: number }
  | { type: 'setSampleStart'; part: PartIndex; value: number }
  | { type: 'setSampleEnd'; part: PartIndex; value: number }
  | { type: 'togglePlay' }
  | { type: 'panic' }
  | { type: 'setPadMode'; mode: PadMode }
  | { type: 'setKeyMode'; mode: KeyMode }
  | { type: 'setVisibleBar'; bar: number }
  | { type: 'clearPart'; part: PartIndex }
  | { type: 'setPartVolume'; part: PartIndex; volume: number }
  | { type: 'setPartPan'; part: PartIndex; pan: number }
  | { type: 'setPartPitch'; part: PartIndex; semitones: number }
  | { type: 'setTempo'; bpm: number }
  | { type: 'setMasterVolume'; volume: number }

/** A "button press": note-on, a CC rising above 0, or a program change. */
function isPress(e: MidiEvent): boolean {
  return e.type === 'noteon' || (e.type === 'cc' && e.value > 0) || e.type === 'program'
}

function isRelease(e: MidiEvent): boolean {
  return e.type === 'noteoff' || (e.type === 'cc' && e.value === 0)
}

function pressVelocity(e: MidiEvent): number {
  if (e.type === 'noteon') return e.velocity
  if (e.type === 'cc') return e.value
  return 100
}

export function padModeFromValue(value: number): PadMode {
  return PAD_MODES[Math.min(PAD_MODES.length - 1, Math.floor((value / 128) * PAD_MODES.length))]!
}

export function routeControl(
  targets: LearnTargetId[],
  e: MidiEvent,
  state: RoutingState,
): AppAction[] {
  const actions: AppAction[] = []

  // Step keys are also keyboard keys; the keys mode decides which they are.
  if (targets.includes('stepKeys') && state.keyMode === 'step') {
    if (e.type !== 'noteon' && e.type !== 'noteoff') return actions
    const binding = state.mappings.stepKeys as Extract<ControlBinding, { kind: 'note-range' }>
    const step = state.visibleBar * STEPS_PER_BAR + (e.note - binding.note)
    const part = state.selectedPart
    if (e.type === 'noteon') actions.push({ type: 'stepKeyDown', part, step, velocity: e.velocity })
    else if (e.type === 'noteoff') actions.push({ type: 'stepKeyUp', part, step })
    return actions
  }
  if (targets.includes('stepKeys') || targets.includes('keyboard')) {
    if (e.type === 'noteon') actions.push({ type: 'keyOn', note: e.note, velocity: e.velocity })
    else if (e.type === 'noteoff') actions.push({ type: 'keyOff', note: e.note })
    return actions
  }

  for (const target of targets) {
    const pad = /^pad([1-8])$/.exec(target)
    if (pad) {
      const part = (Number(pad[1]) - 1) as PartIndex
      if (state.padMode === 'trigger') {
        if (isPress(e)) actions.push({ type: 'trigger', part, velocity: pressVelocity(e) })
        else if (isRelease(e)) actions.push({ type: 'release', part })
      } else if (isPress(e)) {
        actions.push(
          state.padMode === 'mute' ? { type: 'toggleMute', part } : { type: 'selectPart', part },
        )
      }
      continue
    }

    if (/^knob[1-8]$/.test(target)) {
      if (e.type === 'cc') {
        const action = knobAction(state.knobJobs[target as KnobId], e.value, state)
        if (action) actions.push(action)
      }
      continue
    }

    if (!isPress(e)) continue
    switch (target) {
      case 'btnPlay':
        actions.push({ type: 'togglePlay' })
        break
      case 'btnPanic':
        actions.push({ type: 'panic' })
        break
      case 'btnPadMode': {
        const next = PAD_MODES[(PAD_MODES.indexOf(state.padMode) + 1) % PAD_MODES.length]!
        actions.push({ type: 'setPadMode', mode: next })
        break
      }
      case 'btnKeyMode':
        actions.push({ type: 'setKeyMode', mode: state.keyMode === 'play' ? 'step' : 'play' })
        break
      case 'btnBarPrev':
        actions.push({ type: 'setVisibleBar', bar: Math.max(0, state.visibleBar - 1) })
        break
      case 'btnBarNext':
        actions.push({
          type: 'setVisibleBar',
          bar: Math.min(state.lengthBars - 1, state.visibleBar + 1),
        })
        break
      case 'btnClearPart':
        actions.push({ type: 'clearPart', part: state.selectedPart })
        break
      case 'btnAccent':
        actions.push({ type: 'toggleAccent' })
        break
      case 'btnPatPrev':
        actions.push({ type: 'stepPattern', offset: -1 })
        break
      case 'btnPatNext':
        actions.push({ type: 'stepPattern', offset: 1 })
        break
      case 'btnPatDup':
        actions.push({ type: 'duplicatePattern' })
        break
      case 'btnSoundPrev':
        actions.push({ type: 'stepSound', offset: -1 })
        break
      case 'btnSoundNext':
        actions.push({ type: 'stepSound', offset: 1 })
        break
    }
  }
  return actions
}

/** Absolute knob value (0..127) -> action for its job. */
function knobAction(job: KnobJob, value: number, state: RoutingState): AppAction | null {
  const v = value / 127
  const part = state.selectedPart
  switch (job) {
    case 'none':
      return null
    case 'partVolume':
      return { type: 'setPartVolume', part, volume: v }
    case 'partPan': {
      const pan = v * 2 - 1
      return { type: 'setPartPan', part, pan: Math.abs(pan) < 0.02 ? 0 : pan }
    }
    case 'partPitch':
      return { type: 'setPartPitch', part, semitones: Math.round(v * 48 - 24) }
    case 'padMode': {
      const mode = padModeFromValue(value)
      return mode === state.padMode ? null : { type: 'setPadMode', mode }
    }
    case 'tempo':
      return { type: 'setTempo', bpm: Math.round(60 + v * 140) }
    case 'masterVolume':
      return { type: 'setMasterVolume', volume: v }
    case 'swing':
      return { type: 'setSwing', swing: v }
    case 'sampleBrowse':
      return { type: 'pickSound', value: v }
    case 'sampleStart':
      return { type: 'setSampleStart', part, value: v }
    case 'sampleEnd':
      return { type: 'setSampleEnd', part, value: v }
    case 'stepVelocity':
    case 'stepProbability':
    case 'stepRatchet':
    case 'stepMicro':
      return { type: 'editFocusedStep', job, value: v }
  }
}
