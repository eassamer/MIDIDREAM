import { useRef } from 'react'
import { getActivePattern } from '../../project/ProjectModel'
import { MAX_PATTERN_BARS, STEPS_PER_BAR, type PartIndex, type Step } from '../../project/types'
import { projectStore } from '../../state/projectStore'
import { useProjectStore } from '../../state/useProjectStore'
import { useTransport } from '../../state/transportStore'
import { useControl } from '../../state/controlStore'
import { useMidiStore } from '../../state/useMidiStore'
import { noteName } from '../../midi/messages'

export function StepGrid() {
  const project = useProjectStore((s) => s.project)
  const selectedPart = useProjectStore((s) => s.selectedPart)
  const visibleBar = useProjectStore((s) => s.visibleBar)
  const playhead = useTransport((s) => s.playheadStep)
  const stepEntry = useControl((s) => s.keyMode === 'step')
  const stepKeys = useMidiStore((s) => s.mappings.stepKeys)
  const stepKeyBase = stepEntry && stepKeys?.kind === 'note-range' ? stepKeys.note : null
  const { toggleStep, clearPart, clearPattern, doublePattern, setVisibleBar, setPatternLength } =
    projectStore.getState()

  const pattern = getActivePattern(project)
  const part = project.parts[selectedPart]!
  const offset = visibleBar * STEPS_PER_BAR
  const steps = pattern.tracks[selectedPart]!.steps.slice(offset, offset + STEPS_PER_BAR)
  const playheadBar = playhead === null ? null : Math.floor(playhead / STEPS_PER_BAR)

  return (
    <section
      className={`sequencer ${stepEntry ? 'step-entry' : ''}`}
      aria-label="Step sequencer"
      style={{ '--part-color': part.color } as React.CSSProperties}
    >
      <div className="sequencer-toolbar">
        <span className="seq-title">
          {pattern.name} · <strong>{part.name}</strong>
        </span>
        <label>
          Length
          <select
            value={pattern.lengthBars}
            onChange={(e) => setPatternLength(Number(e.target.value))}
          >
            {Array.from({ length: MAX_PATTERN_BARS }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1} bar{i ? 's' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="bar-nav">
          <button onClick={() => setVisibleBar(visibleBar - 1)} disabled={visibleBar === 0}>
            ◀
          </button>
          <span className="lcd">
            Bar {visibleBar + 1}/{pattern.lengthBars}
          </span>
          <button
            onClick={() => setVisibleBar(visibleBar + 1)}
            disabled={visibleBar >= pattern.lengthBars - 1}
          >
            ▶
          </button>
          {playheadBar !== null && pattern.lengthBars > 1 && (
            <span className="muted playing-bar">playing bar {playheadBar + 1}</span>
          )}
        </div>
        <button onClick={() => clearPart(selectedPart)}>Clear part</button>
        <button
          onClick={() => {
            if (confirm('Clear all parts in this pattern?')) clearPattern()
          }}
        >
          Clear pattern
        </button>
        <button
          onClick={doublePattern}
          disabled={pattern.lengthBars * 2 > MAX_PATTERN_BARS}
          title="Double the pattern length by repeating its bars"
        >
          Double
        </button>
      </div>
      <div className="steps">
        {steps.map((step, i) => (
          <button
            key={offset + i}
            className={`step ${step.active ? 'on' : ''} ${i % 4 === 0 ? 'beat' : ''} ${
              playhead === offset + i ? 'playhead' : ''
            }`}
            style={step.active ? { opacity: 0.35 + 0.65 * step.velocity } : undefined}
            onClick={() => toggleStep(selectedPart, offset + i)}
            aria-pressed={step.active}
            aria-label={`Step ${offset + i + 1}`}
          >
            <span>{i + 1}</span>
            {stepKeyBase !== null && <span className="step-key">{noteName(stepKeyBase + i)}</span>}
          </button>
        ))}
      </div>
      <VelocityLane part={selectedPart} steps={steps} offset={offset} />
    </section>
  )
}

/** Drag across the lane to draw velocities; double-click a bar to reset it. */
function VelocityLane({ part, steps, offset }: { part: PartIndex; steps: Step[]; offset: number }) {
  const laneRef = useRef<HTMLDivElement>(null)
  const drawing = useRef(false)

  const setFromPointer = (clientX: number, clientY: number) => {
    const lane = laneRef.current
    if (!lane) return
    const rect = lane.getBoundingClientRect()
    const col = Math.floor(((clientX - rect.left) / rect.width) * STEPS_PER_BAR)
    if (col < 0 || col >= STEPS_PER_BAR) return
    const velocity = 1 - (clientY - rect.top) / rect.height
    projectStore.getState().setStepVelocity(part, offset + col, velocity)
  }

  return (
    <div
      ref={laneRef}
      className="velocity-lane"
      aria-label="Step velocity (drag to edit)"
      onPointerDown={(e) => {
        drawing.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        setFromPointer(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => drawing.current && setFromPointer(e.clientX, e.clientY)}
      onPointerUp={() => (drawing.current = false)}
      onPointerCancel={() => (drawing.current = false)}
    >
      {steps.map((step, i) => (
        <div
          key={offset + i}
          className={`vel-cell ${step.active ? 'on' : ''}`}
          title={`Velocity ${Math.round(step.velocity * 127)}`}
          onDoubleClick={() => projectStore.getState().setStepVelocity(part, offset + i, 0.8)}
        >
          <div className="vel-bar" style={{ height: `${step.velocity * 100}%` }} />
        </div>
      ))}
    </div>
  )
}
