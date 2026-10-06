import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';

interface CenterCardProps {
  label: string;
  title: string;
  subtitle?: ReactNode;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** A centred card over a dimmed map (a bottom sheet on phones). Esc or a click outside closes it. */
export function CenterCard({ label, title, subtitle, wide = false, onClose, children }: CenterCardProps) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="veil" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`center-card glass ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="card-head">
          <div>
            <h2 className="card-title">{title}</h2>
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
