import type { MidiAccessLike, MidiInputLike } from './MidiManager'

/** In-memory Web MIDI stand-in for tests. */
export class FakeInput implements MidiInputLike {
  state: 'connected' | 'disconnected' = 'connected'
  onmidimessage: MidiInputLike['onmidimessage'] = null
  constructor(
    public id: string,
    public name: string | null,
    public manufacturer: string | null = 'Akai',
  ) {}
  send(bytes: number[], timeStamp = 0): void {
    this.onmidimessage?.({ data: new Uint8Array(bytes), timeStamp })
  }
}

export class FakeAccess implements MidiAccessLike {
  ports: FakeInput[] = []
  onstatechange: ((e: unknown) => void) | null = null
  inputs = { values: () => this.ports.values() }

  plug(port: FakeInput): void {
    port.state = 'connected'
    if (!this.ports.includes(port)) this.ports.push(port)
    this.onstatechange?.({})
  }
  unplug(port: FakeInput): void {
    port.state = 'disconnected'
    this.onstatechange?.({})
  }
}
