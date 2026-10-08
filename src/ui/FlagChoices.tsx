import { flagSrc } from '../data/flags.ts';
import { TRIES_PER_TARGET } from '../game/reducer.ts';

interface FlagChoicesProps {
  /** the country lit up on the map (for tests and tooling) */
  targetId: string;
  /** the 4 flags on offer, in order (keys 1–4) */
  ids: readonly string[];
  /** wrong picks and flags a hint removed */
  disabled: readonly string[];
  /** of `disabled`, the ones the player picked (they shake) */
  wrong: readonly string[];
  triesLeft: number;
  onPick: (id: string) => void;
}

/** Flags · Identify: pick the lit-up country's flag from four. Labels are numbers, not names, so screen readers don't give it away. */
export function FlagChoices({ targetId, ids, disabled, wrong, triesLeft, onPick }: FlagChoicesProps) {
  return (
    <div className="flag-choices glass" data-target-id={targetId}>
      <div className="flag-choices-head">
        <span className="mute">Pick its flag</span>
        <span className="tries" aria-label={`${triesLeft} tries left`}>
          {Array.from({ length: TRIES_PER_TARGET }, (_, i) => (
            <i key={i} className={i < triesLeft ? 'on' : ''} />
          ))}
        </span>
      </div>
      <div className="flag-grid">
        {ids.map((id, i) => {
          const off = disabled.includes(id);
          return (
            <button
              key={`${targetId}-${id}`}
              type="button"
              className={`flag-choice ${off ? (wrong.includes(id) ? 'wrong' : 'removed') : ''}`}
              aria-label={`Flag ${i + 1}`}
              disabled={off}
              onClick={() => onPick(id)}
            >
              <img className="flag" src={flagSrc(id)} alt="" width={120} height={90} draggable={false} />
              <kbd>{i + 1}</kbd>
            </button>
          );
        })}
      </div>
    </div>
  );
}
