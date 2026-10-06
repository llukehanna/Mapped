import { Icon } from './Icon.tsx';

interface PauseOverlayProps {
  /** true: ask "Give up?"; false: the plain pause card */
  confirming: boolean;
  onResume: () => void;
  /** pause card: open the give-up question */
  onAskGiveUp: () => void;
  /** give-up question: keep playing */
  onCancel: () => void;
  /** give-up question: end the game */
  onGiveUp: () => void;
}

/** The one central card for pausing and for confirming a give-up. The map behind it is blurred and the clock stopped. */
export function PauseOverlay({ confirming, onResume, onAskGiveUp, onCancel, onGiveUp }: PauseOverlayProps) {
  return (
    <div className="pause-overlay">
      {confirming ? (
        <div className="pause-card glass" role="alertdialog" aria-modal="true" aria-label="Give up?">
          <div className="pause-title">Give up?</div>
          <p className="mute">The game ends and the review shows what you missed.</p>
          <div className="pause-actions">
            <button type="button" className="btn" onClick={onCancel} autoFocus>
              Keep playing <kbd>Esc</kbd>
            </button>
            <button type="button" className="btn danger" onClick={onGiveUp}>
              <Icon name="flag" /> Give up
            </button>
          </div>
        </div>
      ) : (
        <div className="pause-card glass" role="dialog" aria-modal="true" aria-label="Paused">
          <div className="pause-title">Paused</div>
          <p className="mute">The map is hidden while the clock is stopped.</p>
          <div className="pause-actions">
            <button type="button" className="btn primary" onClick={onResume} autoFocus>
              <Icon name="play" /> Resume <kbd>Esc</kbd>
            </button>
            <button type="button" className="btn" onClick={onAskGiveUp}>
              <Icon name="flag" /> Give up
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
