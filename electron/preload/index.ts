import { contextBridge, ipcRenderer, webUtils } from 'electron'

/**
 * Minimal, explicit bridge between the sandboxed renderer and the host.
 * Grow this deliberately (file dialogs, project IO) as milestones require.
 */
const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
  prefs: {
    get: (key: string): Promise<unknown> => ipcRenderer.invoke('prefs:get', key),
    set: (key: string, value: unknown): Promise<void> =>
      ipcRenderer.invoke('prefs:set', key, value),
  },
  samples: {
    /** Open a file picker; resolves to absolute paths (empty if cancelled). */
    pickFiles: (): Promise<string[]> => ipcRenderer.invoke('samples:pickFiles'),
    /** Pick a folder and list the WAV/AIFF files inside it (recursively). */
    pickFolder: (): Promise<string[]> => ipcRenderer.invoke('samples:pickFolder'),
    pickReplacement: (name: string): Promise<string | null> =>
      ipcRenderer.invoke('samples:pickReplacement', name),
    read: (
      path: string,
    ): Promise<
      | { ok: true; data: Uint8Array }
      | { ok: false; reason: 'missing' | 'unsupported' | 'too-large' | 'error'; message?: string }
    > => ipcRenderer.invoke('samples:read', path),
    /** Absolute path of a file dropped onto the window. */
    pathForFile: (file: File): string => webUtils.getPathForFile(file),
  },
} as const

export type DesktopApi = typeof api

contextBridge.exposeInMainWorld('desktop', api)
