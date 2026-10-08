import { flagSrc } from '../data/flags.ts';
import { TRIES_PER_TARGET } from '../game/reducer.ts';
import { Icon } from './Icon.tsx';

interface LocatePromptProps {
  targetId: string;
  /** "Find", or "Whose capital is" */
  label: string;
  name: string;
  /** Flags · Locate: show this country's flag instead of the name */
  flagId?: string;
  triesLeft: number;
  onSkip: () => void;
}

export function LocatePrompt({ targetId, label, name, flagId, triesLeft, onSkip }: LocatePromptProps) {
  return (
    <div className="prompt glass" data-target-id={targetId}>
      <span className="mute">{label}</span>
      {flagId ? (
        <span className="prompt-name">
          <img className="flag prompt-flag" src={flagSrc(flagId)} alt="this flag's country" width={64} height={48} draggable={false} />
        </span>
      ) : (
        <b className="prompt-name">{name}</b>
      )}
      <span className="tries" aria-label={`${triesLeft} tries left`}>
        {Array.from({ length: TRIES_PER_TARGET }, (_, i) => (
          <i key={i} className={i < triesLeft ? 'on' : ''} />
        ))}
      </span>
      <button type="button" className="tb-btn" onClick={onSkip} title="Skip (S)">
        <Icon name="skip" />
        <span className="tb-label">Skip</span>
        <kbd>S</kbd>
      </button>
    </div>
  );
}
