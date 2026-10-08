import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardResponse, GameResult, MyGamesResponse, StartResponse } from '../../src/api/types.ts';
import type { GameConfig } from '../../src/game/types.ts';
import type { D1Database, Env } from '../../worker/env.ts';
import { MAX_CLAIMS_PER_REQUEST, STARTS_PER_HOUR, UNCLAIMED_KEEP_DAYS } from '../../worker/games.ts';
import { call, signIn, startDb, statements, testEnv, wipe } from './harness.ts';
import { clickTarget, play, typeAll, type Move } from './play.ts';

let db: D1Database;
let dispose: () => Promise<void>;
let env: Env;
beforeAll(async () => {
  ({ db, dispose } = await startDb());
  env = testEnv(db);
}, 30_000);
afterAll(() => dispose());
beforeEach(() => wipe(db));

const SOUTH_AMERICA: GameConfig = { mode: 'type', scope: { continents: ['south-america'], subregions: [] }, timeLimitSec: null };

async function start(cookie?: string, config: GameConfig = SOUTH_AMERICA): Promise<StartResponse> {
  return (await call(env, 'POST', '/api/games', { cookie, body: { config } })).json();
}

/** Starts a game and finishes it with an honest log, `step` ms between moves. */
async function playGame(cookie?: string, { step = 2000, moves = typeAll, config = SOUTH_AMERICA }: { step?: number; moves?: Move; config?: GameConfig } = {}) {
  const game = await start(cookie, config);
  const res = await call(env, 'POST', `/api/games/${game.id}/finish`, { cookie, body: { log: play(config, game.seed, moves, step) } });
  return { game, res, result: (await res.clone().json()) as GameResult };
}

const board = async (cookie?: string, path = 'type/south-america'): Promise<BoardResponse> => (await call(env, 'GET', `/api/boards/${path}`, { cookie })).json();

describe('starting a game', () => {
  it('returns an id, a seed and the board; a claim token only when signed out', async () => {
    const anon = await start();
    expect(anon).toMatchObject({ board: 'type:south-america', claim: expect.any(String) });
    expect(Number.isInteger(anon.seed)).toBe(true);
    const ana = await signIn(env, 'ana@example.com');
    expect(await start(ana)).toMatchObject({ claim: null });
    const custom = await start(undefined, { ...SOUTH_AMERICA, scope: { continents: [], subregions: ['Caribbean'] } });
    expect(custom.board).toBeNull();
  });

  it('rejects setups the app could not make', async () => {
    const res = await call(env, 'POST', '/api/games', { body: { config: { ...SOUTH_AMERICA, mode: 'race' } } });
    expect(res.status).toBe(400);
  });

  it('limits starts per IP per hour', async () => {
    const first = await start();
    const { ip_hash } = (await db.prepare('SELECT ip_hash FROM games WHERE id = ?').bind(first.id).first<{ ip_hash: string }>())!;
    await db.batch(
      Array.from({ length: STARTS_PER_HOUR - 1 }, (_, i) =>
        db.prepare("INSERT INTO games (id, ip_hash, config, mode, scope_key, seed, started_at) VALUES (?, ?, '{}', 'type', 'world', 1, ?)").bind(`g${i}`, ip_hash, Date.now()),
      ),
    );
    expect((await call(env, 'POST', '/api/games', { body: { config: SOUTH_AMERICA } })).status).toBe(429);
    expect((await call(env, 'POST', '/api/games', { body: { config: SOUTH_AMERICA }, ip: '198.51.100.9' })).status).toBe(200);
  });

  it('clears unfinished games older than a day', async () => {
    const old = await start();
    await db.prepare('UPDATE games SET started_at = ?').bind(Date.now() - 2 * 86_400_000).run();
    await start();
    expect(await db.prepare('SELECT 1 FROM games WHERE id = ?').bind(old.id).first()).toBeNull();
  });

  it('keeps unclaimed finished games for 90 days', async () => {
    const recent = await playGame();
    const old = await playGame();
    const age = (id: string, days: number) => db.prepare('UPDATE games SET started_at = ?, finished_at = ? WHERE id = ?').bind(Date.now() - days * 86_400_000, Date.now() - days * 86_400_000, id).run();
    await age(recent.game.id, 2);
    await age(old.game.id, UNCLAIMED_KEEP_DAYS + 1);
    await start();
    expect(await db.prepare('SELECT 1 FROM games WHERE id = ?').bind(recent.game.id).first()).not.toBeNull();
    expect(await db.prepare('SELECT 1 FROM games WHERE id = ?').bind(old.game.id).first()).toBeNull();
  });

  it('housekeeping finds abandoned games by index, not by scanning every game', async () => {
    const plan = await db
      .prepare('EXPLAIN QUERY PLAN SELECT id FROM games WHERE (finished_at IS NULL AND started_at < ?) OR (user_id IS NULL AND finished_at < ?) LIMIT 50')
      .bind(0, 0)
      .all<{ detail: string }>();
    const details = plan.results.map((r) => r.detail).join('\n');
    expect(details).toContain('games_abandoned');
    expect(details).not.toMatch(/SCAN (games|TABLE games)\b/);
  });

  it('housekeeping keeps owned, finished games older than a day', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const old = await playGame(ana);
    await db.prepare('UPDATE games SET started_at = ?').bind(Date.now() - 2 * 86_400_000).run();
    await start();
    expect(await db.prepare('SELECT 1 FROM games WHERE id = ?').bind(old.game.id).first()).not.toBeNull();
    expect((await board()).rows.map((r) => r.name)).toEqual(['meridian']);
  });
});

describe('finishing a game', () => {
  it('signed in: ranks, becomes the best, and shows on the board', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const { result } = await playGame(ana);
    expect(result).toMatchObject({ found: 12, total: 12, hints: 0, ms: 24_000, ranked: true, reason: null, newBest: true, best: { found: 12, total: 12, hints: 0, ms: 24_000, rank: 1 } });
    expect((await board(ana)).rows).toEqual([{ rank: 1, name: 'meridian', found: 12, total: 12, hints: 0, ms: 24_000, finishedAt: expect.any(Number), you: true }]);
  });

  it('a slower run is saved but the best stays', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    await playGame(ana);
    const { result } = await playGame(ana, { step: 3000 });
    expect(result).toMatchObject({ ranked: true, newBest: false, best: { ms: 24_000, rank: 1 } });
  });

  it('signed out: saved as anonymous with the rank it would get; claiming it ranks it', async () => {
    const bo = await signIn(env, 'bo@example.com', 'kestrel');
    await playGame(bo, { step: 1500 });
    const { game, result } = await playGame();
    expect(result).toMatchObject({ ranked: false, reason: 'anonymous', wouldRank: 2, best: null });

    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const claimed = await (await call(env, 'POST', '/api/games/claim', { cookie: ana, body: { claims: [{ id: game.id, claim: game.claim }] } })).json();
    expect(claimed.results).toEqual([expect.objectContaining({ id: game.id, ranked: true, reason: null, newBest: true, best: { found: 12, total: 12, hints: 0, ms: 24_000, rank: 2 } })]);
    expect((await board()).rows.map((r) => r.name)).toEqual(['kestrel', 'meridian']);
  });

  it('a wrong claim token claims nothing', async () => {
    const { game } = await playGame();
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const res = await call(env, 'POST', '/api/games/claim', { cookie: ana, body: { claims: [{ id: game.id, claim: 'guess' }] } });
    expect((await res.json()).results).toEqual([]);
  });

  it('a game already claimed can\'t be claimed again by another account', async () => {
    const { game } = await playGame();
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    await call(env, 'POST', '/api/games/claim', { cookie: ana, body: { claims: [{ id: game.id, claim: game.claim }] } });
    const bo = await signIn(env, 'bo@example.com', 'kestrel');
    const second = await (await call(env, 'POST', '/api/games/claim', { cookie: bo, body: { claims: [{ id: game.id, claim: game.claim }] } })).json();
    expect(second.results).toEqual([]);
    expect((await board()).rows.map((r) => r.name)).toEqual(['meridian']);
  });

  it('processes at most 8 claims per request', async () => {
    expect(MAX_CLAIMS_PER_REQUEST).toBe(8);
    const games = [];
    for (let i = 0; i < 9; i++) games.push((await playGame()).game);
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const claims = games.map((g) => ({ id: g.id, claim: g.claim }));
    const first = await (await call(env, 'POST', '/api/games/claim', { cookie: ana, body: { claims } })).json();
    expect(first.results).toHaveLength(8);
    // The ninth is still unclaimed and goes through in the next request.
    const second = await (await call(env, 'POST', '/api/games/claim', { cookie: ana, body: { claims: claims.slice(8) } })).json();
    expect(second.results).toHaveLength(1);
  });

  it('pausing saves the game unranked', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    let paused = false;
    const { result } = await playGame(ana, {
      moves: (s, now) => (s.phase === 'paused' ? { type: 'resume', now } : !paused && s.found.length === 2 ? ((paused = true), { type: 'pause', now }) : typeAll(s, now)),
    });
    expect(result).toMatchObject({ ranked: false, reason: 'paused', best: null });
    expect((await board()).rows).toEqual([]);
  });

  it('a replay quicker than the server clock is unverified', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const game = await start(ana);
    await db.prepare('UPDATE games SET started_at = started_at - 60000').run();
    const res = await call(env, 'POST', `/api/games/${game.id}/finish`, { cookie: ana, body: { log: play(SOUTH_AMERICA, game.seed, typeAll, 2000) } });
    expect(await res.json()).toMatchObject({ ranked: false, reason: 'unverified' });
  });

  it('a log that does not replay is refused and the game discarded', async () => {
    const game = await start();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await call(env, 'POST', `/api/games/${game.id}/finish`, { body: { log: [{ t: 10, a: { type: 'found', id: 'FRA' } }] } });
    expect(res.status).toBe(422);
    expect(await db.prepare('SELECT 1 FROM games WHERE id = ?').bind(game.id).first()).toBeNull();
    expect(logged).toHaveBeenCalledWith('unverified log', game.id, 1);
    logged.mockRestore();
  });

  it('the 422 delete does not remove an already finished game', async () => {
    const { game } = await playGame();
    const res = await call(env, 'POST', `/api/games/${game.id}/finish`, { body: { log: [{ t: 10, a: { type: 'found', id: 'FRA' } }] } });
    expect(res.status).toBe(200);
    expect(await db.prepare('SELECT 1 FROM games WHERE id = ?').bind(game.id).first()).not.toBeNull();
  });

  it('finishing twice returns the same result and changes nothing: a retry after a lost response works', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const { game, result } = await playGame(ana);
    const stored = () => db.prepare('SELECT finished_at, ms, hints, found, ranked, log FROM games WHERE id = ?').bind(game.id).first();
    const before = await stored();
    // The second call, even with a different log, is answered from the stored result.
    const again = await call(env, 'POST', `/api/games/${game.id}/finish`, { cookie: ana, body: { log: [] } });
    expect(again.status).toBe(200);
    // Same result; the best was already recorded the first time, so it isn't "new" again.
    expect(result.newBest).toBe(true);
    expect(await again.json()).toEqual({ ...result, newBest: false });
    expect(await stored()).toEqual(before);
    expect((await board()).rows).toHaveLength(1);
    expect((await call(env, 'POST', '/api/games/nope/finish', { body: { log: [] } })).status).toBe(404);
  });

  it('a signed-out player can retry finishing and still claim afterwards', async () => {
    const { game, result } = await playGame();
    const again = await (await call(env, 'POST', `/api/games/${game.id}/finish`, { body: { log: [] } })).json();
    expect(again).toEqual(result);
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const claimed = await (await call(env, 'POST', '/api/games/claim', { cookie: ana, body: { claims: [{ id: game.id, claim: game.claim }] } })).json();
    expect(claimed.results).toEqual([expect.objectContaining({ id: game.id, ranked: true })]);
  });
});

describe('leaderboards and your games', () => {
  it('orders by hints, then time; players without a name are left off', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const bo = await signIn(env, 'bo@example.com', 'kestrel');
    const cy = await signIn(env, 'cy@example.com');
    let hinted = false;
    await playGame(ana, { step: 1000, moves: (s, now) => (hinted ? typeAll(s, now) : ((hinted = true), { type: 'hint', rand: 0.5, now })) });
    await playGame(bo, { step: 3000 });
    await playGame(cy, { step: 500 });
    const res = await board(ana);
    expect(res.rows.map((r) => [r.rank, r.name, r.hints])).toEqual([
      [1, 'kestrel', 0],
      [2, 'meridian', 1],
    ]);
    expect(res.players).toBe(2);
    expect(res.you).toMatchObject({ rank: 2, name: 'meridian', you: true });
  });

  it('pins your row when you are outside the top 50', async () => {
    const now = Date.now();
    await db.batch(
      Array.from({ length: 55 }, (_, i) => [
        db.prepare('INSERT INTO users (id, google_sub, email, name, name_key, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(`u${i}`, `s${i}`, `${i}@x.y`, `player${i}`, `player${i}`, now),
        db.prepare("INSERT INTO games (id, user_id, ip_hash, config, mode, scope_key, board, seed, started_at, finished_at, found, total, hints, ms, end_reason, ranked) VALUES (?, ?, 'h', '{}', 'type', 'south-america', 'type:south-america', 1, ?, ?, 12, 12, 0, ?, 'complete', 1)").bind(`g${i}`, `u${i}`, now, now, 10_000 + i),
        db.prepare("INSERT INTO bests (user_id, board, game_id, found, total, hints, ms, finished_at) VALUES (?, 'type:south-america', ?, 12, 12, 0, ?, ?)").bind(`u${i}`, `g${i}`, 10_000 + i, now),
      ]).flat(),
    );
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    await playGame(ana);
    const res = await board(ana);
    expect(res.rows).toHaveLength(50);
    expect(res.players).toBe(56);
    expect(res.you).toMatchObject({ rank: 56, name: 'meridian' });
    expect((await call(env, 'GET', '/api/boards/type/mars')).status).toBe(404);
  });

  it('ranks most found first, then fewest hints, then fastest', async () => {
    const findThen = (n: number, hint = false): Move => (s, now) =>
      hint && s.hintsUsed === 0 ? { type: 'hint', rand: 0, now } : s.found.length < n ? typeAll(s, now) : { type: 'giveUp', now };
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const bo = await signIn(env, 'bo@example.com', 'kestrel');
    const cy = await signIn(env, 'cy@example.com', 'osprey');
    const di = await signIn(env, 'di@example.com', 'heron');
    await playGame(ana, { moves: findThen(6, true), step: 1000 }); // 6 found, 1 hint, quick
    await playGame(bo, { moves: findThen(6), step: 3000 }); // 6 found, no hints, slow
    await playGame(cy, { moves: findThen(7, true), step: 4000 }); // 7 found beats everyone with 6
    await playGame(di, { moves: findThen(6), step: 2000 }); // 6 found, no hints, quicker than kestrel
    expect((await board()).rows.map((r) => [r.name, r.found, r.hints])).toEqual([
      ['osprey', 7, 1],
      ['heron', 6, 0],
      ['kestrel', 6, 0],
      ['meridian', 6, 1],
    ]);
    // A better run replaces your best even with more hints, because it found more.
    const { result } = await playGame(bo, { moves: findThen(8, true) });
    expect(result).toMatchObject({ newBest: true, best: { found: 8, hints: 1, rank: 1 } });
    // Finding nothing never ranks.
    expect((await playGame(ana, { moves: findThen(0) })).result).toMatchObject({ found: 0, ranked: false, reason: 'incomplete' });
  });

  it('your games: bests with ranks, then recent games newest first', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    await playGame(ana);
    await playGame(ana, { config: { ...SOUTH_AMERICA, scope: { continents: [], subregions: ['Caribbean'] } } });
    const mine: MyGamesResponse = await (await call(env, 'GET', '/api/me/games', { cookie: ana })).json();
    expect(mine.bests).toEqual([{ board: 'type:south-america', found: 12, total: 12, hints: 0, ms: 24_000, rank: 1 }]);
    expect(mine.recent.map((g) => [g.scopeKey, g.ranked, g.reason, g.isBest])).toEqual([
      ['Caribbean', false, 'custom', false],
      ['south-america', true, null, true],
    ]);
    expect((await call(env, 'GET', '/api/me/games')).status).toBe(401);
  });

  it('your games: personal bests and ranks count unfinished runs, most found first', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const findThen = (n: number, move = typeAll): Move => (s, now) => (s.found.length < n ? move(s, now) : { type: 'giveUp', now });
    await playGame(ana, { moves: findThen(3) });
    await playGame(ana, { moves: findThen(5), step: 3000 });
    await playGame(ana, { moves: findThen(2, clickTarget), config: { ...SOUTH_AMERICA, mode: 'locate' } });
    const mine: MyGamesResponse = await (await call(env, 'GET', '/api/me/games', { cookie: ana })).json();
    // Unfinished runs rank too: the best is the one that found more, though it was slower.
    expect(mine.bests).toEqual(
      expect.arrayContaining([
        { board: 'type:south-america', found: 5, total: 12, hints: 0, ms: 18_000, rank: 1 },
        { board: 'locate:south-america', found: 2, total: 12, hints: 0, ms: 6_000, rank: 1 },
      ]),
    );
    expect(mine.personal).toEqual(
      expect.arrayContaining([
        { board: 'type:south-america', found: 5, total: 12, hints: 0, ms: 18_000, ranked: true },
        { board: 'locate:south-america', found: 2, total: 12, hints: 0, ms: 6_000, ranked: true },
      ]),
    );
    expect(mine.personal).toHaveLength(2);
    // A complete run beats any unfinished one.
    await playGame(ana);
    const after: MyGamesResponse = await (await call(env, 'GET', '/api/me/games', { cookie: ana })).json();
    expect(after.personal.find((p) => p.board === 'type:south-america')).toEqual({ board: 'type:south-america', found: 12, total: 12, hints: 0, ms: 24_000, ranked: true });
  });

  it('recompute-bests rebuilds bests after a game is deleted by hand', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const fast = await playGame(ana, { step: 1500 });
    await playGame(ana, { step: 2500 });
    await db.prepare('DELETE FROM games WHERE id = ?').bind(fast.game.id).run();
    expect((await board()).rows).toEqual([]);
    const sql = readFileSync(new URL('../../scripts/recompute-bests.sql', import.meta.url), 'utf8');
    await db.batch(statements(sql).map((s) => db.prepare(s)));
    expect((await board()).rows).toMatchObject([{ name: 'meridian', ms: 30_000 }]);
  });
});
