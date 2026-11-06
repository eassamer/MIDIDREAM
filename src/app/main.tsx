import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { midiController } from '../state/useMidiStore'
import { startApp } from './wiring'
import '../styles/global.css'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

// MIDI and audio run outside React so it keeps working regardless of which view is shown.
void midiController.start()
startApp()

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
