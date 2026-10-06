import { readJson, writeJson } from './storage.ts';

export type Theme = 'dark' | 'light';
const KEY = 'mapped:theme';

export function readTheme(storage: Storage | null): Theme {
  return readJson<Theme>(storage, KEY) === 'light' ? 'light' : 'dark';
}

export function writeTheme(storage: Storage | null, theme: Theme): void {
  writeJson(storage, KEY, theme);
}
