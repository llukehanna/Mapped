import { capitalOf } from '../data/capitals.ts';
import { flagSrc } from '../data/flags.ts';
import { COUNTRY } from '../data/lookup.ts';
import { groupOf } from '../game/progress.ts';
import type { Topic } from '../game/topics.ts';

interface ReviewPanelProps {
  topic: Topic;
  pool: readonly string[];
  missed: readonly string[];
  hovered: string | null;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
}

const MISSED_LABEL: Record<Topic, string> = { countries: 'Missed countries', flags: 'Missed flags', capitals: 'Missed capitals' };

export function ReviewPanel({ topic, pool, missed, hovered, onHover, onPick }: ReviewPanelProps) {
  const groups = new Map<string, string[]>();
  const label = (id: string) => (topic === 'capitals' ? `${capitalOf(id)} · ${COUNTRY.get(id)!.name}` : COUNTRY.get(id)!.name);
  for (const id of [...missed].sort((a, b) => label(a).localeCompare(label(b)))) {
    const g = groupOf(id, pool, COUNTRY);
    groups.set(g, [...(groups.get(g) ?? []), id]);
  }
  return (
    <aside className="review glass" aria-label={MISSED_LABEL[topic]}>
      <div className="label">Missed · {missed.length}</div>
      {missed.length === 0 ? (
        <p className="review-perfect">Every one. Nothing missed.</p>
      ) : (
        <div className="review-list">
          {[...groups].map(([group, ids]) => (
            <div key={group} className="review-group">
              <div className="label review-group-label">
                {group} · {ids.length}
              </div>
              {ids.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`review-item ${hovered === id ? 'on' : ''}`}
                  onPointerEnter={() => onHover(id)}
                  onPointerLeave={() => onHover(null)}
                  onFocus={() => onHover(id)}
                  onBlur={() => onHover(null)}
                  onClick={() => onPick(id)}
                >
                  {topic === 'flags' && <img className="flag review-flag" src={flagSrc(id)} alt="" draggable={false} />}
                  {label(id)}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
      <div className="review-legend mute">
        <span><i className="sw found" /> Found</span>
        <span><i className="sw missed" /> Missed</span>
      </div>
    </aside>
  );
}
