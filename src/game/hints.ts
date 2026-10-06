import type { CountryDef } from '../data/types.ts';
import type { Mode } from './types.ts';

/** "B _ _ _ _ _": the first letter, then a blank per letter, keeping spaces and hyphens. */
export function letterPattern(name: string): string {
  return [...name].map((ch, i) => (i === 0 ? ch : /[\s-]/.test(ch) ? ch : '_')).join(' ');
}

export function hintText(mode: Mode, level: 1 | 2, country: CountryDef): string {
  const first = country.name[0];
  if (mode === 'locate') return level === 1 ? `It's in ${country.subregion}` : 'Look inside the circle';
  if (mode === 'identify') return level === 1 ? `Starts with ${first}` : letterPattern(country.name);
  return level === 1 ? `Starts with ${first} · outlined on the map` : `Starts with ${first} · zoomed in`;
}
