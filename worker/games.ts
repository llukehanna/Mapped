import type { GameResult, StartResponse, UnrankedReason } from '../src/api/types.ts';
import { boardFor, parseConfig, type Board } from '../src/game/ranking.ts';
import { scopeKey } from '../src/game/scope.ts';
import type { EndReason, GameConfig } from '../src/game/types.ts';
import { currentUser, requireUser } from './auth.ts';
import { bestOf, rankOf, recordBest } from './boards.ts';
import { hmac, randomSeed, randomToken } from './crypto.ts';
import type { Env } from './env.ts';
import { clientIp, HttpError, json, readBody } from './http.ts';
import { judge, parseLog } from './replay.ts';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
export const STARTS_PER_HOUR = 200;

interface GameRow {
  id: string;
  user_id: string | null;
  claim_hash: string | null;
  config: string;
  board: Board | null;
  seed: number;
  started_at: number;
  finished_at: number | null;
  found: number;
  total: number;
  hints: number;
  ms: number;
  end_reason: EndReason;
  ranked: number;
  unranked_reason: UnrankedReason | null;
}

/** POST /api/games { config } */
export async function startGame(req: Request, env: Env): Promise<Response> {
  const config = parseConfig((await readBody(req)).config);
  if (!config) throw new HttpError(400, 'bad_config', "That setup isn't valid.");
  const now = Date.now();
  const ipHash = await hmac(env.AUTH_SECRET, `ip:${clientIp(req)}`);
  const recent = await env.DB.prepare('SELECT count(*) AS n FROM games WHERE ip_hash = ? AND started_at > ?').bind(ipHash, now - HOUR_MS).first<{ n: number }>();
  if (recent!.n >= STARTS_PER_HOUR) throw new HttpError(429, 'rate_limited', 'Too many games from here. Try again in a bit.');

  const user = await currentUser(req, env);
  const id = randomToken(16);
  const seed = randomSeed();
  const claim = user ? null : randomToken(24);
  const board = boardFor(config);
  await env.DB.batch([
    // Housekeeping: unclaimed or abandoned games older than a day.
    env.DB.prepare(
      'DELETE FROM games WHERE id IN (SELECT id FROM games WHERE (user_id IS NULL OR finished_at IS NULL) AND started_at < ? LIMIT 50)',
    ).bind(now - DAY_MS),
    env.DB.prepare(
      'INSERT INTO games (id, user_id, claim_hash, ip_hash, config, mode, scope_key, board, seed, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(id, user?.id ?? null, claim && (await hmac(env.AUTH_SECRET, `claim:${claim}`)), ipHash, JSON.stringify(config), config.mode, scopeKey(config.scope), board, seed, now),
  ]);
  return json({ id, claim, seed, board } satisfies StartResponse);
}

/** The response for a finished game; records a new best first when the game ranks and has an owner. */
async function result(env: Env, game: GameRow): Promise<GameResult> {
  const run = { hints: game.hints, ms: game.ms, finishedAt: game.finished_at! };
  const owned = game.user_id !== null && game.board !== null;
  const newBest = owned && game.ranked === 1 ? await recordBest(env.DB, game.user_id!, game.board!, game.id, run) : false;
  return {
    id: game.id,
    board: game.board,
    found: game.found,
    total: game.total,
    hints: game.hints,
    ms: game.ms,
    endReason: game.end_reason,
    ranked: game.ranked === 1,
    reason: game.unranked_reason,
    newBest,
    best: owned ? await bestOf(env.DB, game.user_id!, game.board!).then((b) => b && { hints: b.hints, ms: b.ms, rank: b.rank }) : null,
    wouldRank: game.unranked_reason === 'anonymous' ? await rankOf(env.DB, game.board!, run) : null,
  };
}

/** POST /api/games/:id/finish { log } */
export async function finishGame(req: Request, env: Env, id: string): Promise<Response> {
  const receivedAt = Date.now();
  const body = await readBody(req);
  const game = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(id).first<GameRow>();
  if (!game) throw new HttpError(404, 'not_found', "That game isn't on record.");
  // A retry after a lost response: say what was saved. (The game id is a bearer secret; `result` is idempotent.)
  if (game.finished_at !== null) return json(await result(env, game));

  const log = parseLog(body.log);
  const config = JSON.parse(game.config) as GameConfig;
  const verdict = log && judge({ config, seed: game.seed, log, board: game.board, serverElapsedMs: receivedAt - game.started_at });
  if (!verdict) {
    await env.DB.prepare('DELETE FROM games WHERE id = ? AND finished_at IS NULL').bind(id).run();
    throw new HttpError(422, 'unverified', "This game couldn't be verified.");
  }
  // Everything checks out but nobody owns it yet: it ranks once claimed.
  const reason: UnrankedReason | null = verdict.reason ?? (game.user_id ? null : 'anonymous');
  const done: GameRow = {
    ...game,
    finished_at: receivedAt,
    found: verdict.found,
    total: verdict.total,
    hints: verdict.hints,
    ms: verdict.ms,
    end_reason: verdict.endReason,
    ranked: reason === null ? 1 : 0,
    unranked_reason: reason,
  };
  const saved = await env.DB.prepare(
    'UPDATE games SET finished_at = ?, found = ?, total = ?, hints = ?, ms = ?, end_reason = ?, ranked = ?, unranked_reason = ?, log = ? WHERE id = ? AND finished_at IS NULL AND user_id IS ?',
  )
    .bind(receivedAt, done.found, done.total, done.hints, done.ms, done.end_reason, done.ranked, reason, JSON.stringify(log), id, game.user_id)
    .run();
  if (saved.meta.changes === 0) {
    // Lost a race with another finish (same game), or the game changed hands meanwhile.
    const now = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(id).first<GameRow>();
    if (now?.finished_at != null) return json(await result(env, now));
    throw new HttpError(409, 'finished', 'That game was already saved.');
  }
  return json(await result(env, done));
}

/** POST /api/games/claim { claims: [{ id, claim }] }: games played signed out, now owned. */
export async function claimGames(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  const body = await readBody(req);
  const claims = Array.isArray(body.claims) ? body.claims.slice(0, 20) : [];
  const results: GameResult[] = [];
  for (const c of claims as { id?: unknown; claim?: unknown }[]) {
    if (typeof c?.id !== 'string' || typeof c.claim !== 'string') continue;
    const game = await env.DB.prepare('SELECT * FROM games WHERE id = ? AND user_id IS NULL').bind(c.id).first<GameRow>();
    if (!game || game.claim_hash !== (await hmac(env.AUTH_SECRET, `claim:${c.claim}`))) continue;
    const ranked = game.unranked_reason === 'anonymous';
    const owned: GameRow = { ...game, user_id: user.id, claim_hash: null, ranked: ranked ? 1 : game.ranked, unranked_reason: ranked ? null : game.unranked_reason };
    const claimed = await env.DB.prepare('UPDATE games SET user_id = ?, claim_hash = NULL, ranked = ?, unranked_reason = ? WHERE id = ? AND user_id IS NULL')
      .bind(user.id, owned.ranked, owned.unranked_reason, game.id)
      .run();
    if (claimed.meta.changes === 0) continue;
    if (owned.finished_at !== null) results.push(await result(env, owned));
  }
  return json({ results });
}
