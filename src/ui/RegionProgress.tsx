import { useState } from 'react';
import type { ProgressRow } from '../game/progress.ts';

/** `initialOpen`: Seas starts it closed, as the open panel would sit over the Antarctic seas. */
export function RegionProgress({ rows, initialOpen = true }: { rows: readonly ProgressRow[]; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const found = rows.reduce((n, r) => n + r.found, 0);
  const total = rows.reduce((n, r) => n + r.total, 0);
  if (rows.length < 2) return null;
  return (
    <section className={`progress glass ${open ? '' : 'closed'}`}>
      <button type="button" className="progress-head label" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>By region</span>
        {!open && (
          <span className="mono">
            {found}/{total}
          </span>
        )}
      </button>
      {open && (
        <div className="bars">
          {rows.map((r) => (
            <div key={r.label} className={`bar ${r.found === r.total ? 'done' : ''}`}>
              <span>{r.label}</span>
              <span className="track">
                <i style={{ width: `${(r.found / r.total) * 100}%` }} />
              </span>
              <span className="mono n">
                {r.found}/{r.total}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
