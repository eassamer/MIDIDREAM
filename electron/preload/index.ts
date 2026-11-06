import { contextBridge } from 'electron'

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
} as const

export type DesktopApi = typeof api

contextBridge.exposeInMainWorld('desktop', api)
