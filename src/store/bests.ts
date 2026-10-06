import { parseConfig } from '../game/ranking.ts';
import { scopeFromKey, scopeKey } from '../game/scope.ts';
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

const BEST_PREFIX = 'mapped:best:v1:';

export function bestKey(config: GameConfig): string {
  return `${BEST_PREFIX}${config.mode}:${scopeKey(config.scope)}:${config.timeLimitSec ?? 'none'}`;
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

const isResult = (r: Result | null): r is Result => !!r && [r.found, r.total, r.ms, r.hints, r.at].every((n) => typeof n === 'number');

/** Every best this browser has saved, with the setup it was for. Keys or values that don't parse are skipped. */
export function localBests(storage: Storage | null): { config: GameConfig; result: Result }[] {
  const found: { config: GameConfig; result: Result }[] = [];
  try {
    for (let i = 0; i < (storage?.length ?? 0); i++) {
      const key = storage!.key(i);
      if (!key?.startsWith(BEST_PREFIX)) continue;
      const [mode, scope, limit, ...extra] = key.slice(BEST_PREFIX.length).split(':');
      const timeLimitSec = limit === 'none' ? null : Number(limit);
      if (extra.length > 0 || !scope || !(timeLimitSec === null || Number.isInteger(timeLimitSec))) continue;
      const config = parseConfig({ mode, scope: scopeFromKey(scope), timeLimitSec });
      const result = readJson<Result>(storage, key);
      if (config && isResult(result)) found.push({ config, result });
    }
  } catch {
    // Blocked storage: nothing to import.
  }
  return found;
}
