import { useEffect, useRef, useState } from 'react';
import type { User } from '../api/types.ts';
import { maskEmail } from './accountText.ts';
import { Icon } from './Icon.tsx';

interface UserMenuProps {
  user: User;
  onGames: () => void;
  onBoards: () => void;
  onPickName: () => void;
  onSignOut: () => void;
  onDelete: () => void;
}

/** The name chip and its menu. */
export function UserMenu({ user, onGames, onBoards, onPickName, onSignOut, onDelete }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="namechip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden="true">
          {(user.name ?? user.email)[0].toUpperCase()}
        </span>
        <span className="namechip-name">{user.name ?? 'Pick a name'}</span>
        <Icon name="down" size={14} />
      </button>
      {open && (
        <div className="menu glass" role="menu">
          <div className="menu-who mute">Signed in as {maskEmail(user.email)}</div>
          {user.name === null && (
            <button type="button" role="menuitem" onClick={pick(onPickName)}>
              Pick a name
            </button>
          )}
          <button type="button" role="menuitem" onClick={pick(onGames)}>
            Your games
          </button>
          <button type="button" role="menuitem" onClick={pick(onBoards)}>
            Leaderboards
          </button>
          <hr />
          <button type="button" role="menuitem" onClick={pick(onSignOut)}>
            Sign out
          </button>
          <button type="button" role="menuitem" className="danger" onClick={pick(onDelete)}>
            Delete account…
          </button>
        </div>
      )}
    </div>
  );
}
