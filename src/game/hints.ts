import type { Facts } from '../data/facts.ts';
import type { GeoMeta } from '../data/geoMeta.ts';
import type { CountryDef } from '../data/types.ts';
import { capitalOf } from '../data/capitals.ts';
import { COUNTRIES } from '../data/countries.ts';
import { COUNTRY, nameOf } from '../data/lookup.ts';
import { BASINS, OCEANS, SEA, SEAS } from '../data/seas.ts';
import { SEA_META } from '../data/seaMeta.ts';
import { hasRegionRung, rulesFor, type Topic } from './topics.ts';
import type { GameConfig, Mode, Scope } from './types.ts';

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

/** "A, B and C", or "A, B, C and N others" past four names. */
function listOrMore(names: string[]): string {
  return names.length > 4 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} others` : list(names);
}

function where({ country, facts, meta }: ClueInput): string {
  const place = PLACE[country.subregion] ?? country.subregion;
  if (facts.landlocked) return `Landlocked, in ${place}`;
  if (meta.neighbors.length === 0) return `An island nation in ${place}`;
  return `On the coast, in ${place}`;
}

function nearby({ meta, nameOf }: ClueInput): string {
  if (meta.neighbors.length === 0) return `Nearest countries: ${list((meta.nearest ?? []).map(nameOf))}`;
  return `Borders ${listOrMore(meta.neighbors.map(nameOf).sort((a, b) => a.localeCompare(b)))}`;
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

/** The naming ladder for `name`: first letter, then blanks and the letter count, then more letters. */
function letterClue(level: number, name: string): string {
  if (level === 1) return `Starts with ${name[0]}`;
  if (level === 2) return `${letterPattern(name, 'first')} · ${letterCount(name)}`;
  return letterPattern(name, level === 3 ? 'ends' : 'half');
}

/** The clue on rung `level` (1-based) of the ladder for `mode`. */
export function clueText(mode: Mode, level: number, input: ClueInput): string {
  if (mode === 'locate') return level === 1 ? where(input) : level === 2 ? nearby(input) : 'Look inside the circle';
  return letterClue(level, input.country.name);
}

/** The clue on rung `level` for any topic: letter rungs spell whatever the answer is (country or capital). */
export function clueFor(config: Pick<GameConfig, 'mode' | 'topic'> & { scope?: Scope }, level: number, input: ClueInput): string {
  const { answer } = rulesFor(config);
  if (answer === 'click') return clueText('locate', level, input);
  if (answer === 'flag') return level === 1 ? 'One wrong flag removed' : 'Two wrong flags removed';
  if (answer === 'capitalPick') return level === 1 ? 'One wrong capital removed' : 'Two wrong capitals removed';
  if (hasRegionRung(config)) {
    return level === 1 ? `In ${PLACE[input.country.subregion] ?? input.country.subregion}` : clueText('identify', level - 1, input);
  }
  const name = answer === 'capital' ? capitalOf(input.country.id) : input.country.name;
  return clueText('identify', level, { ...input, country: { ...input.country, name } });
}

/** The clue on rung `level` for a sea: Locate says which water and which coasts, the letter rungs spell the whole name. */
export function seaClue(mode: Mode, level: number, id: string): string {
  const sea = SEA.get(id)!;
  if (mode !== 'locate') return letterClue(level, sea.name);
  if (level >= 3) return 'Look inside the circle';
  if (level === 1) {
    if (OCEANS.has(id)) return 'One of the five oceans';
    if (sea.basin === 'inland') return 'Inland, between Europe and Asia';
    return `In ${BASINS.find((b) => b.id === sea.basin)!.place}`;
  }
  if (id === 'sargasso') return 'No coastline; in the North Atlantic';
  const coast = SEA_META[id].coast;
  if (coast.length === 0) return 'Off Antarctica';
  return `Off ${listOrMore(coast.map(nameOf).sort((a, b) => a.localeCompare(b)))}`;
}

/**
 * The ids framed by the level-1 Locate hint: the target's subregion, or for Seas its basin. None when that would frame the answer
 * alone: an ocean (its basin is its own), or a group of one (the Caspian, the only inland sea).
 */
export function hintRegion(topic: Topic, id: string): string[] | null {
  if (topic === 'seas' && OCEANS.has(id)) return null;
  const ids =
    topic === 'seas'
      ? SEAS.filter((s) => s.basin === SEA.get(id)!.basin).map((s) => s.id)
      : COUNTRIES.filter((c) => c.subregion === COUNTRY.get(id)!.subregion).map((c) => c.id);
  return ids.length > 1 ? ids : null;
}
