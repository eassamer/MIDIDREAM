import { useMemo, useState } from 'react'
import { assignSampleToPart, previewSample, sampleLibrary, stepSample } from '../../app/wiring'
import { builtinSampleRef, BUILTIN_SAMPLE_IDS } from '../../audio/builtinSamples'
import { entryToRef } from '../../samples/SampleLibrary'
import type { SampleRef } from '../../project/types'
import { projectStore } from '../../state/projectStore'
import { sampleStore, useSamples } from '../../state/sampleStore'
import { useProjectStore } from '../../state/useProjectStore'

/**
 * Built-in sounds and the user's sample library. Click a row to load it on
 * the selected part; ▶ previews without changing anything. Drop WAV/AIFF
 * files here to add them.
 */
export function SampleBrowser() {
  const library = useSamples((s) => s.library)
  const status = useSamples((s) => s.status)
  const search = useSamples((s) => s.search)
  const selectedPart = useProjectStore((s) => s.selectedPart)
  const sound = useProjectStore((s) => s.project.parts[s.selectedPart]!.sound)
  const currentId = sound.kind === 'sample' ? sound.sample?.id : 'synth'
  const [dropping, setDropping] = useState(false)

  const q = search.trim().toLowerCase()
  const builtins = useMemo(
    () => BUILTIN_SAMPLE_IDS.map(builtinSampleRef).filter((r) => r.name.toLowerCase().includes(q)),
    [q],
  )
  const users = useMemo(
    () =>
      library
        .filter((e) => e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q))
        .map(entryToRef),
    [library, q],
  )

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropping(false)
    const api = window.desktop?.samples
    if (!api) return
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => api.pathForFile(f))
      .filter((p) => /\.(wav|aiff?)$/i.test(p))
    const entries = sampleLibrary.addPaths(paths)
    // Dropping a single file also loads it onto the selected part.
    if (entries.length === 1) void assignSampleToPart(selectedPart, entryToRef(entries[0]!))
  }

  const row = (ref: SampleRef, removable: boolean) => {
    const st = status[ref.id]?.state
    return (
      <li
        key={ref.id}
        className={`sample-row ${currentId === ref.id ? 'current' : ''} ${
          st === 'missing' || st === 'error' ? 'bad' : ''
        }`}
      >
        <button
          className="sample-preview"
          onClick={() => void previewSample(ref)}
          title="Preview"
          aria-label={`Preview ${ref.name}`}
        >
          ▶
        </button>
        <button
          className="sample-name"
          onClick={() => void assignSampleToPart(selectedPart, ref)}
          title={ref.origin === 'user' ? ref.path : 'Built-in'}
        >
          {ref.name}
          {st === 'loading' && <span className="muted"> · loading</span>}
          {(st === 'missing' || st === 'error') && (
            <span className="warn"> · {status[ref.id]?.message}</span>
          )}
        </button>
        {removable && (
          <button
            className="sample-remove"
            title="Remove from library (the file is not deleted)"
            onClick={() => sampleLibrary.remove(ref.id)}
          >
            ✕
          </button>
        )}
      </li>
    )
  }

  return (
    <section
      className={`panel sample-browser ${dropping ? 'dropping' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <div className="panel-head">
        <h2>Sounds</h2>
        <button onClick={() => stepSample(-1)} title="Previous sound">
          ◀
        </button>
        <button onClick={() => stepSample(1)} title="Next sound">
          ▶
        </button>
      </div>
      <div className="browser-actions">
        <input
          className="browser-search"
          placeholder="Search"
          value={search}
          onChange={(e) => sampleStore.setState({ search: e.target.value })}
          aria-label="Search samples"
        />
        <button
          onClick={() => void sampleLibrary.importFiles()}
          disabled={!sampleLibrary.available}
        >
          Import files…
        </button>
        <button
          onClick={() => void sampleLibrary.importFolder()}
          disabled={!sampleLibrary.available}
        >
          Add folder…
        </button>
      </div>
      <ul className="sample-list">
        <li className={`sample-row ${currentId === 'synth' ? 'current' : ''}`}>
          <span className="sample-preview" />
          <button
            className="sample-name"
            onClick={() => projectStore.getState().assignSynth(selectedPart)}
          >
            Synth voice
          </button>
        </li>
        {builtins.length > 0 && <li className="sample-group">Built-in</li>}
        {builtins.map((r) => row(r, false))}
        <li className="sample-group">Your samples</li>
        {users.length === 0 && (
          <li className="muted small sample-empty">
            {library.length === 0
              ? 'Import WAV/AIFF files or a folder, or drop files here.'
              : 'No matches.'}
          </li>
        )}
        {users.map((r) => row(r, true))}
      </ul>
    </section>
  )
}
