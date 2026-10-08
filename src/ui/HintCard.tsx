interface HintCardProps {
  /** clues revealed so far, oldest first */
  clues: readonly string[];
  /** rungs on this mode's ladder */
  levels: number;
  /** type: a country is picked on the map, so the card shows even before its first clue */
  picked: boolean;
  /** the clues spell out the name, so set them in mono where blanks line up and can be counted */
  spelled: boolean;
  onHint: () => void;
}

/** The clues revealed for the country being asked about, stacked above the input. The newest is emphasized. */
export function HintCard({ clues, levels, picked, spelled, onHint }: HintCardProps) {
  if (!clues.length && !picked) return null;
  return (
    <section className="hint-card glass" aria-label="Hints">
      <div className="hint-head label">
        <span>Hint</span>
        <span className="mono">
          {clues.length}/{levels}
        </span>
      </div>
      {clues.length > 0 ? (
        <ol className={`hint-list${spelled ? ' spelled' : ''}`}>
          {clues.map((c, i) => (
            <li key={i} className={i === clues.length - 1 ? 'newest' : ''}>
              {c}
            </li>
          ))}
        </ol>
      ) : (
        <p className="hint-empty mute">The outlined country. Click another to switch.</p>
      )}
      {clues.length < levels && (
        <button type="button" className="hint-more mute" onClick={onHint}>
          {clues.length ? 'Another hint' : 'Get a hint'} <kbd>?</kbd>
        </button>
      )}
    </section>
  );
}
