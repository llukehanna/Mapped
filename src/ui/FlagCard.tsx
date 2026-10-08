import { flagSrc } from '../data/flags.ts';

/** Flags · Type: the flag to name, large, above the input. The alt text never names the country. */
export function FlagCard({ id }: { id: string }) {
  return (
    <div className="flag-card glass">
      <img className="flag" src={flagSrc(id)} alt="The flag to name" width={240} height={180} draggable={false} />
    </div>
  );
}
