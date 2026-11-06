import { useEffect, useState } from 'react'
import { TransportBar, type AppView } from '../components/transport/TransportBar'
import { PartSelector } from '../components/parts/PartSelector'
import { PartControls } from '../components/parts/PartControls'
import { StepGrid } from '../components/sequencer/StepGrid'
import { MidiSetup } from '../components/settings/MidiSetup'
import { MidiIndicator } from '../components/settings/MidiIndicator'
import { AudioSetup } from '../components/settings/AudioSetup'
import { AudioIndicator } from '../components/settings/AudioIndicator'
import { audioEngine } from './wiring'

export function App() {
  const [view, setView] = useState<AppView>('sequencer')

  // ⌘. (or Ctrl+.) stops all sound from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        audioEngine.panic()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <TransportBar view={view} onViewChange={setView} />
      <main className="main">
        {view === 'sequencer' && (
          <>
            <PartSelector />
            <PartControls />
            <StepGrid />
          </>
        )}
        {view === 'midi' && <MidiSetup />}
        {view === 'audio' && <AudioSetup />}
      </main>
      <footer className="statusbar">
        <MidiIndicator onClick={() => setView('midi')} />
        <AudioIndicator onClick={() => setView('audio')} />
        {window.desktop && (
          <span className="muted">
            Electron {window.desktop.versions.electron} · Chrome {window.desktop.versions.chrome}
          </span>
        )}
      </footer>
    </div>
  )
}
