import { describe, expect, it } from 'vitest';
import { FACTS } from '../../src/data/facts.ts';
import { GEO_META } from '../../src/data/geoMeta.ts';
import { COUNTRY, nameOf } from '../../src/data/lookup.ts';
import { clueFor, clueText, letterCount, letterPattern } from '../../src/game/hints.ts';
import { hintLevels } from '../../src/game/topics.ts';

const clue = (mode: 'type' | 'identify' | 'locate', level: number, id: string) =>
  clueText(mode, level, { country: COUNTRY.get(id)!, facts: FACTS.get(id)!, meta: GEO_META[id], nameOf });

describe('hint ladder', () => {
  it('has four rungs for naming modes and three for locate', () => {
    expect((['type', 'identify', 'locate'] as const).map((mode) => hintLevels({ mode }))).toEqual([4, 4, 3]);
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

describe('clues by topic', () => {
  const input = (id: string) => ({ country: COUNTRY.get(id)!, facts: FACTS.get(id)!, meta: GEO_META[id], nameOf });
  it('capitals spell the capital', () => {
    expect(clueFor({ mode: 'type', topic: 'capitals' }, 1, input('KEN'))).toBe('Starts with N');
    expect(clueFor({ mode: 'type', topic: 'capitals' }, 2, input('KEN'))).toBe('N _ _ _ _ _ _ · 7 letters');
  });
  it('capitals · identify rungs say how many capitals are left', () => {
    expect(clueFor({ mode: 'identify', topic: 'capitals' }, 1, input('KEN'))).toBe('One wrong capital removed');
    expect(clueFor({ mode: 'identify', topic: 'capitals' }, 2, input('KEN'))).toBe('Two wrong capitals removed');
  });
  it('flags · type: no region rung when every country in the game shares one region', () => {
    const southAmerica = { mode: 'type' as const, topic: 'flags' as const, scope: { continents: ['south-america' as const], subregions: [] } };
    const caribbean = { mode: 'type' as const, topic: 'flags' as const, scope: { continents: [], subregions: ['Caribbean'] } };
    const africa = { mode: 'type' as const, topic: 'flags' as const, scope: { continents: ['africa' as const], subregions: [] } };
    expect(hintLevels(southAmerica)).toBe(4);
    expect(hintLevels(caribbean)).toBe(4);
    expect(hintLevels(africa)).toBe(5);
    for (const lvl of [1, 2, 3, 4]) expect(clueFor(southAmerica, lvl, input('CHL'))).toBe(clueText('identify', lvl, input('CHL')));
    expect(clueFor(africa, 1, input('TCD'))).toBe('In Central Africa');
  });

  it('flags · type: region first, then the letter rungs', () => {
    const flagsType = { mode: 'type' as const, topic: 'flags' as const };
    expect(clueFor(flagsType, 1, input('TCD'))).toBe('In Central Africa');
    expect(clueFor(flagsType, 1, input('JAM'))).toBe('In the Caribbean');
    for (const lvl of [2, 3, 4, 5]) expect(clueFor(flagsType, lvl, input('TCD'))).toBe(clueText('identify', lvl - 1, input('TCD')));
  });
  it('capitals · locate uses the locate rungs', () => {
    expect(clueFor({ mode: 'locate', topic: 'capitals' }, 3, input('KEN'))).toBe('Look inside the circle');
  });
  it('flags · identify rungs say how many flags are left', () => {
    expect(clueFor({ mode: 'identify', topic: 'flags' }, 1, input('KEN'))).toBe('One wrong flag removed');
    expect(clueFor({ mode: 'identify', topic: 'flags' }, 2, input('KEN'))).toBe('Two wrong flags removed');
  });
  it('countries unchanged', () => {
    for (const mode of ['type', 'locate', 'identify'] as const) for (const lvl of [1, 2, 3]) expect(clueFor({ mode }, lvl, input('KEN'))).toBe(clueText(mode, lvl, input('KEN')));
  });
});
