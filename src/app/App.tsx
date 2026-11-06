import { useState } from 'react'
import { TransportBar, type AppView } from '../components/transport/TransportBar'
import { PartSelector } from '../components/parts/PartSelector'
import { StepGrid } from '../components/sequencer/StepGrid'
import { MidiSetup } from '../components/settings/MidiSetup'
import { MidiIndicator } from '../components/settings/MidiIndicator'

export function App() {
  const [view, setView] = useState<AppView>('sequencer')

  return (
    <div className="app">
      <TransportBar view={view} onViewChange={setView} />
      <main className="main">
        {view === 'sequencer' ? (
          <>
            <PartSelector />
            <StepGrid />
          </>
        ) : (
          <MidiSetup />
        )}
      </main>
      <footer className="statusbar">
        <MidiIndicator onClick={() => setView('midi')} />
        <span>Audio engine: not yet implemented (Milestone 2)</span>
        {window.desktop && (
          <span className="muted">
            Electron {window.desktop.versions.electron} · Chrome {window.desktop.versions.chrome}
          </span>
        )}
      </footer>
    </div>
  )
}
