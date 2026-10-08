import { describe, expect, it } from 'vitest';
import { FACTS } from '../../src/data/facts.ts';
import { GEO_META } from '../../src/data/geoMeta.ts';
import { COUNTRY, nameOf } from '../../src/data/lookup.ts';
import { clueText, HINT_LEVELS, letterCount, letterPattern } from '../../src/game/hints.ts';

const clue = (mode: 'type' | 'identify' | 'locate', level: number, id: string) =>
  clueText(mode, level, { country: COUNTRY.get(id)!, facts: FACTS.get(id)!, meta: GEO_META[id], nameOf });

describe('hint ladder', () => {
  it('has four rungs for naming modes and three for locate', () => {
    expect(HINT_LEVELS).toEqual({ type: 4, identify: 4, locate: 3 });
  });

  it('naming modes spell the name out: first letter, length, last letter, every other letter', () => {
    expect([1, 2, 3, 4].map((level) => clue('type', level, 'MNG'))).toEqual([
      'Starts with M',
      'M _ _ _ _ _ _ _ · 8 letters',
      'M _ _ _ _ _ _ a',
      'M _ n _ o _ i a',
    ]);
    expect(clue('identify', 2, 'CRI')).toBe('C _ _ _ _   _ _ _ _ · 5 + 4 letters');
  });

  it('locate stays about location', () => {
    expect(clue('locate', 1, 'BOL')).toBe('Landlocked, in South America');
    expect(clue('locate', 2, 'BOL')).toBe('Borders Argentina, Brazil, Chile and 2 others');
    expect(clue('locate', 3, 'BOL')).toBe('Look inside the circle');
    expect(clue('locate', 1, 'JAM')).toBe('An island nation in the Caribbean');
    expect(clue('locate', 1, 'ARM')).toBe('Landlocked, in the Caucasus or Central Asia');
    expect(clue('locate', 2, 'JPN')).toMatch(/^Nearest countries: .+ and .+$/);
  });
});

describe('letters', () => {
  it('patterns blank only letters, keeping spaces, hyphens and apostrophes', () => {
    expect(letterPattern('Costa Rica', 'first')).toBe('C _ _ _ _   _ _ _ _');
    expect(letterPattern('Guinea-Bissau', 'first')).toBe('G _ _ _ _ _ - _ _ _ _ _ _');
    expect(letterPattern("Côte d'Ivoire", 'ends')).toBe("C _ _ _   _ ' _ _ _ _ _ e");
  });

  it('counts letters per word', () => {
    expect(letterCount('Chad')).toBe('4 letters');
    expect(letterCount('Guinea-Bissau')).toBe('6 + 6 letters');
    expect(letterCount("Côte d'Ivoire")).toBe('4 + 7 letters');
  });
});
