import { describe, expect, it } from 'vitest';
import { addClaim, clearClaims, readClaims, removeClaims, saveResume, takeResume } from '../../src/api/resume.ts';
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

describe('claims', () => {
  it('keeps claims for a day, without duplicates', () => {
    const s = memoryStorage();
    addClaim(s, { id: 'a', claim: 'x' }, 0);
    addClaim(s, { id: 'a', claim: 'x' }, 10);
    addClaim(s, { id: 'b', claim: 'y' }, 20 * HOUR);
    expect(readClaims(s, 23 * HOUR).map((c) => c.id)).toEqual(['a', 'b']);
    expect(readClaims(s, 25 * HOUR).map((c) => c.id)).toEqual(['b']);
    clearClaims(s);
    expect(readClaims(s, 0)).toEqual([]);
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
