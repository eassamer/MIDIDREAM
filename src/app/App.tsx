import { useEffect, useState } from 'react'
import { TransportBar, type AppView } from '../components/transport/TransportBar'
import { PartSelector } from '../components/parts/PartSelector'
import { PartControls } from '../components/parts/PartControls'
import { StepGrid } from '../components/sequencer/StepGrid'
import { MidiSetup } from '../components/settings/MidiSetup'
import { MidiIndicator } from '../components/settings/MidiIndicator'
import { AudioSetup } from '../components/settings/AudioSetup'
import { AudioIndicator } from '../components/settings/AudioIndicator'
import { audioEngine, togglePlay } from './wiring'

export function App() {
  const [view, setView] = useState<AppView>('sequencer')

  // Global shortcuts: Space = play/stop, ⌘. (or Ctrl+.) = stop all sound.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault()
        audioEngine.panic()
        return
      }
      const target = e.target as HTMLElement | null
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
      if (e.code === 'Space' && !typing && !e.repeat) {
        e.preventDefault() // also stops Space from "clicking" the focused button
        togglePlay()
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
