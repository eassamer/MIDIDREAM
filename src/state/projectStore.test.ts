import { describe, expect, it } from 'vitest'
import { getActivePattern } from '../project/ProjectModel'
import { createProjectStore } from './projectStore'

describe('projectStore (no React)', () => {
  it('edits the active pattern and notifies subscribers', () => {
    const store = createProjectStore()
    let calls = 0
    const unsub = store.subscribe(() => calls++)
    store.getState().toggleStep(2, 8)
    expect(getActivePattern(store.getState().project).tracks[2]!.steps[8]!.active).toBe(true)
    expect(calls).toBe(1)
    unsub()
  })

  it('keeps visibleBar within the pattern length', () => {
    const store = createProjectStore()
    store.getState().setPatternLength(4)
    store.getState().setVisibleBar(10)
    expect(store.getState().visibleBar).toBe(3)
    store.getState().setPatternLength(2)
    expect(store.getState().visibleBar).toBe(1)
  })

  it('toggles mute per part', () => {
    const store = createProjectStore()
    store.getState().toggleMute(4)
    store.getState().toggleMute(6)
    expect(store.getState().project.parts.filter((p) => p.mute)).toHaveLength(2)
    store.getState().toggleMute(4)
    expect(
      store
        .getState()
        .project.parts.filter((p) => p.mute)
        .map((p) => p.index),
    ).toEqual([6])
  })
})
