import type { Continent } from '../data/types.ts';
import type { LogEntry } from './log.ts';

export type Mode = 'type' | 'locate' | 'identify';

/** A union of whole continents and individual subregions. Both empty means the whole world. */
export interface Scope {
  continents: Continent[];
  subregions: string[];
}

export interface GameConfig {
  mode: Mode;
  scope: Scope;
  /** null = no limit (stopwatch counts up) */
  timeLimitSec: number | null;
}

export type Phase = 'setup' | 'playing' | 'paused' | 'review';
export type EndReason = 'complete' | 'timeout' | 'gaveUp';

export type GameEvent =
  | { kind: 'found'; id: string; corrected?: boolean } // corrected: accepted despite a typo
  | { kind: 'wrong'; id: string } // locate: clicked the wrong country
  | { kind: 'revealed'; id: string } // locate/identify: target given away (skip or out of tries)
  | { kind: 'hint'; id: string; level: number };

export interface GameState {
  config: GameConfig;
  phase: Phase;
  /** every in-scope country id */
  pool: string[];
  /** locate/identify: targets still to ask; queue[0] is the current target */
  queue: string[];
  /** in the order they were found */
  found: string[];
  missed: string[];
  hintsUsed: number;
  /** the country being hinted and how far up its ladder (1-based) */
  hint: { id: string; level: number } | null;
  /** locate: wrong clicks left on the current target */
  triesLeft: number;
  /** active play time banked before the current run */
  elapsedMs: number;
  /** clock time the current run began; null while not running */
  runningSince: number | null;
  endReason: EndReason | null;
  /** latest thing that happened, for toasts and map flashes; seq retriggers animations */
  event: (GameEvent & { seq: number }) | null;
  /** clock time the game started; null before the first start */
  startedAt: number | null;
  /** every action that changed the game, for the server to replay */
  log: LogEntry[];
}

export type GameAction =
  | { type: 'start'; config: GameConfig; pool: string[]; order: string[]; now: number }
  | { type: 'found'; id: string; now: number; corrected?: boolean }
  | { type: 'click'; id: string; now: number }
  | { type: 'skip'; now: number }
  /** a hint for `id`, which the player chose (type) or is being asked about (locate/identify) */
  | { type: 'hint'; id: string; now: number }
  /** an old client's hint, for a country picked with `rand`; see giveLegacyHint */
  | { type: 'hint'; rand: number; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'giveUp'; now: number }
  | { type: 'toSetup' }
  | { type: 'restore'; state: GameState };
