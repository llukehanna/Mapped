import { COUNTRIES } from './countries.ts';
import { TERRITORIES } from './territories.ts';
import type { CountryDef, TerritoryDef } from './types.ts';

export const COUNTRY: ReadonlyMap<string, CountryDef> = new Map(COUNTRIES.map((c) => [c.id, c]));
export const TERRITORY: ReadonlyMap<string, TerritoryDef> = new Map(TERRITORIES.map((t) => [t.id, t]));

/** Display name for a country or territory id. */
export const nameOf = (id: string): string => COUNTRY.get(id)?.name ?? TERRITORY.get(id)?.name ?? id;
