import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { COUNTRIES } from '../../src/data/countries.ts';
import { LOCAL_IMPORT_BEFORE, MAX_IMPORTED_PER_ACCOUNT, MAX_IMPORTS_PER_REQUEST, type BoardResponse, type MyGamesResponse } from '../../src/api/types.ts';
import { poolFor } from '../../src/game/scope.ts';
import type { GameConfig } from '../../src/game/types.ts';
import type { D1Database, Env } from '../../worker/env.ts';
import { call, signIn, startDb, testEnv, wipe } from './harness.ts';

let db: D1Database;
let dispose: () => Promise<void>;
let env: Env;
beforeAll(async () => {
  ({ db, dispose } = await startDb());
  env = testEnv(db);
}, 30_000);
afterAll(() => dispose());
beforeEach(() => wipe(db));

const EUROPE: GameConfig = { mode: 'type', scope: { continents: ['europe'], subregions: [] }, timeLimitSec: null };
const EUROPE_TOTAL = poolFor(EUROPE.scope, COUNTRIES).length;
const JUNE = Date.parse('2026-06-01');

/** A believable pre-accounts best; `over` replaces fields. */
const entry = (over: Record<string, unknown> = {}) => ({ config: EUROPE, found: 40, total: EUROPE_TOTAL, ms: 600_000, hints: 2, at: JUNE, ...over });

const send = async (cookie: string | undefined, results: unknown) => call(env, 'POST', '/api/me/import', { cookie, body: { results } });
const importCount = async (cookie: string, results: unknown) => ((await (await send(cookie, results)).json()) as { imported: number }).imported;
const myGames = async (cookie: string): Promise<MyGamesResponse> => (await call(env, 'GET', '/api/me/games', { cookie })).json();

describe('importing pre-accounts bests', () => {
  it('needs a signed-in player', async () => {
    expect((await send(undefined, [entry()])).status).toBe(401);
  });

  it('adds them to Your games, unranked', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const complete = entry({ config: { mode: 'locate', scope: { continents: [], subregions: ['Caribbean'] }, timeLimitSec: 600 }, found: 5, total: poolFor({ continents: [], subregions: ['Caribbean'] }, COUNTRIES).length, at: JUNE + 1000 });
    expect(await importCount(ana, [entry(), complete])).toBe(2);
    const { recent, bests, personal } = await myGames(ana);
    expect(bests).toEqual([]);
    // They count as your personal best on their board (the custom Caribbean run has no board).
    expect(personal).toEqual([{ board: 'type:europe', found: 40, total: EUROPE_TOTAL, hints: 2, ms: 600_000, ranked: false }]);
    expect(recent).toEqual([
      expect.objectContaining({ mode: 'locate', scopeKey: 'Caribbean', found: 5, endReason: 'gaveUp', ranked: false, reason: 'imported', isBest: false, finishedAt: JUNE + 1000 }),
      { id: expect.stringMatching(/^imp_/), mode: 'type', scopeKey: 'europe', found: 40, total: EUROPE_TOTAL, hints: 2, ms: 600_000, endReason: 'gaveUp', ranked: false, reason: 'imported', isBest: false, finishedAt: JUNE },
    ]);
  });

  it('calls a run that found everything complete', async () => {
    const ana = await signIn(env, 'ana@example.com');
    await importCount(ana, [entry({ found: EUROPE_TOTAL })]);
    expect((await myGames(ana)).recent[0]).toMatchObject({ endReason: 'complete', ranked: false, reason: 'imported' });
  });

  it('sending the same entries again inserts nothing', async () => {
    const ana = await signIn(env, 'ana@example.com');
    expect(await importCount(ana, [entry()])).toBe(1);
    expect(await importCount(ana, [entry()])).toBe(0);
    expect((await myGames(ana)).recent).toHaveLength(1);
  });

  it('is per account: the same run on another account imports separately', async () => {
    const ana = await signIn(env, 'ana@example.com');
    const bo = await signIn(env, 'bo@example.com');
    expect(await importCount(ana, [entry()])).toBe(1);
    expect(await importCount(bo, [entry()])).toBe(1);
  });

  it('skips entries that are not real bests, and imports the rest', async () => {
    const ana = await signIn(env, 'ana@example.com');
    const bad = [
      entry({ config: { mode: 'race', scope: EUROPE.scope, timeLimitSec: null } }),
      entry({ config: null }),
      entry({ total: EUROPE_TOTAL - 1 }),
      entry({ found: EUROPE_TOTAL + 1 }),
      entry({ found: -1 }),
      entry({ found: 1.5 }),
      entry({ ms: -1 }),
      entry({ ms: 86_400_001 }),
      entry({ hints: -1 }),
      entry({ hints: 100_001 }),
      entry({ at: LOCAL_IMPORT_BEFORE }),
      entry({ at: Date.parse('2025-12-31') }),
      entry({ at: JUNE + 0.5 }),
      entry({ at: '2026-06-01' }),
      'junk',
      null,
    ];
    expect(await importCount(ana, [...bad, entry({ at: JUNE + 5 })])).toBe(1);
    expect((await myGames(ana)).recent).toHaveLength(1);
    // Garbage that is not even a list is an empty import.
    expect(await importCount(ana, 'nope')).toBe(0);
  });

  it('processes at most 25 entries per request', async () => {
    const ana = await signIn(env, 'ana@example.com');
    const many = Array.from({ length: MAX_IMPORTS_PER_REQUEST + 5 }, (_, i) => entry({ at: JUNE + i }));
    expect(MAX_IMPORTS_PER_REQUEST).toBe(25);
    expect(await importCount(ana, many)).toBe(25);
  });

  it('stops at 200 imported games per account, truncating the request that crosses the line', async () => {
    const ana = await signIn(env, 'ana@example.com');
    expect(MAX_IMPORTED_PER_ACCOUNT).toBe(200);
    const batch = (from: number) => Array.from({ length: MAX_IMPORTS_PER_REQUEST }, (_, i) => entry({ at: JUNE + from + i }));
    for (let n = 0; n < 7; n++) expect(await importCount(ana, batch(n * 25))).toBe(25);
    // 175 in; room for 25 more.
    expect(await importCount(ana, batch(175))).toBe(25);
    expect(await importCount(ana, batch(200))).toBe(0);
    expect(await db.prepare("SELECT count(*) AS n FROM games WHERE user_id IS NOT NULL AND unranked_reason = 'imported'").first<{ n: number }>()).toEqual({ n: 200 });
    // The allowance is per account.
    expect(await importCount(await signIn(env, 'bo@example.com'), batch(0))).toBe(25);
  });

  it('truncates to the remaining allowance', async () => {
    const ana = await signIn(env, 'ana@example.com');
    for (let n = 0; n < 7; n++) await importCount(ana, Array.from({ length: 25 }, (_, i) => entry({ at: JUNE + n * 25 + i })));
    expect(await importCount(ana, Array.from({ length: 10 }, (_, i) => entry({ at: JUNE + 500 + i })))).toBe(10);
    expect(await importCount(ana, Array.from({ length: 25 }, (_, i) => entry({ at: JUNE + 600 + i })))).toBe(15);
  });

  it('never ranks: no board row, no best', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    await importCount(ana, [entry({ found: EUROPE_TOTAL, hints: 0, ms: 1000 })]);
    const board = (await (await call(env, 'GET', '/api/boards/type/europe', { cookie: ana })).json()) as BoardResponse;
    expect(board).toMatchObject({ rows: [], players: 0, you: null });
    expect(await db.prepare('SELECT count(*) AS n FROM bests').first<{ n: number }>()).toEqual({ n: 0 });
  });
});
