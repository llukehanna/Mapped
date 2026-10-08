import { describe, expect, it } from 'vitest';
import type { GameResult } from '../../src/api/types.ts';
import { maskEmail, saveMessage } from '../../src/ui/accountText.ts';

const result = (over: Partial<GameResult> = {}): GameResult => ({
  id: 'g',
  board: 'type:world',
  found: 197,
  total: 197,
  hints: 0,
  ms: 847_000,
  endReason: 'complete',
  ranked: true,
  reason: null,
  newBest: false,
  best: null,
  wouldRank: null,
  ...over,
});
const saved = (over: Partial<GameResult> = {}) => ({ status: 'saved' as const, result: result(over) });

describe('save card text', () => {
  it('signed out, rankable: invites you to sign in with the rank you would get', () => {
    expect(saveMessage(saved({ ranked: false, reason: 'anonymous', wouldRank: 12 }), false)).toMatchObject({
      tone: 'gold',
      title: 'Sign in to save this run',
      detail: '0 hints · 14:07 would put you #12 on World · Type.',
      signIn: true,
    });
  });

  it('signed out, anonymous, no rank: fallback message without ranking', () => {
    expect(saveMessage(saved({ ranked: false, reason: 'anonymous', wouldRank: null }), false)).toMatchObject({
      tone: 'gold',
      title: 'Sign in to save this run',
      detail: '0 hints · 14:07. Sign in to put it on the leaderboard.',
      signIn: true,
    });
  });

  it('signed out, not rankable: still offers to keep it', () => {
    expect(saveMessage(saved({ ranked: false, reason: 'custom', board: null }), false)).toMatchObject({
      title: 'Sign in to keep your games',
      detail: 'Unranked: custom regions.',
      signIn: true,
    });
  });

  it('a new best, with and without a name', () => {
    expect(saveMessage(saved({ newBest: true, best: { found: 197, total: 197, hints: 0, ms: 847_000, rank: 12 } }), true)).toMatchObject({
      tone: 'gold',
      title: 'Saved · #12 on World · Type',
      detail: 'New personal best.',
      board: 'type:world',
    });
    expect(saveMessage(saved({ newBest: true, best: { found: 197, total: 197, hints: 0, ms: 847_000, rank: null } }), true).detail).toBe(
      'Pick a name to appear on the leaderboard.',
    );
  });

  it('an unfinished run says how many it found', () => {
    expect(saveMessage(saved({ found: 139, hints: 31, ms: 1_366_000, ranked: false, reason: 'anonymous', wouldRank: 3 }), false).detail).toBe(
      '139/197 · 31 hints · 22:46 would put you #3 on World · Type.',
    );
    expect(saveMessage(saved({ found: 50, best: { found: 139, total: 197, hints: 31, ms: 1_366_000, rank: 2 } }), true).detail).toBe(
      'Your best on World · Type stays 139/197 · 31 hints · 22:46 (#2).',
    );
  });

  it('ranked but not a best', () => {
    expect(saveMessage(saved({ best: { found: 197, total: 197, hints: 1, ms: 832_000, rank: 9 } }), true).detail).toBe('Your best on World · Type stays 1 hint · 13:52 (#9).');
  });

  it('unranked, signed in', () => {
    expect(saveMessage(saved({ ranked: false, reason: 'paused' }), true)).toMatchObject({ title: 'Saved', detail: 'Unranked: paused.', signIn: false });
  });

  it('offline, saving, failed, unverified', () => {
    expect(saveMessage({ status: 'offline' }, false).detail).toBe("This game wasn't saved.");
    expect(saveMessage({ status: 'saving' }, true).title).toBe('Saving…');
    expect(saveMessage({ status: 'error' }, true)).toMatchObject({ tone: 'warn', retry: true });
    expect(saveMessage({ status: 'unverified' }, true).detail).toBe("This game couldn't be verified.");
  });
});

it('masks emails for the user menu', () => {
  expect(maskEmail('meridian@gmail.com')).toBe('m•••@gmail.com');
});
