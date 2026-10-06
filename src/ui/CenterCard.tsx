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
  const section = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  useEffect(() => {
    if (section.current && !section.current.contains(document.activeElement)) {
      section.current.focus();
    }
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    return () => {
      const currentFocus = document.activeElement as HTMLElement | null;
      const isBodyOrInsideCard = currentFocus === document.body || (section.current && section.current.contains(currentFocus));
      if (opener.current && document.contains(opener.current) && isBodyOrInsideCard) {
        opener.current.focus();
      }
    };
  }, []);
  return (
    <div className="veil" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section ref={section} className={`center-card glass ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
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
