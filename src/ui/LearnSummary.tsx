import { flagSrc } from '../data/flags.ts';
import { nameOf } from '../data/lookup.ts';
import { formatClock } from '../game/format.ts';
import { hardest, type LearnState } from '../game/learn.ts';
import { CenterCard } from './CenterCard.tsx';

interface LearnSummaryProps {
  state: LearnState;
  /** "S. America" */
  region: string;
  /** the region's flags learned on this browser, after this round */
  regionLearned: number;
  regionTotal: number;
  onAgain: () => void;
  onPlay: () => void;
  onClose: () => void;
}

const flags = (n: number) => `${n} flag${n === 1 ? '' : 's'}`;

/** The end of a Learn round, finished or stopped: how many were learned, how long it took, and the flags missed most. */
export function LearnSummary({ state, region, regionLearned, regionTotal, onAgain, onPlay, onClose }: LearnSummaryProps) {
  const learned = state.learned.length;
  const size = state.pool.length;
  const time = formatClock((state.endedAt ?? state.startedAt) - state.startedAt);
  const title = learned === size ? `Learned ${flags(size)} in ${time}` : `Learned ${learned} of ${flags(size)} in ${time}`;
  const worst = hardest(state);
  return (
    <CenterCard label="Learn summary" title={title} subtitle={`${region} · ${regionLearned} / ${regionTotal} learned on this browser`} onClose={onClose}>
      {worst.length > 0 && (
        <div className="learn-hardest">
          <div className="label">Hardest this round</div>
          <ul>
            {worst.map((id) => (
              <li key={id}>
                <img className="flag" src={flagSrc(id)} alt="" width={32} height={24} draggable={false} />
                <span>{nameOf(id)}</span>
                <span className="mute">
                  {state.misses[id]} miss{state.misses[id] === 1 ? '' : 'es'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="learn-actions">
        <button type="button" className="btn" onClick={onPlay}>
          Play Flags
        </button>
        <button type="button" className="btn primary" onClick={onAgain} autoFocus>
          Learn again
        </button>
      </div>
    </CenterCard>
  );
}
