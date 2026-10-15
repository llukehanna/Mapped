import { describe, expect, it } from 'vitest';
import { COUNTRY } from '../../src/data/lookup.ts';
import { GEO_META } from '../../src/data/geoMeta.ts';
import { capitalChoices } from '../../src/game/capitalChoices.ts';

describe('capitalChoices', () => {
  it('four distinct countries including the target', () => {
    for (const id of ['KEN', 'FRA', 'NZL', 'FJI', 'CHL']) {
      const c = capitalChoices(id, 3);
      expect(c).toHaveLength(4);
      expect(new Set(c).size).toBe(4);
      expect(c).toContain(id);
      for (const x of c) expect(COUNTRY.has(x)).toBe(true);
    }
  });
  it('neighbors first', () => {
    const decoys = capitalChoices('KEN', 1).filter((id) => id !== 'KEN');
    for (const id of decoys) expect(GEO_META.KEN.neighbors).toContain(id); // Kenya has 5 neighbors
  });
  it('deterministic per seed, and the target moves around', () => {
    expect(capitalChoices('KEN', 9)).toEqual(capitalChoices('KEN', 9));
    expect(new Set(Array.from({ length: 30 }, (_, s) => capitalChoices('KEN', s).indexOf('KEN'))).size).toBeGreaterThan(1);
  });
});
