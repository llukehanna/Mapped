import type { BestSummary, BoardResponse, BoardRow, MyGamesResponse, PersonalBest, RecentGame } from '../src/api/types.ts';
import { parseBoard, type Board, type Run } from '../src/game/ranking.ts';
import { topicOf } from '../src/game/topics.ts';
import type { EndReason, Mode } from '../src/game/types.ts';
import { currentUser, requireUser } from './auth.ts';
import type { D1Database, Env } from './env.ts';
import { HttpError, json } from './http.ts';

const TOP = 50;

/** 1 + how many named players' bests on `board` beat `run` (more found, then fewer hints, then faster, then earlier). */
export async function rankOf(db: D1Database, board: Board, run: Run): Promise<number> {
  const row = await db
    .prepare(
      `SELECT count(*) AS n FROM bests b JOIN users u ON u.id = b.user_id
       WHERE b.board = ?1 AND u.name IS NOT NULL
         AND (b.found > ?2 OR (b.found = ?2 AND (b.hints < ?3 OR (b.hints = ?3 AND (b.ms < ?4 OR (b.ms = ?4 AND b.finished_at < ?5))))))`,
    )
    .bind(board, run.found, run.hints, run.ms, run.finishedAt)
    .first<{ n: number }>();
  return row!.n + 1;
}

/** Keeps `run` as the player's best on `board` if it beats the one on record. Returns whether it did. */
export async function recordBest(db: D1Database, userId: string, board: Board, gameId: string, run: Run & { total: number }): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT INTO bests (user_id, board, game_id, found, total, hints, ms, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, board) DO UPDATE SET game_id = excluded.game_id, found = excluded.found, total = excluded.total,
         hints = excluded.hints, ms = excluded.ms, finished_at = excluded.finished_at
       WHERE excluded.found > bests.found
          OR (excluded.found = bests.found AND (excluded.hints < bests.hints OR (excluded.hints = bests.hints AND excluded.ms < bests.ms)))`,
    )
    .bind(userId, board, gameId, run.found, run.total, run.hints, run.ms, run.finishedAt)
    .run();
  return res.meta.changes > 0;
}

/** The player's best on `board`, ranked when they have a name (nameless players aren't on boards). */
export async function bestOf(db: D1Database, userId: string, board: Board): Promise<(BestSummary & { finishedAt: number }) | null> {
  const row = await db
    .prepare('SELECT b.found, b.total, b.hints, b.ms, b.finished_at, u.name FROM bests b JOIN users u ON u.id = b.user_id WHERE b.user_id = ? AND b.board = ?')
    .bind(userId, board)
    .first<{ found: number; total: number; hints: number; ms: number; finished_at: number; name: string | null }>();
  if (!row) return null;
  const run = { found: row.found, hints: row.hints, ms: row.ms, finishedAt: row.finished_at };
  return { ...run, total: row.total, rank: row.name === null ? null : await rankOf(db, board, run) };
}

/** GET /api/boards/:mode/:region (countries) or /api/boards/:topic/:mode/:region; `board` is the board key. */
export async function getBoard(req: Request, env: Env, board: string): Promise<Response> {
  if (!parseBoard(board)) throw new HttpError(404, 'not_found', 'No such leaderboard.');
  const user = await currentUser(req, env);
  const [top, count] = await env.DB.batch([
    env.DB.prepare(
      `SELECT b.user_id, u.name, b.found, b.total, b.hints, b.ms, b.finished_at FROM bests b JOIN users u ON u.id = b.user_id
       WHERE b.board = ? AND u.name IS NOT NULL ORDER BY b.found DESC, b.hints, b.ms, b.finished_at LIMIT ${TOP}`,
    ).bind(board),
    env.DB.prepare('SELECT count(*) AS n FROM bests b JOIN users u ON u.id = b.user_id WHERE b.board = ? AND u.name IS NOT NULL').bind(board),
  ]);
  type Row = { user_id: string; name: string; found: number; total: number; hints: number; ms: number; finished_at: number };
  const rows: BoardRow[] = (top.results as Row[]).map((r, i) => ({
    rank: i + 1,
    name: r.name,
    found: r.found,
    total: r.total,
    hints: r.hints,
    ms: r.ms,
    finishedAt: r.finished_at,
    you: r.user_id === user?.id,
  }));
  let you = rows.find((r) => r.you) ?? null;
  if (!you && user?.name) {
    const best = await bestOf(env.DB, user.id, board as Board);
    if (best?.rank) you = { rank: best.rank, name: user.name, found: best.found, total: best.total, hints: best.hints, ms: best.ms, finishedAt: best.finishedAt, you: true };
  }
  const players = (count.results[0] as { n: number }).n;
  return json({ board: board as Board, rows, players, you } satisfies BoardResponse);
}

/** GET /api/me/games */
export async function myGames(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  const [bests, personal, recent] = await env.DB.batch([
    // Each best carries its rank (the same tie-breaks as rankOf), so the whole page costs a fixed number of D1 queries.
    env.DB.prepare(
      `SELECT b.board, b.found, b.total, b.hints, b.ms, b.finished_at,
         1 + (SELECT count(*) FROM bests o JOIN users u ON u.id = o.user_id
              WHERE o.board = b.board AND u.name IS NOT NULL
                AND (o.found > b.found OR (o.found = b.found AND (o.hints < b.hints OR (o.hints = b.hints AND (o.ms < b.ms OR (o.ms = b.ms AND o.finished_at < b.finished_at))))))) AS rank
       FROM bests b WHERE b.user_id = ?`,
    ).bind(user.id),
    env.DB.prepare(
      `SELECT board, found, total, hints, ms, ranked FROM (
         SELECT g.*, row_number() OVER (PARTITION BY board ORDER BY found DESC, ranked DESC, hints, ms, finished_at) AS n
         FROM games g WHERE user_id = ? AND board IS NOT NULL AND finished_at IS NOT NULL
       ) WHERE n = 1`,
    ).bind(user.id),
    env.DB.prepare(
      `SELECT g.id, g.config, g.mode, g.scope_key, g.found, g.total, g.hints, g.ms, g.end_reason, g.ranked, g.unranked_reason, g.finished_at,
              b.game_id IS NOT NULL AS is_best
       FROM games g LEFT JOIN bests b ON b.game_id = g.id
       WHERE g.user_id = ? AND g.finished_at IS NOT NULL ORDER BY g.finished_at DESC LIMIT 50`,
    ).bind(user.id),
  ]);
  type BestRow = { board: Board; found: number; total: number; hints: number; ms: number; finished_at: number; rank: number };
  const ranked = (bests.results as BestRow[]).map((b) => ({
    board: b.board,
    found: b.found,
    total: b.total,
    hints: b.hints,
    ms: b.ms,
    rank: user.name === null ? null : b.rank,
  }));
  type GameRow = {
    id: string; config: string; mode: Mode; scope_key: string; found: number; total: number; hints: number; ms: number;
    end_reason: EndReason; ranked: number; unranked_reason: RecentGame['reason']; finished_at: number; is_best: number;
  };
  const games: RecentGame[] = (recent.results as GameRow[]).map((g) => ({
    id: g.id,
    topic: topicOf(JSON.parse(g.config)),
    mode: g.mode,
    scopeKey: g.scope_key,
    found: g.found,
    total: g.total,
    hints: g.hints,
    ms: g.ms,
    endReason: g.end_reason,
    ranked: g.ranked === 1,
    reason: g.unranked_reason,
    isBest: g.is_best === 1,
    finishedAt: g.finished_at,
  }));
  type PersonalRow = Omit<PersonalBest, 'ranked'> & { ranked: number };
  const mine: PersonalBest[] = (personal.results as PersonalRow[]).map((p) => ({ ...p, ranked: p.ranked === 1 }));
  return json({ bests: ranked, personal: mine, recent: games } satisfies MyGamesResponse);
}
