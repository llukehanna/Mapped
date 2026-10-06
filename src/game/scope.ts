import type { Continent, CountryDef } from '../data/types.ts';
import type { Scope } from './types.ts';

export const CONTINENTS: { id: Continent; label: string }[] = [
  { id: 'africa', label: 'Africa' },
  { id: 'asia', label: 'Asia' },
  { id: 'europe', label: 'Europe' },
  { id: 'north-america', label: 'N. America' },
  { id: 'south-america', label: 'S. America' },
  { id: 'oceania', label: 'Oceania' },
];

export const WORLD: Scope = { continents: [], subregions: [] };

export const isWorld = (scope: Scope) => scope.continents.length === 0 && scope.subregions.length === 0;

export function inScope(country: CountryDef, scope: Scope): boolean {
  return isWorld(scope) || scope.continents.includes(country.continent) || scope.subregions.includes(country.subregion);
}

/** In-scope country ids, alphabetical by name. */
export function poolFor(scope: Scope, countries: readonly CountryDef[]): string[] {
  return countries
    .filter((c) => inScope(c, scope))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.id);
}

/** Subregions of a continent, in data order. */
export function subregionsOf(continent: Continent, countries: readonly CountryDef[]): string[] {
  return [...new Set(countries.filter((c) => c.continent === continent).map((c) => c.subregion))];
}

/** "World", "Europe", "Africa + Europe", "Caribbean + Central America". */
export function scopeLabel(scope: Scope): string {
  if (isWorld(scope)) return 'World';
  const names = [
    ...CONTINENTS.filter((c) => scope.continents.includes(c.id)).map((c) => c.label),
    ...[...scope.subregions].sort(),
  ];
  return names.length > 3 ? `${names.slice(0, 2).join(' + ')} + ${names.length - 2} more` : names.join(' + ');
}

/** Stable string for storage keys, independent of selection order. */
export function scopeKey(scope: Scope): string {
  if (isWorld(scope)) return 'world';
  return [...[...scope.continents].sort(), ...[...scope.subregions].sort()].join(',');
}
