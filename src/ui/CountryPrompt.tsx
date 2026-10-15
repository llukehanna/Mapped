interface CountryPromptProps {
  targetId: string;
  /** the named, lit-up country */
  name: string;
}

/** Capitals · Type: names the country whose capital to type, above the input. */
export function CountryPrompt({ targetId, name }: CountryPromptProps) {
  return (
    <div className="country-prompt glass" data-target-id={targetId}>
      <span className="mute">Capital of</span>{' '}
      <b className="prompt-name">{name}</b>
    </div>
  );
}
