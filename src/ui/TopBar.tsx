import { Icon } from './Icon.tsx';
import { RankedTag } from './RankedTag.tsx';

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

export function ThemeToggle({ theme, onToggle }: { theme: 'dark' | 'light'; onToggle: () => void }) {
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" className="iconbtn" onClick={onToggle} aria-label={label} title={label}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}

/** Opens the central "Give up?" dialog; it never ends the game by itself. */
export function GiveUpButton({ onGiveUp }: { onGiveUp: () => void }) {
  return (
    <button type="button" className="tb-btn" onClick={onGiveUp} title="Give up (Esc)">
      <Icon name="flag" />
      <span className="tb-label">Give up</span>
    </button>
  );
}

interface TopBarProps {
  pill: string;
  /** this run can go on a leaderboard */
  ranked: boolean;
  found: number;
  total: number;
  clock: string;
  clockLevel: '' | 'warn' | 'crit';
  theme: 'dark' | 'light';
  onTheme: () => void;
  onHint: () => void;
  onGiveUp: () => void;
  onMenu: () => void;
}

export function TopBar(p: TopBarProps) {
  return (
    <header className="topbar glass">
      <Wordmark />
      <span className="pill mono hide-sm">{p.pill}</span>
      {p.ranked && (
        <span className="hide-sm">
          <RankedTag />
        </span>
      )}
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
        <GiveUpButton onGiveUp={p.onGiveUp} />
        <ThemeToggle theme={p.theme} onToggle={p.onTheme} />
      </div>
      <button type="button" className="tb-btn show-sm" onClick={p.onMenu} aria-label="Menu">
        <Icon name="menu" />
      </button>
    </header>
  );
}
