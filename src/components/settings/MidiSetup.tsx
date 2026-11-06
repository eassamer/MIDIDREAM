import { useEffect } from 'react'
import { LEARN_TARGETS, describeBinding, type LearnTarget } from '../../midi/mapping'
import { midiController, useMidiStore } from '../../state/useMidiStore'

export function MidiSetup() {
  return (
    <div className="midi-setup">
      <DevicePanel />
      <LearnPanel />
      <MonitorPanel />
    </div>
  )
}

function DevicePanel() {
  const snapshot = useMidiStore((s) => s.snapshot)
  const selected = snapshot.inputs.find((i) => i.id === snapshot.connectedId)
  // Keep showing a remembered-but-unplugged device in the dropdown.
  const missingPreferred =
    snapshot.preferredName &&
    !snapshot.inputs.some((i) => i.name === snapshot.preferredName && i.connected)

  return (
    <section className="panel">
      <h2>MIDI input</h2>
      {snapshot.status === 'unsupported' && <p className="warn">Web MIDI is not available.</p>}
      {snapshot.status === 'denied' && (
        <p className="warn">MIDI access was denied: {snapshot.error}</p>
      )}
      {snapshot.status === 'ready' && (
        <>
          <select
            value={selected?.id ?? ''}
            onChange={(e) => midiController.selectInput(e.target.value || null)}
          >
            <option value="">
              {missingPreferred ? `${snapshot.preferredName} (disconnected)` : '— None —'}
            </option>
            {snapshot.inputs
              .filter((i) => i.connected)
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.manufacturer ? ` — ${i.manufacturer}` : ''}
                </option>
              ))}
          </select>
          {snapshot.inputs.filter((i) => i.connected).length === 0 && (
            <p className="muted">
              No MIDI inputs found. Plug in the MPK Mini; it will appear here.
            </p>
          )}
          {missingPreferred && (
            <p className="warn">
              Waiting for “{snapshot.preferredName}”. It will reconnect automatically when plugged
              in.
            </p>
          )}
        </>
      )}
    </section>
  )
}

function LearnPanel() {
  const mappings = useMidiStore((s) => s.mappings)
  const learning = useMidiStore((s) => s.learning)

  useEffect(() => {
    if (!learning) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') midiController.cancelLearn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [learning])

  const groups: [string, LearnTarget[]][] = [
    ['Pads', LEARN_TARGETS.filter((t) => t.kind === 'pad')],
    ['Knobs', LEARN_TARGETS.filter((t) => t.kind === 'knob')],
    [
      'Joystick & keyboard',
      LEARN_TARGETS.filter((t) => t.kind === 'joystick' || t.kind === 'keyboard'),
    ],
  ]

  return (
    <section className="panel learn-panel">
      <div className="panel-head">
        <h2>MIDI Learn</h2>
        <button
          onClick={() => {
            if (confirm('Clear all learned MIDI mappings?')) midiController.clearAllMappings()
          }}
          disabled={Object.keys(mappings).length === 0}
        >
          Clear all
        </button>
      </div>
      <p className="muted">
        Click <strong>Learn</strong>, then press the pad, turn the knob, move the joystick, or play
        a key. Esc cancels.
      </p>
      <div className="learn-groups">
        {groups.map(([title, targets]) => (
          <div key={title} className="learn-group">
            <h3>{title}</h3>
            {targets.map((t) => (
              <LearnRow key={t.id} target={t} />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

const LEARN_HINT: Record<LearnTarget['kind'], string> = {
  pad: 'Press the pad…',
  knob: 'Turn the knob…',
  joystick: 'Move the joystick…',
  keyboard: 'Play any key…',
}

function LearnRow({ target }: { target: LearnTarget }) {
  const binding = useMidiStore((s) => s.mappings[target.id])
  const isLearning = useMidiStore((s) => s.learning === target.id)
  const activity = useMidiStore((s) => s.activity[target.id] ?? 0)
  const value = useMidiStore((s) => s.values[target.id])

  return (
    <div className={`learn-row ${isLearning ? 'learning' : ''}`}>
      <span key={activity} className={`led ${activity ? 'flash' : ''}`} />
      <span className="learn-label">{target.label}</span>
      <span className="learn-binding">
        {isLearning ? LEARN_HINT[target.kind] : binding ? describeBinding(binding) : '—'}
      </span>
      {!isLearning && (
        <span className="learn-value lcd">{binding && value !== undefined ? value : ''}</span>
      )}
      {isLearning ? (
        <button onClick={() => midiController.cancelLearn()}>Cancel</button>
      ) : (
        <button onClick={() => midiController.beginLearn(target.id)}>
          {binding ? 'Relearn' : 'Learn'}
        </button>
      )}
      <button
        onClick={() => midiController.clearMapping(target.id)}
        disabled={!binding}
        title="Clear mapping"
      >
        ✕
      </button>
    </div>
  )
}

function MonitorPanel() {
  const log = useMidiStore((s) => s.log)
  const showRealtime = useMidiStore((s) => s.showRealtime)

  return (
    <section className="panel monitor-panel">
      <div className="panel-head">
        <h2>MIDI monitor</h2>
        <label className="muted">
          <input
            type="checkbox"
            checked={showRealtime}
            onChange={(e) => midiController.setShowRealtime(e.target.checked)}
          />
          Show clock/realtime
        </label>
        <button onClick={() => midiController.clearLog()}>Clear</button>
      </div>
      <ol className="monitor-log">
        {log.length === 0 && <li className="muted">Waiting for MIDI messages…</li>}
        {log.map((entry) => (
          <li key={entry.id}>
            <span className="muted">{(entry.time / 1000).toFixed(3)}s</span>
            <code>{entry.text}</code>
            {entry.targets.length > 0 && <span className="tag">{entry.targets.join(', ')}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}
