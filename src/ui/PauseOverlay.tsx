import { GiveUpButton } from './TopBar.tsx';
import { Icon } from './Icon.tsx';

export function PauseOverlay({ onResume, onGiveUp }: { onResume: () => void; onGiveUp: () => void }) {
  return (
    <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="pause-card glass">
        <div className="pause-title">Paused</div>
        <p className="mute">The map is hidden while the clock is stopped.</p>
        <div className="pause-actions">
          <button type="button" className="btn primary" onClick={onResume} autoFocus>
            <Icon name="play" /> Resume <kbd>Esc</kbd>
          </button>
          <GiveUpButton onGiveUp={onGiveUp} />
        </div>
      </div>
    </div>
  );
}
