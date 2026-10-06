import { COUNTRY } from '../data/lookup.ts';
import { groupOf } from '../game/progress.ts';

interface ReviewPanelProps {
  pool: readonly string[];
  missed: readonly string[];
  hovered: string | null;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
}

export function ReviewPanel({ pool, missed, hovered, onHover, onPick }: ReviewPanelProps) {
  const groups = new Map<string, string[]>();
  for (const id of [...missed].sort((a, b) => COUNTRY.get(a)!.name.localeCompare(COUNTRY.get(b)!.name))) {
    const g = groupOf(id, pool, COUNTRY);
    groups.set(g, [...(groups.get(g) ?? []), id]);
  }
  return (
    <aside className="review glass" aria-label="Missed countries">
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
                  {COUNTRY.get(id)!.name}
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
