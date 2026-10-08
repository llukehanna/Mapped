import type { GameAction } from './types.ts';

/** A game action as recorded for the server's replay: the action without its clock time. */
export type LoggedAction =
  | { type: 'found'; id: string; corrected?: boolean }
  | { type: 'click'; id: string }
  | { type: 'skip' }
  | { type: 'hint'; id: string }
  | { type: 'hint'; rand: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'giveUp' }
  | { type: 'tick' };

/** `t`: ms since the game started, on the clock of whoever recorded it. */
export interface LogEntry {
  t: number;
  a: LoggedAction;
}

/** The loggable part of an action, or null for actions that aren't part of play (start, toSetup, restore). */
export function toLogged(action: GameAction): LoggedAction | null {
  switch (action.type) {
    case 'found':
      return action.corrected ? { type: 'found', id: action.id, corrected: true } : { type: 'found', id: action.id };
    case 'click':
      return { type: 'click', id: action.id };
    case 'hint':
      return 'id' in action ? { type: 'hint', id: action.id } : { type: 'hint', rand: action.rand };
    case 'skip':
    case 'pause':
    case 'resume':
    case 'giveUp':
    case 'tick':
      return { type: action.type };
    default:
      return null;
  }
}

/** Turns a log entry back into the action it came from, with its clock time restored. */
export function toAction(entry: LogEntry, startedAt: number): GameAction {
  const now = startedAt + entry.t;
  const a = entry.a;
  switch (a.type) {
    case 'found':
      return a.corrected ? { type: 'found', id: a.id, now, corrected: true } : { type: 'found', id: a.id, now };
    case 'click':
      return { type: 'click', id: a.id, now };
    case 'hint':
      return 'id' in a ? { type: 'hint', id: a.id, now } : { type: 'hint', rand: a.rand, now };
    default:
      return { type: a.type, now };
  }
}
