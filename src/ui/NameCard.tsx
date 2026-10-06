import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import { cleanName, NAME_RULE } from '../api/names.ts';
import type { User } from '../api/types.ts';
import { CenterCard } from './CenterCard.tsx';

type Check = { ok: boolean; text: string } | null;

/** Picks the display name, once, right after the first sign-in. */
export function NameCard({ onDone, onClose }: { onDone: (user: User) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [check, setCheck] = useState<Check>(null);
  const [busy, setBusy] = useState(false);

  // Live check, 300 ms after typing stops. Stale answers are ignored.
  useEffect(() => {
    if (!name.trim()) return setCheck(null);
    const clean = cleanName(name);
    if (!clean) return setCheck({ ok: false, text: NAME_RULE });
    let live = true;
    const id = window.setTimeout(() => {
      api.checkName(clean).then(
        (r) => live && setCheck(r.available ? { ok: true, text: 'Available' } : { ok: false, text: r.reason === 'taken' ? 'That name is taken.' : NAME_RULE }),
        () => live && setCheck(null),
      );
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [name]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean || busy) return;
    setBusy(true);
    api.setName(clean).then(
      (r) => onDone(r.user),
      (err: Error) => {
        setBusy(false);
        setCheck({ ok: false, text: err.message });
      },
    );
  };

  return (
    <CenterCard label="Pick a name" title="Pick a name" subtitle="This is what the leaderboards show. Your email never appears." onClose={onClose}>
      <form className="name-form" onSubmit={submit}>
        <label className="label" htmlFor="display-name">
          Display name
        </label>
        <input
          id="display-name"
          className="field"
          value={name}
          maxLength={20}
          autoComplete="nickname"
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <div className={`field-note ${check?.ok ? 'ok' : check ? 'bad' : ''}`} aria-live="polite">
          {check ? (check.ok ? `✓ ${check.text}` : check.text) : NAME_RULE}
        </div>
        <button type="submit" className="btn primary wide-btn" disabled={busy || !cleanName(name)}>
          {busy ? 'Saving…' : 'Done'}
        </button>
      </form>
      <div className="card-foot">
        <span className="mute">You can play without one; you just won't show on boards.</span>
        <button type="button" className="link-btn" onClick={onClose}>
          Not now
        </button>
      </div>
    </CenterCard>
  );
}
