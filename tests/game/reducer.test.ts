import { describe, expect, it } from 'vitest';
import { elapsed, initialState, reduce, target, TRIES_PER_TARGET } from '../../src/game/reducer.ts';
import type { GameConfig, GameState } from '../../src/game/types.ts';

const POOL = ['ARG', 'BRA', 'CHL'];
const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({ mode: 'type', scope: { continents: ['south-america'], subregions: [] }, timeLimitSec: null, ...over });
const start = (over: Partial<GameConfig> = {}, order = POOL): GameState =>
  reduce(initialState(cfg(over)), { type: 'start', config: cfg(over), pool: POOL, order, now: 1000 });

describe('type mode', () => {
  it('starts playing with an empty found list and a running clock', () => {
    const s = start();
    expect(s.phase).toBe('playing');
    expect(s.found).toEqual([]);
    expect(elapsed(s, 4000)).toBe(3000);
  });

  it('records finds in order and emits a found event', () => {
    let s = start();
    s = reduce(s, { type: 'found', id: 'BRA', now: 2000 });
    s = reduce(s, { type: 'found', id: 'ARG', now: 3000 });
    expect(s.found).toEqual(['BRA', 'ARG']);
    expect(s.event).toEqual({ kind: 'found', id: 'ARG', seq: 2 });
  });

  it('carries a typo correction through to the event', () => {
    const s = reduce(start(), { type: 'found', id: 'BRA', now: 2000, corrected: true });
    expect(s.event).toEqual({ kind: 'found', id: 'BRA', corrected: true, seq: 1 });
  });

  it('ignores duplicates and ids outside the pool', () => {
    let s = reduce(start(), { type: 'found', id: 'BRA', now: 2000 });
    expect(reduce(s, { type: 'found', id: 'BRA', now: 2500 })).toBe(s);
    expect(reduce(s, { type: 'found', id: 'FRA', now: 2500 })).toBe(s);
  });

  it('ends as complete when every country is found, freezing the clock', () => {
    let s = start();
    for (const id of POOL) s = reduce(s, { type: 'found', id, now: 9000 });
    expect(s.phase).toBe('review');
    expect(s.endReason).toBe('complete');
    expect(s.missed).toEqual([]);
    expect(elapsed(s, 99_000)).toBe(8000);
  });

  it('give up moves every unfound country to missed', () => {
    let s = reduce(start(), { type: 'found', id: 'BRA', now: 2000 });
    s = reduce(s, { type: 'giveUp', now: 5000 });
    expect(s.endReason).toBe('gaveUp');
    expect(s.missed.sort()).toEqual(['ARG', 'CHL']);
  });
});

describe('timer', () => {
  it('times out at the limit and caps elapsed at the limit', () => {
    let s = start({ timeLimitSec: 60 });
    s = reduce(s, { type: 'tick', now: 60_999 });
    expect(s.phase).toBe('playing');
    s = reduce(s, { type: 'tick', now: 61_400 });
    expect(s.phase).toBe('review');
    expect(s.endReason).toBe('timeout');
    expect(s.elapsedMs).toBe(60_000);
  });

  it('never times out without a limit', () => {
    expect(reduce(start(), { type: 'tick', now: 10_000_000 }).phase).toBe('playing');
  });

  it('give up works while paused, keeping the paused clock time', () => {
    let s = reduce(start(), { type: 'pause', now: 4000 });
    s = reduce(s, { type: 'giveUp', now: 90_000 });
    expect(s.phase).toBe('review');
    expect(s.endReason).toBe('gaveUp');
    expect(s.elapsedMs).toBe(3000);
  });

  it('pause stops the clock and ignores guesses until resumed', () => {
    let s = reduce(start(), { type: 'pause', now: 4000 });
    expect(s.phase).toBe('paused');
    expect(elapsed(s, 50_000)).toBe(3000);
    expect(reduce(s, { type: 'found', id: 'BRA', now: 5000 })).toBe(s);
    s = reduce(s, { type: 'resume', now: 50_000 });
    expect(elapsed(s, 51_000)).toBe(4000);
  });
});

describe('hints in type mode', () => {
  it('climbs the ladder of the country the player picked, up to the top rung', () => {
    let s = start();
    s = reduce(s, { type: 'hint', id: 'CHL', now: 5000 });
    expect(s.hint).toEqual({ id: 'CHL', level: 1 });
    expect(s.event).toMatchObject({ kind: 'hint', id: 'CHL', level: 1 });
    for (let i = 0; i < 5; i++) s = reduce(s, { type: 'hint', id: 'CHL', now: 5000 });
    expect(s.hint).toEqual({ id: 'CHL', level: 4 });
    expect(s.hintsUsed).toBe(4);
  });

  it('picking another country starts its ladder over', () => {
    let s = reduce(start(), { type: 'hint', id: 'CHL', now: 5000 });
    s = reduce(s, { type: 'hint', id: 'BRA', now: 5000 });
    expect(s.hint).toEqual({ id: 'BRA', level: 1 });
    expect(s.hintsUsed).toBe(2);
  });

  it('ignores hints for found or out-of-scope countries', () => {
    const s = reduce(start(), { type: 'found', id: 'ARG', now: 2000 });
    expect(reduce(s, { type: 'hint', id: 'ARG', now: 5000 })).toBe(s);
    expect(reduce(s, { type: 'hint', id: 'FRA', now: 5000 })).toBe(s);
  });

  it('finding the hinted country clears the hint', () => {
    let s = reduce(start(), { type: 'hint', id: 'ARG', now: 5000 });
    s = reduce(s, { type: 'found', id: 'ARG', now: 2000 });
    expect(s.hint).toBeNull();
  });

  it('still replays old random hints: six rungs on one country, then a new one', () => {
    let s = start();
    for (let i = 0; i < 6; i++) s = reduce(s, { type: 'hint', rand: 0, now: 5000 });
    expect(s.hint).toEqual({ id: 'ARG', level: 6 });
    s = reduce(s, { type: 'hint', rand: 0.99, now: 5000 });
    expect(s.hint).toEqual({ id: 'CHL', level: 1 });
    expect(s.hintsUsed).toBe(7);
  });

  it('a new hint past the shortened ladder changes nothing', () => {
    let s = start();
    for (let i = 0; i < 5; i++) s = reduce(s, { type: 'hint', rand: 0, now: 5000 });
    expect(reduce(s, { type: 'hint', id: 'ARG', now: 5000 })).toBe(s);
  });
});

describe('locate mode', () => {
  const locate = () => start({ mode: 'locate' }, ['CHL', 'ARG', 'BRA']);

  it('asks for targets in the given order', () => {
    expect(target(locate())).toBe('CHL');
  });

  it('a correct click finds the target and advances', () => {
    const s = reduce(locate(), { type: 'click', id: 'CHL', now: 2000 });
    expect(s.found).toEqual(['CHL']);
    expect(target(s)).toBe('ARG');
    expect(s.triesLeft).toBe(TRIES_PER_TARGET);
  });

  it('a wrong click costs a try and emits a wrong event for the clicked country', () => {
    const s = reduce(locate(), { type: 'click', id: 'BRA', now: 2000 });
    expect(s.triesLeft).toBe(TRIES_PER_TARGET - 1);
    expect(s.event).toMatchObject({ kind: 'wrong', id: 'BRA' });
    expect(target(s)).toBe('CHL');
  });

  it('running out of tries reveals the target as missed and advances', () => {
    let s = locate();
    for (let i = 0; i < TRIES_PER_TARGET; i++) s = reduce(s, { type: 'click', id: 'BRA', now: 2000 });
    expect(s.missed).toEqual(['CHL']);
    expect(s.event).toMatchObject({ kind: 'revealed', id: 'CHL' });
    expect(target(s)).toBe('ARG');
  });

  it('clicks outside the pool are ignored', () => {
    const s = locate();
    expect(reduce(s, { type: 'click', id: 'FRA', now: 2000 })).toBe(s);
  });

  it('skip reveals and advances; the game completes when the queue is empty', () => {
    let s = locate();
    s = reduce(s, { type: 'skip', now: 2000 });
    s = reduce(s, { type: 'click', id: 'ARG', now: 3000 });
    s = reduce(s, { type: 'skip', now: 4000 });
    expect(s.phase).toBe('review');
    expect(s.endReason).toBe('complete');
    expect(s.found).toEqual(['ARG']);
    expect(s.missed.sort()).toEqual(['BRA', 'CHL']);
  });

  it('hints are only for the current country and stop at the top rung (3 in locate)', () => {
    expect(reduce(locate(), { type: 'hint', id: 'ARG', now: 5000 }).hint).toBeNull();
    let s = reduce(locate(), { type: 'hint', id: 'CHL', now: 5000 });
    expect(s.hint).toEqual({ id: 'CHL', level: 1 });
    for (let i = 0; i < 4; i++) s = reduce(s, { type: 'hint', id: 'CHL', now: 5000 });
    expect(s.hint).toEqual({ id: 'CHL', level: 3 });
    expect(s.hintsUsed).toBe(3);
  });
});

describe('identify mode', () => {
  it('found advances; give up marks the rest of the queue missed', () => {
    let s = start({ mode: 'identify' }, ['BRA', 'ARG', 'CHL']);
    s = reduce(s, { type: 'found', id: 'BRA', now: 2000 });
    expect(target(s)).toBe('ARG');
    s = reduce(s, { type: 'giveUp', now: 3000 });
    expect(s.missed.sort()).toEqual(['ARG', 'CHL']);
  });

  it('only the current target can be found', () => {
    const s = start({ mode: 'identify' }, ['BRA', 'ARG', 'CHL']);
    expect(reduce(s, { type: 'found', id: 'ARG', now: 2000 }).found).toEqual([]);
  });
});

describe('topics', () => {
  it('flags · type is ordered: one flag at a time, typed answers must be the target', () => {
    let s = start({ topic: 'flags' }, ['CHL', 'ARG', 'BRA']);
    expect(target(s)).toBe('CHL');
    expect(reduce(s, { type: 'found', id: 'ARG', now: 2000 })).toBe(s);
    s = reduce(s, { type: 'found', id: 'CHL', now: 2000 });
    expect(target(s)).toBe('ARG');
    s = reduce(s, { type: 'skip', now: 2500 });
    expect(s.missed).toEqual(['ARG']);
  });

  it('flags · identify: a pick is a click; any country may be picked; wrong picks cost tries', () => {
    let s = start({ topic: 'flags', mode: 'identify' }, ['CHL', 'ARG', 'BRA']);
    s = reduce(s, { type: 'click', id: 'ROU', now: 2000 }); // a lookalike outside the pool
    expect(s.triesLeft).toBe(TRIES_PER_TARGET - 1);
    expect(reduce(s, { type: 'click', id: 'NOPE', now: 2100 })).toBe(s); // not a country
    s = reduce(s, { type: 'click', id: 'CHL', now: 2200 });
    expect(s.found).toEqual(['CHL']);
  });

  it('countries · identify still ignores clicks', () => {
    const s = start({ mode: 'identify' });
    expect(reduce(s, { type: 'click', id: 'ARG', now: 2000 })).toBe(s);
  });

  it('capitals · type is unordered like countries · type', () => {
    const s = start({ topic: 'capitals' });
    expect(target(s)).toBeNull();
    expect(reduce(s, { type: 'found', id: 'BRA', now: 2000 }).found).toEqual(['BRA']);
  });

  it('hint ladders follow the topic', () => {
    let s = start({ topic: 'flags', mode: 'identify' }, ['CHL', 'ARG', 'BRA']);
    s = reduce(s, { type: 'hint', id: 'CHL', now: 2000 });
    s = reduce(s, { type: 'hint', id: 'CHL', now: 2100 });
    expect(s.hintsUsed).toBe(2);
    expect(reduce(s, { type: 'hint', id: 'CHL', now: 2200 })).toBe(s);
  });
});
