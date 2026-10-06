import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../src/data/countries.ts';
import { poolFor, scopeFromKey, scopeKey, scopeLabel, subregionsOf, WORLD } from '../../src/game/scope.ts';
import type { Scope } from '../../src/game/types.ts';

describe('scope', () => {
  it('world is every country', () => expect(poolFor(WORLD, COUNTRIES)).toHaveLength(197));

  it('unions continents and subregions without duplicates', () => {
    const pool = poolFor({ continents: ['south-america'], subregions: ['Caribbean', 'South America'] }, COUNTRIES);
    expect(pool).toHaveLength(12 + 13);
  });

  it('sorts the pool by country name', () => {
    expect(poolFor({ continents: [], subregions: ['Australasia'] }, COUNTRIES)).toEqual(['AUS', 'NZL']);
  });

  it('lists subregions per continent', () => {
    expect(subregionsOf('africa', COUNTRIES)).toEqual(['Northern Africa', 'Western Africa', 'Central Africa', 'Eastern Africa', 'Southern Africa']);
  });

  it.each([
    [WORLD, 'World'],
    [{ continents: ['europe', 'africa'], subregions: [] }, 'Africa + Europe'],
    [{ continents: ['asia'], subregions: ['Caribbean'] }, 'Asia + Caribbean'],
    [{ continents: ['asia', 'europe', 'africa', 'oceania'], subregions: [] }, 'Africa + Asia + 2 more'],
  ] as const)('labels %j as %s', (scope, label) => expect(scopeLabel({ continents: [...scope.continents], subregions: [...scope.subregions] })).toBe(label));

  it('keys scopes independent of selection order', () => {
    expect(scopeKey({ continents: ['europe', 'africa'], subregions: [] })).toBe(scopeKey({ continents: ['africa', 'europe'], subregions: [] }));
    expect(scopeKey(WORLD)).toBe('world');
  });
});

describe('scopeFromKey', () => {
  it('round-trips every scope key', () => {
    const subregions = [...new Set(COUNTRIES.map((c) => c.subregion))];
    for (const scope of [WORLD, { continents: ['europe', 'asia'], subregions: [] }, { continents: ['africa'], subregions: subregions.slice(0, 5) }, { continents: [], subregions }] as Scope[]) {
      expect(scopeKey(scopeFromKey(scopeKey(scope)))).toBe(scopeKey(scope));
    }
    expect(subregions.every((s) => !s.includes(','))).toBe(true);
  });
});
