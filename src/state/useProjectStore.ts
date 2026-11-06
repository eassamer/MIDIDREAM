import { useStore } from 'zustand'
import { projectStore, type ProjectState } from './projectStore'

/** React binding for the app-wide project store. */
export function useProjectStore<T>(selector: (state: ProjectState) => T): T {
  return useStore(projectStore, selector)
}
