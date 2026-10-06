import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../src/game/log.ts';
import { boardFor } from '../../src/game/ranking.ts';
import { target } from '../../src/game/reducer.ts';
import type { GameConfig } from '../../src/game/types.ts';
import { judge, parseLog, replay } from '../../worker/replay.ts';
import { clickTarget, play as basePlay, typeAll, type Move } from './play.ts';

const SEED = 42;
const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({ mode: 'type', scope: { continents: ['south-america'], subregions: [] }, timeLimitSec: null, ...over });

const play = (config: GameConfig, moves: Move, step = 2000, seed = SEED) => basePlay(config, seed, moves, step);
const verdict = (config: GameConfig, log: LogEntry[], serverElapsedMs = log.at(-1)!.t + 300) =>
  judge({ config, seed: SEED, log, board: boardFor(config), serverElapsedMs });

describe('honest games rank', () => {
  it('type: every country, 2 s apart', () => {
    const log = play(cfg(), typeAll);
    expect(verdict(cfg(), log)).toEqual({ found: 12, total: 12, hints: 0, ms: 24_000, endReason: 'complete', reason: null });
  });

  it('locate: clicking each target in the server order', () => {
    const config = cfg({ mode: 'locate' });
    expect(verdict(config, play(config, clickTarget))).toMatchObject({ found: 12, reason: null });
  });

  it('identify, with hints along the way', () => {
    const config = cfg({ mode: 'identify' });
    let hinted = 0;
    const log = play(config, (s, now) => (hinted++ % 3 === 0 ? { type: 'hint', rand: 0.5, now } : { type: 'found', id: target(s)!, now }));
    expect(verdict(config, log)).toMatchObject({ found: 12, hints: 6, reason: null });
  });

  it('a timed game that finishes in time still ranks', () => {
    const config = cfg({ timeLimitSec: 300 });
    expect(verdict(config, play(config, typeAll))).toMatchObject({ reason: null });
  });
});

describe('honest games that do not rank', () => {
  it('custom scope', () => {
    const config = cfg({ scope: { continents: [], subregions: ['Caribbean'] } });
    expect(verdict(config, play(config, typeAll))).toMatchObject({ reason: 'custom' });
  });

  it('giving up', () => {
    const log = play(cfg(), (s, now) => (s.found.length < 3 ? typeAll(s, now) : { type: 'giveUp', now }));
    expect(verdict(cfg(), log)).toMatchObject({ found: 3, endReason: 'gaveUp', reason: 'incomplete' });
  });

  it('running out of time', () => {
    const config = cfg({ timeLimitSec: 60 });
    const log = play(config, (s, now) => (s.found.length < 5 ? typeAll(s, now) : { type: 'tick', now }), 10_000);
    expect(verdict(config, log)).toMatchObject({ found: 5, endReason: 'timeout', ms: 60_000, reason: 'incomplete' });
  });

  it('skipping in identify', () => {
    const config = cfg({ mode: 'identify' });
    let skipped = false;
    const log = play(config, (s, now) => (skipped ? { type: 'found', id: target(s)!, now } : ((skipped = true), { type: 'skip', now })));
    expect(verdict(config, log)).toMatchObject({ found: 11, reason: 'incomplete' });
  });

  it('pausing', () => {
    let paused = false;
    const log = play(cfg(), (s, now) => {
      if (s.found.length === 4 && !paused) return (paused = true), { type: 'pause', now };
      if (s.phase === 'paused') return { type: 'resume', now: now + 60_000 };
      return typeAll(s, now + (paused ? 60_000 : 0));
    });
    expect(verdict(cfg(), log, log.at(-1)!.t + 300)).toMatchObject({ found: 12, reason: 'paused' });
  });
});

describe('doctored logs', () => {
  it('a shortened clock: the replay is quicker than the server saw', () => {
    const log = play(cfg(), typeAll);
    expect(verdict(cfg(), log, log.at(-1)!.t + 2900)).toMatchObject({ reason: null });
    expect(verdict(cfg(), log, log.at(-1)!.t + 3100)).toMatchObject({ reason: 'unverified' });
  });

  it('finds closer together than anyone can type', () => {
    const log = play(cfg(), typeAll).map((e, i) => (i === 5 ? { ...e, t: e.t - 1950 } : e));
    expect(verdict(cfg(), log)).toMatchObject({ reason: 'unverified' });
  });

  it('a whole game faster than 0.3 s per country', () => {
    const log = play(cfg(), typeAll, 250);
    expect(verdict(cfg(), log)).toMatchObject({ reason: 'unverified' });
  });

  it('a pause hidden by shifting the later times back', () => {
    let paused = false;
    const honest = play(cfg(), (s, now) => {
      if (s.found.length === 4 && !paused) return (paused = true), { type: 'pause', now };
      if (s.phase === 'paused') return { type: 'resume', now: now + 60_000 };
      return typeAll(s, now + (paused ? 60_000 : 0));
    });
    const p = honest.findIndex((e) => e.a.type === 'pause');
    const gap = honest[p + 1].t - honest[p].t;
    const hidden = [...honest.slice(0, p), ...honest.slice(p + 2).map((e) => ({ ...e, t: e.t - gap }))];
    expect(verdict(cfg(), hidden, honest.at(-1)!.t + 300)).toMatchObject({ reason: 'unverified' });
  });

  it('a locate log made for a different target order does not replay: its first click misses the server target', () => {
    const config = cfg({ mode: 'locate' });
    const other = play(config, clickTarget, 2000, 7);
    expect(replay(config, SEED, other)).toBeNull();
    expect(verdict(config, other)).toBeNull();
  });

  it('finds of countries outside the game, or repeats, do not replay', () => {
    const log = play(cfg(), typeAll);
    expect(replay(cfg(), SEED, [{ t: 100, a: { type: 'found', id: 'FRA' } }, ...log])).toBeNull();
    expect(replay(cfg(), SEED, [log[0], { ...log[0], t: log[0].t + 1 }, ...log.slice(1)])).toBeNull();
  });

  it('entries after the end do not replay', () => {
    const log = play(cfg(), typeAll);
    expect(replay(cfg(), SEED, [...log, { t: log.at(-1)!.t + 10, a: { type: 'giveUp' } }])).toBeNull();
  });

  it('a game that never ended does not replay', () => {
    expect(replay(cfg(), SEED, play(cfg(), typeAll).slice(0, -1))).toBeNull();
  });
});

describe('parseLog', () => {
  it('accepts what the reducer records', () => {
    const log = play(cfg({ mode: 'identify' }), (s, now) => ({ type: 'found', id: target(s)!, now, corrected: true }));
    expect(parseLog(JSON.parse(JSON.stringify(log)))).toEqual(log);
  });

  it('rejects malformed entries', () => {
    for (const bad of [
      'x',
      [{ t: 5, a: { type: 'found' } }],
      [{ t: 5, a: { type: 'teleport' } }],
      [{ t: 5, a: { type: 'hint', rand: 1 } }],
      [{ t: 5, a: { type: 'hint', rand: -0.1 } }],
      [{ t: 5.5, a: { type: 'skip' } }],
      [{ t: 9, a: { type: 'skip' } }, { t: 8, a: { type: 'skip' } }],
      [{ t: 5, a: { type: 'found', id: 'TOOLONGID' } }],
      Array.from({ length: 5001 }, (_, i) => ({ t: i, a: { type: 'skip' } })),
    ]) {
      expect(parseLog(bad)).toBeNull();
    }
  });
});

it('replays a whole-world game in well under the Worker CPU budget', () => {
  const config = cfg({ scope: { continents: [], subregions: [] } });
  const log = play(config, typeAll, 1000);
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) replay(config, SEED, log);
  expect((performance.now() - t0) / 50).toBeLessThan(5);
});

it('replays a long hint log in linear time', () => {
  // Every hint changes the game, so nothing short-circuits. Compare 1,000 and 20,000 entries on the same
  // machine: linear work grows about 11x here, the old quadratic replay about 225x. Ratios survive slow CI runners.
  const config = cfg({ scope: { continents: [], subregions: [] } });
  const hints = (n: number): LogEntry[] => Array.from({ length: n }, (_, i) => ({ t: i * 10, a: { type: 'hint', rand: (i % 100) / 100 } }));
  const time = (log: LogEntry[]) => {
    replay(config, SEED, log); // warm up
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) replay(config, SEED, log);
    return (performance.now() - t0) / 5;
  };
  const short = time(hints(1000));
  const long = time(hints(20_000));
  expect(long / short).toBeLessThan(60);
});
