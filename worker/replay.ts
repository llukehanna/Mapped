import type { UnrankedReason } from '../src/api/types.ts';
import { COUNTRIES } from '../src/data/countries.ts';
import { toAction, type LogEntry, type LoggedAction } from '../src/game/log.ts';
import { CLOCK_TOLERANCE_MS, MIN_FIND_GAP_MS, MIN_MS_PER_COUNTRY, type Board } from '../src/game/ranking.ts';
import { initialState, reduce } from '../src/game/reducer.ts';
import { seededRandom, shuffle } from '../src/game/rng.ts';
import { poolFor } from '../src/game/scope.ts';
import type { EndReason, GameConfig, GameState } from '../src/game/types.ts';

export const MAX_LOG_ENTRIES = 5000;
const DAY_MS = 86_400_000;
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 8;

function parseAction(value: unknown): LoggedAction | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  switch (a.type) {
    case 'found':
      if (!isId(a.id)) return null;
      return a.corrected === true ? { type: 'found', id: a.id, corrected: true } : { type: 'found', id: a.id };
    case 'click':
      return isId(a.id) ? { type: 'click', id: a.id } : null;
    case 'hint':
      return typeof a.rand === 'number' && a.rand >= 0 && a.rand < 1 ? { type: 'hint', rand: a.rand } : null;
    case 'skip':
    case 'pause':
    case 'resume':
    case 'giveUp':
    case 'tick':
      return { type: a.type };
    default:
      return null;
  }
}

/** A log from untrusted JSON: well-formed entries with times that never go backwards. */
export function parseLog(value: unknown): LogEntry[] | null {
  if (!Array.isArray(value) || value.length > MAX_LOG_ENTRIES) return null;
  const out: LogEntry[] = [];
  let last = 0;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const { t, a } = entry as Record<string, unknown>;
    if (!Number.isInteger(t) || (t as number) < last || (t as number) > DAY_MS) return null;
    const action = parseAction(a);
    if (!action) return null;
    last = t as number;
    out.push({ t: last, a: action });
  }
  return out;
}

export interface Replayed {
  state: GameState;
  /** log times of each successful find, in order */
  findTimes: number[];
  paused: boolean;
}

/**
 * Plays the game again from the server's seed. Null when an entry changed nothing (an honest client
 * only logs actions that did something), when entries follow the end, or when the game never ended.
 */
export function replay(config: GameConfig, seed: number, log: LogEntry[]): Replayed | null {
  const pool = poolFor(config.scope, COUNTRIES);
  let state = reduce(initialState(config), { type: 'start', config, pool, order: shuffle(pool, seededRandom(seed)), now: 0 });
  const findTimes: number[] = [];
  let paused = false;
  for (const entry of log) {
    if (state.phase === 'review') return null;
    const next = reduce(state, toAction(entry, 0));
    if (next === state) return null;
    if (next.found.length > state.found.length) findTimes.push(entry.t);
    if (entry.a.type === 'pause') paused = true;
    // The reducer appends to the log it is given; nobody reads it here, so keep it empty (linear, not quadratic).
    state = next.log.length ? { ...next, log: [] } : next;
  }
  return state.phase === 'review' ? { state, findTimes, paused } : null;
}

export interface Verdict {
  found: number;
  total: number;
  hints: number;
  ms: number;
  endReason: EndReason;
  /** null: ranks (once it has an owner) */
  reason: Exclude<UnrankedReason, 'anonymous'> | null;
}

export interface JudgeInput {
  config: GameConfig;
  seed: number;
  log: LogEntry[];
  board: Board | null;
  /** server clock: receipt of /finish minus the recorded start */
  serverElapsedMs: number;
}

/** The game's result from the server's own replay, and whether it may rank. Null if the log doesn't replay. */
export function judge({ config, seed, log, board, serverElapsedMs }: JudgeInput): Verdict | null {
  const played = replay(config, seed, log);
  if (!played) return null;
  const { state, findTimes, paused } = played;
  const result = { found: state.found.length, total: state.pool.length, hints: state.hintsUsed, ms: state.elapsedMs, endReason: state.endReason! };
  // Unfinished runs rank too (more found first), so the speed check is per country found.
  const tooFast =
    result.ms / result.found < MIN_MS_PER_COUNTRY || findTimes.some((t, i) => i > 0 && t - findTimes[i - 1] < MIN_FIND_GAP_MS);
  const reason = !board
    ? 'custom'
    : result.found === 0
      ? 'incomplete'
      : paused
        ? 'paused'
        : result.ms < serverElapsedMs - CLOCK_TOLERANCE_MS || tooFast
          ? 'unverified'
          : null;
  return { ...result, reason };
}
