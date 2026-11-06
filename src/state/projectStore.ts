import { createStore } from 'zustand/vanilla'
import {
  addPattern,
  assignSample,
  assignSynth,
  replaceSampleRef,
  setChokeGroup,
  updateSample,
  type SamplePatch,
  clearPattern,
  clearTrack,
  deletePattern,
  duplicatePattern,
  renamePattern,
  selectPattern,
  setSwing,
  updateStep,
  type StepPatch,
  createProject,
  doublePattern,
  setBpm,
  setStepVelocity,
  getActivePattern,
  setMasterVolume,
  setPartMute,
  setPatternLength,
  updatePart,
  type PartPatch,
  toggleStep,
} from '../project/ProjectModel'
import type { OscillatorWaveform, PartIndex, Project, SampleRef } from '../project/types'

/**
 * Framework-agnostic project store. The audio engine, MIDI layer, and React UI
 * can all subscribe to it; React uses the hook in useProjectStore.ts.
 */
export interface ProjectState {
  project: Project
  selectedPart: PartIndex
  /** Which bar of the active pattern is shown in the step grid (0-based). */
  visibleBar: number

  newProject: (name?: string) => void
  loadProject: (project: Project) => void
  selectPart: (part: PartIndex) => void
  setVisibleBar: (bar: number) => void
  toggleStep: (part: PartIndex, stepIndex: number) => void
  clearPart: (part: PartIndex) => void
  setPatternLength: (bars: number) => void
  toggleMute: (part: PartIndex) => void
  toggleSolo: (part: PartIndex) => void
  updatePart: (part: PartIndex, patch: PartPatch) => void
  setMasterVolume: (volume: number) => void
  setBpm: (bpm: number) => void
  setStepVelocity: (part: PartIndex, stepIndex: number, velocity: number) => void
  clearPattern: () => void
  doublePattern: () => void
  setSwing: (swing: number) => void
  updateStep: (part: PartIndex, stepIndex: number, patch: StepPatch) => void
  /** Switch pattern now (the app queues switches during playback). */
  selectPattern: (patternId: string) => void
  addPattern: () => void
  duplicatePattern: () => void
  deletePattern: () => void
  renamePattern: (patternId: string, name: string) => void
  assignSample: (part: PartIndex, sample: SampleRef) => void
  assignSynth: (part: PartIndex, waveform?: OscillatorWaveform) => void
  updateSample: (part: PartIndex, patch: SamplePatch) => void
  setChokeGroup: (part: PartIndex, group: number | null) => void
  replaceSampleRef: (ref: SampleRef) => void
}

export function createProjectStore(initial: Project = createProject()) {
  return createStore<ProjectState>()((set, get) => ({
    project: initial,
    selectedPart: 0,
    visibleBar: 0,

    newProject: (name) => set({ project: createProject(name), selectedPart: 0, visibleBar: 0 }),
    loadProject: (project) => set({ project, selectedPart: 0, visibleBar: 0 }),
    selectPart: (part) => set({ selectedPart: part }),
    setVisibleBar: (bar) => {
      const { lengthBars } = getActivePattern(get().project)
      set({ visibleBar: Math.min(Math.max(0, Math.floor(bar)), lengthBars - 1) })
    },
    toggleStep: (part, stepIndex) => {
      const { project } = get()
      set({ project: toggleStep(project, project.activePatternId, part, stepIndex) })
    },
    clearPart: (part) => {
      const { project } = get()
      set({ project: clearTrack(project, project.activePatternId, part) })
    },
    setPatternLength: (bars) => {
      const { project, visibleBar } = get()
      const next = setPatternLength(project, project.activePatternId, bars)
      const { lengthBars } = getActivePattern(next)
      set({ project: next, visibleBar: Math.min(visibleBar, lengthBars - 1) })
    },
    toggleMute: (part) => {
      const { project } = get()
      set({ project: setPartMute(project, part, !project.parts[part]!.mute) })
    },
    toggleSolo: (part) => {
      const { project } = get()
      set({ project: updatePart(project, part, { solo: !project.parts[part]!.solo }) })
    },
    updatePart: (part, patch) => set({ project: updatePart(get().project, part, patch) }),
    setMasterVolume: (volume) => set({ project: setMasterVolume(get().project, volume) }),
    setBpm: (bpm) => set({ project: setBpm(get().project, bpm) }),
    setStepVelocity: (part, stepIndex, velocity) => {
      const { project } = get()
      set({
        project: setStepVelocity(project, project.activePatternId, part, stepIndex, velocity),
      })
    },
    clearPattern: () => {
      const { project } = get()
      set({ project: clearPattern(project, project.activePatternId) })
    },
    setSwing: (swing) => set({ project: setSwing(get().project, swing) }),
    updateStep: (part, stepIndex, patch) => {
      const { project } = get()
      set({ project: updateStep(project, project.activePatternId, part, stepIndex, patch) })
    },
    selectPattern: (patternId) => {
      const project = selectPattern(get().project, patternId)
      if (project !== get().project) set({ project, visibleBar: 0 })
    },
    addPattern: () => set({ project: addPattern(get().project), visibleBar: 0 }),
    duplicatePattern: () => {
      const { project } = get()
      set({ project: duplicatePattern(project, project.activePatternId), visibleBar: 0 })
    },
    deletePattern: () => {
      const { project } = get()
      set({ project: deletePattern(project, project.activePatternId), visibleBar: 0 })
    },
    assignSample: (part, sample) => set({ project: assignSample(get().project, part, sample) }),
    assignSynth: (part, waveform) => set({ project: assignSynth(get().project, part, waveform) }),
    updateSample: (part, patch) => set({ project: updateSample(get().project, part, patch) }),
    setChokeGroup: (part, group) => set({ project: setChokeGroup(get().project, part, group) }),
    replaceSampleRef: (ref) => set({ project: replaceSampleRef(get().project, ref) }),
    renamePattern: (patternId, name) =>
      set({ project: renamePattern(get().project, patternId, name) }),
    doublePattern: () => {
      const { project } = get()
      set({ project: doublePattern(project, project.activePatternId) })
    },
  }))
}

export type ProjectStore = ReturnType<typeof createProjectStore>

/** App-wide singleton instance. Tests should create their own via createProjectStore. */
export const projectStore = createProjectStore()
