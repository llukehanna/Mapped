import { COUNTRIES } from '../data/countries.ts';
import { GEO_META } from '../data/geoMeta.ts';
import { COUNTRY } from '../data/lookup.ts';
import { idHash } from './flagChoices.ts';
import { seededRandom, shuffle } from './rng.ts';

/**
 * The 4 countries whose capitals are offered in Capitals · Identify: the target and 3 others, neighbors first, then the same
 * subregion, the same continent, then anywhere. Same game seed and target → same choices (a reload or a restored review shows the same ones).
 */
export function capitalChoices(target: string, seed: number): string[] {
  const rand = seededRandom((seed ^ idHash(target) ^ 0x5bd1e995) >>> 0);
  const me = COUNTRY.get(target)!;
  const others = COUNTRIES.filter((c) => c.id !== target);
  const tiers = [
    shuffle(GEO_META[target].neighbors.filter((id) => COUNTRY.has(id)), rand),
    shuffle(others.filter((c) => c.subregion === me.subregion).map((c) => c.id), rand),
    shuffle(others.filter((c) => c.continent === me.continent).map((c) => c.id), rand),
    shuffle(others.map((c) => c.id), rand),
  ];
  const picked: string[] = [];
  for (const tier of tiers) for (const id of tier) if (picked.length < 3 && !picked.includes(id)) picked.push(id);
  return shuffle([target, ...picked], rand);
}
