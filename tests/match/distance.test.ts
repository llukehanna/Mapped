import { describe, expect, it } from 'vitest';
import { editDistance, typoAllowance } from '../../src/match/distance.ts';

describe('editDistance', () => {
  it.each([
    ['brazil', 'brazil', 0],
    ['brazl', 'brazil', 1],
    ['barzil', 'brazil', 1], // adjacent swap counts once
    ['iran', 'iraq', 1],
    ['', 'chad', 4],
    ['phillipines', 'philippines', 2],
  ])('%s vs %s = %i', (a, b, d) => expect(editDistance(a, b)).toBe(d));
});

describe('typoAllowance', () => {
  it.each([[4, 0], [5, 1], [9, 1], [10, 2], [20, 2]])('length %i allows %i', (n, k) => expect(typoAllowance(n)).toBe(k));
});
