/// <reference types="vite/client" />
import type { DesktopApi } from '../electron/preload'

declare global {
  interface Window {
    /** Exposed by the Electron preload script. Undefined in plain browser/tests. */
    desktop?: DesktopApi
  }
}
