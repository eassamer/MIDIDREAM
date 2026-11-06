import { useEffect, useRef, useState } from 'react'
import { MAX_BPM, MIN_BPM } from '../../project/ProjectModel'
import { togglePlay } from '../../app/wiring'
import { projectStore } from '../../state/projectStore'
import { useProjectStore } from '../../state/useProjectStore'
import { useTransport } from '../../state/transportStore'
import { MasterSection } from '../mixer/MasterSection'

export type AppView = 'sequencer' | 'sound' | 'midi' | 'audio'

interface Props {
  view: AppView
  onViewChange: (view: AppView) => void
}

export function TransportBar({ view, onViewChange }: Props) {
  const playing = useTransport((s) => s.playing)

  return (
    <header className="transport">
      <div className="brand">ELECTRIBE MINI</div>
      <button
        className={`play ${playing ? 'on' : ''}`}
        onClick={togglePlay}
        title={playing ? 'Stop (Space)' : 'Play (Space)'}
        aria-pressed={playing}
      >
        {playing ? '■ Stop' : '▶ Play'}
      </button>
      <div className="transport-info">
        <span className="label">BPM</span>
        <BpmInput />
        <TapTempo />
        <SwingControl />
      </div>
      <MasterSection />
      <nav className="view-tabs">
        <button aria-pressed={view === 'sequencer'} onClick={() => onViewChange('sequencer')}>
          Sequencer
        </button>
        <button aria-pressed={view === 'sound'} onClick={() => onViewChange('sound')}>
          Sound
        </button>
        <button aria-pressed={view === 'midi'} onClick={() => onViewChange('midi')}>
          MIDI
        </button>
        <button aria-pressed={view === 'audio'} onClick={() => onViewChange('audio')}>
          Audio
        </button>
      </nav>
    </header>
  )
}

/** BPM field: type a value (Enter/blur commits) or use arrow keys (Shift = ±10). */
function BpmInput() {
  const bpm = useProjectStore((s) => s.project.bpm)
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft !== null) {
      const value = Number(draft)
      if (Number.isFinite(value) && draft.trim() !== '') projectStore.getState().setBpm(value)
    }
    setDraft(null)
  }

  return (
    <input
      className="bpm lcd"
      aria-label="Tempo in BPM"
      inputMode="decimal"
      value={draft ?? String(bpm)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          const delta = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)
          setDraft(null)
          projectStore.getState().setBpm(Math.round(bpm) + delta)
        }
      }}
      title={`Tempo (${MIN_BPM}–${MAX_BPM}). ↑/↓ to nudge, Shift for ±10.`}
    />
  )
}

/** Tap tempo: averages the last few taps; a 2 s pause starts a new count. */
function TapTempo() {
  const taps = useRef<number[]>([])
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(false), 100)
    return () => clearTimeout(t)
  }, [flash])

  const tap = () => {
    const now = performance.now()
    const list = taps.current
    if (list.length && now - list[list.length - 1]! > 2000) list.length = 0
    list.push(now)
    if (list.length > 5) list.shift()
    if (list.length >= 2) {
      const avg = (list[list.length - 1]! - list[0]!) / (list.length - 1)
      projectStore.getState().setBpm(60000 / avg)
    }
    setFlash(true)
  }

  return (
    <button className={`tap ${flash ? 'flash' : ''}`} onPointerDown={tap} title="Tap tempo">
      TAP
    </button>
  )
}

/** Swing: 0 = straight (50%), 1 = heavy shuffle (75%). Double-click resets. */
function SwingControl() {
  const swing = useProjectStore((s) => s.project.swing)
  return (
    <label
      className="control compact swing"
      title="Swing: delays every second 16th (double-click to reset)"
      onDoubleClick={() => projectStore.getState().setSwing(0)}
    >
      <span className="label">Swing</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={swing}
        onChange={(e) => projectStore.getState().setSwing(Number(e.target.value))}
      />
      <span className="lcd control-value">{Math.round(50 + swing * 25)}%</span>
    </label>
  )
}
