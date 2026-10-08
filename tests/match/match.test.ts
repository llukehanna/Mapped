import { describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../src/data/countries.ts';
import { TERRITORIES } from '../../src/data/territories.ts';
import { matchSubmitted, matchTarget, matchTyped, type MatchContext } from '../../src/match/match.ts';
import { CAPITAL_INDEX } from '../../src/match/capitalIndex.ts';
import { buildIndex } from '../../src/match/nameIndex.ts';
import { normalize } from '../../src/match/normalize.ts';

const index = buildIndex(COUNTRIES, TERRITORIES);
const WORLD = new Set(COUNTRIES.map((c) => c.id));
const EUROPE = new Set(COUNTRIES.filter((c) => c.continent === 'europe').map((c) => c.id));
const ctx = (found: string[] = [], inScope: ReadonlySet<string> = WORLD): MatchContext => ({ index, inScope, found: new Set(found) });

describe('buildIndex', () => {
  it('rejects two entries sharing a name', () => {
    const dupe = { ...COUNTRIES[0], id: 'ZZZ' };
    expect(() => buildIndex([COUNTRIES[0], dupe], [])).toThrow(/used by both/);
  });
});

describe('matchTyped (every keystroke)', () => {
  it('accepts every country by its name and by each alias', () => {
    for (const c of COUNTRIES) {
      for (const name of [c.name, ...c.aliases]) {
        const r = matchTyped(name, ctx());
        expect(['accept', 'hold'], `${name}`).toContain(r.kind);
        expect('id' in r && r.id, name).toBe(c.id);
      }
    }
  });

  it.each([
    ['niger', 'NER'],
    ['dominica', 'DMA'],
    ['guinea', 'GIN'],
    ['congo', 'COG'],
    ['america', 'USA'], // could still become "American Samoa"
    ['trinidad', 'TTO'], // could still become "Trinidad and Tobago"
  ])('holds %s while a longer name is still possible', (input, id) => {
    expect(matchTyped(input, ctx())).toEqual({ kind: 'hold', id });
  });

  it('accepts "niger" immediately once Nigeria is found', () => {
    expect(matchTyped('niger', ctx(['NGA']))).toEqual({ kind: 'accept', id: 'NER', corrected: false });
  });

  it('stays quiet about "niger" already found while "nigeria" is still possible', () => {
    expect(matchTyped('niger', ctx(['NER']))).toEqual({ kind: 'none' });
  });

  it('reports already-found names that cannot grow into anything else', () => {
    expect(matchTyped('Brazil', ctx(['BRA']))).toEqual({ kind: 'already', id: 'BRA' });
  });

  it('reports real countries outside the selected regions', () => {
    expect(matchTyped('japan', ctx([], EUROPE))).toEqual({ kind: 'outOfScope', id: 'JPN' });
    expect(matchTyped('france', ctx([], EUROPE))).toEqual({ kind: 'accept', id: 'FRA', corrected: false });
  });

  it('reports territories and non-country names', () => {
    expect(matchTyped('Greenland', ctx())).toEqual({ kind: 'territory', id: 't-greenland' });
    expect(matchTyped('england', ctx())).toEqual({ kind: 'territory', id: 't-england' });
  });

  it('never forgives typos while typing', () => {
    expect(matchTyped('brazl', ctx())).toEqual({ kind: 'none' });
  });

  it('keeps Iran and Iraq apart', () => {
    expect(matchTyped('iran', ctx())).toMatchObject({ id: 'IRN' });
    expect(matchTyped('iraq', ctx())).toMatchObject({ id: 'IRQ' });
  });
});

describe('matchSubmitted (Enter)', () => {
  it.each([
    ['brazl', 'BRA'],
    ['phillipines', 'PHL'],
    ['kyrgystan', 'KGZ'],
    ['columbia', 'COL'],
    ['swizerland', 'CHE'],
    ['lichtenstein', 'LIE'],
    ['equador', 'ECU'],
  ])('forgives the unambiguous typo %s', (input, id) => {
    expect(matchSubmitted(input, ctx())).toEqual({ kind: 'accept', id, corrected: true });
  });

  it.each(['austrlia', 'malwi', 'slovania', 'irak'])('refuses %s, which is close to two countries or too short', (input) => {
    expect(matchSubmitted(input, ctx())).toEqual({ kind: 'none' });
  });

  it('accepts a held exact name without waiting', () => {
    expect(matchSubmitted('niger', ctx())).toEqual({ kind: 'accept', id: 'NER', corrected: false });
  });

  it('reports already-found on submit even when a longer name is possible', () => {
    expect(matchSubmitted('niger', ctx(['NER']))).toEqual({ kind: 'already', id: 'NER' });
  });
});

describe('matchTarget (identify mode)', () => {
  it('accepts any name of the target as typed', () => {
    expect(matchTarget('Ivory Coast', 'CIV', index, false)).toBe('accept');
  });
  it('waits silently on other input until submitted', () => {
    expect(matchTarget('niger', 'NGA', index, false)).toBe('none');
  });
  it('forgives typos on submit only when they point at the target', () => {
    expect(matchTarget('brazl', 'BRA', index, true)).toBe('accept');
    expect(matchTarget('iran', 'IRQ', index, true)).toBe('wrong');
  });
});

describe('index sanity', () => {
  it('has no empty keys', () => {
    expect(index.keys.every((k) => k.length > 0)).toBe(true);
    expect(normalize('')).toBe('');
  });
});

describe('capitals', () => {
  const cctx = (inScope: string[], found: string[] = []) => ({ index: CAPITAL_INDEX, inScope: new Set(inScope), found: new Set(found) });
  it('a typed capital is its country', () => {
    expect(matchTyped('nairobi', cctx(['KEN']))).toEqual({ kind: 'accept', id: 'KEN', corrected: false });
    expect(matchTyped('la paz', cctx(['BOL']))).toEqual({ kind: 'accept', id: 'BOL', corrected: false });
    expect(matchTyped('kiev', cctx(['UKR']))).toEqual({ kind: 'accept', id: 'UKR', corrected: false });
  });
  it('outside the region, already found, typos on Enter', () => {
    expect(matchTyped('nairobi', cctx(['TZA']))).toEqual({ kind: 'outOfScope', id: 'KEN' });
    expect(matchTyped('nairobi', cctx(['KEN'], ['KEN']))).toEqual({ kind: 'already', id: 'KEN' });
    expect(matchSubmitted('nairobbi', cctx(['KEN']))).toEqual({ kind: 'accept', id: 'KEN', corrected: true });
  });
  it('identify: the target’s capital only', () => {
    expect(matchTarget('Ottawa', 'CAN', CAPITAL_INDEX, false)).toBe('accept');
    expect(matchTarget('Toronto', 'CAN', CAPITAL_INDEX, true)).toBe('wrong');
  });
});
