import { describe, expect, it } from 'vitest';
import { COUNTRY } from '../../src/data/lookup.ts';
import { groupOf, progressRows } from '../../src/game/progress.ts';

describe('progressRows', () => {
  it('groups by continent when the pool spans several, in continent order', () => {
    expect(progressRows(['FRA', 'DEU', 'EGY'], ['FRA'], COUNTRY)).toEqual([
      { label: 'Africa', found: 0, total: 1 },
      { label: 'Europe', found: 1, total: 2 },
    ]);
  });

  it('groups by subregion inside a single continent, in data order', () => {
    expect(progressRows(['FRA', 'ESP', 'SWE'], ['SWE'], COUNTRY)).toEqual([
      { label: 'Northern Europe', found: 1, total: 1 },
      { label: 'Western Europe', found: 0, total: 1 },
      { label: 'Southern Europe', found: 0, total: 1 },
    ]);
  });

  it('names the group a country counts under', () => {
    expect(groupOf('BRA', ['BRA', 'FRA'], COUNTRY)).toBe('S. America');
    expect(groupOf('FRA', ['FRA', 'ESP'], COUNTRY)).toBe('Western Europe');
  });
});
