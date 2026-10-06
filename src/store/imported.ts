import { readJson, writeJson } from './storage.ts';

/** Which accounts have already had this browser's pre-accounts bests imported, as hashes (never emails). */
const IMPORTED = 'mapped:imported:v1';

/** SHA-256 hex of the lowercased email. */
export async function emailKey(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.toLowerCase()));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function read(storage: Storage | null): string[] {
  const list = readJson<unknown>(storage, IMPORTED);
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
}

export const hasImported = (storage: Storage | null, key: string): boolean => read(storage).includes(key);

export function markImported(storage: Storage | null, key: string): void {
  writeJson(storage, IMPORTED, [...read(storage), key]);
}
