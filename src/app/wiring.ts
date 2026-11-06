import { AudioEngine } from '../audio/AudioEngine'
import type { LearnTargetId } from '../midi/mapping'
import type { MidiEvent } from '../midi/messages'
import type { PartIndex } from '../project/types'
import { audioStore } from '../state/audioStore'
import { midiStore } from '../state/midiStore'
import { getActivePattern } from '../project/ProjectModel'
import { projectStore } from '../state/projectStore'
import { transportStore } from '../state/transportStore'
import { Sequencer } from '../sequencer/Sequencer'
import { midiController } from '../state/useMidiStore'
import { controlStore } from '../state/controlStore'
import { routeControl, type AppAction } from './controlRouting'

/**
 * Connects the independent layers: project state -> audio engine, and
 * learned MIDI controls -> app actions. No React here.
 */
export const audioEngine = new AudioEngine()

export const sequencer = new Sequencer(
  { now: () => audioEngine.now() },
  {
    getPattern: () => getActivePattern(projectStore.getState().project),
    getBpm: () => projectStore.getState().project.bpm,
  },
  {
    playNote: (part, velocity, note, when, duration) =>
      audioEngine.trigger(part, velocity, note, when, duration),
    cancelAfter: (time) => audioEngine.cancelAfter(time),
    releaseAll: () => audioEngine.releaseAll(),
  },
)

/** Start or stop playback (resuming audio first if it was suspended). */
export function togglePlay(): void {
  if (!sequencer.isPlaying) void audioEngine.resume()
  sequencer.toggle()
}

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
  midiController.onControl(onMidiControl)

  // Losing the MIDI device must not leave notes hanging.
  midiStore.subscribe((state, prev) => {
    if (prev.snapshot.connectedId && !state.snapshot.connectedId) {
      heldKeys.clear()
      audioEngine.releaseAll()
    }
  })

  // Transport state -> UI, and a visual-only playhead that follows the audio
  // clock (offset by output latency so it matches what you hear).
  sequencer.onPlayingChange((playing) => {
    transportStore.setState({ playing, playheadStep: null })
    if (playing) requestAnimationFrame(followPlayhead)
  })

  // If the OS or runtime suspended audio, any click brings it back.
  window.addEventListener('pointerdown', () => {
    if (audioEngine.getStats().status === 'suspended') void audioEngine.resume()
  })
}

/** Learned MIDI control -> actions (pure router) -> side effects (here). */
function onMidiControl(targets: LearnTargetId[], e: MidiEvent): void {
  const project = projectStore.getState()
  const pattern = getActivePattern(project.project)
  const actions = routeControl(targets, e, {
    padMode: controlStore.getState().padMode,
    keyMode: controlStore.getState().keyMode,
    selectedPart: project.selectedPart,
    visibleBar: project.visibleBar,
    lengthBars: pattern.lengthBars,
    mappings: midiStore.getState().mappings,
    knobJobs: midiStore.getState().knobJobs,
  })
  for (const action of actions) runAction(action)
}

/** Release every note held from pads or keys (sequencer notes end on their own). */
function releaseHeldNotes(): void {
  heldKeys.clear()
  audioEngine.releaseAll()
}

export function runAction(action: AppAction): void {
  const store = projectStore.getState()
  switch (action.type) {
    case 'trigger':
      audioEngine.trigger(action.part, action.velocity)
      break
    case 'release':
      audioEngine.release(action.part)
      break
    case 'keyOn': {
      const part = store.selectedPart
      heldKeys.set(action.note, part)
      audioEngine.trigger(part, action.velocity, action.note)
      break
    }
    case 'keyOff': {
      // Release on the part the note started on, even if the selection changed.
      const part = heldKeys.get(action.note) ?? store.selectedPart
      heldKeys.delete(action.note)
      audioEngine.release(part, action.note)
      break
    }
    case 'toggleMute':
      store.toggleMute(action.part)
      break
    case 'selectPart':
      store.selectPart(action.part)
      break
    case 'toggleStep': {
      const pattern = getActivePattern(store.project)
      const step = pattern.tracks[action.part]?.steps[action.step]
      if (!step) break
      store.toggleStep(action.part, action.step)
      if (!step.active) {
        // Turning a step on: key velocity becomes step velocity, and you hear it.
        store.setStepVelocity(action.part, action.step, action.velocity / 127)
        if (!sequencer.isPlaying) audioEngine.trigger(action.part, action.velocity)
      }
      break
    }
    case 'togglePlay':
      togglePlay()
      break
    case 'panic':
      audioEngine.panic()
      break
    case 'setPadMode':
      // A pad held across a mode change would never get its note-off routed
      // as a release, so let go of everything held first.
      releaseHeldNotes()
      controlStore.setState({ padMode: action.mode })
      break
    case 'setKeyMode':
      releaseHeldNotes()
      controlStore.setState({ keyMode: action.mode })
      break
    case 'setVisibleBar':
      store.setVisibleBar(action.bar)
      break
    case 'clearPart':
      store.clearPart(action.part)
      break
    case 'setPartVolume':
      store.updatePart(action.part, { volume: action.volume })
      break
    case 'setPartPan':
      store.updatePart(action.part, { pan: action.pan })
      break
    case 'setPartPitch':
      store.updatePart(action.part, { pitchSemitones: action.semitones })
      break
    case 'setTempo':
      store.setBpm(action.bpm)
      break
    case 'setMasterVolume':
      store.setMasterVolume(action.volume)
      break
  }
}

function followPlayhead(): void {
  if (!sequencer.isPlaying) return
  const heard = sequencer.stepAt(audioEngine.now() - audioEngine.outputDelay())
  const step = heard?.step ?? null
  if (transportStore.getState().playheadStep !== step) {
    transportStore.setState({ playheadStep: step })
  }
  requestAnimationFrame(followPlayhead)
}
