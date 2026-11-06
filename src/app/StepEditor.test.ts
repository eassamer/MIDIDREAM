import { describe, expect, it } from 'vitest'
import type { StepPatch } from '../project/ProjectModel'
import { createStep } from '../project/ProjectModel'
import type { PartIndex, Step } from '../project/types'
import { StepEditor, stepPatchFor, type FocusedStep } from './StepEditor'

function setup() {
  const steps: Step[] = Array.from({ length: 16 }, createStep)
  const toggled: [number, number][] = []
  const patches: [number, StepPatch][] = []
  let focus: FocusedStep | null = null
  const editor = new StepEditor({
    getStep: (_p, i) => steps[i],
    toggleStep: (_p, i, v) => {
      toggled.push([i, v])
      steps[i] = { ...steps[i]!, active: !steps[i]!.active }
    },
    updateStep: (_p, i, patch) => {
      patches.push([i, patch])
      steps[i] = { ...steps[i]!, ...patch }
    },
    setFocus: (f) => (focus = f),
  })
  return { editor, steps, toggled, patches, focus: () => focus }
}

const P = 1 as PartIndex

describe('StepEditor', () => {
  it('a tap toggles on release with the key velocity and focuses the step', () => {
    const t = setup()
    t.editor.keyDown(P, 4, 90)
    expect(t.toggled).toEqual([])
    expect(t.focus()).toEqual({ part: 1, step: 4 })
    t.editor.keyUp(P, 4)
    expect(t.toggled).toEqual([[4, 90]])
  })

  it('hold + knob edits the step and does not toggle it', () => {
    const t = setup()
    t.editor.keyDown(P, 2, 90)
    t.editor.editWithKnob('stepRatchet', 1)
    t.editor.keyUp(P, 2)
    expect(t.toggled).toEqual([])
    expect(t.steps[2]!.ratchet).toBe(4)
  })

  it('keeps editing the last touched step after release', () => {
    const t = setup()
    t.editor.keyDown(P, 7, 100)
    t.editor.keyUp(P, 7)
    t.editor.editWithKnob('stepProbability', 0.5)
    t.editor.toggleAccent()
    expect(t.steps[7]).toMatchObject({ active: true, probability: 0.5, accent: true })
  })

  it('ignores a release for a different key and does nothing without focus', () => {
    const t = setup()
    t.editor.editWithKnob('stepVelocity', 0.2)
    t.editor.toggleAccent()
    expect(t.patches).toEqual([])
    t.editor.keyDown(P, 1, 80)
    t.editor.keyUp(P, 9)
    expect(t.toggled).toEqual([])
  })

  it('reset clears focus and the held key', () => {
    const t = setup()
    t.editor.keyDown(P, 3, 80)
    t.editor.reset()
    t.editor.keyUp(P, 3)
    expect(t.toggled).toEqual([])
    expect(t.focus()).toBeNull()
  })
})

describe('stepPatchFor', () => {
  it('maps knob values to step settings with detents', () => {
    expect(stepPatchFor('stepProbability', 0.52)).toEqual({ probability: 0.5 })
    expect(stepPatchFor('stepRatchet', 0)).toEqual({ ratchet: 1 })
    expect(stepPatchFor('stepRatchet', 0.3)).toEqual({ ratchet: 2 })
    expect(stepPatchFor('stepRatchet', 1)).toEqual({ ratchet: 4 })
    expect(stepPatchFor('stepMicro', 0.5)).toEqual({ microtiming: 0 })
    expect(stepPatchFor('stepMicro', 0.51)).toEqual({ microtiming: 0 })
    expect(stepPatchFor('stepMicro', 1).microtiming).toBeCloseTo(0.5)
    expect(stepPatchFor('stepVelocity', 0.7)).toEqual({ velocity: 0.7 })
  })
})
