import type { Facts } from '../data/facts.ts';
import type { GeoMeta } from '../data/geoMeta.ts';
import type { CountryDef } from '../data/types.ts';
import { capitalOf } from '../data/capitals.ts';
import { rulesFor } from './topics.ts';
import type { GameConfig, Mode } from './types.ts';

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

/** "B _ _ _ _ _": the first letter and a blank for every other letter. "ends" also shows the last letter; "half" shows every
 * other letter plus the last. Anything that isn't a letter (spaces, hyphens, apostrophes) stays as it is. */
export function letterPattern(name: string, reveal: 'first' | 'ends' | 'half'): string {
  const last = name.length - 1;
  const shown = (i: number) => i === 0 || (reveal !== 'first' && i === last) || (reveal === 'half' && i % 2 === 0);
  return [...name].map((ch, i) => (!/\p{L}/u.test(ch) || shown(i) ? ch : '_')).join(' ');
}

/** "8 letters", or "5 + 4 letters" for a name of several words. */
export function letterCount(name: string): string {
  const words = name.split(/[\s-]+/).map((w) => [...w].filter((ch) => /\p{L}/u.test(ch)).length);
  return `${words.join(' + ')} letters`;
}

/** The clue on rung `level` (1-based) of the ladder for `mode`. */
export function clueText(mode: Mode, level: number, input: ClueInput): string {
  if (mode === 'locate') return level === 1 ? where(input) : level === 2 ? nearby(input) : 'Look inside the circle';
  const { name } = input.country;
  if (level === 1) return `Starts with ${name[0]}`;
  if (level === 2) return `${letterPattern(name, 'first')} · ${letterCount(name)}`;
  return letterPattern(name, level === 3 ? 'ends' : 'half');
}

/** The clue on rung `level` for any topic: letter rungs spell whatever the answer is (country or capital). */
export function clueFor(config: Pick<GameConfig, 'mode' | 'topic'>, level: number, input: ClueInput): string {
  const { answer } = rulesFor(config);
  if (answer === 'click') return clueText('locate', level, input);
  if (answer === 'flag') return level === 1 ? 'One wrong flag removed' : 'Two wrong flags removed';
  const name = answer === 'capital' ? capitalOf(input.country.id) : input.country.name;
  return clueText('identify', level, { ...input, country: { ...input.country, name } });
}
