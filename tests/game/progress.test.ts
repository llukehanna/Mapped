import { describe, expect, it } from 'vitest';
import { COUNTRY } from '../../src/data/lookup.ts';
import { hintText, letterPattern } from '../../src/game/hints.ts';
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

describe('hints', () => {
  it('builds a letter pattern that keeps word breaks', () => {
    expect(letterPattern('Brazil')).toBe('B _ _ _ _ _');
    expect(letterPattern('Costa Rica')).toBe('C _ _ _ _   _ _ _ _');
    expect(letterPattern('Guinea-Bissau')).toBe('G _ _ _ _ _ - _ _ _ _ _ _');
  });

  it('words each mode and level', () => {
    const bra = COUNTRY.get('BRA')!;
    expect(hintText('type', 1, bra)).toBe('Starts with B · outlined on the map');
    expect(hintText('identify', 2, bra)).toBe('B _ _ _ _ _');
    expect(hintText('locate', 1, bra)).toBe("It's in South America");
  });
});
