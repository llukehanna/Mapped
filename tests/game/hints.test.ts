import { describe, expect, it } from 'vitest';
import { FACTS } from '../../src/data/facts.ts';
import { GEO_META } from '../../src/data/geoMeta.ts';
import { COUNTRY, nameOf } from '../../src/data/lookup.ts';
import { clueText, HINT_LEVELS, letterPattern, populationPhrase, sizePhrase } from '../../src/game/hints.ts';

const clue = (mode: 'type' | 'identify' | 'locate', level: number, id: string) =>
  clueText(mode, level, { country: COUNTRY.get(id)!, facts: FACTS.get(id)!, meta: GEO_META[id], nameOf });

describe('hint ladder', () => {
  it('has six rungs for naming modes and three for locate', () => {
    expect(HINT_LEVELS).toEqual({ type: 6, identify: 6, locate: 3 });
  });

  it('rung 1 says where: landlocked, island or coastal, and the subregion', () => {
    expect(clue('type', 1, 'MNG')).toBe('Landlocked, in East Asia');
    expect(clue('type', 1, 'JAM')).toBe('An island nation in the Caribbean');
    expect(clue('type', 1, 'SEN')).toBe('On the coast, in Western Africa');
    expect(clue('type', 1, 'ARM')).toBe('Landlocked, in the Caucasus or Central Asia');
  });

  it('rung 2 names neighbors, or the nearest countries for islands', () => {
    expect(clue('type', 2, 'MNG')).toBe('Borders China and Russia');
    expect(clue('type', 2, 'PRT')).toBe('Borders Spain');
    expect(clue('type', 2, 'CHN')).toMatch(/^Borders .+, .+, .+ and \d+ others$/);
    expect(clue('type', 2, 'JPN')).toMatch(/^Nearest countries: .+ and .+$/);
  });

  it('rung 3 compares size and gives population', () => {
    expect(clue('type', 3, 'MNG')).toBe('About the size of Alaska · about 3.5 million people');
  });

  it('rung 4 gives the capital; rungs 5 and 6 reveal letters', () => {
    expect(clue('identify', 4, 'MNG')).toBe('Capital: Ulaanbaatar');
    expect(clue('identify', 5, 'MNG')).toBe('M _ _ _ _ _ _ _');
    expect(clue('identify', 6, 'MNG')).toBe('M _ n _ o _ i a');
  });

  it('locate stays about location', () => {
    expect(clue('locate', 1, 'BOL')).toBe('Landlocked, in South America');
    expect(clue('locate', 2, 'BOL')).toBe('Borders Argentina, Brazil, Chile and 2 others');
    expect(clue('locate', 3, 'BOL')).toBe('Look inside the circle');
  });
});

describe('phrases', () => {
  it.each([
    [0.44, 'Tiny: under 1 km²'],
    [2, 'Tiny: about 2 km²'],
    [734, 'About the size of New York City'],
    [9833520, 'A bit larger than the contiguous US'],
    [119000, 'About the size of Pennsylvania'],
    [17098246, 'About twice the size of the contiguous US'],
  ])('size %d km² → %s', (km2, text) => expect(sizePhrase(km2)).toBe(text));

  it.each([
    [1_410_000_000, 'about 1.4 billion people'],
    [46_000_000, 'about 46 million people'],
    [3_500_000, 'about 3.5 million people'],
    [390_000, 'about 390,000 people'],
    [39_000, 'about 39,000 people'],
    [800, 'about 800 people'],
  ])('population %d → %s', (n, text) => expect(populationPhrase(n)).toBe(text));

  it('letter patterns keep spaces and hyphens', () => {
    expect(letterPattern('Costa Rica', 'first')).toBe('C _ _ _ _   _ _ _ _');
    expect(letterPattern('Guinea-Bissau', 'first')).toBe('G _ _ _ _ _ - _ _ _ _ _ _');
  });
});
