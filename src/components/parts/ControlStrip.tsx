import { runAction } from '../../app/wiring'
import { PAD_MODES, type KeyMode, type PadMode } from '../../state/controlStore'
import { useControl } from '../../state/controlStore'
import { useMidiStore } from '../../state/useMidiStore'

const PAD_MODE_LABEL: Record<PadMode, string> = {
  trigger: 'Trigger',
  mute: 'Mute',
  select: 'Select',
}

const KEY_MODES: KeyMode[] = ['play', 'step']
const KEY_MODE_LABEL: Record<KeyMode, string> = { play: 'Play notes', step: 'Step entry' }

/**
 * Always-visible state of the MPK: what the pads and keys do right now.
 * Clicking works too, but the MPK buttons/knob are the main way to switch.
 */
export function ControlStrip() {
  const padMode = useControl((s) => s.padMode)
  const keyMode = useControl((s) => s.keyMode)
  const hasStepKeys = useMidiStore((s) => !!s.mappings.stepKeys)

  return (
    <section className="control-strip" aria-label="Controller modes">
      <div className="mode-group">
        <span className="label">Pads</span>
        <div className="segmented" role="radiogroup" aria-label="Pad mode">
          {PAD_MODES.map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={padMode === m}
              className={padMode === m ? `on mode-${m}` : ''}
              onClick={() => runAction({ type: 'setPadMode', mode: m })}
            >
              {PAD_MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="mode-group">
        <span className="label">Keys</span>
        <div className="segmented" role="radiogroup" aria-label="Keys mode">
          {KEY_MODES.map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={keyMode === m}
              className={keyMode === m ? `on mode-${m}` : ''}
              onClick={() => runAction({ type: 'setKeyMode', mode: m })}
            >
              {KEY_MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      {keyMode === 'step' && !hasStepKeys && (
        <span className="warn small">
          Step keys are not learned yet: MIDI view → Keyboard → Step keys.
        </span>
      )}
    </section>
  )
}
