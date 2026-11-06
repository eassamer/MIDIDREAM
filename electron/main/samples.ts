import { BrowserWindow, dialog, ipcMain } from 'electron'
import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, isAbsolute, join } from 'node:path'

/**
 * Sample file access for the sandboxed renderer. Files are only ever read,
 * never modified: trim/reverse/pitch live in the project as parameters.
 */

/** Formats we decode (WAV via Chromium, AIFF via our own parser). */
export const AUDIO_EXTENSIONS = new Set(['.wav', '.aif', '.aiff'])
const MAX_FILE_BYTES = 200 * 1024 * 1024
const MAX_SCAN_FILES = 5000
const MAX_SCAN_DEPTH = 8

export type ReadResult =
  | { ok: true; data: Uint8Array }
  | { ok: false; reason: 'missing' | 'unsupported' | 'too-large' | 'error'; message?: string }

function isAudioPath(p: string): boolean {
  return AUDIO_EXTENSIONS.has(extname(p).toLowerCase())
}

async function scanFolder(root: string): Promise<string[]> {
  const found: string[] = []
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH || found.length >= MAX_SCAN_FILES) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return // unreadable folder: skip
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      if (found.length >= MAX_SCAN_FILES) return
      if (e.name.startsWith('.')) continue
      const full = join(dir, e.name)
      if (e.isDirectory()) await walk(full, depth + 1)
      else if (e.isFile() && isAudioPath(full)) found.push(full)
    }
  }
  await walk(root, 0)
  return found
}

export async function readSampleFile(path: unknown): Promise<ReadResult> {
  if (typeof path !== 'string' || !isAbsolute(path)) {
    return { ok: false, reason: 'error', message: 'Invalid path' }
  }
  if (!isAudioPath(path)) return { ok: false, reason: 'unsupported' }
  try {
    const info = await stat(path)
    if (!info.isFile()) return { ok: false, reason: 'missing' }
    if (info.size > MAX_FILE_BYTES) return { ok: false, reason: 'too-large' }
    const buf = await readFile(path)
    return { ok: true, data: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return { ok: false, reason: 'missing' }
    return { ok: false, reason: 'error', message: (err as Error).message }
  }
}

export function registerSamplesIpc(): void {
  const parent = () => BrowserWindow.getFocusedWindow() ?? undefined

  ipcMain.handle('samples:pickFiles', async () => {
    const win = parent()
    const options: Electron.OpenDialogOptions = {
      title: 'Import samples',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio (WAV, AIFF)', extensions: ['wav', 'aif', 'aiff'] }],
    }
    const res = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return res.canceled ? [] : res.filePaths.filter(isAudioPath)
  })

  ipcMain.handle('samples:pickFolder', async () => {
    const win = parent()
    const options: Electron.OpenDialogOptions = {
      title: 'Add a sample folder',
      properties: ['openDirectory'],
    }
    const res = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (res.canceled || !res.filePaths[0]) return []
    return scanFolder(res.filePaths[0])
  })

  /** Pick one file to replace a missing one. */
  ipcMain.handle('samples:pickReplacement', async (_e, name: unknown) => {
    const win = parent()
    const options: Electron.OpenDialogOptions = {
      title: typeof name === 'string' ? `Locate “${name}”` : 'Locate sample',
      properties: ['openFile'],
      filters: [{ name: 'Audio (WAV, AIFF)', extensions: ['wav', 'aif', 'aiff'] }],
    }
    const res = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    return res.canceled ? null : (res.filePaths[0] ?? null)
  })

  ipcMain.handle('samples:read', (_e, path: unknown) => readSampleFile(path))
}
