import type { StepKnobJob } from '../midi/knobJobs'
import type { StepPatch } from '../project/ProjectModel'
import type { PartIndex, Step } from '../project/types'

/**
 * Hardware-style step editing from the MPK keys:
 * - tap a step key: toggles the step on release (key velocity -> step velocity)
 * - hold a step key and turn a step knob: edits that step, no toggle
 * - after release the step stays "focused", so knobs and the Accent button
 *   keep editing it until another step is touched.
 *
 * Pure state machine: reads and writes go through the injected callbacks.
 */

export interface FocusedStep {
  part: PartIndex
  step: number
}

export interface StepEditorDeps {
  getStep(part: PartIndex, step: number): Step | undefined
  toggleStep(part: PartIndex, step: number, velocity: number): void
  updateStep(part: PartIndex, step: number, patch: StepPatch): void
  setFocus(focus: FocusedStep | null): void
}

interface Held extends FocusedStep {
  velocity: number
  edited: boolean
}

/** Knob value (0..1) -> step patch for each step knob job. */
export function stepPatchFor(job: StepKnobJob, value: number): StepPatch {
  switch (job) {
    case 'stepVelocity':
      return { velocity: value }
    case 'stepProbability':
      // 5% detents so values are easy to hit and read.
      return { probability: Math.round(value * 20) / 20 }
    case 'stepRatchet':
      return { ratchet: 1 + Math.min(3, Math.floor(value * 4)) }
    case 'stepMicro': {
      // -50%..+50% of a step in 1/24 detents, snapping to 0 near the centre.
      const micro = Math.round((value - 0.5) * 24) / 24
      return { microtiming: Math.abs(micro) < 1 / 48 ? 0 : micro }
    }
  }
}

export class StepEditor {
  private held: Held | null = null
  private focus: FocusedStep | null = null

  constructor(private readonly deps: StepEditorDeps) {}

  get focused(): FocusedStep | null {
    return this.focus
  }

  keyDown(part: PartIndex, step: number, velocity: number): void {
    if (!this.deps.getStep(part, step)) return
    this.held = { part, step, velocity, edited: false }
    this.setFocus({ part, step })
  }

  keyUp(part: PartIndex, step: number): void {
    const held = this.held
    if (!held || held.part !== part || held.step !== step) return
    this.held = null
    if (!held.edited) this.deps.toggleStep(part, step, held.velocity)
  }

  /** Apply a knob to the focused step. Turning a knob while holding cancels the toggle. */
  editWithKnob(job: StepKnobJob, value: number): void {
    const focus = this.focus
    if (!focus) return
    this.deps.updateStep(focus.part, focus.step, stepPatchFor(job, value))
    if (this.held) this.held.edited = true
  }

  toggleAccent(): void {
    const focus = this.focus
    if (!focus) return
    const step = this.deps.getStep(focus.part, focus.step)
    if (!step) return
    this.deps.updateStep(focus.part, focus.step, { accent: !step.accent })
    if (this.held) this.held.edited = true
  }

  /** Focus a step from the mouse (or clear focus). */
  setFocus(focus: FocusedStep | null): void {
    this.focus = focus
    this.deps.setFocus(focus)
  }

  /** Forget held/focused steps (part, pattern, or mode changed). */
  reset(): void {
    this.held = null
    this.setFocus(null)
  }
}
