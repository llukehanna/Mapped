import { SEAS, shortName, WATERS } from '../data/seas.ts';
import { buildIndex } from './nameIndex.ts';
import { normalize } from './normalize.ts';

/** Every key already claimed by a full name or a listed alternate, so a short form never steals one. */
const taken = new Set(SEAS.flatMap((s) => [s.name, ...s.aliases]).map(normalize));

/** Seas as typed answers ("Pacific Ocean", "Pacific", "East Sea"); gulfs, bays and the like are note-only. */
export const SEA_INDEX = buildIndex(
  SEAS.map((s) => {
    const short = shortName(s.name);
    const key = normalize(short);
    const extra = short !== s.name && !taken.has(key) ? [short] : [];
    if (extra.length) taken.add(key);
    return { id: s.id, name: s.name, aliases: [...s.aliases, ...extra] };
  }),
  WATERS.map((w) => ({ id: w.id, name: w.name, aliases: [] })),
);
