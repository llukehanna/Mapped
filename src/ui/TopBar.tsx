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

/** Flags · Learn: three small labelled stats (learned, right, wrong) in place of score and clock. Learn is untimed. */
export function LearnStats({ learned, total, percentRight, wrong }: { learned: number; total: number; percentRight: number | null; wrong: number }) {
  return (
    <div className="learn-stats" role="group" aria-label={`${learned} of ${total} learned, ${percentRight === null ? 'no answers yet' : `${percentRight}% right`}, ${wrong} wrong`}>
      <div className="stat" aria-hidden="true">
        <span className="stat-key">Learned</span>
        <span className="stat-val mono">
          <b>{learned}</b>
          <span className="mute"> / {total}</span>
        </span>
      </div>
      <i className="tb-divider" aria-hidden="true" />
      <div className="stat" aria-hidden="true">
        <span className="stat-key">Right</span>
        <span className="stat-val mono">{percentRight === null ? '—' : `${percentRight}%`}</span>
      </div>
      <i className="tb-divider" aria-hidden="true" />
      <div className="stat" aria-hidden="true">
        <span className="stat-key">Wrong</span>
        <span className={`stat-val mono ${wrong > 0 ? 'bad' : ''}`}>{wrong}</span>
      </div>
    </div>
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
    <button type="button" className="tb-btn stop-btn" onClick={onStop} title="Stop (Esc)" aria-label="Stop">
      <Icon name="stop" />
      <span className="tb-label">Stop</span>
    </button>
  );
}

type TopBarProps = {
  pill: string;
  /** this run can go on a leaderboard */
  ranked: boolean;
  theme: 'dark' | 'light';
  onTheme: () => void;
} & (
  | {
      found: number;
      total: number;
      clock: string;
      clockLevel: '' | 'warn' | 'crit';
      onHint: () => void;
      onGiveUp: () => void;
      onMenu: () => void;
      learn?: undefined;
      onStop?: undefined;
    }
  /** Flags · Learn: its stats instead of score and clock; Stop and the theme, on phones too; no hint, no menu */
  | { learn: Parameters<typeof LearnStats>[0]; onStop: () => void; onHint?: undefined; onGiveUp?: undefined; onMenu?: undefined }
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
      {p.learn ? (
        <LearnStats {...p.learn} />
      ) : (
        <>
          <Score found={p.found} total={p.total} />
          <div className="tb-divider" />
          <div className={`clock mono ${p.clockLevel}`} role="timer" aria-live="off">
            {p.clock}
          </div>
        </>
      )}
      <div className="tb-spacer" />
      {p.onStop ? (
        <div className="tb-actions learn-actions">
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
