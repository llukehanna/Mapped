import { Icon } from './Icon.tsx';

/** The gold trophy pill: "Ranked", "World · Type board", "#12". */
export function RankedTag({ text = 'Ranked' }: { text?: string }) {
  return (
    <span className="ranked">
      <Icon name="trophy" size={12} />
      {text}
    </span>
  );
}
