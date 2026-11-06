/**
 * Preference storage. Uses the Electron host (JSON file in userData) when
 * available and falls back to localStorage in a plain browser.
 */
export interface PreferenceStore {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
}

const LS_PREFIX = 'electribe-mini:'

export const preferences: PreferenceStore = {
  async get<T>(key: string): Promise<T | null> {
    if (typeof window !== 'undefined' && window.desktop) {
      return (await window.desktop.prefs.get(key)) as T | null
    }
    try {
      const raw = globalThis.localStorage?.getItem(LS_PREFIX + key)
      return raw == null ? null : (JSON.parse(raw) as T)
    } catch {
      return null
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    if (typeof window !== 'undefined' && window.desktop) {
      await window.desktop.prefs.set(key, value)
      return
    }
    try {
      globalThis.localStorage?.setItem(LS_PREFIX + key, JSON.stringify(value))
    } catch {
      // Storage unavailable (private mode, tests): preferences are not persisted.
    }
  },
}
