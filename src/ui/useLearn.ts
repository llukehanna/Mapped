import { useEffect, useRef, useState } from 'react';
import { COUNTRIES } from '../data/countries.ts';
import { flagChoices } from '../game/flagChoices.ts';
import { learnReduce, roundFor, type LearnAction, type LearnState } from '../game/learn.ts';
import { shuffle } from '../game/rng.ts';
import { poolFor } from '../game/scope.ts';
import type { Scope } from '../game/types.ts';
import { addLearned, readLearned } from '../store/learned.ts';

/** A right answer moves on by itself after this long; a wrong one waits for Continue. */
export const RIGHT_PAUSE_MS = 900;

export interface LearnSession {
  state: LearnState;
  /** the region being learned (for the pill, and "Learn again") */
  scope: Scope;
  /** the flag on screen and its four names, fixed from when it was asked until the next one */
  card: { id: string; choices: string[] } | null;
  /** seeds the choices: a random number per round, plus how many cards came before, so a returning flag's names move around */
  seed: number;
  asked: number;
}

/**
 * Flags · Learn: one drill round at a time, kept apart from the ranked game (no server, no board). Each flag is saved as learned
 * the moment it becomes learned, so Stop keeps the progress.
 */
export function useLearn(storage: Storage | null, random: () => number) {
  const [session, setSession] = useState<LearnSession | null>(null);
  /** Mirrors `session` synchronously, so two quick key presses can't both answer the same card. */
  const live = useRef<LearnSession | null>(null);
  const set = (next: LearnSession | null) => {
    live.current = next;
    setSession(next);
  };

  const withCard = (s: LearnSession): LearnSession => {
    const id = s.state.queue[0];
    if (s.state.phase !== 'asking' || id === undefined) return s;
    return { ...s, card: { id, choices: flagChoices(id, (s.seed + s.asked) >>> 0) }, asked: s.asked + 1 };
  };

  function act(action: LearnAction) {
    const cur = live.current;
    if (!cur) return;
    const state = learnReduce(cur.state, action);
    if (state === cur.state) return;
    const fresh = state.learned.slice(cur.state.learned.length);
    if (fresh.length > 0) addLearned(storage, fresh);
    const next = { ...cur, state };
    set(action.type === 'continue' ? withCard(next) : next);
  }

  function start(scope: Scope) {
    const round = roundFor(poolFor(scope, COUNTRIES), readLearned(storage));
    const state = learnReduce(null, { type: 'start', pool: round, order: shuffle(round, random), now: Date.now() });
    set(withCard({ state, scope, card: null, seed: Math.floor(random() * 2 ** 32), asked: 0 }));
  }

  // Right answers move on after a beat.
  const state = session?.state;
  useEffect(() => {
    if (state?.phase !== 'answered' || !state.last?.right) return;
    const id = window.setTimeout(() => act({ type: 'continue', now: Date.now() }), RIGHT_PAUSE_MS);
    return () => window.clearTimeout(id);
  }, [state]);

  return {
    session,
    start,
    pick: (id: string) => act({ type: 'pick', id }),
    next: () => act({ type: 'continue', now: Date.now() }),
    stop: () => act({ type: 'stop', now: Date.now() }),
    close: () => set(null),
  };
}
