import { scopeKey } from '../game/scope.ts';
import type { GameConfig } from '../game/types.ts';
import { readJson, writeJson } from './storage.ts';

export interface Result {
  found: number;
  total: number;
  ms: number;
  hints: number;
  /** epoch ms when the game ended */
  at: number;
}

export function bestKey(config: GameConfig): string {
  return `mapped:best:v1:${config.mode}:${scopeKey(config.scope)}:${config.timeLimitSec ?? 'none'}`;
}

/** More found wins, then a faster time, then fewer hints. */
export function isBetter(a: Result, b: Result | null): boolean {
  if (!b) return true;
  if (a.found !== b.found) return a.found > b.found;
  if (a.ms !== b.ms) return a.ms < b.ms;
  return a.hints < b.hints;
}

export function readBest(storage: Storage | null, config: GameConfig): Result | null {
  return readJson<Result>(storage, bestKey(config));
}

/** Saves `result` if it beats the stored best. Returns whether it did. */
export function recordResult(storage: Storage | null, config: GameConfig, result: Result): boolean {
  if (!isBetter(result, readBest(storage, config))) return false;
  writeJson(storage, bestKey(config), result);
  return true;
}
