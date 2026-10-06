/** localStorage, or null when the browser blocks it (private mode, disabled site data). */
export function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__mapped_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function readJson<T>(storage: Storage | null, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(storage: Storage | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: bests are a nicety, never an error.
  }
}
