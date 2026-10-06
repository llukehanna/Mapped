import { editDistance, typoAllowance } from './distance.ts';
import type { NameIndex } from './nameIndex.ts';
import { normalize } from './normalize.ts';

export type MatchResult =
  | { kind: 'accept'; id: string; corrected: boolean }
  | { kind: 'hold'; id: string }
  | { kind: 'already'; id: string }
  | { kind: 'outOfScope'; id: string }
  | { kind: 'territory'; id: string }
  | { kind: 'none' };

export interface MatchContext {
  index: NameIndex;
  inScope: ReadonlySet<string>;
  found: ReadonlySet<string>;
}

const NONE: MatchResult = { kind: 'none' };

/** True when `key` is the start of a longer name whose country is still to be found. */
function startsLongerName(key: string, ctx: MatchContext): boolean {
  return ctx.index.keys.some((k) => k.length > key.length && k.startsWith(key) && !ctx.found.has(ctx.index.byKey.get(k)!));
}

function classify(id: string, ctx: MatchContext, corrected: boolean): MatchResult {
  if (ctx.index.territories.has(id)) return { kind: 'territory', id };
  if (ctx.found.has(id)) return { kind: 'already', id };
  if (!ctx.inScope.has(id)) return { kind: 'outOfScope', id };
  return { kind: 'accept', id, corrected };
}

/** Called on every keystroke. Exact names only; never guesses at typos. */
export function matchTyped(input: string, ctx: MatchContext): MatchResult {
  const key = normalize(input);
  const id = key && ctx.index.byKey.get(key);
  if (!id) return NONE;
  const result = classify(id, ctx, false);
  if (!startsLongerName(key, ctx)) return result;
  // "niger" while Nigeria is still unfound: wait, the player may still be typing.
  return result.kind === 'accept' ? { kind: 'hold', id } : NONE;
}

/** Called on Enter (or when a hold times out). Accepts exact names, then unambiguous typos. */
export function matchSubmitted(input: string, ctx: MatchContext): MatchResult {
  const key = normalize(input);
  if (!key) return NONE;
  const exact = ctx.index.byKey.get(key);
  if (exact) return classify(exact, ctx, false);
  const id = uniqueNear(key, ctx.index);
  return id ? classify(id, ctx, true) : NONE;
}

/** The single country or territory within typo range of `key`, or null if none or several. */
export function uniqueNear(key: string, index: NameIndex): string | null {
  const allowance = typoAllowance(key.length);
  if (!allowance) return null;
  const near = new Set<string>();
  for (const k of index.keys) {
    if (Math.abs(k.length - key.length) > allowance) continue;
    if (editDistance(key, k) <= allowance) near.add(index.byKey.get(k)!);
    if (near.size > 1) return null;
  }
  return near.size === 1 ? [...near][0] : null;
}

/** Identify mode: is `input` the name of `targetId`? Typos are only forgiven on submit. */
export function matchTarget(input: string, targetId: string, index: NameIndex, submitted: boolean): 'accept' | 'wrong' | 'none' {
  const key = normalize(input);
  if (!key) return 'none';
  if (index.keysOf.get(targetId)?.includes(key)) return 'accept';
  if (!submitted) return 'none';
  return uniqueNear(key, index) === targetId ? 'accept' : 'wrong';
}
