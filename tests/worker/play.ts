import { COUNTRIES } from '../../src/data/countries.ts';
import type { LogEntry } from '../../src/game/log.ts';
import { initialState, reduce, target } from '../../src/game/reducer.ts';
import { seededRandom, shuffle } from '../../src/game/rng.ts';
import { poolFor } from '../../src/game/scope.ts';
import type { GameAction, GameConfig, GameState } from '../../src/game/types.ts';

export type Move = (s: GameState, now: number) => GameAction | null;

/** Plays like the browser does: the server's seed for the order, the real reducer, and the state's own log. */
export function play(config: GameConfig, seed: number, moves: Move, step = 2000): LogEntry[] {
  const pool = poolFor(config.scope, COUNTRIES);
  let s = reduce(initialState(config), { type: 'start', config, pool, order: shuffle(pool, seededRandom(seed)), now: 1_000_000 });
  for (let now = 1_000_000 + step; s.phase !== 'review'; now += step) {
    const action = moves(s, now);
    if (!action) break;
    s = reduce(s, action);
  }
  return s.log;
}

export const typeAll: Move = (s, now) => ({ type: 'found', id: s.pool.find((id) => !s.found.includes(id))!, now });
export const clickTarget: Move = (s, now) => ({ type: 'click', id: target(s)!, now });
