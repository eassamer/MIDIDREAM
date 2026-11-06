import { app, ipcMain } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * User preferences (MIDI device, mappings, ...) stored as one JSON document in
 * the app's userData folder, so they survive restarts and are shared between
 * dev and packaged builds.
 */
const prefsPath = () => join(app.getPath('userData'), 'preferences.json')

async function readAll(): Promise<Record<string, unknown>> {
  try {
    const data: unknown = JSON.parse(await readFile(prefsPath(), 'utf8'))
    return typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

// Serialize writes so concurrent set() calls cannot interleave.
let writeChain: Promise<void> = Promise.resolve()

async function setKey(key: string, value: unknown): Promise<void> {
  const all = await readAll()
  if (value === undefined) delete all[key]
  else all[key] = value
  const target = prefsPath()
  await mkdir(app.getPath('userData'), { recursive: true })
  const tmp = `${target}.tmp`
  await writeFile(tmp, JSON.stringify(all, null, 2), 'utf8')
  await rename(tmp, target) // atomic replace: no half-written file on crash
}

export function registerPreferencesIpc(): void {
  ipcMain.handle('prefs:get', async (_e, key: unknown) => {
    if (typeof key !== 'string') throw new Error('prefs:get key must be a string')
    return (await readAll())[key] ?? null
  })
  ipcMain.handle('prefs:set', (_e, key: unknown, value: unknown) => {
    if (typeof key !== 'string') throw new Error('prefs:set key must be a string')
    writeChain = writeChain
      .then(() => setKey(key, value))
      .catch((err: unknown) => {
        console.error('Failed to write preferences', err)
      })
    return writeChain
  })
}
