import { getActivePattern, MAX_RATCHET } from '../../project/ProjectModel'
import type { PartIndex } from '../../project/types'
import { projectStore } from '../../state/projectStore'
import { useControl } from '../../state/controlStore'
import { useProjectStore } from '../../state/useProjectStore'

/**
 * Settings of the focused step (held/last step key on the MPK, or the last
 * clicked step). Mirrors what the step knobs and Accent button change.
 */
export function StepInspector() {
  const focused = useControl((s) => s.focusedStep)
  const selectedPart = useProjectStore((s) => s.selectedPart)
  const step = useProjectStore((s) =>
    focused ? getActivePattern(s.project).tracks[focused.part]?.steps[focused.step] : undefined,
  )

  if (!focused || !step || focused.part !== selectedPart) {
    return (
      <div className="step-inspector empty muted">
        Touch a step (step key or click) to edit its velocity, probability, ratchet, timing and
        accent.
      </div>
    )
  }

  const part = focused.part as PartIndex
  const update = (patch: Parameters<ReturnType<typeof projectStore.getState>['updateStep']>[2]) =>
    projectStore.getState().updateStep(part, focused.step, patch)

  return (
    <div className="step-inspector">
      <span className="si-title">
        Step <strong>{focused.step + 1}</strong>
        {!step.active && <span className="muted"> (off)</span>}
      </span>
      <label className="control">
        <span className="label">Velocity</span>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.01}
          value={step.velocity}
          onChange={(e) => update({ velocity: Number(e.target.value) })}
        />
        <span className="lcd control-value">{Math.round(step.velocity * 127)}</span>
      </label>
      <label className="control">
        <span className="label">Chance</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={step.probability}
          onChange={(e) => update({ probability: Number(e.target.value) })}
        />
        <span className="lcd control-value">{Math.round(step.probability * 100)}%</span>
      </label>
      <div className="control">
        <span className="label">Ratchet</span>
        <div className="segmented small-seg">
          {Array.from({ length: MAX_RATCHET }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              className={step.ratchet === n ? 'on mode-select' : ''}
              onClick={() => update({ ratchet: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <label className="control" onDoubleClick={() => update({ microtiming: 0 })}>
        <span className="label">Timing</span>
        <input
          type="range"
          min={-0.5}
          max={0.5}
          step={1 / 24}
          value={step.microtiming}
          onChange={(e) => update({ microtiming: Number(e.target.value) })}
          title="Early ← → late (double-click to reset)"
        />
        <span className="lcd control-value">
          {step.microtiming === 0
            ? 'on grid'
            : `${step.microtiming > 0 ? '+' : ''}${Math.round(step.microtiming * 100)}%`}
        </span>
      </label>
      <button
        className={`accent-btn ${step.accent ? 'on' : ''}`}
        aria-pressed={step.accent}
        onClick={() => update({ accent: !step.accent })}
      >
        Accent
      </button>
    </div>
  )
}
