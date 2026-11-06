import { useMidiStore } from '../../state/useMidiStore'

/** Compact connection status for the status bar. */
export function MidiIndicator({ onClick }: { onClick?: () => void }) {
  const snapshot = useMidiStore((s) => s.snapshot)
  const connected = snapshot.inputs.find((i) => i.id === snapshot.connectedId)

  let state: 'ok' | 'warn' | 'off'
  let text: string
  if (snapshot.status === 'unsupported') [state, text] = ['off', 'MIDI unavailable']
  else if (snapshot.status === 'denied') [state, text] = ['off', 'MIDI access denied']
  else if (snapshot.status !== 'ready') [state, text] = ['off', 'MIDI starting…']
  else if (connected) [state, text] = ['ok', `MIDI: ${connected.name}`]
  else if (snapshot.preferredName)
    [state, text] = ['warn', `MIDI: ${snapshot.preferredName} (disconnected)`]
  else [state, text] = ['off', 'MIDI: no device selected']

  return (
    <button className="midi-indicator" onClick={onClick} title="Open MIDI setup">
      <span className={`dot ${state}`} />
      {text}
    </button>
  )
}
