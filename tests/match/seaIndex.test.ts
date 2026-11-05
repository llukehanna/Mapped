import { describe, expect, it } from 'vitest';
import { SEAS } from '../../src/data/seas.ts';
import { poolOf, WORLD } from '../../src/game/scope.ts';
import { matchSubmitted, matchTyped } from '../../src/match/match.ts';
import { SEA_INDEX } from '../../src/match/seaIndex.ts';

const ctx = (found: string[] = []) => ({ index: SEA_INDEX, inScope: new Set(poolOf({ topic: 'seas', scope: WORLD })), found: new Set(found) });

describe('SEA_INDEX', () => {
  it('accepts names, short names and alternates', () => {
    for (const [typed, id] of [['Pacific Ocean', 'pac'], ['pacific', 'pac'], ['east sea', 'japan'], ['Sulawesi Sea', 'celebes'], ['med', 'med']])
      expect(matchSubmitted(typed, ctx()), typed).toMatchObject({ kind: 'accept', id });
  });
  it('forgives a typo on Enter', () => expect(matchSubmitted('Medditeranean Sea', ctx())).toMatchObject({ kind: 'accept', id: 'med', corrected: true }));
  it('a gulf is a note, a country is nothing', () => {
    expect(matchSubmitted('Gulf of Mexico', ctx())).toEqual({ kind: 'territory', id: 'w-gulf-of-mexico' });
    expect(matchSubmitted('France', ctx())).toEqual({ kind: 'none' });
  });
  it('waits while a longer name could follow', () => expect(matchTyped('north', ctx())).toEqual({ kind: 'hold', id: 'north' }));
  it('accepts every sea by its full name', () => {
    for (const s of SEAS) expect(matchSubmitted(s.name, ctx()), s.name).toMatchObject({ kind: 'accept', id: s.id });
  });
});
