import { useEffect, useState } from 'react';
import { api, type ApiError } from '../api/client.ts';
import type { MyGamesResponse, User } from '../api/types.ts';
import { formatClock } from '../game/format.ts';
import { BOARD_MODES, BOARD_REGIONS, boardKey, regionLabel, type Board } from '../game/ranking.ts';
import { scopeFromKey, scopeLabel } from '../game/scope.ts';
import { TOPIC_LABEL, type Topic } from '../game/topics.ts';
import { hintsText, REASON_TEXT } from './accountText.ts';
import { CenterCard } from './CenterCard.tsx';
import { RankedTag } from './RankedTag.tsx';
import { MODES } from './SetupCard.tsx';
import { TopicTabs } from './TopicTabs.tsx';

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const modeLabel = (id: string) => MODES.find((m) => m.id === id)!.label;

export function YourGames({ user, onBoard, onClose, onSignedOut }: { user: User; onBoard: (board: Board) => void; onClose: () => void; onSignedOut: () => void }) {
  const [data, setData] = useState<MyGamesResponse | 'error' | null>(null);
  const [topic, setTopic] = useState<Topic>('countries');
  useEffect(() => {
    api.myGames().then(setData, (e: ApiError) => {
      if (e.status === 401) onSignedOut();
      else setData('error');
    });
  }, []);
  const ok = data && data !== 'error' ? data : null;
  const ranks = new Map(ok ? ok.bests.map((b) => [b.board, b.rank]) : []);
  const personal = new Map(ok ? ok.personal.map((p) => [p.board, p]) : []);

  return (
    <CenterCard label="Your games" title="Your games" subtitle={user.name ?? 'No name yet: pick one to appear on the boards.'} wide onClose={onClose}>
      {data === null && <p className="mute">Loading…</p>}
      {data === 'error' && <p className="mute">Couldn't load your games. Try again in a moment.</p>}
      {data && data !== 'error' && (
        <>
          <div>
            <div className="label">Your bests</div>
            <TopicTabs topic={topic} onPick={setTopic} />
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
                    const board = boardKey(topic, m, r);
                    const b = personal.get(board);
                    const rank = b?.ranked ? ranks.get(board) : null;
                    return b ? (
                      <button key={m} type="button" className="best-cell" onClick={() => onBoard(board)}>
                        <span>
                          <b className="mono">{b.found === b.total ? formatClock(b.ms) : `${b.found}/${b.total}`}</b> <span className="mute">· {hintsText(b.hints)}</span>
                        </span>
                        {rank && <span className="gold mono">#{rank}</span>}
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
                      {[scopeLabel(scopeFromKey(g.scopeKey)), ...(g.topic === 'countries' ? [] : [TOPIC_LABEL[g.topic]]), modeLabel(g.mode)].join(' · ')}
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
