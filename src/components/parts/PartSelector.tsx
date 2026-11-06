import type { PartIndex } from '../../project/types'
import { projectStore } from '../../state/projectStore'
import { useProjectStore } from '../../state/useProjectStore'

export function PartSelector() {
  const parts = useProjectStore((s) => s.project.parts)
  const selected = useProjectStore((s) => s.selectedPart)
  const { selectPart, toggleMute } = projectStore.getState()

  return (
    <section className="parts" aria-label="Parts">
      {parts.map((part) => (
        <div
          key={part.index}
          className={`part ${part.index === selected ? 'selected' : ''} ${part.mute ? 'muted' : ''}`}
          style={{ '--part-color': part.color } as React.CSSProperties}
        >
          <button
            className="part-select"
            onClick={() => selectPart(part.index as PartIndex)}
            aria-pressed={part.index === selected}
          >
            <span className="part-num">{part.index + 1}</span>
            <span className="part-name">{part.name}</span>
          </button>
          <button
            className={`part-mute ${part.mute ? 'on' : ''}`}
            onClick={() => toggleMute(part.index as PartIndex)}
            aria-pressed={part.mute}
            title="Mute"
          >
            M
          </button>
        </div>
      ))}
    </section>
  )
}
