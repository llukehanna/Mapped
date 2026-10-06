import type { GameState } from '../game/types.ts';
import { readJson, writeJson } from '../store/storage.ts';
import type { GameResult } from './types.ts';

/** What survives the round trip to Google (and later visits): games to claim, and the review screen to come back to. Claims live in localStorage, the review in sessionStorage. */

const CLAIMS = 'mapped:claims:v1';
const RESUME = 'mapped:resume:v1';
/** Signed-out games stay claimable this long; the server keeps them for as long (UNCLAIMED_KEEP_DAYS). */
const CLAIM_TTL_MS = 90 * 86_400_000;
/** Oldest claims go first past this many. */
const MAX_STORED_CLAIMS = 500;
const RESUME_TTL_MS = 30 * 60_000;

export interface Claim {
  id: string;
  claim: string;
  at: number;
}

/** The online game behind the current screen. */
export interface Run {
  id: string;
  claim: string | null;
  board: GameResult['board'];
}

export type SaveState =
  | { status: 'offline' }
  | { status: 'saving' }
  | { status: 'error' }
  | { status: 'unverified' }
  | { status: 'saved'; result: GameResult };

export interface Resume {
  state: GameState;
  run: Run | null;
  save: SaveState | null;
  at: number;
}

export function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readClaims(storage: Storage | null, now: number): Claim[] {
  return (readJson<Claim[]>(storage, CLAIMS) ?? []).filter((c) => now - c.at < CLAIM_TTL_MS);
}

export function addClaim(storage: Storage | null, claim: { id: string; claim: string }, now: number): void {
  writeJson(storage, CLAIMS, [...readClaims(storage, now).filter((c) => c.id !== claim.id), { ...claim, at: now }].slice(-MAX_STORED_CLAIMS));
}

/** One-time move of claims saved by older versions in sessionStorage into `to` (localStorage). Keeps them where they are if `to` is unavailable. */
export function migrateClaims(from: Storage | null, to: Storage | null, now: number): void {
  if (!from || !to) return;
  const moving = readClaims(from, now);
  if (moving.length > 0) {
    const have = new Set(readClaims(to, now).map((c) => c.id));
    const merged = [...readClaims(to, now), ...moving.filter((c) => !have.has(c.id))].sort((a, b) => a.at - b.at);
    writeJson(to, CLAIMS, merged.slice(-MAX_STORED_CLAIMS));
  }
  clearClaims(from);
}

/** Drops the claims with these ids (the ones the server has taken), keeping the rest. */
export function removeClaims(storage: Storage | null, ids: readonly string[]): void {
  const drop = new Set(ids);
  const keep = (readJson<Claim[]>(storage, CLAIMS) ?? []).filter((c) => !drop.has(c.id));
  if (keep.length === 0) clearClaims(storage);
  else writeJson(storage, CLAIMS, keep);
}

export function clearClaims(storage: Storage | null): void {
  try {
    storage?.removeItem(CLAIMS);
  } catch {
    // nothing to clear
  }
}

export function saveResume(storage: Storage | null, resume: Omit<Resume, 'at'>, now: number): void {
  writeJson(storage, RESUME, { ...resume, at: now });
}

/** The saved review, once: reading it removes it. Null when missing or older than 30 minutes. */
export function takeResume(storage: Storage | null, now: number): Resume | null {
  const resume = readJson<Resume>(storage, RESUME);
  try {
    storage?.removeItem(RESUME);
  } catch {
    // ignore
  }
  return resume && now - resume.at < RESUME_TTL_MS ? resume : null;
}
