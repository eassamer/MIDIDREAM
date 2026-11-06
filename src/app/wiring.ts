import { AudioEngine } from '../audio/AudioEngine'
import type { LearnTargetId } from '../midi/mapping'
import type { MidiEvent } from '../midi/messages'
import type { PartIndex } from '../project/types'
import { audioStore } from '../state/audioStore'
import { midiStore } from '../state/midiStore'
import { getActivePattern, neighbourPatternId } from '../project/ProjectModel'
import { StepEditor } from './StepEditor'
import { projectStore } from '../state/projectStore'
import { transportStore } from '../state/transportStore'
import { Sequencer } from '../sequencer/Sequencer'
import { midiController } from '../state/useMidiStore'
import { PREF_CONTROL_MODES, controlStore, sanitizeModes } from '../state/controlStore'
import { preferences } from '../persistence/preferences'
import { SampleLibrary, browsableRefs } from '../samples/SampleLibrary'
import { sampleStore } from '../state/sampleStore'
import type { SampleRef } from '../project/types'
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
    getSwing: () => projectStore.getState().project.swing,
    onPatternEnd: () => {
      // Pattern changes requested during playback land on the loop boundary.
      const queued = transportStore.getState().queuedPatternId
      if (queued) {
        transportStore.setState({ queuedPatternId: null })
        projectStore.getState().selectPattern(queued)
        stepEditor.reset()
      }
    },
  },
  {
    playNote: (part, velocity, note, when, duration) =>
      audioEngine.trigger(part, velocity, note, when, duration),
    cancelAfter: (time) => audioEngine.cancelAfter(time),
    releaseAll: () => audioEngine.releaseAll(),
  },
)

/** Step editing from keys/knobs; focus is mirrored into controlStore for the UI. */
export const stepEditor = new StepEditor({
  getStep: (part, step) =>
    getActivePattern(projectStore.getState().project).tracks[part]?.steps[step],
  toggleStep: (part, step, velocity) => {
    const store = projectStore.getState()
    const wasActive = getActivePattern(store.project).tracks[part]?.steps[step]?.active
    store.toggleStep(part, step)
    if (!wasActive) {
      // Turning a step on: key velocity becomes step velocity, and you hear it.
      store.setStepVelocity(part, step, velocity / 127)
      if (!sequencer.isPlaying) audioEngine.trigger(part, velocity)
    }
  },
  updateStep: (part, step, patch) => projectStore.getState().updateStep(part, step, patch),
  setFocus: (focus) => controlStore.setState({ focusedStep: focus }),
})

/**
 * Switch pattern. While playing, the change is queued to the end of the
 * current loop (choosing the active pattern again cancels the queue).
 */
export function requestPattern(patternId: string): void {
  const store = projectStore.getState()
  if (sequencer.isPlaying) {
    const queued = patternId === store.project.activePatternId ? null : patternId
    transportStore.setState({ queuedPatternId: queued })
  } else {
    transportStore.setState({ queuedPatternId: null })
    store.selectPattern(patternId)
    stepEditor.reset()
  }
}

/** User sample library (file access comes from the Electron preload). */
export const sampleLibrary = new SampleLibrary(
  sampleStore,
  typeof window !== 'undefined' ? (window.desktop?.samples ?? null) : null,
  audioEngine,
  preferences,
)

/** Put a sample on a part, load it, and play it once through the part. */
export async function assignSampleToPart(part: PartIndex, ref: SampleRef): Promise<void> {
  projectStore.getState().assignSample(part, ref)
  if ((await sampleLibrary.ensureLoaded(ref)) && !sequencer.isPlaying) {
    audioEngine.trigger(part, 100)
  }
}

/** Audition a sample by itself (browser preview), loading it first if needed. */
export async function previewSample(ref: SampleRef): Promise<void> {
  if (await sampleLibrary.ensureLoaded(ref)) audioEngine.preview(ref.id)
}

/** Next/previous sample in the browser list for the selected part (MPK browsing). */
export function stepSample(offset: number): void {
  const { project, selectedPart } = projectStore.getState()
  const refs = browsableRefs(sampleStore.getState().library)
  if (!refs.length) return
  const sound = project.parts[selectedPart]!.sound
  const current = sound.kind === 'sample' ? refs.findIndex((r) => r.id === sound.sample?.id) : -1
  const next =
    current < 0
      ? offset > 0
        ? 0
        : refs.length - 1
      : (current + offset + refs.length) % refs.length
  void assignSampleToPart(selectedPart, refs[next]!)
}

/** Choose a sample by absolute knob position (0..1) across the browser list. */
export function pickSampleAt(value: number): void {
  const { project, selectedPart } = projectStore.getState()
  const refs = browsableRefs(sampleStore.getState().library)
  if (!refs.length) return
  const ref = refs[Math.round(value * (refs.length - 1))]!
  const sound = project.parts[selectedPart]!.sound
  if (sound.kind === 'sample' && sound.sample?.id === ref.id) return
  void assignSampleToPart(selectedPart, ref)
}

/** Ask the user for the new location of a missing file and repoint every part using it. */
export async function relinkSample(ref: SampleRef): Promise<void> {
  const next = await sampleLibrary.relink(ref)
  if (next) projectStore.getState().replaceSampleRef(next)
}

/** Start or stop playback (resuming audio first if it was suspended). */
export function togglePlay(): void {
  if (!sequencer.isPlaying) void audioEngine.resume()
  sequencer.toggle()
}

/** Keyboard notes currently held, and which part each one started on. */
const heldKeys = new Map<number, PartIndex>()

export function startApp(): void {
  void restoreModes()
  void sampleLibrary.start()

  // Engine status -> UI store.
  audioEngine.onStatsChange((stats) => audioStore.setState({ stats }))
  audioEngine.start()

  // Project -> engine (only when relevant fields change).
  const { project } = projectStore.getState()
  audioEngine.setParts(project.parts)
  audioEngine.setMasterVolume(project.masterVolume)
  projectStore.subscribe((state, prev) => {
    if (state.project.parts !== prev.project.parts) {
      audioEngine.setParts(state.project.parts)
      loadPartSamples()
    }
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
    const queued = transportStore.getState().queuedPatternId
    transportStore.setState({ playing, playheadStep: null, queuedPatternId: null })
    // Stopping with a change queued: switch now rather than dropping the request.
    if (!playing && queued) {
      projectStore.getState().selectPattern(queued)
      stepEditor.reset()
    }
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
      stepEditor.reset()
      break
    case 'stepKeyDown':
      stepEditor.keyDown(action.part, action.step, action.velocity)
      break
    case 'stepKeyUp':
      stepEditor.keyUp(action.part, action.step)
      break
    case 'editFocusedStep':
      stepEditor.editWithKnob(action.job, action.value)
      break
    case 'toggleAccent':
      stepEditor.toggleAccent()
      break
    case 'setSwing':
      store.setSwing(action.swing)
      break
    case 'stepPattern': {
      const transport = transportStore.getState()
      // Pressing again while a change is queued moves on from the queued one.
      const from = transport.queuedPatternId ?? store.project.activePatternId
      requestPattern(neighbourPatternId(store.project, from, action.offset))
      break
    }
    case 'stepSound':
      stepSample(action.offset)
      break
    case 'pickSound':
      pickSampleAt(action.value)
      break
    case 'setSampleStart':
      store.updateSample(action.part, { start: action.value })
      break
    case 'setSampleEnd':
      store.updateSample(action.part, { end: action.value })
      break
    case 'duplicatePattern':
      store.duplicatePattern()
      transportStore.setState({ queuedPatternId: null })
      stepEditor.reset()
      break
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
      stepEditor.reset()
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

/**
 * Pad and keys modes are remembered between sessions, so a setup that never
 * switches modes (e.g. keys always in Step entry) needs no button for it.
 */
async function restoreModes(): Promise<void> {
  const saved = sanitizeModes(await preferences.get(PREF_CONTROL_MODES))
  controlStore.setState(saved)
  controlStore.subscribe((state, prev) => {
    if (state.padMode !== prev.padMode || state.keyMode !== prev.keyMode) {
      void preferences.set(PREF_CONTROL_MODES, { padMode: state.padMode, keyMode: state.keyMode })
    }
  })
}

/** Make sure every user sample referenced by a part is loaded (missing files get flagged). */
function loadPartSamples(): void {
  for (const part of projectStore.getState().project.parts) {
    if (part.sound.kind === 'sample' && part.sound.sample?.origin === 'user') {
      const status = sampleStore.getState().status[part.sound.sample.id]?.state
      if (status !== 'missing' && status !== 'error') {
        void sampleLibrary.ensureLoaded(part.sound.sample)
      }
    }
  }
}
