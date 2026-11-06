import { describe, expect, it } from 'vitest'
import { FakeAccess, FakeInput } from './fakeMidi'
import { MidiManager } from './MidiManager'
import type { MidiEvent } from './messages'

function setup(ports: FakeInput[] = []) {
  const access = new FakeAccess()
  ports.forEach((p) => access.ports.push(p))
  const manager = new MidiManager(() => Promise.resolve(access))
  const events: MidiEvent[] = []
  manager.onEvent((e) => events.push(e))
  return { access, manager, events }
}

describe('MidiManager', () => {
  it('reports denied access', async () => {
    const manager = new MidiManager(() => Promise.reject(new Error('nope')))
    await manager.start()
    expect(manager.getSnapshot()).toMatchObject({ status: 'denied', error: 'nope' })
  })

  it('auto-selects a connected MPK on first run and receives its messages', async () => {
    const other = new FakeInput('a', 'IAC Bus 1', 'Apple')
    const mpk = new FakeInput('b', 'MPK mini 3')
    const { manager, events } = setup([other, mpk])
    await manager.start()
    expect(manager.getSnapshot()).toMatchObject({
      status: 'ready',
      connectedId: 'b',
      preferredName: 'MPK mini 3',
    })
    mpk.send([0x90, 60, 100])
    other.send([0x90, 61, 100])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'noteon', note: 60 })
  })

  it('does not auto-select when there is no MPK', async () => {
    const { manager } = setup([new FakeInput('a', 'Some Synth')])
    await manager.start()
    expect(manager.getSnapshot().connectedId).toBeNull()
  })

  it('restores the preferred device by name', async () => {
    const { manager } = setup([new FakeInput('a', 'Keystep'), new FakeInput('b', 'MPK mini 3')])
    await manager.start('Keystep')
    expect(manager.getSnapshot().connectedId).toBe('a')
  })

  it('detaches on unplug and reattaches on replug (even with a new port id)', async () => {
    const mpk = new FakeInput('b', 'MPK mini 3')
    const { access, manager, events } = setup([mpk])
    await manager.start()
    access.unplug(mpk)
    expect(manager.getSnapshot()).toMatchObject({ connectedId: null, preferredName: 'MPK mini 3' })
    expect(mpk.onmidimessage).toBeNull()

    const replugged = new FakeInput('b2', 'MPK mini 3')
    access.plug(replugged)
    expect(manager.getSnapshot().connectedId).toBe('b2')
    replugged.send([0xb0, 70, 1])
    expect(events.at(-1)).toMatchObject({ type: 'cc', controller: 70 })
  })

  it('switches input and can select none', async () => {
    const a = new FakeInput('a', 'MPK mini 3')
    const b = new FakeInput('b', 'Keystep')
    const { manager, events } = setup([a, b])
    await manager.start()
    manager.selectInput('b')
    expect(a.onmidimessage).toBeNull()
    b.send([0x90, 1, 1])
    manager.selectInput(null)
    expect(manager.getSnapshot()).toMatchObject({ connectedId: null, preferredName: null })
    b.send([0x90, 2, 2])
    expect(events).toHaveLength(1)
  })
})
