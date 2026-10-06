import type { CountryDef, TerritoryDef } from '../data/types.ts';
import { normalize } from './normalize.ts';

export interface NameIndex {
  /** normalized key -> country or territory id */
  byKey: ReadonlyMap<string, string>;
  /** every key, for prefix and typo scans */
  keys: readonly string[];
  /** id -> all of its keys */
  keysOf: ReadonlyMap<string, readonly string[]>;
  /** ids that are territories (never guessable) */
  territories: ReadonlySet<string>;
}

export function buildIndex(countries: readonly CountryDef[], territories: readonly TerritoryDef[]): NameIndex {
  const byKey = new Map<string, string>();
  const keysOf = new Map<string, string[]>();
  for (const entry of [...countries, ...territories]) {
    const keys = [...new Set([entry.name, ...entry.aliases].map(normalize))];
    for (const key of keys) {
      const owner = byKey.get(key);
      if (owner && owner !== entry.id) throw new Error(`Name key "${key}" is used by both ${owner} and ${entry.id}`);
      byKey.set(key, entry.id);
    }
    keysOf.set(entry.id, keys);
  }
  return { byKey, keys: [...byKey.keys()], keysOf, territories: new Set(territories.map((t) => t.id)) };
}
