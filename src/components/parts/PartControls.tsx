import type { OscillatorWaveform } from '../../project/types'
import { projectStore } from '../../state/projectStore'
import { useProjectStore } from '../../state/useProjectStore'

const WAVEFORMS: OscillatorWaveform[] = ['sine', 'triangle', 'sawtooth', 'square']

/** Mixer and sound controls for the selected part. Only shows what applies. */
export function PartControls() {
  const index = useProjectStore((s) => s.selectedPart)
  const part = useProjectStore((s) => s.project.parts[s.selectedPart]!)
  const { updatePart } = projectStore.getState()

  return (
    <section
      className="part-controls"
      aria-label={`${part.name} controls`}
      style={{ '--part-color': part.color } as React.CSSProperties}
    >
      <div className="pc-title">
        <span className="part-num">Part {index + 1}</span>
        <strong>{part.name}</strong>
        <span className="muted">
          {part.sound.kind === 'sample'
            ? `Sample · ${part.sound.sample?.name ?? 'none'}`
            : 'Synth voice'}
        </span>
      </div>

      <Slider
        label="Volume"
        min={0}
        max={1}
        step={0.01}
        value={part.volume}
        display={`${Math.round(part.volume * 100)}%`}
        onChange={(v) => updatePart(index, { volume: v })}
        resetTo={0.8}
      />
      <Slider
        label="Pan"
        min={-1}
        max={1}
        step={0.01}
        value={part.pan}
        display={
          Math.abs(part.pan) < 0.01
            ? 'C'
            : `${part.pan < 0 ? 'L' : 'R'}${Math.round(Math.abs(part.pan) * 100)}`
        }
        onChange={(v) => updatePart(index, { pan: v })}
        resetTo={0}
      />
      <Slider
        label="Pitch"
        min={-24}
        max={24}
        step={1}
        value={part.pitchSemitones}
        display={`${part.pitchSemitones > 0 ? '+' : ''}${part.pitchSemitones} st`}
        onChange={(v) => updatePart(index, { pitchSemitones: v })}
        resetTo={0}
      />
      {part.sound.kind === 'synth' && (
        <label className="control">
          <span className="label">Wave</span>
          <select
            value={part.sound.waveform}
            onChange={(e) =>
              updatePart(index, {
                sound: { kind: 'synth', waveform: e.target.value as OscillatorWaveform },
              })
            }
          >
            {WAVEFORMS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  )
}

interface SliderProps {
  label: string
  min: number
  max: number
  step: number
  value: number
  display: string
  onChange: (value: number) => void
  /** Double-click resets to this value. */
  resetTo: number
}

function Slider({ label, min, max, step, value, display, onChange, resetTo }: SliderProps) {
  return (
    <label
      className="control"
      onDoubleClick={() => onChange(resetTo)}
      title="Double-click to reset"
    >
      <span className="label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="lcd control-value">{display}</span>
    </label>
  )
}
