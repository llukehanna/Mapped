import { readJson, writeJson } from './storage.ts';

/** Ids of every flag learned on this browser (localStorage only, never sent anywhere). */
export const LEARNED_KEY = 'mapped:learn:v1:flags';

export function readLearned(storage: Storage | null): Set<string> {
  const list = readJson<unknown>(storage, LEARNED_KEY);
  return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
}

export function addLearned(storage: Storage | null, ids: readonly string[]): void {
  writeJson(storage, LEARNED_KEY, [...new Set([...readLearned(storage), ...ids])]);
}

/** Forgets these ids (the selected region's); everything else stays learned. */
export function resetLearned(storage: Storage | null, ids: readonly string[]): void {
  const drop = new Set(ids);
  writeJson(storage, LEARNED_KEY, [...readLearned(storage)].filter((id) => !drop.has(id)));
}
