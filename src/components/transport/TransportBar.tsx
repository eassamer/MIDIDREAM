import { useProjectStore } from '../../state/useProjectStore'
import { MasterSection } from '../mixer/MasterSection'

export type AppView = 'sequencer' | 'midi' | 'audio'

interface Props {
  view: AppView
  onViewChange: (view: AppView) => void
}

export function TransportBar({ view, onViewChange }: Props) {
  const name = useProjectStore((s) => s.project.name)
  const bpm = useProjectStore((s) => s.project.bpm)
  const ts = useProjectStore((s) => s.project.timeSignature)

  return (
    <header className="transport">
      <div className="brand">ELECTRIBE MINI</div>
      <div className="transport-info">
        <span className="label">Project</span>
        <span className="value">{name}</span>
        <span className="label">BPM</span>
        <span className="value lcd">{bpm}</span>
        <span className="label">Meter</span>
        <span className="value lcd">
          {ts.beatsPerBar}/{ts.beatUnit}
        </span>
      </div>
      <MasterSection />
      <nav className="view-tabs">
        <button aria-pressed={view === 'sequencer'} onClick={() => onViewChange('sequencer')}>
          Sequencer
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
