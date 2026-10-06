import { Icon } from './Icon.tsx';

export function ZoomControls({ onIn, onOut, onFit }: { onIn: () => void; onOut: () => void; onFit: () => void }) {
  return (
    <div className="zoom glass" role="group" aria-label="Zoom">
      <button type="button" onClick={onIn} aria-label="Zoom in" title="Zoom in (+)">
        <Icon name="plus" />
      </button>
      <button type="button" onClick={onOut} aria-label="Zoom out" title="Zoom out (−)">
        <Icon name="minus" />
      </button>
      <button type="button" onClick={onFit} aria-label="Fit selection" title="Fit (0)">
        <Icon name="fit" />
      </button>
    </div>
  );
}
