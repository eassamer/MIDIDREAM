import { TransportBar } from '../components/transport/TransportBar'
import { PartSelector } from '../components/parts/PartSelector'
import { StepGrid } from '../components/sequencer/StepGrid'

export function App() {
  return (
    <div className="app">
      <TransportBar />
      <main className="main">
        <PartSelector />
        <StepGrid />
      </main>
      <footer className="statusbar">
        <span>Audio engine: not yet implemented (Milestone 2)</span>
        <span>MIDI: not yet implemented (Milestone 1)</span>
        {window.desktop && (
          <span className="muted">
            Electron {window.desktop.versions.electron} · Chrome {window.desktop.versions.chrome}
          </span>
        )}
      </footer>
    </div>
  )
}
