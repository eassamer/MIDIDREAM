import { BUILTIN_SAMPLE_IDS, builtinSampleRef, isBuiltinSampleId } from '../audio/builtinSamples'
import type { PreferenceStore } from '../persistence/preferences'
import type { SampleRef } from '../project/types'
import type { LibraryEntry, SampleStatus } from '../state/sampleStore'
import type { StoreApi } from 'zustand/vanilla'
import type { SampleState } from '../state/sampleStore'

export const PREF_SAMPLE_LIBRARY = 'samples.library'

export type ReadResult =
  | { ok: true; data: Uint8Array }
  | { ok: false; reason: 'missing' | 'unsupported' | 'too-large' | 'error'; message?: string }

/** Host file access (Electron preload in the app, fakes in tests). */
export interface SampleFiles {
  pickFiles(): Promise<string[]>
  pickFolder(): Promise<string[]>
  pickReplacement(name: string): Promise<string | null>
  read(path: string): Promise<ReadResult>
}

export interface SampleLoader {
  loadSample(id: string, bytes: Uint8Array): Promise<{ duration: number }>
  hasSample(id: string): boolean
}

let counter = 0
function newId(): string {
  counter++
  return `user:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter}`
}

/** File name without folder or extension. */
export function sampleNameFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  return base.replace(/\.(wav|aiff?|WAV|AIFF?)$/i, '')
}

export function entryToRef(entry: LibraryEntry): SampleRef {
  return { id: entry.id, name: entry.name, origin: 'user', path: entry.path }
}

/** Everything the browser can step through: built-ins first, then the user library. */
export function browsableRefs(library: LibraryEntry[]): SampleRef[] {
  return [...BUILTIN_SAMPLE_IDS.map(builtinSampleRef), ...library.map(entryToRef)]
}

export function sanitizeLibrary(data: unknown): LibraryEntry[] {
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  const out: LibraryEntry[] = []
  for (const e of data) {
    if (typeof e !== 'object' || e === null) continue
    const { id, name, path } = e as Record<string, unknown>
    if (typeof id !== 'string' || typeof path !== 'string' || typeof name !== 'string') continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push({ id, name, path })
  }
  return out
}

const FAILURE_TEXT: Record<Exclude<ReadResult, { ok: true }>['reason'], string> = {
  missing: 'File not found',
  unsupported: 'Not a WAV or AIFF file',
  'too-large': 'File is larger than 200 MB',
  error: 'Could not read the file',
}

/**
 * The user's sample library: which files exist, loading them into the
 * engine on demand, and repairing references to moved files. No React.
 */
export class SampleLibrary {
  private inflight = new Map<string, Promise<boolean>>()

  constructor(
    private readonly store: StoreApi<SampleState>,
    private readonly files: SampleFiles | null,
    private readonly loader: SampleLoader,
    private readonly prefs: PreferenceStore,
  ) {}

  get available(): boolean {
    return this.files !== null
  }

  async start(): Promise<void> {
    const library = sanitizeLibrary(await this.prefs.get(PREF_SAMPLE_LIBRARY))
    this.store.setState({ library })
  }

  /** Add files (deduplicated by path). Returns the entries for those paths. */
  addPaths(paths: string[]): LibraryEntry[] {
    const library = this.store.getState().library
    const byPath = new Map(library.map((e) => [e.path, e]))
    const added: LibraryEntry[] = []
    const result: LibraryEntry[] = []
    for (const path of paths) {
      let entry = byPath.get(path)
      if (!entry) {
        entry = { id: newId(), name: sampleNameFromPath(path), path }
        byPath.set(path, entry)
        added.push(entry)
      }
      result.push(entry)
    }
    if (added.length) this.setLibrary([...library, ...added])
    return result
  }

  async importFiles(): Promise<LibraryEntry[]> {
    if (!this.files) return []
    return this.addPaths(await this.files.pickFiles())
  }

  async importFolder(): Promise<LibraryEntry[]> {
    if (!this.files) return []
    return this.addPaths(await this.files.pickFolder())
  }

  remove(id: string): void {
    this.setLibrary(this.store.getState().library.filter((e) => e.id !== id))
  }

  /**
   * Make a sample playable. Built-ins are always loaded. Resolves false (and
   * records why) when the file is missing or cannot be decoded.
   */
  ensureLoaded(ref: SampleRef): Promise<boolean> {
    if (isBuiltinSampleId(ref.id) || this.loader.hasSample(ref.id)) return Promise.resolve(true)
    const running = this.inflight.get(ref.id)
    if (running) return running
    const task = this.load(ref).finally(() => this.inflight.delete(ref.id))
    this.inflight.set(ref.id, task)
    return task
  }

  /**
   * Point a missing sample at a new file chosen by the user. Keeps the id, so
   * every part using it follows. Returns the updated reference, or null.
   */
  async relink(ref: SampleRef): Promise<SampleRef | null> {
    if (!this.files) return null
    const path = await this.files.pickReplacement(ref.name)
    if (!path) return null
    const library = this.store.getState().library
    const exists = library.some((e) => e.id === ref.id)
    const entry: LibraryEntry = { id: ref.id, name: ref.name, path }
    this.setLibrary(
      exists ? library.map((e) => (e.id === ref.id ? entry : e)) : [...library, entry],
    )
    this.setStatus(ref.id, { state: 'idle' })
    const next = entryToRef(entry)
    await this.ensureLoaded(next)
    return next
  }

  private async load(ref: SampleRef): Promise<boolean> {
    if (!this.files) {
      this.setStatus(ref.id, { state: 'error', message: 'File access unavailable' })
      return false
    }
    this.setStatus(ref.id, { state: 'loading' })
    const res = await this.files.read(ref.path)
    if (!res.ok) {
      this.setStatus(ref.id, {
        state: res.reason === 'missing' ? 'missing' : 'error',
        message: res.message ?? FAILURE_TEXT[res.reason],
      })
      return false
    }
    try {
      const { duration } = await this.loader.loadSample(ref.id, res.data)
      this.setStatus(ref.id, { state: 'ready', duration })
      return true
    } catch (err) {
      this.setStatus(ref.id, {
        state: 'error',
        message: `Could not decode: ${err instanceof Error ? err.message : String(err)}`,
      })
      return false
    }
  }

  private setLibrary(library: LibraryEntry[]): void {
    this.store.setState({ library })
    void this.prefs.set(PREF_SAMPLE_LIBRARY, library)
  }

  private setStatus(id: string, status: SampleStatus): void {
    this.store.setState({ status: { ...this.store.getState().status, [id]: status } })
  }
}
