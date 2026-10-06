import type { Facts } from '../data/facts.ts';
import type { GeoMeta } from '../data/geoMeta.ts';
import type { CountryDef } from '../data/types.ts';
import type { Mode } from './types.ts';

/** Rungs on the hint ladder. Locate stops early: past "where" and "near what", the only help left is the answer. */
export const HINT_LEVELS: Record<Mode, number> = { type: 6, identify: 6, locate: 3 };

export interface ClueInput {
  country: CountryDef;
  facts: Facts;
  meta: GeoMeta;
  nameOf: (id: string) => string;
}

const PLACE: Record<string, string> = {
  'Middle East': 'the Middle East',
  Caribbean: 'the Caribbean',
  Balkans: 'the Balkans',
  'Caucasus & Central Asia': 'the Caucasus or Central Asia',
};

/** "A, B and C" */
function list(names: string[]): string {
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function where({ country, facts, meta }: ClueInput): string {
  const place = PLACE[country.subregion] ?? country.subregion;
  if (facts.landlocked) return `Landlocked, in ${place}`;
  if (meta.neighbors.length === 0) return `An island nation in ${place}`;
  return `On the coast, in ${place}`;
}

function nearby({ meta, nameOf }: ClueInput): string {
  if (meta.neighbors.length === 0) return `Nearest countries: ${list((meta.nearest ?? []).map(nameOf))}`;
  const names = meta.neighbors.map(nameOf).sort((a, b) => a.localeCompare(b));
  return names.length > 4 ? `Borders ${names.slice(0, 3).join(', ')} and ${names.length - 3} others` : `Borders ${list(names)}`;
}

/** Familiar places to compare areas with, in km². */
const SIZES: [string, number][] = [
  ['Manhattan', 59],
  ['Washington, D.C.', 177],
  ['New York City', 783],
  ['Rhode Island', 4000],
  ['Delaware', 6400],
  ['Connecticut', 14400],
  ['New Jersey', 22600],
  ['Maryland', 32000],
  ['Indiana', 94000],
  ['Pennsylvania', 119000],
  ['Florida', 170000],
  ['California', 424000],
  ['Texas', 696000],
  ['Alaska', 1718000],
  ['the contiguous US', 8080000],
];

export function sizePhrase(areaKm2: number): string {
  if (areaKm2 < 1) return 'Tiny: under 1 km²';
  if (areaKm2 < 30) return `Tiny: about ${Math.round(areaKm2)} km²`;
  const [name, ref] = SIZES.reduce((best, s) => (Math.abs(Math.log(areaKm2 / s[1])) < Math.abs(Math.log(areaKm2 / best[1])) ? s : best));
  const r = areaKm2 / ref;
  if (r < 0.6) return `About half the size of ${name}`;
  if (r < 0.8) return `About two-thirds the size of ${name}`;
  if (r < 0.9) return `A bit smaller than ${name}`;
  if (r <= 1.1) return `About the size of ${name}`;
  if (r < 1.3) return `A bit larger than ${name}`;
  if (r < 1.7) return `About 1.5 times the size of ${name}`;
  if (r < 2.5) return `About twice the size of ${name}`;
  return `About ${Math.round(r)} times the size of ${name}`;
}

export function populationPhrase(n: number): string {
  if (n >= 1e9) return `about ${(n / 1e9).toFixed(1)} billion people`;
  if (n >= 1e7) return `about ${Math.round(n / 1e6)} million people`;
  if (n >= 1e6) return `about ${(n / 1e6).toFixed(1)} million people`;
  const rounded = n >= 1e5 ? Math.round(n / 1e4) * 1e4 : n >= 1e4 ? Math.round(n / 1e3) * 1e3 : Math.round(n / 100) * 100;
  return `about ${rounded.toLocaleString('en-US')} people`;
}

/** "B _ _ _ _ _" (first letter only) or "M _ n _ o _ i a" (every other letter plus the last). Spaces and hyphens stay. */
export function letterPattern(name: string, reveal: 'first' | 'half'): string {
  const last = name.length - 1;
  return [...name]
    .map((ch, i) => (/[\s-]/.test(ch) || i === 0 || (reveal === 'half' && (i % 2 === 0 || i === last)) ? ch : '_'))
    .join(' ');
}

/** The clue on rung `level` (1-based) of the ladder for `mode`. */
export function clueText(mode: Mode, level: number, input: ClueInput): string {
  if (level === 1) return where(input);
  if (level === 2) return nearby(input);
  if (mode === 'locate') return 'Look inside the circle';
  if (level === 3) return `${sizePhrase(input.facts.areaKm2)} · ${populationPhrase(input.facts.population)}`;
  if (level === 4) return `Capital: ${input.facts.capital}`;
  return letterPattern(input.country.name, level === 5 ? 'first' : 'half');
}
