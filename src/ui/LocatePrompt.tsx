import { TRIES_PER_TARGET } from '../game/reducer.ts';
import { Icon } from './Icon.tsx';

interface LocatePromptProps {
  targetId: string;
  name: string;
  triesLeft: number;
  onSkip: () => void;
}

export function LocatePrompt({ targetId, name, triesLeft, onSkip }: LocatePromptProps) {
  return (
    <div className="prompt glass" data-target-id={targetId}>
      <span className="mute">Find</span>
      <b className="prompt-name">{name}</b>
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
