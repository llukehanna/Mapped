import { useEffect, useState } from 'react';
import { Icon } from './Icon.tsx';

export function Wordmark() {
  return (
    <div className="wordmark">
      <i aria-hidden="true" />
      Mapped
    </div>
  );
}

export function Score({ found, total }: { found: number; total: number }) {
  return (
    <div className="score mono" aria-label={`${found} of ${total} found`}>
      <b>{found}</b>
      <span className="mute"> / {total}</span>
    </div>
  );
}

/** "Give up" asks once more before ending the game. */
export function GiveUpButton({ onGiveUp }: { onGiveUp: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(id);
  }, [armed]);
  return (
    <button type="button" className={`tb-btn ${armed ? 'danger' : ''}`} onClick={() => (armed ? onGiveUp() : setArmed(true))}>
      <Icon name="flag" />
      <span className="tb-label">{armed ? 'Sure?' : 'Give up'}</span>
    </button>
  );
}

interface TopBarProps {
  pill: string;
  found: number;
  total: number;
  clock: string;
  clockLevel: '' | 'warn' | 'crit';
  paused: boolean;
  onHint: () => void;
  onPause: () => void;
  onGiveUp: () => void;
  onMenu: () => void;
}

export function TopBar(p: TopBarProps) {
  return (
    <header className="topbar glass">
      <Wordmark />
      <span className="pill mono hide-sm">{p.pill}</span>
      <div className="tb-spacer" />
      <Score found={p.found} total={p.total} />
      <div className="tb-divider" />
      <div className={`clock mono ${p.clockLevel}`} role="timer" aria-live="off">
        {p.clock}
      </div>
      <div className="tb-spacer" />
      <div className="hide-sm tb-actions">
        <button type="button" className="tb-btn" onClick={p.onHint} title="Hint (?)">
          <Icon name="hint" />
          <span className="tb-label">Hint</span>
          <kbd>?</kbd>
        </button>
        <button type="button" className="tb-btn" onClick={p.onPause} title="Pause (Esc)">
          <Icon name={p.paused ? 'play' : 'pause'} />
          <span className="tb-label">{p.paused ? 'Resume' : 'Pause'}</span>
          <kbd>Esc</kbd>
        </button>
        <GiveUpButton onGiveUp={p.onGiveUp} />
      </div>
      <button type="button" className="tb-btn show-sm" onClick={p.onMenu} aria-label="Menu">
        <Icon name="menu" />
      </button>
    </header>
  );
}
