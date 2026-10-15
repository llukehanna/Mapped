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

/** `label` goes before the count ("Learned 12 / 45"); without one it reads as found. */
export function Score({ found, total, label }: { found: number; total: number; label?: string }) {
  return (
    <div className="score mono" aria-label={label ? `${label} ${found} of ${total}` : `${found} of ${total} found`}>
      {label && <span className="score-label">{label} </span>}
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

/** Ends a Learn round straight away (progress is already saved). */
export function StopButton({ onStop }: { onStop: () => void }) {
  return (
    <button type="button" className="tb-btn" onClick={onStop} title="Stop (Esc)">
      <Icon name="stop" />
      <span className="tb-label">Stop</span>
    </button>
  );
}

type TopBarProps = {
  pill: string;
  /** this run can go on a leaderboard */
  ranked: boolean;
  found: number;
  total: number;
  /** before the count, e.g. "Learned" */
  scoreLabel?: string;
  clock: string;
  clockLevel: '' | 'warn' | 'crit';
  theme: 'dark' | 'light';
  onTheme: () => void;
} & (
  | { onHint: () => void; onGiveUp: () => void; onMenu: () => void; onStop?: undefined }
  /** Flags · Learn: Stop and the theme, on phones too; no hint, no menu */
  | { onStop: () => void; onHint?: undefined; onGiveUp?: undefined; onMenu?: undefined }
);

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
      <Score found={p.found} total={p.total} label={p.scoreLabel} />
      <div className="tb-divider" />
      <div className={`clock mono ${p.clockLevel}`} role="timer" aria-live="off">
        {p.clock}
      </div>
      <div className="tb-spacer" />
      {p.onStop ? (
        <div className="tb-actions">
          <StopButton onStop={p.onStop} />
          <ThemeToggle theme={p.theme} onToggle={p.onTheme} />
        </div>
      ) : (
        <>
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
        </>
      )}
    </header>
  );
}
