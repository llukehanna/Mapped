import { describe, expect, it } from 'vitest';
import { BOARD_REGIONS, boardFor, boardKey, boardLabel, compareRuns, parseBoard, parseConfig } from '../../src/game/ranking.ts';
import type { GameConfig } from '../../src/game/types.ts';

const cfg = (continents: string[], subregions: string[] = [], mode: GameConfig['mode'] = 'type'): GameConfig =>
  ({ mode, scope: { continents, subregions }, timeLimitSec: null }) as GameConfig;

describe('boards', () => {
  it('World and single whole continents rank; mixes and subregions do not', () => {
    expect(boardFor(cfg([]))).toBe('type:world');
    expect(boardFor(cfg(['europe'], [], 'locate'))).toBe('locate:europe');
    expect(boardFor({ ...cfg(['asia']), timeLimitSec: 600 })).toBe('type:asia');
    expect(boardFor(cfg(['europe', 'asia']))).toBeNull();
    expect(boardFor(cfg([], ['Caribbean']))).toBeNull();
    expect(boardFor(cfg(['europe'], ['Caribbean']))).toBeNull();
  });

  it('there are 21 boards', () => {
    expect(BOARD_REGIONS).toHaveLength(7);
  });

  it('parses and labels board ids', () => {
    expect(parseBoard('identify:north-america')).toEqual({ topic: 'countries', mode: 'identify', region: 'north-america' });
    expect(parseBoard('type:mars')).toBeNull();
    expect(parseBoard('type:world:x')).toBeNull();
    expect(boardLabel('type:world')).toBe('World · Type');
    expect(boardLabel('locate:south-america')).toBe('S. America · Locate');
  });

  it('ranks more found first, then fewer hints, then time, then the earlier finish', () => {
    const runs = [
      { found: 12, hints: 1, ms: 50_000, finishedAt: 1 },
      { found: 12, hints: 0, ms: 90_000, finishedAt: 5 },
      { found: 12, hints: 0, ms: 90_000, finishedAt: 2 },
      { found: 12, hints: 0, ms: 80_000, finishedAt: 9 },
      { found: 11, hints: 0, ms: 10_000, finishedAt: 0 },
    ];
    expect([...runs].sort(compareRuns)).toEqual([runs[3], runs[2], runs[1], runs[0], runs[4]]);
  });
});

describe('parseConfig', () => {
  it('accepts what the setup card makes', () => {
    const c = { mode: 'identify', scope: { continents: ['africa'], subregions: ['Caribbean'] }, timeLimitSec: 600 };
    expect(parseConfig(c)).toEqual(c);
    expect(parseConfig({ mode: 'type', scope: { continents: [], subregions: [] }, timeLimitSec: null })).not.toBeNull();
  });

  it('rejects anything else', () => {
    const ok = { mode: 'type', scope: { continents: [], subregions: [] }, timeLimitSec: null };
    for (const bad of [
      null,
      'x',
      { ...ok, mode: 'race' },
      { ...ok, scope: { continents: ['mars'], subregions: [] } },
      { ...ok, scope: { continents: [], subregions: ['Atlantis'] } },
      { ...ok, scope: { continents: ['asia', 'asia'], subregions: [] } },
      { ...ok, scope: { continents: 'asia', subregions: [] } },
      { ...ok, timeLimitSec: 5 },
      { ...ok, timeLimitSec: 90.5 },
      { ...ok, timeLimitSec: '600' },
    ]) {
      expect(parseConfig(bad)).toBeNull();
    }
  });
});

describe('topics on boards', () => {
  const europe = { continents: ['europe' as const], subregions: [] };
  it('countries boards keep their keys; other topics are prefixed', () => {
    expect(boardFor({ mode: 'type', scope: europe, timeLimitSec: null })).toBe('type:europe');
    expect(boardFor({ topic: 'countries', mode: 'type', scope: europe, timeLimitSec: null })).toBe('type:europe');
    expect(boardFor({ topic: 'flags', mode: 'identify', scope: europe, timeLimitSec: null })).toBe('flags:identify:europe');
  });
  it('parses and labels both shapes', () => {
    expect(parseBoard('type:world')).toEqual({ topic: 'countries', mode: 'type', region: 'world' });
    expect(parseBoard('capitals:locate:asia')).toEqual({ topic: 'capitals', mode: 'locate', region: 'asia' });
    expect(parseBoard('countries:type:world')).toBeNull(); // countries never carries the prefix
    expect(parseBoard('flags:type:mars')).toBeNull();
    expect(boardLabel('flags:type:europe')).toBe('Europe · Flags · Type');
    expect(boardLabel('type:europe')).toBe('Europe · Type');
    expect(boardKey('countries', 'type', 'world')).toBe('type:world');
    expect(boardKey('flags', 'type', 'world')).toBe('flags:type:world');
  });
  it('parseConfig keeps a valid topic, drops countries, and rejects unknown ones', () => {
    const base = { mode: 'type', scope: { continents: [], subregions: [] }, timeLimitSec: null };
    expect(parseConfig({ ...base, topic: 'flags' })).toMatchObject({ topic: 'flags' });
    expect(parseConfig({ ...base, topic: 'countries' })).not.toHaveProperty('topic');
    expect(parseConfig(base)).not.toHaveProperty('topic');
    expect(parseConfig({ ...base, topic: 'rivers' })).toBeNull();
  });
});
