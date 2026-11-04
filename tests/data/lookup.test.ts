import { describe, expect, it } from 'vitest';
import { nameOf, noteOf } from '../../src/data/lookup.ts';
import { TERRITORIES } from '../../src/data/territories.ts';

describe('lookup', () => {
  it('names countries, territories, seas and water', () => {
    expect(nameOf('FRA')).toBe('France');
    expect(nameOf(TERRITORIES[0].id)).toBe(TERRITORIES[0].name);
    expect(nameOf('japan')).toBe('Sea of Japan');
    expect(nameOf('w-gulf-of-mexico')).toBe('Gulf of Mexico');
  });
  it('notes for territories and water', () => {
    expect(noteOf(TERRITORIES[0].id)).toBe(TERRITORIES[0].note);
    expect(noteOf('w-gulf-of-mexico')).toBe('a gulf, not on the list');
    expect(noteOf('w-scotia-sea')).toBe('not on the list');
    expect(noteOf('FRA')).toBeNull();
  });
});
