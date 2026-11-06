/**
 * Raw MIDI bytes -> typed events. Pure functions, no Web MIDI dependency.
 * Channels are reported 1..16 (as printed on hardware), not 0..15.
 */

export type MidiEvent =
  | { type: 'noteon'; channel: number; note: number; velocity: number; time: number }
  | { type: 'noteoff'; channel: number; note: number; velocity: number; time: number }
  | { type: 'cc'; channel: number; controller: number; value: number; time: number }
  | { type: 'pitchbend'; channel: number; /** -8192..8191 */ value: number; time: number }
  | { type: 'program'; channel: number; program: number; time: number }
  | { type: 'channelpressure'; channel: number; pressure: number; time: number }
  | { type: 'polypressure'; channel: number; note: number; pressure: number; time: number }
  | { type: 'system'; status: number; bytes: number[]; time: number }

/** Clock, start/continue/stop, active sensing, reset. Very chatty; usually hidden. */
export function isRealtime(event: MidiEvent): boolean {
  return event.type === 'system' && event.status >= 0xf8
}

export function parseMidiMessage(data: ArrayLike<number>, time = 0): MidiEvent | null {
  if (data.length === 0) return null
  const status = data[0]!
  if (status < 0x80) return null // running status / stray data bytes are not supported

  if (status >= 0xf0) {
    return { type: 'system', status, bytes: Array.from(data), time }
  }

  const kind = status & 0xf0
  const channel = (status & 0x0f) + 1
  const d1 = (data[1] ?? 0) & 0x7f
  const d2 = (data[2] ?? 0) & 0x7f

  switch (kind) {
    case 0x80:
      return { type: 'noteoff', channel, note: d1, velocity: d2, time }
    case 0x90:
      // Note-on with velocity 0 is a note-off by MIDI convention.
      return d2 === 0
        ? { type: 'noteoff', channel, note: d1, velocity: 0, time }
        : { type: 'noteon', channel, note: d1, velocity: d2, time }
    case 0xa0:
      return { type: 'polypressure', channel, note: d1, pressure: d2, time }
    case 0xb0:
      return { type: 'cc', channel, controller: d1, value: d2, time }
    case 0xc0:
      return { type: 'program', channel, program: d1, time }
    case 0xd0:
      return { type: 'channelpressure', channel, pressure: d1, time }
    case 0xe0:
      return { type: 'pitchbend', channel, value: ((d2 << 7) | d1) - 8192, time }
    default:
      return null
  }
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/** MIDI note number -> name, using C3 = 60 (Akai/Yamaha convention). */
export function noteName(note: number): string {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 2}`
}

export function describeEvent(e: MidiEvent): string {
  switch (e.type) {
    case 'noteon':
      return `Note On  ch${e.channel}  ${e.note} (${noteName(e.note)})  vel ${e.velocity}`
    case 'noteoff':
      return `Note Off ch${e.channel}  ${e.note} (${noteName(e.note)})  vel ${e.velocity}`
    case 'cc':
      return `CC       ch${e.channel}  #${e.controller}  = ${e.value}`
    case 'pitchbend':
      return `Pitch Bend ch${e.channel}  ${e.value}`
    case 'program':
      return `Program  ch${e.channel}  ${e.program}`
    case 'channelpressure':
      return `Aftertouch ch${e.channel}  ${e.pressure}`
    case 'polypressure':
      return `Poly AT  ch${e.channel}  ${e.note}  ${e.pressure}`
    case 'system':
      return `System   ${e.bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ')}`
  }
}
