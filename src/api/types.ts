import type { Board } from '../game/ranking.ts';
import type { EndReason, GameConfig, Mode } from '../game/types.ts';

/** Shared between the Worker and the browser: the JSON each API route sends back. */

/** Most claims one /api/games/claim request handles (each costs several D1 queries). */
export const MAX_CLAIMS_PER_REQUEST = 8;

/** Most bests one /api/me/import request takes; the browser sends its saved bests in batches of this many. */
export const MAX_IMPORTS_PER_REQUEST = 25;

/** Most pre-accounts bests one account can ever import; a real browser holds a few dozen. */
export const MAX_IMPORTED_PER_ACCOUNT = 200;

/** Bests saved in the browser before this moment (the v2 launch, 2026-10-06 21:30 UTC) are imported; later runs already went to the server. */
export const LOCAL_IMPORT_BEFORE = 1791322200000;

/** One best the browser saved before accounts, as POST /api/me/import takes it. */
export interface ImportEntry {
  config: GameConfig;
  found: number;
  total: number;
  ms: number;
  hints: number;
  /** epoch ms when the game ended */
  at: number;
}

export type UnrankedReason = 'custom' | 'incomplete' | 'paused' | 'unverified' | 'anonymous' | 'imported';

export interface User {
  /** null until the player picks one */
  name: string | null;
  email: string;
}

export interface StartResponse {
  id: string;
  /** proves ownership of a game played signed out; null when signed in */
  claim: string | null;
  seed: number;
  board: Board | null;
}

export interface BestSummary {
  hints: number;
  ms: number;
  /** null while the player has no name and so isn't on the board */
  rank: number | null;
}

export interface GameResult {
  id: string;
  board: Board | null;
  found: number;
  total: number;
  hints: number;
  ms: number;
  endReason: EndReason;
  ranked: boolean;
  reason: UnrankedReason | null;
  /** this run became the player's best on its board */
  newBest: boolean;
  /** the player's best on this board after this run (owned games on a board) */
  best: BestSummary | null;
  /** unclaimed ranked-eligible games: the rank this run would get */
  wouldRank: number | null;
}

export interface BoardRow {
  rank: number;
  name: string;
  hints: number;
  ms: number;
  finishedAt: number;
  you: boolean;
}

export interface BoardResponse {
  board: Board;
  rows: BoardRow[];
  players: number;
  /** your own row when you're on this board, even outside the top 50 */
  you: BoardRow | null;
}

export interface RecentGame {
  id: string;
  mode: Mode;
  scopeKey: string;
  found: number;
  total: number;
  hints: number;
  ms: number;
  endReason: EndReason;
  ranked: boolean;
  reason: UnrankedReason | null;
  /** this game is the player's current best on its board */
  isBest: boolean;
  finishedAt: number;
}

export interface MyGamesResponse {
  bests: (BestSummary & { board: Board })[];
  recent: RecentGame[];
}
