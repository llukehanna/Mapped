import { Icon } from './Icon.tsx';

interface GiveUpDialogProps {
  /** keep playing */
  onCancel: () => void;
  /** end the game */
  onGiveUp: () => void;
}

/** The one central "Give up?" question. There is no pause: the clock keeps running while it's open. */
export function GiveUpDialog({ onCancel, onGiveUp }: GiveUpDialogProps) {
  return (
    <div className="pause-overlay">
      <div className="pause-card glass" role="alertdialog" aria-modal="true" aria-label="Give up?">
        <div className="pause-title">Give up?</div>
        <p className="mute">The game ends and the review shows what you missed. The clock is still running.</p>
        <div className="pause-actions">
          <button type="button" className="btn" onClick={onCancel} autoFocus>
            Keep playing <kbd>Esc</kbd>
          </button>
          <button type="button" className="btn danger" onClick={onGiveUp}>
            <Icon name="flag" /> Give up
          </button>
        </div>
      </div>
    </div>
  );
}
