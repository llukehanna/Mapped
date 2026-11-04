import { describe, expect, it } from 'vitest';
import { COUNTRY } from '../../src/data/lookup.ts';
import { groupFor, groupOf, progressRows, progressRowsFor } from '../../src/game/progress.ts';
import { poolOf, WORLD } from '../../src/game/scope.ts';

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

describe('seas progress', () => {
  it('rows are basins, in BASINS order', () => {
    const rows = progressRowsFor('seas', poolOf({ topic: 'seas', scope: WORLD }), ['med', 'aegean']);
    expect(rows.map((r) => r.label)).toEqual(['Atlantic', 'Mediterranean', 'Pacific', 'Indian', 'Arctic', 'Southern', 'Inland']);
    expect(rows[1]).toEqual({ label: 'Mediterranean', found: 2, total: 7 });
    expect(groupFor('seas', 'tasman', [])).toBe('Pacific');
  });
  it('only basins present in the pool get a row', () => {
    expect(progressRowsFor('seas', ['caspian', 'black'], ['black']).map((r) => r.label)).toEqual(['Mediterranean', 'Inland']);
  });
  it('other topics defer to the country rows', () => {
    expect(progressRowsFor('countries', ['FRA', 'DEU', 'EGY'], ['FRA'])).toEqual(progressRows(['FRA', 'DEU', 'EGY'], ['FRA'], COUNTRY));
    expect(groupFor('flags', 'FRA', ['FRA', 'EGY'])).toBe(groupOf('FRA', ['FRA', 'EGY'], COUNTRY));
  });
});
