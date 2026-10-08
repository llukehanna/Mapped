import { COUNTRY } from '../data/lookup.ts';
import { toLogged } from './log.ts';
import { hintLevels, rulesFor } from './topics.ts';
import type { EndReason, GameAction, GameConfig, GameEvent, GameState, Mode } from './types.ts';

export const TRIES_PER_TARGET = 3;

export function initialState(config: GameConfig): GameState {
  return {
    config,
    phase: 'setup',
    pool: [],
    queue: [],
    found: [],
    missed: [],
    hintsUsed: 0,
    hint: null,
    triesLeft: TRIES_PER_TARGET,
    elapsedMs: 0,
    runningSince: null,
    endReason: null,
    event: null,
    startedAt: null,
    log: [],
  };
}

/** Active play time at clock time `now`. */
export function elapsed(state: GameState, now: number): number {
  return state.elapsedMs + (state.runningSince === null ? 0 : now - state.runningSince);
}

/** Current locate/identify target, or null. */
export const target = (state: GameState): string | null => (rulesFor(state.config).ordered ? (state.queue[0] ?? null) : null);

const emit = (state: GameState, event: GameEvent): GameState['event'] => ({ ...event, seq: (state.event?.seq ?? 0) + 1 });

function end(state: GameState, reason: EndReason, now: number): GameState {
  const found = new Set(state.found);
  const missed = new Set(state.missed);
  for (const id of state.pool) if (!found.has(id)) missed.add(id);
  return {
    ...state,
    phase: 'review',
    endReason: reason,
    elapsedMs: elapsed(state, now),
    runningSince: null,
    missed: [...missed],
    queue: [],
    hint: null,
  };
}

/** Moves to the next locate/identify target, ending the game when none are left. */
function advance(state: GameState, now: number): GameState {
  const next = { ...state, queue: state.queue.slice(1), triesLeft: TRIES_PER_TARGET, hint: null };
  return next.queue.length === 0 ? end(next, 'complete', now) : next;
}

function markFound(state: GameState, id: string, now: number, corrected = false): GameState {
  if (!state.pool.includes(id) || state.found.includes(id)) return state;
  if (rulesFor(state.config).ordered && id !== target(state)) return state;
  const next: GameState = {
    ...state,
    found: [...state.found, id],
    hint: state.hint?.id === id ? null : state.hint,
    event: emit(state, corrected ? { kind: 'found', id, corrected } : { kind: 'found', id }),
  };
  if (rulesFor(state.config).ordered) return advance(next, now);
  return next.found.length === next.pool.length ? end(next, 'complete', now) : next;
}

function reveal(state: GameState, id: string, now: number): GameState {
  return advance({ ...state, missed: [...state.missed, id], event: emit(state, { kind: 'revealed', id }) }, now);
}

/** Climbs the hint ladder for `id`: the current target (locate/identify) or a missing country the player chose (type). */
function giveHint(state: GameState, id: string): GameState {
  const goal = target(state);
  if (goal ? id !== goal : !state.pool.includes(id) || state.found.includes(id)) return state;
  const level = state.hint?.id === id ? state.hint.level + 1 : 1;
  if (level > hintLevels(state.config)) return state;
  return { ...state, hint: { id, level }, hintsUsed: state.hintsUsed + 1, event: emit(state, { kind: 'hint', id, level }) };
}

/** The ladder before hints were chosen: six rungs for naming modes. */
const LEGACY_LEVELS: Record<Mode, number> = { type: 6, identify: 6, locate: 3 };

/**
 * Hints from clients before the player chose the country: type mode climbed one country and then moved on to another at
 * random. Kept so games from tabs still on that version replay on the server.
 */
function giveLegacyHint(state: GameState, rand: number): GameState {
  const top = LEGACY_LEVELS[state.config.mode];
  const climb = (id: string, level: number): GameState => ({
    ...state,
    hint: { id, level },
    hintsUsed: state.hintsUsed + 1,
    event: emit(state, { kind: 'hint', id, level }),
  });
  const goal = target(state);
  if (goal) {
    if (state.hint?.id !== goal) return climb(goal, 1);
    return state.hint.level < top ? climb(goal, state.hint.level + 1) : state;
  }
  if (state.hint && state.hint.level < top) return climb(state.hint.id, state.hint.level + 1);
  const found = new Set(state.found);
  const unfound = state.pool.filter((id) => !found.has(id));
  const left = unfound.length > 1 ? unfound.filter((id) => id !== state.hint?.id) : unfound;
  if (!left.length) return state;
  return climb(left[Math.min(left.length - 1, Math.floor(rand * left.length))], 1);
}

/** Applies `action`, recording it in the log when it changed the game. */
export function reduce(state: GameState, action: GameAction): GameState {
  const next = step(state, action);
  if (next === state || next.startedAt === null) return next;
  const logged = toLogged(action);
  return logged && 'now' in action ? { ...next, log: [...state.log, { t: action.now - next.startedAt, a: logged }] } : next;
}

function step(state: GameState, action: GameAction): GameState {
  if (action.type === 'restore') return action.state;
  if (action.type === 'start') {
    return {
      ...initialState(action.config),
      phase: 'playing',
      pool: action.pool,
      queue: rulesFor(action.config).ordered ? action.order : [],
      runningSince: action.now,
      startedAt: action.now,
    };
  }
  if (action.type === 'toSetup') return { ...initialState(state.config), event: null };
  if (action.type === 'resume') {
    return state.phase === 'paused' ? { ...state, phase: 'playing', runningSince: action.now } : state;
  }
  // Giving up is allowed from the pause card as well as during play.
  if (action.type === 'giveUp') return state.phase === 'playing' || state.phase === 'paused' ? end(state, 'gaveUp', action.now) : state;
  if (state.phase !== 'playing') return state;

  switch (action.type) {
    case 'found':
      return markFound(state, action.id, action.now, action.corrected);
    case 'click': {
      const goal = target(state);
      const { answer } = rulesFor(state.config);
      if (!goal || (answer !== 'click' && answer !== 'flag')) return state;
      // Locate clicks land on the map, so they must be in the game. A flag pick may be any country (lookalikes come from anywhere).
      if (answer === 'click' ? !state.pool.includes(action.id) : !COUNTRY.has(action.id)) return state;
      if (action.id === goal) return markFound(state, goal, action.now);
      const wrong = { ...state, triesLeft: state.triesLeft - 1, event: emit(state, { kind: 'wrong', id: action.id }) };
      return wrong.triesLeft > 0 ? wrong : reveal(wrong, goal, action.now);
    }
    case 'skip': {
      const goal = target(state);
      return goal ? reveal(state, goal, action.now) : state;
    }
    case 'hint':
      return 'id' in action ? giveHint(state, action.id) : giveLegacyHint(state, action.rand);
    case 'pause':
      return { ...state, phase: 'paused', elapsedMs: elapsed(state, action.now), runningSince: null };
    case 'tick': {
      const limit = state.config.timeLimitSec;
      return limit !== null && elapsed(state, action.now) >= limit * 1000
        ? { ...end(state, 'timeout', action.now), elapsedMs: limit * 1000 }
        : state;
    }
  }
}
