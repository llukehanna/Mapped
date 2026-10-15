import { useEffect, useRef } from 'react';
import { capitalOf } from '../data/capitals.ts';
import { flagSrc } from '../data/flags.ts';
import { nameOf } from '../data/lookup.ts';
import type { LearnState } from '../game/learn.ts';

interface LearnCardProps {
  /** the flag on screen and the four countries offered (keys 1–4) */
  card: { id: string; choices: readonly string[] };
  phase: LearnState['phase'];
  last: LearnState['last'];
  /** the flag after this one, fetched ahead */
  upNext: string | undefined;
  onPick: (id: string) => void;
  onContinue: () => void;
  onStop: () => void;
}

/**
 * Flags · Learn: one flag, large, and four country names. After a pick the right name turns gold (a wrong pick shakes) and the
 * line under the flag names the country and its capital. A wrong answer waits for Continue (or Enter). Keyed per card, so each
 * one animates in fresh.
 */
export function LearnCard({ card, phase, last, upNext, onPick, onContinue, onStop }: LearnCardProps) {
  const answered = phase === 'answered' && last !== null;
  const keys = useRef({ card, phase, onPick, onContinue, onStop });
  keys.current = { card, phase, onPick, onContinue, onStop };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = keys.current;
      if (e.key === 'Escape') return void k.onStop();
      if (e.key === 'Enter' && k.phase === 'answered') {
        e.preventDefault();
        return void k.onContinue();
      }
      const id = /^[1-4]$/.test(e.key) ? k.card.choices[Number(e.key) - 1] : undefined;
      if (id && k.phase === 'asking') k.onPick(id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (upNext) new Image().src = flagSrc(upNext);
  }, [upNext]);

  const answer = `${nameOf(card.id)} · ${capitalOf(card.id)}`;
  return (
    <div className="learn-card glass" data-target-id={card.id} data-phase={phase}>
      <img className="flag learn-flag" src={flagSrc(card.id)} alt="The flag to name" width={240} height={180} draggable={false} />
      <div className={`learn-line ${answered ? (last.right ? 'right' : 'wrong') : ''}`}>
        <span aria-live="polite">{!answered ? <span className="mute">Which country is this?</span> : last.right ? answer : `That's ${answer}`}</span>
        {answered && !last.right && (
          <button type="button" className="btn primary learn-continue" onClick={onContinue} autoFocus>
            Continue <kbd>↵</kbd>
          </button>
        )}
      </div>
      <div className="learn-grid">
        {card.choices.map((id, i) => {
          const state = !answered ? '' : id === card.id ? 'right' : id === last.picked ? 'wrong' : '';
          return (
            <button
              key={id}
              type="button"
              className={`choice learn-choice ${state}`}
              data-country-id={id}
              disabled={answered}
              onClick={() => onPick(id)}
            >
              <span className="choice-name">{nameOf(id)}</span>
              <kbd>{i + 1}</kbd>
            </button>
          );
        })}
      </div>
    </div>
  );
}
