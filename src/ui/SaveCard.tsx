import { useState } from 'react';
import type { SaveState } from '../api/resume.ts';
import type { Board } from '../game/ranking.ts';
import { saveMessage } from './accountText.ts';

interface SaveCardProps {
  save: SaveState;
  signedIn: boolean;
  onSignIn: () => void;
  onRetry: () => void;
  onBoard: (board: Board) => void;
}

/** Bottom centre of the review screen: what happened to this game on the server. */
export function SaveCard({ save, signedIn, onSignIn, onRetry, onBoard }: SaveCardProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const m = saveMessage(save, signedIn);
  return (
    <div className={`savecard glass ${m.tone}`} role="status">
      <div className="savecard-text">
        <b>{m.title}</b>
        {m.detail && <span>{m.detail}</span>}
      </div>
      {m.board && !m.signIn && (
        <button type="button" className="btn" onClick={() => onBoard(m.board!)}>
          Leaderboard
        </button>
      )}
      {m.retry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
      {m.signIn && (
        <>
          <button type="button" className="btn ghost" onClick={() => setDismissed(true)}>
            Not now
          </button>
          <button type="button" className="btn primary" onClick={onSignIn}>
            Sign in
          </button>
        </>
      )}
    </div>
  );
}
