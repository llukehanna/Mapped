import { COUNTRIES } from '../data/countries.ts';
import { FLAG_LOOKALIKES } from '../data/flagLookalikes.ts';
import { COUNTRY } from '../data/lookup.ts';
import { seededRandom, shuffle } from './rng.ts';

/** A stable number for a country id, so each target gets its own choices from one game seed. */
const idHash = (id: string) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/**
 * The 4 flags offered in Flags · Identify: the target and 3 others, lookalikes first, then the same subregion, the same
 * continent, then anywhere. Same game seed and target → same choices (a reload or a restored review shows the same flags).
 */
export function flagChoices(target: string, seed: number): string[] {
  const rand = seededRandom((seed ^ idHash(target)) >>> 0);
  const me = COUNTRY.get(target)!;
  const others = COUNTRIES.filter((c) => c.id !== target);
  const tiers = [
    shuffle([...new Set(FLAG_LOOKALIKES.filter((g) => g.includes(target)).flat())].filter((id) => id !== target), rand),
    shuffle(others.filter((c) => c.subregion === me.subregion).map((c) => c.id), rand),
    shuffle(others.filter((c) => c.continent === me.continent).map((c) => c.id), rand),
    shuffle(others.map((c) => c.id), rand),
  ];
  const picked: string[] = [];
  for (const tier of tiers) for (const id of tier) if (picked.length < 3 && !picked.includes(id)) picked.push(id);
  return shuffle([target, ...picked], rand);
}
