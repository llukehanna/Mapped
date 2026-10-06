interface HintCardProps {
  /** clues revealed so far, oldest first */
  clues: readonly string[];
  /** rungs on this mode's ladder */
  levels: number;
}

/** The clues revealed for the hinted country, stacked above the input. The newest is emphasized. */
export function HintCard({ clues, levels }: HintCardProps) {
  if (!clues.length) return null;
  return (
    <section className="hint-card glass" aria-label="Hints">
      <div className="hint-head label">
        <span>Hint</span>
        <span className="mono">
          {clues.length}/{levels}
        </span>
      </div>
      <ol className="hint-list">
        {clues.map((c, i) => (
          <li key={i} className={i === clues.length - 1 ? 'newest' : ''}>
            {c}
          </li>
        ))}
      </ol>
      {clues.length < levels && (
        <div className="hint-more mute">
          Press <kbd>?</kbd> for another clue
        </div>
      )}
    </section>
  );
}
