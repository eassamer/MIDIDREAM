import { useState } from 'react'
import { requestPattern } from '../../app/wiring'
import { MAX_PATTERNS } from '../../project/ProjectModel'
import { projectStore } from '../../state/projectStore'
import { useProjectStore } from '../../state/useProjectStore'
import { useTransport } from '../../state/transportStore'

/**
 * Pattern slots. Click to switch (queued to the loop end while playing);
 * double-click a name to rename it.
 */
export function PatternBar() {
  const patterns = useProjectStore((s) => s.project.patterns)
  const activeId = useProjectStore((s) => s.project.activePatternId)
  const queuedId = useTransport((s) => s.queuedPatternId)
  const [renaming, setRenaming] = useState<string | null>(null)
  const { addPattern, duplicatePattern, deletePattern, renamePattern } = projectStore.getState()

  return (
    <div className="pattern-bar" aria-label="Patterns">
      <span className="label">Patterns</span>
      <div className="pattern-list">
        {patterns.map((p, i) =>
          renaming === p.id ? (
            <input
              key={p.id}
              className="pattern-rename"
              autoFocus
              defaultValue={p.name}
              aria-label="Pattern name"
              onBlur={(e) => {
                renamePattern(p.id, e.target.value)
                setRenaming(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') setRenaming(null)
              }}
            />
          ) : (
            <button
              key={p.id}
              className={`pattern-chip ${p.id === activeId ? 'active' : ''} ${
                p.id === queuedId ? 'queued' : ''
              }`}
              onClick={() => requestPattern(p.id)}
              onDoubleClick={() => setRenaming(p.id)}
              title={`${p.name} · ${p.lengthBars} bar${p.lengthBars > 1 ? 's' : ''}${
                p.id === queuedId ? ' · starts at loop end' : ''
              }`}
            >
              <span className="pattern-num">{i + 1}</span>
              {p.name}
            </button>
          ),
        )}
      </div>
      <button
        onClick={addPattern}
        disabled={patterns.length >= MAX_PATTERNS}
        title="New empty pattern"
      >
        + New
      </button>
      <button
        onClick={duplicatePattern}
        disabled={patterns.length >= MAX_PATTERNS}
        title="Copy the current pattern"
      >
        Duplicate
      </button>
      <button
        onClick={() => {
          if (confirm('Delete this pattern?')) deletePattern()
        }}
        disabled={patterns.length <= 1}
        title="Delete the current pattern"
      >
        Delete
      </button>
    </div>
  )
}
