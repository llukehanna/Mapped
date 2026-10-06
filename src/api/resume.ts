import type { GameState } from '../game/types.ts';
import { readJson, writeJson } from '../store/storage.ts';
import type { GameResult } from './types.ts';

/** What survives the round trip to Google: games to claim, and the review screen to come back to. */

const CLAIMS = 'mapped:claims:v1';
const RESUME = 'mapped:resume:v1';
const CLAIM_TTL_MS = 24 * 3_600_000;
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
  writeJson(storage, CLAIMS, [...readClaims(storage, now).filter((c) => c.id !== claim.id), { ...claim, at: now }]);
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
