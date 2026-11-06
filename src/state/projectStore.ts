import { createStore } from 'zustand/vanilla'
import {
  clearTrack,
  createProject,
  getActivePattern,
  setPartMute,
  setPatternLength,
  toggleStep,
} from '../project/ProjectModel'
import type { PartIndex, Project } from '../project/types'

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
  }))
}

export type ProjectStore = ReturnType<typeof createProjectStore>

/** App-wide singleton instance. Tests should create their own via createProjectStore. */
export const projectStore = createProjectStore()
