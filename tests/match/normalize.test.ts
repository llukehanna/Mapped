import { describe, expect, it } from 'vitest';
import { normalize } from '../../src/match/normalize.ts';

describe('normalize', () => {
  it.each([
    ["Côte d'Ivoire", 'cotedivoire'],
    ['cote d ivoire', 'cotedivoire'],
    ['St. Kitts & Nevis', 'saintkittsnevis'],
    ['Saint-Kitts and Nevis', 'saintkittsnevis'],
    ['  The Gambia ', 'gambia'],
    ['NEW zealand', 'newzealand'],
    ['newzealand', 'newzealand'],
    ['São Tomé and Príncipe', 'saotomeprincipe'],
    ['Türkiye', 'turkiye'],
    ['Bosnia-Herzegovina', 'bosniaherzegovina'],
    ['United States of America', 'unitedstatesamerica'],
    ['the', ''],
    ['', ''],
  ])('%j -> %j', (input, key) => expect(normalize(input)).toBe(key));
});
