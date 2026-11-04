import { COUNTRIES } from './countries.ts';
import { TERRITORIES } from './territories.ts';
import { SEA, WATER } from './seas.ts';
import type { CountryDef, TerritoryDef } from './types.ts';

export const COUNTRY: ReadonlyMap<string, CountryDef> = new Map(COUNTRIES.map((c) => [c.id, c]));
export const TERRITORY: ReadonlyMap<string, TerritoryDef> = new Map(TERRITORIES.map((t) => [t.id, t]));

/** Display name for a country, territory, sea or water id. */
export const nameOf = (id: string): string =>
  COUNTRY.get(id)?.name ?? TERRITORY.get(id)?.name ?? SEA.get(id)?.name ?? WATER.get(id)?.name ?? id;

/** What to say when someone types a non-answer: a territory's note, or what kind of water it is. */
export function noteOf(id: string): string | null {
  const territory = TERRITORY.get(id);
  if (territory) return territory.note;
  const water = WATER.get(id);
  if (!water) return null;
  return water.kind === 'sea' ? 'not on the list' : `a ${water.kind}, not on the list`;
}
