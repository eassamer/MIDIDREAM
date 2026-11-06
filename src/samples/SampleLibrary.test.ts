import { describe, expect, it } from 'vitest'
import { createStore } from 'zustand/vanilla'
import type { PreferenceStore } from '../persistence/preferences'
import type { SampleState } from '../state/sampleStore'
import {
  PREF_SAMPLE_LIBRARY,
  SampleLibrary,
  browsableRefs,
  sampleNameFromPath,
  sanitizeLibrary,
  type ReadResult,
} from './SampleLibrary'

function setup(files: Record<string, ReadResult> = {}, opts: { failDecode?: boolean } = {}) {
  const data: Record<string, unknown> = {}
  const prefs: PreferenceStore = {
    get: async <T>(k: string) => (data[k] as T) ?? null,
    set: async (k, v) => {
      data[k] = v
    },
  }
  const store = createStore<SampleState>()(() => ({ library: [], status: {}, search: '' }))
  const loaded = new Set<string>()
  const reads: string[] = []
  let replacement: string | null = null
  const lib = new SampleLibrary(
    store,
    {
      pickFiles: async () => Object.keys(files),
      pickFolder: async () => Object.keys(files),
      pickReplacement: async () => replacement,
      read: async (path) => {
        reads.push(path)
        return files[path] ?? { ok: false, reason: 'missing' }
      },
    },
    {
      loadSample: async (id) => {
        if (opts.failDecode) throw new Error('bad data')
        loaded.add(id)
        return { duration: 1.5 }
      },
      hasSample: (id) => loaded.has(id),
    },
    prefs,
  )
  return {
    lib,
    store,
    data,
    reads,
    setReplacement: (p: string) => (replacement = p),
    files,
  }
}

const ok: ReadResult = { ok: true, data: new Uint8Array([1, 2, 3]) }

describe('SampleLibrary', () => {
  it('imports, deduplicates by path, and persists', async () => {
    const t = setup({ '/s/Kick 01.wav': ok, '/s/Snare.aif': ok })
    await t.lib.importFiles()
    await t.lib.importFiles()
    const lib = t.store.getState().library
    expect(lib.map((e) => e.name)).toEqual(['Kick 01', 'Snare'])
    expect(t.data[PREF_SAMPLE_LIBRARY]).toEqual(lib)
  })

  it('restores the library from preferences', async () => {
    const first = setup({ '/a.wav': ok })
    await first.lib.importFolder()
    const second = setup()
    second.data[PREF_SAMPLE_LIBRARY] = first.data[PREF_SAMPLE_LIBRARY]
    await second.lib.start()
    expect(second.store.getState().library).toEqual(first.store.getState().library)
  })

  it('loads on demand once, and reports ready with duration', async () => {
    const t = setup({ '/a.wav': ok })
    const [entry] = t.lib.addPaths(['/a.wav'])
    const ref = { id: entry!.id, name: 'a', origin: 'user' as const, path: '/a.wav' }
    const [a, b] = await Promise.all([t.lib.ensureLoaded(ref), t.lib.ensureLoaded(ref)])
    expect(a && b).toBe(true)
    expect(t.reads).toEqual(['/a.wav'])
    expect(t.store.getState().status[ref.id]).toEqual({ state: 'ready', duration: 1.5 })
    await t.lib.ensureLoaded(ref)
    expect(t.reads).toHaveLength(1)
  })

  it('treats built-ins as always loaded', async () => {
    const t = setup()
    const ok = await t.lib.ensureLoaded({
      id: 'builtin:kick',
      name: 'Kick',
      origin: 'builtin',
      path: '',
    })
    expect(ok).toBe(true)
    expect(t.reads).toEqual([])
  })

  it('flags missing files and decode failures', async () => {
    const t = setup({}, {})
    const missing = { id: 'user:x', name: 'x', origin: 'user' as const, path: '/gone.wav' }
    expect(await t.lib.ensureLoaded(missing)).toBe(false)
    expect(t.store.getState().status['user:x']).toMatchObject({ state: 'missing' })

    const bad = setup({ '/b.wav': ok }, { failDecode: true })
    const ref = { id: 'user:b', name: 'b', origin: 'user' as const, path: '/b.wav' }
    expect(await bad.lib.ensureLoaded(ref)).toBe(false)
    expect(bad.store.getState().status['user:b']).toMatchObject({
      state: 'error',
      message: expect.stringContaining('bad data'),
    })
  })

  it('relinks a missing file to a new path, keeping its id', async () => {
    const t = setup({ '/new/kick.wav': ok })
    const [entry] = t.lib.addPaths(['/old/kick.wav'])
    const ref = { id: entry!.id, name: entry!.name, origin: 'user' as const, path: entry!.path }
    expect(await t.lib.ensureLoaded(ref)).toBe(false)
    t.setReplacement('/new/kick.wav')
    const next = await t.lib.relink(ref)
    expect(next).toEqual({ ...ref, path: '/new/kick.wav' })
    expect(t.store.getState().library).toEqual([{ ...entry, path: '/new/kick.wav' }])
    expect(t.store.getState().status[ref.id]?.state).toBe('ready')
  })

  it('removes entries without touching files', async () => {
    const t = setup()
    const [a] = t.lib.addPaths(['/a.wav', '/b.wav'])
    t.lib.remove(a!.id)
    expect(t.store.getState().library.map((e) => e.path)).toEqual(['/b.wav'])
  })
})

describe('helpers', () => {
  it('names samples from paths', () => {
    expect(sampleNameFromPath('/Users/me/Drums/Kick 909.WAV')).toBe('Kick 909')
    expect(sampleNameFromPath('C:\\\\x\\\\hat.aiff')).toBe('hat')
  })

  it('sanitizes stored libraries', () => {
    expect(
      sanitizeLibrary([
        { id: 'a', name: 'A', path: '/a.wav' },
        { id: 'a', name: 'dup', path: '/dup.wav' },
        { id: 1, name: 'bad', path: '/bad.wav' },
        null,
      ]),
    ).toEqual([{ id: 'a', name: 'A', path: '/a.wav' }])
    expect(sanitizeLibrary('nope')).toEqual([])
  })

  it('lists built-ins before user samples', () => {
    const refs = browsableRefs([{ id: 'user:1', name: 'Mine', path: '/m.wav' }])
    expect(refs[0]!.origin).toBe('builtin')
    expect(refs.at(-1)).toEqual({ id: 'user:1', name: 'Mine', origin: 'user', path: '/m.wav' })
  })
})
