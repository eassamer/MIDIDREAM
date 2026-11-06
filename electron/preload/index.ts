import { contextBridge, ipcRenderer } from 'electron'

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
} as const

export type DesktopApi = typeof api

contextBridge.exposeInMainWorld('desktop', api)
