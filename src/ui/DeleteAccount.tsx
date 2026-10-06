import { useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import type { User } from '../api/types.ts';
import { CenterCard } from './CenterCard.tsx';

/** Like Give up: a deliberate confirm. You type your name (or email, before you have one). */
export function DeleteAccount({ user, onDeleted, onClose }: { user: User; onDeleted: () => void; onClose: () => void }) {
  const expected = user.name ?? user.email;
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    api.deleteAccount(typed).then(onDeleted, (err: Error) => {
      setBusy(false);
      setError(err.message);
    });
  };
  return (
    <CenterCard label="Delete account" title="Delete your account?" subtitle="Your games, bests and leaderboard places are removed for good." onClose={onClose}>
      <form className="name-form" onSubmit={submit}>
        <label className="label" htmlFor="confirm-delete">
          Type <b>{expected}</b> to confirm
        </label>
        <input id="confirm-delete" className="field" value={typed} autoFocus autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        {error && <div className="field-note bad">{error}</div>}
        <div className="pause-actions">
          <button type="button" className="btn" onClick={onClose}>
            Keep my account
          </button>
          <button type="submit" className="btn danger" disabled={busy || typed !== expected}>
            Delete account
          </button>
        </div>
      </form>
    </CenterCard>
  );
}
