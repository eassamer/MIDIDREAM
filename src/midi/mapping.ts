import type { MidiEvent } from './messages'

/**
 * Hardware control mapping model. Nothing here assumes MPK Mini note or CC
 * numbers: every binding is created from a message the user actually sent.
 */

/** A physical control, identified by the messages it sends. */
export type ControlBinding =
  | { kind: 'note'; channel: number; note: number }
  | { kind: 'cc'; channel: number; controller: number }
  | { kind: 'program'; channel: number; program: number }
  | { kind: 'pitchbend'; channel: number }
  /** The keyboard: any note on this channel not claimed by a pad. */
  | { kind: 'note-channel'; channel: number }

export type PadId = `pad${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
export type KnobId = `knob${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`
export type LearnTargetId = PadId | KnobId | 'joyX' | 'joyY' | 'keyboard'

export type LearnTargetKind = 'pad' | 'knob' | 'joystick' | 'keyboard'

export interface LearnTarget {
  id: LearnTargetId
  label: string
  kind: LearnTargetKind
}

const range8 = [1, 2, 3, 4, 5, 6, 7, 8] as const

export const LEARN_TARGETS: readonly LearnTarget[] = [
  ...range8.map((n): LearnTarget => ({ id: `pad${n}`, label: `Pad ${n}`, kind: 'pad' })),
  ...range8.map((n): LearnTarget => ({ id: `knob${n}`, label: `Knob ${n}`, kind: 'knob' })),
  { id: 'joyX', label: 'Joystick X', kind: 'joystick' },
  { id: 'joyY', label: 'Joystick Y', kind: 'joystick' },
  { id: 'keyboard', label: 'Keyboard', kind: 'keyboard' },
]

export type MidiMappings = Partial<Record<LearnTargetId, ControlBinding>>

export const MAPPINGS_SCHEMA_VERSION = 1

export interface StoredMappings {
  version: typeof MAPPINGS_SCHEMA_VERSION
  mappings: MidiMappings
}

export function getTarget(id: LearnTargetId): LearnTarget {
  return LEARN_TARGETS.find((t) => t.id === id)!
}

/**
 * Turn an incoming event into a binding for the target being learned, or
 * null if the event is not a sensible way to identify that kind of control.
 * Note-offs and zero-value CCs are ignored so releasing a pad does not count.
 */
export function bindingFromEvent(kind: LearnTargetKind, e: MidiEvent): ControlBinding | null {
  switch (kind) {
    case 'pad':
      if (e.type === 'noteon') return { kind: 'note', channel: e.channel, note: e.note }
      if (e.type === 'cc' && e.value > 0)
        return { kind: 'cc', channel: e.channel, controller: e.controller }
      if (e.type === 'program') return { kind: 'program', channel: e.channel, program: e.program }
      return null
    case 'knob':
      return e.type === 'cc' ? { kind: 'cc', channel: e.channel, controller: e.controller } : null
    case 'joystick':
      if (e.type === 'pitchbend') return { kind: 'pitchbend', channel: e.channel }
      if (e.type === 'cc') return { kind: 'cc', channel: e.channel, controller: e.controller }
      return null
    case 'keyboard':
      return e.type === 'noteon' ? { kind: 'note-channel', channel: e.channel } : null
  }
}

export function bindingsEqual(a: ControlBinding, b: ControlBinding): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Does this binding describe the control that produced the event? */
export function bindingMatches(b: ControlBinding, e: MidiEvent): boolean {
  if (!('channel' in e) || e.channel !== b.channel) return false
  switch (b.kind) {
    case 'note':
      return (e.type === 'noteon' || e.type === 'noteoff') && e.note === b.note
    case 'cc':
      return e.type === 'cc' && e.controller === b.controller
    case 'program':
      return e.type === 'program' && e.program === b.program
    case 'pitchbend':
      return e.type === 'pitchbend'
    case 'note-channel':
      return e.type === 'noteon' || e.type === 'noteoff'
  }
}

/**
 * Targets an event belongs to. Specific bindings win over the keyboard's
 * channel-wide binding, so a pad sharing the keyboard's channel is not also
 * treated as a key.
 */
export function matchEvent(mappings: MidiMappings, e: MidiEvent): LearnTargetId[] {
  const specific: LearnTargetId[] = []
  let keyboard = false
  for (const [id, binding] of Object.entries(mappings) as [LearnTargetId, ControlBinding][]) {
    if (!bindingMatches(binding, e)) continue
    if (binding.kind === 'note-channel') keyboard = true
    else specific.push(id)
  }
  if (keyboard && specific.length === 0) return ['keyboard']
  return specific
}

/**
 * Assign a binding to a target. The same physical control can only drive one
 * target, so any other target already using an identical binding is cleared.
 */
export function assignBinding(
  mappings: MidiMappings,
  target: LearnTargetId,
  binding: ControlBinding,
): MidiMappings {
  const next: MidiMappings = {}
  for (const [id, b] of Object.entries(mappings) as [LearnTargetId, ControlBinding][]) {
    if (id !== target && !bindingsEqual(b, binding)) next[id] = b
  }
  next[target] = binding
  return next
}

export function clearBinding(mappings: MidiMappings, target: LearnTargetId): MidiMappings {
  const next = { ...mappings }
  delete next[target]
  return next
}

export function describeBinding(b: ControlBinding): string {
  switch (b.kind) {
    case 'note':
      return `Note ${b.note} · ch${b.channel}`
    case 'cc':
      return `CC ${b.controller} · ch${b.channel}`
    case 'program':
      return `Program ${b.program} · ch${b.channel}`
    case 'pitchbend':
      return `Pitch bend · ch${b.channel}`
    case 'note-channel':
      return `All notes · ch${b.channel}`
  }
}

/** Validate mappings loaded from disk; drops anything malformed. */
export function sanitizeMappings(data: unknown): MidiMappings {
  if (typeof data !== 'object' || data === null) return {}
  const stored = data as Partial<StoredMappings>
  if (stored.version !== MAPPINGS_SCHEMA_VERSION || typeof stored.mappings !== 'object') return {}
  const out: MidiMappings = {}
  const isCh = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 16
  const is7 = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 127
  for (const target of LEARN_TARGETS) {
    const b = (stored.mappings as Record<string, unknown>)[target.id] as
      Record<string, unknown> | undefined
    if (!b || !isCh(b['channel'])) continue
    const channel = b['channel'] as number
    if (b['kind'] === 'note' && is7(b['note'])) {
      out[target.id] = { kind: 'note', channel, note: b['note'] as number }
    } else if (b['kind'] === 'cc' && is7(b['controller'])) {
      out[target.id] = { kind: 'cc', channel, controller: b['controller'] as number }
    } else if (b['kind'] === 'program' && is7(b['program'])) {
      out[target.id] = { kind: 'program', channel, program: b['program'] as number }
    } else if (b['kind'] === 'pitchbend' || b['kind'] === 'note-channel') {
      out[target.id] = { kind: b['kind'], channel }
    }
  }
  return out
}
