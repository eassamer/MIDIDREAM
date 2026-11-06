import { AudioEngine } from '../audio/AudioEngine'
import type { LearnTargetId } from '../midi/mapping'
import type { MidiEvent } from '../midi/messages'
import type { PartIndex } from '../project/types'
import { audioStore } from '../state/audioStore'
import { midiStore } from '../state/midiStore'
import { projectStore } from '../state/projectStore'
import { midiController } from '../state/useMidiStore'

/**
 * Connects the independent layers: project state -> audio engine, and
 * learned MIDI controls -> app actions. No React here.
 */
export const audioEngine = new AudioEngine()

/** Keyboard notes currently held, and which part each one started on. */
const heldKeys = new Map<number, PartIndex>()

export function startApp(): void {
  // Engine status -> UI store.
  audioEngine.onStatsChange((stats) => audioStore.setState({ stats }))
  audioEngine.start()

  // Project -> engine (only when relevant fields change).
  const { project } = projectStore.getState()
  audioEngine.setParts(project.parts)
  audioEngine.setMasterVolume(project.masterVolume)
  projectStore.subscribe((state, prev) => {
    if (state.project.parts !== prev.project.parts) audioEngine.setParts(state.project.parts)
    if (state.project.masterVolume !== prev.project.masterVolume) {
      audioEngine.setMasterVolume(state.project.masterVolume)
    }
  })

  // Learned MIDI controls -> sound.
  midiController.onControl(routeControl)

  // Losing the MIDI device must not leave notes hanging.
  midiStore.subscribe((state, prev) => {
    if (prev.snapshot.connectedId && !state.snapshot.connectedId) {
      heldKeys.clear()
      audioEngine.releaseAll()
    }
  })

  // If the OS or runtime suspended audio, any click brings it back.
  window.addEventListener('pointerdown', () => {
    if (audioEngine.getStats().status === 'suspended') void audioEngine.resume()
  })
}

function padPart(target: LearnTargetId): PartIndex | null {
  const m = /^pad([1-8])$/.exec(target)
  return m ? ((Number(m[1]) - 1) as PartIndex) : null
}

/** Performance routing for Milestone 2: pads trigger parts, keys play the selected part. */
function routeControl(targets: LearnTargetId[], e: MidiEvent): void {
  for (const target of targets) {
    const part = padPart(target)
    if (part !== null) {
      if (e.type === 'noteon') audioEngine.trigger(part, e.velocity)
      else if (e.type === 'noteoff') audioEngine.release(part)
      else if (e.type === 'cc') {
        if (e.value > 0) audioEngine.trigger(part, e.value)
        else audioEngine.release(part)
      } else if (e.type === 'program') audioEngine.trigger(part, 100)
      continue
    }
    if (target === 'keyboard') {
      if (e.type === 'noteon') {
        const selected = projectStore.getState().selectedPart
        heldKeys.set(e.note, selected)
        audioEngine.trigger(selected, e.velocity, e.note)
      } else if (e.type === 'noteoff') {
        // Release on the part the note started on, even if the selection changed.
        const part = heldKeys.get(e.note) ?? projectStore.getState().selectedPart
        heldKeys.delete(e.note)
        audioEngine.release(part, e.note)
      }
    }
  }
}
