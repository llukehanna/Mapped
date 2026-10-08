import { useEffect, useLayoutEffect, useRef, useState, type Dispatch } from 'react';
import { capitalOf } from '../data/capitals.ts';
import { nameOf, TERRITORY } from '../data/lookup.ts';
import { rulesFor } from '../game/topics.ts';
import { target } from '../game/reducer.ts';
import type { GameAction, GameState } from '../game/types.ts';
import { matchSubmitted, matchTarget, matchTyped, type MatchContext, type MatchResult } from '../match/match.ts';
import { CAPITAL_INDEX } from '../match/capitalIndex.ts';
import type { NameIndex } from '../match/nameIndex.ts';
import type { ToastMessage } from './Toast.tsx';

/** How long an exact name that could still grow ("niger" → "nigeria") waits before counting. */
export const HOLD_MS = 600;

interface GuessOptions {
  state: GameState;
  dispatch: Dispatch<GameAction>;
  index: NameIndex;
  say: (text: string, tone: ToastMessage['tone']) => void;
  /** briefly light up a country (used for "already found") */
  flash: (id: string) => void;
  /** a typed "?" asks for a hint, even where keyboards send no key events (phones) */
  onHint: () => void;
}

/** Input state and matching for every game with a typed answer: country names, or capitals in Capitals. */
export function useGuess({ state, dispatch, index, say, flash, onHint }: GuessOptions) {
  const [value, setValue] = useState('');
  const [shakeSeq, setShakeSeq] = useState(0);
  const hold = useRef<number | undefined>(undefined);
  const latest = useRef(state);
  useLayoutEffect(() => {
    latest.current = state;
  });

  // Fresh input for each game.
  useEffect(() => {
    setValue('');
    window.clearTimeout(hold.current);
  }, [state.pool]);
  useEffect(() => () => window.clearTimeout(hold.current), []);

  /** Capitals games match what's typed against capitals; everything else against country names. */
  const indexFor = (s: GameState) => (rulesFor(s.config).answer === 'capital' ? CAPITAL_INDEX : index);
  const context = (): MatchContext => ({ index: indexFor(latest.current), inScope: new Set(latest.current.pool), found: new Set(latest.current.found) });

  /** Acts on a match. Returns true when the input should clear. */
  function handle(r: MatchResult): boolean {
    const capitals = rulesFor(latest.current.config).answer === 'capital';
    switch (r.kind) {
      case 'accept':
        dispatch({ type: 'found', id: r.id, now: Date.now(), corrected: r.corrected });
        return true;
      case 'already':
        say(`Already found: ${capitals ? capitalOf(r.id) : nameOf(r.id)}`, 'info');
        flash(r.id);
        return true;
      case 'outOfScope':
        say(capitals ? `${capitalOf(r.id)} is ${nameOf(r.id)}'s capital, which isn't in this quiz` : `${nameOf(r.id)} isn't in this quiz`, 'warn');
        return true;
      case 'territory':
        say(`${nameOf(r.id)}: ${TERRITORY.get(r.id)!.note}`, 'info');
        return true;
      default:
        return false;
    }
  }

  function onChange(raw: string) {
    const next = raw.replace(/\?/g, '');
    for (let i = next.length; i < raw.length; i++) onHint();
    setValue(next);
    window.clearTimeout(hold.current);
    const s = latest.current;
    if (s.phase !== 'playing') return;
    if (rulesFor(s.config).ordered) {
      const goal = target(s);
      if (goal && matchTarget(next, goal, indexFor(s), false) === 'accept') {
        dispatch({ type: 'found', id: goal, now: Date.now() });
        setValue('');
      }
      return;
    }
    const r = matchTyped(next, context());
    if (r.kind === 'hold') {
      hold.current = window.setTimeout(() => {
        if (handle(matchSubmitted(next, context()))) setValue('');
      }, HOLD_MS);
      return;
    }
    if (handle(r)) setValue('');
  }

  function onSubmit() {
    window.clearTimeout(hold.current);
    const s = latest.current;
    if (s.phase !== 'playing' || !value.trim()) return;
    if (rulesFor(s.config).ordered) {
      const goal = target(s);
      if (!goal) return;
      if (matchTarget(value, goal, indexFor(s), true) === 'accept') dispatch({ type: 'found', id: goal, now: Date.now(), corrected: true });
      else setShakeSeq((n) => n + 1);
      setValue('');
      return;
    }
    if (handle(matchSubmitted(value, context()))) setValue('');
    else setShakeSeq((n) => n + 1);
  }

  return { value, onChange, onSubmit, shakeSeq };
}
