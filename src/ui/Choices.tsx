import type { ReactNode } from 'react';
import { capitalOf } from '../data/capitals.ts';
import { flagSrc } from '../data/flags.ts';
import { TRIES_PER_TARGET } from '../game/reducer.ts';

interface ChoicesProps {
  /** what each choice shows: the country's flag (Flags · Identify) or its capital (Capitals · Identify) */
  kind: 'flag' | 'capital';
  /** the country being asked about (for tests and tooling) */
  targetId: string;
  /** the panel's heading, e.g. "Pick its flag" or "Capital of Kenya" */
  head: ReactNode;
  /** the 4 countries on offer, in order (keys 1–4) */
  ids: readonly string[];
  /** wrong picks and choices a hint removed */
  disabled: readonly string[];
  /** of `disabled`, the ones the player picked (they shake) */
  wrong: readonly string[];
  triesLeft: number;
  onPick: (id: string) => void;
}

/**
 * Pick one of four: Flags · Identify (the lit-up country's flag) or Capitals · Identify (the named country's capital). Flags are
 * labelled by number, not name, so screen readers don't give the answer away; capitals are labelled by name (the country is
 * already named, so naming the capitals leaks nothing).
 */
export function Choices({ kind, targetId, head, ids, disabled, wrong, triesLeft, onPick }: ChoicesProps) {
  return (
    <div className={`choices ${kind}-choices glass`} data-target-id={targetId}>
      <div className="choices-head">
        <span className="mute">{head}</span>
        <span className="tries" aria-label={`${triesLeft} tries left`}>
          {Array.from({ length: TRIES_PER_TARGET }, (_, i) => (
            <i key={i} className={i < triesLeft ? 'on' : ''} />
          ))}
        </span>
      </div>
      <div className="choices-grid">
        {ids.map((id, i) => {
          const off = disabled.includes(id);
          const capital = kind === 'capital' ? capitalOf(id) : null;
          return (
            <button
              key={`${targetId}-${id}`}
              type="button"
              className={`choice ${kind}-choice ${off ? (wrong.includes(id) ? 'wrong' : 'removed') : ''}`}
              aria-label={capital ?? `Flag ${i + 1}`}
              data-country-id={id}
              disabled={off}
              onClick={() => onPick(id)}
            >
              {capital === null ? (
                <img className="flag" src={flagSrc(id)} alt="" width={120} height={90} draggable={false} />
              ) : (
                <span className="choice-name">{capital}</span>
              )}
              <kbd>{i + 1}</kbd>
            </button>
          );
        })}
      </div>
    </div>
  );
}
