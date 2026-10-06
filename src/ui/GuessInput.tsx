import { useEffect, useState, type Ref } from 'react';

interface GuessInputProps {
  ref?: Ref<HTMLInputElement>;
  value: string;
  placeholder: string;
  /** shown at the right of the field, e.g. the current hint */
  aside?: string | null;
  /** increments on a rejected guess */
  shakeSeq: number;
  /** identify mode: the country being asked about (for tests and tooling) */
  targetId?: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function GuessInput({ ref, value, placeholder, aside, shakeSeq, targetId, onChange, onSubmit }: GuessInputProps) {
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (!shakeSeq) return;
    setShaking(true);
    const id = window.setTimeout(() => setShaking(false), 380);
    return () => window.clearTimeout(id);
  }, [shakeSeq]);
  return (
    <form
      className={`guess glass ${shaking ? 'shake' : ''}`}
      data-target-id={targetId ?? undefined}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input
        ref={ref}
        className="guess-input"
        aria-label="Country name"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="done"
      />
      {aside && <span className="guess-aside mono">{aside}</span>}
    </form>
  );
}
