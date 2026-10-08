import type { SaveState } from '../api/resume.ts';
import type { UnrankedReason } from '../api/types.ts';
import { formatClock } from '../game/format.ts';
import { boardLabel, type Board } from '../game/ranking.ts';

export const hintsText = (n: number) => `${n} hint${n === 1 ? '' : 's'}`;

/** "0 hints · 14:07", or "139/197 · 31 hints · 22:46" when not everything was found. */
export const runText = (r: { found: number; total: number; hints: number; ms: number }) =>
  `${r.found < r.total ? `${r.found}/${r.total} · ` : ''}${hintsText(r.hints)} · ${formatClock(r.ms)}`;

export const REASON_TEXT: Record<UnrankedReason, string> = {
  custom: 'custom regions',
  incomplete: 'nothing found',
  paused: 'paused',
  unverified: "couldn't verify",
  anonymous: 'not signed in',
  imported: 'played before accounts',
};

/** "m•••@gmail.com" */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  return at < 1 ? email : `${email[0]}•••${email.slice(at)}`;
}

export interface SaveMessage {
  tone: 'gold' | 'plain' | 'warn';
  title: string;
  detail: string | null;
  /** show Sign in */
  signIn: boolean;
  /** show Retry */
  retry: boolean;
  /** the board to link to */
  board: Board | null;
}

const msg = (tone: SaveMessage['tone'], title: string, detail: string | null = null, extra: Partial<SaveMessage> = {}): SaveMessage => ({
  tone,
  title,
  detail,
  signIn: false,
  retry: false,
  board: null,
  ...extra,
});

/** What the save card says after a game. */
export function saveMessage(save: SaveState, signedIn: boolean): SaveMessage {
  if (save.status === 'offline') return msg('plain', 'Offline', "This game wasn't saved.");
  if (save.status === 'saving') return msg('plain', 'Saving…');
  if (save.status === 'error') return msg('warn', "Couldn't save this game.", null, { retry: true });
  if (save.status === 'unverified') return msg('plain', 'Not saved', "This game couldn't be verified.");
  const r = save.result;
  const label = r.board && boardLabel(r.board);
  if (r.reason === 'anonymous') {
    const detail = r.wouldRank === null || !label ? `${runText(r)}. Sign in to put it on the leaderboard.` : `${runText(r)} would put you #${r.wouldRank} on ${label}.`;
    return msg('gold', 'Sign in to save this run', detail, { signIn: true, board: r.board });
  }
  if (!r.ranked && !signedIn) return msg('plain', 'Sign in to keep your games', `Unranked: ${REASON_TEXT[r.reason!]}.`, { signIn: true });
  if (!r.ranked) return msg('plain', 'Saved', `Unranked: ${REASON_TEXT[r.reason!]}.`);
  if (r.newBest) {
    return r.best?.rank
      ? msg('gold', `Saved · #${r.best.rank} on ${label}`, 'New personal best.', { board: r.board })
      : msg('gold', 'Saved · new personal best', 'Pick a name to appear on the leaderboard.');
  }
  const b = r.best!;
  const rank = b.rank ? ` (#${b.rank})` : '';
  return msg('plain', 'Saved', `Your best on ${label} stays ${runText(b)}${rank}.`, { board: r.board });
}
