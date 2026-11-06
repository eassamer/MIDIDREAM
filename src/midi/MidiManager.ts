import { parseMidiMessage, type MidiEvent } from './messages'

/**
 * Owns the Web MIDI connection: lists inputs, attaches to the chosen one, and
 * follows unplug/replug. Independent of React and of the app store.
 *
 * Devices are remembered by *name* (port ids are not guaranteed stable across
 * reconnects or restarts), so replugging the same controller reattaches it.
 */

export type MidiStatus = 'idle' | 'requesting' | 'ready' | 'unsupported' | 'denied'

export interface MidiInputInfo {
  id: string
  name: string
  manufacturer: string
  connected: boolean
}

export interface MidiSnapshot {
  status: MidiStatus
  error: string | null
  inputs: MidiInputInfo[]
  /** Name of the device the user wants; kept while it is unplugged. */
  preferredName: string | null
  /** Id of the input we are currently receiving from, if any. */
  connectedId: string | null
}

/** Subset of Web MIDI types we rely on (lets tests provide fakes). */
export interface MidiInputLike {
  id: string
  name: string | null
  manufacturer: string | null
  state: 'connected' | 'disconnected'
  onmidimessage: ((e: { data: Uint8Array | null; timeStamp: number }) => void) | null
}

export interface MidiAccessLike {
  inputs: { values(): Iterable<MidiInputLike> }
  onstatechange: ((e: unknown) => void) | null
}

export type RequestMidiAccess = () => Promise<MidiAccessLike>

const defaultRequest: RequestMidiAccess = () => {
  if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
    return Promise.reject(new UnsupportedError())
  }
  return navigator.requestMIDIAccess({ sysex: false }) as unknown as Promise<MidiAccessLike>
}

class UnsupportedError extends Error {
  constructor() {
    super('Web MIDI is not available in this runtime')
  }
}

type Listener<T> = (value: T) => void

export class MidiManager {
  private access: MidiAccessLike | null = null
  private attached: MidiInputLike | null = null
  private snapshot: MidiSnapshot = {
    status: 'idle',
    error: null,
    inputs: [],
    preferredName: null,
    connectedId: null,
  }
  /** True once a device was picked (by the user or auto-pick); disables auto-pick. */
  private everChosen = false
  private eventListeners = new Set<Listener<MidiEvent>>()
  private changeListeners = new Set<Listener<MidiSnapshot>>()

  constructor(private readonly requestAccess: RequestMidiAccess = defaultRequest) {}

  getSnapshot(): MidiSnapshot {
    return this.snapshot
  }

  onEvent(listener: Listener<MidiEvent>): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  onChange(listener: Listener<MidiSnapshot>): () => void {
    this.changeListeners.add(listener)
    return () => this.changeListeners.delete(listener)
  }

  /** Request MIDI access. `preferredName` restores the last-used device. */
  async start(preferredName: string | null = null): Promise<void> {
    if (this.access || this.snapshot.status === 'requesting') return
    this.update({ status: 'requesting', preferredName })
    try {
      this.access = await this.requestAccess()
    } catch (err) {
      const unsupported = err instanceof UnsupportedError
      this.update({
        status: unsupported ? 'unsupported' : 'denied',
        error: err instanceof Error ? err.message : String(err),
      })
      return
    }
    this.access.onstatechange = () => this.reconcile()
    this.update({ status: 'ready', error: null })
    this.reconcile()
  }

  /** Choose an input by id (or null to stop listening). Remembered by name. */
  selectInput(id: string | null): void {
    const input = id ? this.listInputs().find((i) => i.id === id) : undefined
    this.everChosen = true
    this.update({ preferredName: input?.name ?? null })
    this.reconcile()
  }

  dispose(): void {
    this.detach()
    if (this.access) this.access.onstatechange = null
    this.access = null
    this.eventListeners.clear()
    this.changeListeners.clear()
  }

  private listInputs(): MidiInputLike[] {
    return this.access ? Array.from(this.access.inputs.values()) : []
  }

  /** Re-read ports and (re)attach to the preferred device if it is present. */
  private reconcile(): void {
    const ports = this.listInputs()
    const inputs: MidiInputInfo[] = ports.map((p) => ({
      id: p.id,
      name: p.name ?? '(unnamed device)',
      manufacturer: p.manufacturer ?? '',
      connected: p.state === 'connected',
    }))

    let preferredName = this.snapshot.preferredName
    // First run convenience: pick a connected MPK if the user has no preference yet.
    if (preferredName === null && this.snapshot.status === 'ready' && !this.everChosen) {
      preferredName = inputs.find((i) => i.connected && /mpk/i.test(i.name))?.name ?? null
    }
    if (preferredName !== null) this.everChosen = true

    const wanted =
      preferredName === null
        ? undefined
        : // Prefer the port we already hold, else any connected port with that name.
          (ports.find(
            (p) => p === this.attached && p.state === 'connected' && p.name === preferredName,
          ) ?? ports.find((p) => p.state === 'connected' && p.name === preferredName))

    if (wanted !== this.attached) {
      this.detach()
      if (wanted) this.attach(wanted)
    } else if (this.attached && this.attached.state !== 'connected') {
      this.detach()
    }

    this.update({ inputs, preferredName, connectedId: this.attached?.id ?? null })
  }

  private attach(input: MidiInputLike): void {
    this.attached = input
    // Assigning onmidimessage implicitly opens the port.
    input.onmidimessage = (msg) => {
      if (!msg.data) return
      const event = parseMidiMessage(msg.data, msg.timeStamp)
      if (event) for (const l of this.eventListeners) l(event)
    }
  }

  private detach(): void {
    if (this.attached) this.attached.onmidimessage = null
    this.attached = null
  }

  private update(patch: Partial<MidiSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    for (const l of this.changeListeners) l(this.snapshot)
  }
}
