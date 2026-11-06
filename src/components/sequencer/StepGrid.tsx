import { getActivePattern } from '../../project/ProjectModel'
import { MAX_PATTERN_BARS, STEPS_PER_BAR } from '../../project/types'
import { projectStore } from '../../state/projectStore'
import { useProjectStore } from '../../state/useProjectStore'

export function StepGrid() {
  const project = useProjectStore((s) => s.project)
  const selectedPart = useProjectStore((s) => s.selectedPart)
  const visibleBar = useProjectStore((s) => s.visibleBar)
  const { toggleStep, clearPart, setVisibleBar, setPatternLength } = projectStore.getState()

  const pattern = getActivePattern(project)
  const part = project.parts[selectedPart]!
  const offset = visibleBar * STEPS_PER_BAR
  const steps = pattern.tracks[selectedPart]!.steps.slice(offset, offset + STEPS_PER_BAR)

  return (
    <section
      className="sequencer"
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
        </div>
        <button onClick={() => clearPart(selectedPart)}>Clear part</button>
      </div>
      <div className="steps">
        {steps.map((step, i) => (
          <button
            key={offset + i}
            className={`step ${step.active ? 'on' : ''} ${i % 4 === 0 ? 'beat' : ''}`}
            onClick={() => toggleStep(selectedPart, offset + i)}
            aria-pressed={step.active}
            aria-label={`Step ${offset + i + 1}`}
          >
            <span>{i + 1}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
