import { describe, expect, it } from 'vitest';
import { toAction, toLogged } from '../../src/game/log.ts';
import { initialState, reduce } from '../../src/game/reducer.ts';
import type { GameConfig, GameState } from '../../src/game/types.ts';

const POOL = ['ARG', 'BRA', 'CHL'];
const cfg = (mode: GameConfig['mode'] = 'type'): GameConfig => ({ mode, scope: { continents: ['south-america'], subregions: [] }, timeLimitSec: null });
const start = (mode: GameConfig['mode'] = 'type'): GameState =>
  reduce(initialState(cfg(mode)), { type: 'start', config: cfg(mode), pool: POOL, order: POOL, now: 1000 });

describe('action log', () => {
  it('starts empty and records the start time', () => {
    const s = start();
    expect(s.startedAt).toBe(1000);
    expect(s.log).toEqual([]);
  });

  it('records each action that changed the game, with ms since the start', () => {
    let s = start();
    s = reduce(s, { type: 'found', id: 'BRA', now: 2500 });
    s = reduce(s, { type: 'hint', rand: 0.4, now: 3000 });
    s = reduce(s, { type: 'pause', now: 3500 });
    s = reduce(s, { type: 'resume', now: 9000 });
    s = reduce(s, { type: 'found', id: 'ARG', now: 9500, corrected: true });
    expect(s.log).toEqual([
      { t: 1500, a: { type: 'found', id: 'BRA' } },
      { t: 2000, a: { type: 'hint', rand: 0.4 } },
      { t: 2500, a: { type: 'pause' } },
      { t: 8000, a: { type: 'resume' } },
      { t: 8500, a: { type: 'found', id: 'ARG', corrected: true } },
    ]);
  });

  it('skips actions that changed nothing: repeats, outsiders, ticks before time is up', () => {
    let s = reduce(start(), { type: 'found', id: 'BRA', now: 2000 });
    s = reduce(s, { type: 'found', id: 'BRA', now: 2100 });
    s = reduce(s, { type: 'found', id: 'FRA', now: 2200 });
    s = reduce(s, { type: 'tick', now: 2300 });
    s = reduce(s, { type: 'resume', now: 2400 });
    expect(s.log).toHaveLength(1);
  });

  it('records the tick that ends a timed game', () => {
    const timed = { ...cfg(), timeLimitSec: 60 };
    let s = reduce(initialState(timed), { type: 'start', config: timed, pool: POOL, order: POOL, now: 0 });
    s = reduce(s, { type: 'tick', now: 30_000 });
    s = reduce(s, { type: 'tick', now: 60_050 });
    expect(s.phase).toBe('review');
    expect(s.log).toEqual([{ t: 60_050, a: { type: 'tick' } }]);
  });

  it('records wrong clicks in locate', () => {
    const s = reduce(start('locate'), { type: 'click', id: 'CHL', now: 1200 });
    expect(s.log).toEqual([{ t: 200, a: { type: 'click', id: 'CHL' } }]);
  });

  it('starting again clears the log', () => {
    const s = reduce(start(), { type: 'found', id: 'BRA', now: 2000 });
    const again = reduce(s, { type: 'start', config: cfg(), pool: POOL, order: POOL, now: 50_000 });
    expect(again.log).toEqual([]);
    expect(again.startedAt).toBe(50_000);
  });

  it('restore replaces the whole state', () => {
    const saved = reduce(start(), { type: 'giveUp', now: 4000 });
    expect(reduce(initialState(cfg()), { type: 'restore', state: saved })).toBe(saved);
  });

  it('toAction undoes toLogged', () => {
    for (const action of [
      { type: 'found', id: 'BRA', now: 1700 },
      { type: 'found', id: 'BRA', now: 1700, corrected: true },
      { type: 'click', id: 'CHL', now: 1700 },
      { type: 'hint', rand: 0.25, now: 1700 },
      { type: 'skip', now: 1700 },
      { type: 'giveUp', now: 1700 },
    ] as const) {
      expect(toAction({ t: 700, a: toLogged(action)! }, 1000)).toEqual(action);
    }
    expect(toLogged({ type: 'toSetup' })).toBeNull();
  });
});
