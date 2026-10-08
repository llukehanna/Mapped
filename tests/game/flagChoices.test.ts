import { describe, expect, it } from 'vitest';
import { COUNTRY } from '../../src/data/lookup.ts';
import { flagChoices } from '../../src/game/flagChoices.ts';

describe('flagChoices', () => {
  it('four distinct countries including the target', () => {
    const c = flagChoices('TCD', 7);
    expect(c).toHaveLength(4);
    expect(new Set(c).size).toBe(4);
    expect(c).toContain('TCD');
    for (const id of c) expect(COUNTRY.has(id)).toBe(true);
  });
  it('prefers lookalikes', () => expect(flagChoices('TCD', 7)).toEqual(expect.arrayContaining(['ROU', 'AND', 'MDA'])));
  it('fills from the same subregion when there are few lookalikes', () => {
    const c = flagChoices('NZL', 1).filter((id) => id !== 'NZL' && id !== 'AUS');
    for (const id of c) expect(COUNTRY.get(id)!.continent).toBe('oceania');
  });
  it('is the same for the same seed, and shuffles the target’s position', () => {
    expect(flagChoices('KEN', 42)).toEqual(flagChoices('KEN', 42));
    const spots = new Set(Array.from({ length: 30 }, (_, s) => flagChoices('KEN', s).indexOf('KEN')));
    expect(spots.size).toBeGreaterThan(1);
  });
});
