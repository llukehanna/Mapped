import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import type { BoardResponse, BoardRow } from '../api/types.ts';
import { formatClock } from '../game/format.ts';
import { BOARD_MODES, BOARD_REGIONS, regionLabel, type Region } from '../game/ranking.ts';
import type { Topic } from '../game/topics.ts';
import type { Mode } from '../game/types.ts';
import { CenterCard } from './CenterCard.tsx';
import { MODES } from './SetupCard.tsx';
import { TopicTabs } from './TopicTabs.tsx';

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function Row({ row }: { row: BoardRow }) {
  return (
    <tr className={`${row.rank <= 3 ? 'top' : ''} ${row.you ? 'you' : ''}`}>
      <td className="rank mono">{row.rank}</td>
      <td className="who">
        {row.name}
        {row.you && <span className="mute"> (you)</span>}
      </td>
      <td className={`num mono ${row.found === row.total ? 'gold' : ''}`}>
        {row.found}/{row.total}
      </td>
      <td className={`num mono ${row.hints === 0 ? 'gold' : 'mute'}`}>{row.hints}</td>
      <td className="num mono">{formatClock(row.ms)}</td>
      <td className="num mute hide-sm">{day(row.finishedAt)}</td>
    </tr>
  );
}

interface LeaderboardProps {
  topic: Topic;
  mode: Mode;
  region: Region;
  onPick: (topic: Topic, mode: Mode, region: Region) => void;
  onClose: () => void;
}

export function Leaderboard({ topic, mode, region, onPick, onClose }: LeaderboardProps) {
  const [data, setData] = useState<BoardResponse | 'error' | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    api.board(topic, mode, region).then(
      (d) => live && setData(d),
      () => live && setData('error'),
    );
    return () => {
      live = false;
    };
  }, [topic, mode, region]);
  const pinned = data && data !== 'error' && data.you && !data.rows.some((r) => r.you) ? data.you : null;

  return (
    <CenterCard label="Leaderboards" title="Leaderboards" wide onClose={onClose}>
      <TopicTabs topic={topic} onPick={(t) => onPick(t, mode, region)} />
      <div className="seg board-modes" role="tablist" aria-label="Mode">
        {BOARD_MODES.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={m === mode} className={m === mode ? 'on' : ''} onClick={() => onPick(topic, m, region)}>
            {MODES.find((x) => x.id === m)!.label}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Region">
        {BOARD_REGIONS.map((r) => (
          <button key={r} type="button" className={`chip ${r === region ? 'on' : ''}`} aria-pressed={r === region} onClick={() => onPick(topic, mode, r)}>
            {regionLabel(r)}
          </button>
        ))}
      </div>
      <div className="board-body">
        {data === null && <p className="mute">Loading…</p>}
        {data === 'error' && <p className="mute">Couldn't load this board. Try again in a moment.</p>}
        {data && data !== 'error' && data.rows.length === 0 && <p className="mute">No runs yet. Be the first.</p>}
        {data && data !== 'error' && data.rows.length > 0 && (
          <table className="board-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th className="num">Found</th>
                <th className="num">Hints</th>
                <th className="num">Time</th>
                <th className="num hide-sm">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <Row key={row.rank} row={row} />
              ))}
              {pinned && (
                <>
                  <tr className="gap" aria-hidden="true">
                    <td colSpan={6}>···</td>
                  </tr>
                  <Row row={pinned} />
                </>
              )}
            </tbody>
          </table>
        )}
      </div>
      <div className="card-foot mute">
        <span>Most found, then fewest hints, then fastest.</span>
        {data && data !== 'error' && <span>{data.players} {data.players === 1 ? 'player' : 'players'}</span>}
      </div>
    </CenterCard>
  );
}
