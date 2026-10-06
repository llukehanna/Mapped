import { describe, expect, it } from 'vitest';
import { addClaim, clearClaims, migrateClaims, readClaims, removeClaims, saveResume, takeResume } from '../../src/api/resume.ts';
import { initialState } from '../../src/game/reducer.ts';

/** A Map-backed Storage, since tests run in Node. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('claims', () => {
  it('keeps claims for 90 days, without duplicates', () => {
    const s = memoryStorage();
    addClaim(s, { id: 'a', claim: 'x' }, 0);
    addClaim(s, { id: 'a', claim: 'x' }, 10);
    addClaim(s, { id: 'b', claim: 'y' }, 80 * DAY);
    expect(readClaims(s, 89 * DAY).map((c) => c.id)).toEqual(['a', 'b']);
    expect(readClaims(s, 91 * DAY).map((c) => c.id)).toEqual(['b']);
    clearClaims(s);
    expect(readClaims(s, 0)).toEqual([]);
  });

  it('keeps only the 500 most recent claims', () => {
    const s = memoryStorage();
    for (let i = 0; i < 503; i++) addClaim(s, { id: `g${i}`, claim: 'c' }, i);
    const ids = readClaims(s, 1000).map((c) => c.id);
    expect(ids).toHaveLength(500);
    expect(ids[0]).toBe('g3');
    expect(ids.at(-1)).toBe('g502');
  });

  it('removes only the claims that were sent', () => {
    const s = memoryStorage();
    for (const id of ['a', 'b', 'c']) addClaim(s, { id, claim: id }, 0);
    removeClaims(s, ['a', 'c', 'zzz']);
    expect(readClaims(s, 0).map((c) => c.id)).toEqual(['b']);
    removeClaims(s, ['b']);
    expect(readClaims(s, 0)).toEqual([]);
    expect(s.getItem('mapped:claims:v1')).toBeNull();
    removeClaims(null, ['a']);
  });

  it('survives storage being unavailable', () => {
    addClaim(null, { id: 'a', claim: 'x' }, 0);
    expect(readClaims(null, 0)).toEqual([]);
  });

  it('migrates claims from one store to another, keeping their age, and clears the old one', () => {
    const from = memoryStorage();
    const to = memoryStorage();
    addClaim(from, { id: 'a', claim: 'x' }, 5 * DAY);
    addClaim(from, { id: 'old', claim: 'y' }, 0);
    addClaim(to, { id: 'b', claim: 'z' }, 6 * DAY);
    addClaim(to, { id: 'a', claim: 'x' }, 5 * DAY);
    migrateClaims(from, to, 91 * DAY);
    expect(readClaims(to, 91 * DAY)).toEqual([
      { id: 'a', claim: 'x', at: 5 * DAY },
      { id: 'b', claim: 'z', at: 6 * DAY },
    ]);
    expect(from.getItem('mapped:claims:v1')).toBeNull();
  });

  it('leaves the old store alone when there is nowhere to move claims to', () => {
    const from = memoryStorage();
    addClaim(from, { id: 'a', claim: 'x' }, 0);
    migrateClaims(from, null, 1);
    expect(readClaims(from, 1).map((c) => c.id)).toEqual(['a']);
    migrateClaims(null, memoryStorage(), 1);
  });
});

describe('resume', () => {
  const state = { ...initialState({ mode: 'type', scope: { continents: [], subregions: [] }, timeLimitSec: null }), phase: 'review' as const };

  it('comes back once', () => {
    const s = memoryStorage();
    saveResume(s, { state, run: { id: 'g', claim: 'c', board: 'type:world' }, save: { status: 'saving' } }, 0);
    expect(takeResume(s, 60_000)).toMatchObject({ state, run: { id: 'g' } });
    expect(takeResume(s, 60_000)).toBeNull();
  });

  it('expires after 30 minutes', () => {
    const s = memoryStorage();
    saveResume(s, { state, run: null, save: null }, 0);
    expect(takeResume(s, 31 * 60_000)).toBeNull();
  });
});
