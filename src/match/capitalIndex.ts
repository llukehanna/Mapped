import { CAPITALS } from '../data/capitals.ts';
import { buildIndex } from './nameIndex.ts';

/** Capitals as names of their countries: typing "Nairobi" finds KEN. */
export const CAPITAL_INDEX = buildIndex(
  [...CAPITALS].map(([id, c]) => ({ id, name: c.name, aliases: c.aliases })),
  [],
);
