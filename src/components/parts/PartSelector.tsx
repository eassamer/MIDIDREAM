import type { PartIndex } from '../../project/types'
import { audioEngine } from '../../app/wiring'
import { projectStore } from '../../state/projectStore'
import { useProjectStore } from '../../state/useProjectStore'

export function PartSelector() {
  const parts = useProjectStore((s) => s.project.parts)
  const selected = useProjectStore((s) => s.selectedPart)
  const { selectPart, toggleMute, toggleSolo } = projectStore.getState()
  const anySolo = parts.some((p) => p.solo)

  return (
    <section className="parts" aria-label="Parts">
      {parts.map((part) => {
        const index = part.index as PartIndex
        const silenced = part.mute || (anySolo && !part.solo)
        return (
          <div
            key={index}
            className={`part ${index === selected ? 'selected' : ''} ${silenced ? 'muted' : ''}`}
            style={{ '--part-color': part.color } as React.CSSProperties}
          >
            <button
              className="part-select"
              onClick={() => selectPart(index)}
              aria-pressed={index === selected}
            >
              <span className="part-num">{index + 1}</span>
              <span className="part-name">{part.name}</span>
            </button>
            <button
              className="part-pad"
              aria-label={`Play ${part.name}`}
              title="Play (hold for sustained sounds)"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                audioEngine.trigger(index, 110)
              }}
              onPointerUp={() => audioEngine.release(index)}
              onPointerCancel={() => audioEngine.release(index)}
            />
            <div className="part-buttons">
              <button
                className={`part-mute ${part.mute ? 'on' : ''}`}
                onClick={() => toggleMute(index)}
                aria-pressed={part.mute}
                title="Mute"
              >
                M
              </button>
              <button
                className={`part-solo ${part.solo ? 'on' : ''}`}
                onClick={() => toggleSolo(index)}
                aria-pressed={part.solo}
                title="Solo"
              >
                S
              </button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
