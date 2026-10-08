import { useEffect, useState, type Ref } from 'react';

interface GuessInputProps {
  ref?: Ref<HTMLInputElement>;
  value: string;
  placeholder: string;
  /** the input's accessible name: "Country name", or "Capital" in Capitals games */
  label?: string;
  /** shown at the right of the field, e.g. the current hint */
  aside?: string | null;
  /** increments on a rejected guess */
  shakeSeq: number;
  /** one-at-a-time games: the current target country (for tests and tooling) */
  targetId?: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function GuessInput({ ref, value, placeholder, label = 'Country name', aside, shakeSeq, targetId, onChange, onSubmit }: GuessInputProps) {
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
        aria-label={label}
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
