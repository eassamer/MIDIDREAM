import { audioEngine, relinkSample } from '../../app/wiring'
import { CHOKE_GROUPS } from '../../project/ProjectModel'
import type { SamplePlayMode } from '../../project/types'
import { projectStore } from '../../state/projectStore'
import { useProjectStore } from '../../state/useProjectStore'
import { useSamples } from '../../state/sampleStore'
import { Waveform } from './Waveform'

const PLAY_MODES: { mode: SamplePlayMode; label: string; hint: string }[] = [
  { mode: 'one-shot', label: 'One-shot', hint: 'Plays to the end, ignores release' },
  { mode: 'gated', label: 'Gated', hint: 'Stops when the pad/key/step ends' },
  { mode: 'loop', label: 'Loop', hint: 'Loops the region until released' },
]

/** Sound settings of the selected part: sample region, play mode, reverse, choke. */
export function SoundEditor() {
  const index = useProjectStore((s) => s.selectedPart)
  const part = useProjectStore((s) => s.project.parts[s.selectedPart]!)
  const { updateSample, setChokeGroup } = projectStore.getState()
  const sound = part.sound
  const sample = sound.kind === 'sample' ? sound.sample : null
  const status = useSamples((s) => (sample ? s.status[sample.id] : undefined))

  return (
    <section
      className="panel sound-editor"
      style={{ '--part-color': part.color } as React.CSSProperties}
    >
      <div className="panel-head">
        <h2>
          Part {index + 1} · {part.name}
        </h2>
        <button
          onPointerDown={() => audioEngine.trigger(index, 110)}
          onPointerUp={() => audioEngine.release(index)}
          title="Play the part (hold for gated/loop sounds)"
        >
          ▶ Audition
        </button>
      </div>

      {sound.kind === 'synth' ? (
        <p className="muted">
          Synth voice ({sound.waveform}). Pick a sample in the browser to turn this part into a
          sample part, or change the waveform in the part controls on the Sequencer view.
        </p>
      ) : (
        <>
          <div className="sound-name">
            <strong>{sample?.name ?? 'No sample'}</strong>
            <span className="muted">
              {sample?.origin === 'builtin' ? 'Built-in' : sample?.path}
              {status?.duration ? ` · ${status.duration.toFixed(2)} s` : ''}
            </span>
          </div>

          {sample && (status?.state === 'missing' || status?.state === 'error') && (
            <div className="sample-problem">
              <span className="warn">
                {status.message}: {sample.path}
              </span>
              <button onClick={() => void relinkSample(sample)}>Locate…</button>
            </div>
          )}

          {sample && (
            <Waveform
              sampleId={sample.id}
              start={sound.start}
              end={sound.end}
              reverse={sound.reverse}
              color={part.color}
              onChange={(patch) => updateSample(index, patch)}
            />
          )}

          <div className="sound-controls">
            <span className="muted small">
              Region {Math.round(sound.start * 100)}% – {Math.round(sound.end * 100)}%
              {status?.duration
                ? ` (${((sound.end - sound.start) * status.duration * 1000).toFixed(0)} ms)`
                : ''}
              {' · double-click the waveform to reset'}
            </span>
            <div className="segmented" role="radiogroup" aria-label="Play mode">
              {PLAY_MODES.map((m) => (
                <button
                  key={m.mode}
                  role="radio"
                  aria-checked={sound.playMode === m.mode}
                  className={sound.playMode === m.mode ? 'on mode-select' : ''}
                  title={m.hint}
                  onClick={() => updateSample(index, { playMode: m.mode })}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <button
              className={`accent-btn ${sound.reverse ? 'on' : ''}`}
              aria-pressed={sound.reverse}
              onClick={() => updateSample(index, { reverse: !sound.reverse })}
            >
              Reverse
            </button>
          </div>
        </>
      )}

      <label className="control choke">
        <span className="label">Choke group</span>
        <select
          value={part.chokeGroup ?? ''}
          onChange={(e) => setChokeGroup(index, e.target.value ? Number(e.target.value) : null)}
          title="Parts in the same group cut each other off (e.g. open/closed hats)"
        >
          <option value="">None</option>
          {CHOKE_GROUPS.map((g) => (
            <option key={g} value={g}>
              Group {g}
            </option>
          ))}
        </select>
      </label>
    </section>
  )
}
