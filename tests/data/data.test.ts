import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../src/data/countries.ts';
import { FACTS, LANDLOCKED } from '../../src/data/facts.ts';
import { TERRITORIES } from '../../src/data/territories.ts';
import { CAPITALS, capitalOf } from '../../src/data/capitals.ts';
import { FLAG_LOOKALIKES } from '../../src/data/flagLookalikes.ts';
import { COUNTRY } from '../../src/data/lookup.ts';
import { normalize } from '../../src/match/normalize.ts';

describe('country data', () => {
  it('has the 197 countries Sporcle uses, each with a unique id', () => {
    expect(COUNTRIES).toHaveLength(197);
    expect(new Set(COUNTRIES.map((c) => c.id)).size).toBe(197);
  });

  it('has the expected count per continent', () => {
    const counts: Record<string, number> = {};
    for (const c of COUNTRIES) counts[c.continent] = (counts[c.continent] ?? 0) + 1;
    expect(counts).toEqual({ africa: 54, asia: 49, europe: 45, 'north-america': 23, 'south-america': 12, oceania: 14 });
  });

  it('has the expected count per subregion', () => {
    const counts: Record<string, number> = {};
    for (const c of COUNTRIES) counts[c.subregion] = (counts[c.subregion] ?? 0) + 1;
    expect(counts).toMatchInlineSnapshot(`
      {
        "Australasia": 2,
        "Balkans": 9,
        "Caribbean": 13,
        "Caucasus & Central Asia": 8,
        "Central Africa": 9,
        "Central America": 7,
        "East Asia": 6,
        "Eastern Africa": 18,
        "Eastern Europe": 9,
        "Melanesia": 4,
        "Micronesia": 5,
        "Middle East": 16,
        "Northern Africa": 6,
        "Northern America": 3,
        "Northern Europe": 10,
        "Polynesia": 3,
        "South America": 12,
        "South Asia": 8,
        "Southeast Asia": 11,
        "Southern Africa": 5,
        "Southern Europe": 8,
        "Western Africa": 16,
        "Western Europe": 9,
      }
    `);
  });

  it('gives territories unique ids that never collide with countries', () => {
    const ids = [...COUNTRIES, ...TERRITORIES].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(TERRITORIES.every((t) => t.id.startsWith('t-') && t.note.length > 0)).toBe(true);
  });

  it('ties every shaped territory to a real country or leaves it neutral', () => {
    const ids = new Set(COUNTRIES.map((c) => c.id));
    for (const t of TERRITORIES) if (t.sovereign) expect(ids, t.name).toContain(t.sovereign);
    expect(TERRITORIES.find((t) => t.name === 'Greenland')!.sovereign).toBe('DNK');
    expect(TERRITORIES.find((t) => t.name === 'Western Sahara')!.sovereign).toBeNull();
  });
});

describe('hint facts', () => {
  it('has a capital, population and area for every country', () => {
    for (const c of COUNTRIES) {
      const f = FACTS.get(c.id);
      expect(f, c.id).toBeDefined();
      expect(f!.capital.length, c.id).toBeGreaterThan(1);
      expect(f!.population, c.id).toBeGreaterThan(0);
      expect(f!.areaKm2, c.id).toBeGreaterThan(0);
    }
    expect(FACTS.size).toBe(197);
  });

  it('lists the 45 landlocked countries, all real ids', () => {
    const ids = new Set(COUNTRIES.map((c) => c.id));
    expect(LANDLOCKED.size).toBe(45);
    for (const id of LANDLOCKED) expect(ids, id).toContain(id);
  });
});

describe('capitals and flags', () => {
  it('has a capital for every country, and no capital name belongs to two countries', () => {
    const owner = new Map<string, string>();
    for (const c of COUNTRIES) {
      const cap = CAPITALS.get(c.id);
      expect(cap, c.id).toBeDefined();
      for (const key of [cap!.name, ...cap!.aliases].map(normalize)) {
        expect(owner.get(key) ?? c.id, `${key} for ${c.id}`).toBe(c.id);
        owner.set(key, c.id);
      }
    }
    expect(CAPITALS.size).toBe(COUNTRIES.length);
  });
  it('accepts the alternatives the spec names', () => {
    expect(capitalOf('BOL')).toBe('Sucre');
    expect(CAPITALS.get('BOL')!.aliases).toContain('La Paz');
    expect(CAPITALS.get('UKR')!.aliases).toContain('Kiev');
    expect(CAPITALS.get('ZAF')!.aliases).toEqual(expect.arrayContaining(['Cape Town', 'Bloemfontein']));
    expect(capitalOf('NRU')).toBe('Yaren');
    expect(capitalOf('PSE')).toBe('Ramallah');
    expect(CAPITALS.get('IND')!.aliases).toContain('Delhi');
    expect(CAPITALS.get('CIV')!.aliases).toContain('Abidjan');
    expect(CAPITALS.get('BEN')!.aliases).toContain('Cotonou');
    expect(CAPITALS.get('BDI')!.aliases).toContain('Bujumbura');
    expect(CAPITALS.get('NLD')!.aliases).toContain('The Hague');
    expect(CAPITALS.get('XKX')!.aliases).toContain('Prishtina');
  });
  it('has a flag file for every country', () => {
    for (const c of COUNTRIES) expect(existsSync(`public/flags/${c.id}.svg`), c.id).toBe(true);
  });
  it('lookalike groups use real ids, at least 25 groups', () => {
    expect(FLAG_LOOKALIKES.length).toBeGreaterThanOrEqual(25);
    for (const g of FLAG_LOOKALIKES) for (const id of g) expect(COUNTRY.has(id), id).toBe(true);
  });
});
