import { useEffect, useState } from 'react';
import { api, type ApiError } from '../api/client.ts';
import type { MyGamesResponse, User } from '../api/types.ts';
import { formatClock } from '../game/format.ts';
import { BOARD_MODES, BOARD_REGIONS, regionLabel, type Board } from '../game/ranking.ts';
import { scopeFromKey, scopeLabel } from '../game/scope.ts';
import { hintsText, REASON_TEXT } from './accountText.ts';
import { CenterCard } from './CenterCard.tsx';
import { RankedTag } from './RankedTag.tsx';
import { MODES } from './SetupCard.tsx';

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const modeLabel = (id: string) => MODES.find((m) => m.id === id)!.label;

export function YourGames({ user, onBoard, onClose, onSignedOut }: { user: User; onBoard: (board: Board) => void; onClose: () => void; onSignedOut: () => void }) {
  const [data, setData] = useState<MyGamesResponse | 'error' | null>(null);
  useEffect(() => {
    api.myGames().then(setData, (e: ApiError) => {
      if (e.status === 401) onSignedOut();
      else setData('error');
    });
  }, []);
  const bests = new Map(data && data !== 'error' ? data.bests.map((b) => [b.board, b]) : []);

  return (
    <CenterCard label="Your games" title="Your games" subtitle={user.name ?? 'No name yet: pick one to appear on the boards.'} wide onClose={onClose}>
      {data === null && <p className="mute">Loading…</p>}
      {data === 'error' && <p className="mute">Couldn't load your games. Try again in a moment.</p>}
      {data && data !== 'error' && (
        <>
          <div>
            <div className="label">Your bests</div>
            <div className="bests-grid">
              <span />
              {BOARD_MODES.map((m) => (
                <span key={m} className="label">
                  {modeLabel(m)}
                </span>
              ))}
              {BOARD_REGIONS.map((r) => (
                <div key={r} className="bests-row">
                  <span className="mute">{regionLabel(r)}</span>
                  {BOARD_MODES.map((m) => {
                    const board: Board = `${m}:${r}`;
                    const b = bests.get(board);
                    return b ? (
                      <button key={m} type="button" className="best-cell" onClick={() => onBoard(board)}>
                        <span>
                          <b className="mono">{formatClock(b.ms)}</b> <span className="mute">· {hintsText(b.hints)}</span>
                        </span>
                        {b.rank && <span className="gold mono">#{b.rank}</span>}
                      </button>
                    ) : (
                      <span key={m} className="best-cell none" aria-label="No run yet">
                        ·
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="label">Recent</div>
            {data.recent.length === 0 ? (
              <p className="mute">No saved games yet.</p>
            ) : (
              <ul className="recent">
                {data.recent.map((g) => (
                  <li key={g.id}>
                    <span className="mute">{day(g.finishedAt)}</span>
                    <span>
                      {scopeLabel(scopeFromKey(g.scopeKey))} · {modeLabel(g.mode)}
                    </span>
                    <span className="mono">
                      {g.found}/{g.total}
                    </span>
                    <span className="mono">{formatClock(g.ms)}</span>
                    <span className="mute hide-sm">{hintsText(g.hints)}</span>
                    <span>{g.ranked ? <RankedTag text={g.isBest ? 'Best' : 'Ranked'} /> : <span className="unranked">Unranked: {REASON_TEXT[g.reason!]}</span>}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </CenterCard>
  );
}
