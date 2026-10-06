import type { CountryDef } from '../data/types.ts';
import { CONTINENTS } from './scope.ts';

export interface ProgressRow {
  label: string;
  found: number;
  total: number;
}

/** Found/total per continent, or per subregion when the pool sits inside one continent. In a fixed order. */
export function progressRows(pool: readonly string[], found: readonly string[], countries: ReadonlyMap<string, CountryDef>): ProgressRow[] {
  const inPool = pool.map((id) => countries.get(id)!).filter(Boolean);
  const continents = new Set(inPool.map((c) => c.continent));
  const bySubregion = continents.size === 1;
  const labelOf = (c: CountryDef) => (bySubregion ? c.subregion : CONTINENTS.find((x) => x.id === c.continent)!.label);
  const done = new Set(found);
  const rows = new Map<string, ProgressRow>();
  for (const c of inPool) {
    const label = labelOf(c);
    const row = rows.get(label) ?? { label, found: 0, total: 0 };
    row.total += 1;
    if (done.has(c.id)) row.found += 1;
    rows.set(label, row);
  }
  // Stable order: continents as listed in CONTINENTS, subregions as they first appear in the data.
  const order = bySubregion
    ? [...new Set([...countries.values()].map((c) => c.subregion))]
    : CONTINENTS.map((c) => c.label);
  return [...rows.values()].sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
}

/** The row label a country is counted under, given the same pool. */
export function groupOf(id: string, pool: readonly string[], countries: ReadonlyMap<string, CountryDef>): string {
  const c = countries.get(id)!;
  const continents = new Set(pool.map((p) => countries.get(p)?.continent));
  return continents.size === 1 ? c.subregion : CONTINENTS.find((x) => x.id === c.continent)!.label;
}
