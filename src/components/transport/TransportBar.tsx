import { useProjectStore } from '../../state/useProjectStore'

export function TransportBar() {
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
    </header>
  )
}
