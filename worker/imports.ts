import { COUNTRIES } from '../src/data/countries.ts';
import { LOCAL_IMPORT_BEFORE, MAX_IMPORTED_PER_ACCOUNT, MAX_IMPORTS_PER_REQUEST } from '../src/api/types.ts';
import { boardFor, parseConfig } from '../src/game/ranking.ts';
import { poolFor, scopeKey } from '../src/game/scope.ts';
import { requireUser } from './auth.ts';
import { hmac } from './crypto.ts';
import type { D1PreparedStatement, Env } from './env.ts';
import { json, readBody } from './http.ts';

export { MAX_IMPORTED_PER_ACCOUNT, MAX_IMPORTS_PER_REQUEST };

const LAUNCH_YEAR_START = Date.parse('2026-01-01');
const DAY_MS = 86_400_000;
const intIn = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/**
 * POST /api/me/import { results: [{ config, found, total, ms, hints, at }] }: bests the browser saved before accounts existed.
 * They are unverified, so they only count in Your games: they can be your personal best on their board, but are never ranked. Entries that don't check out are skipped.
 */
export async function importBests(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  const body = await readBody(req);
  const entries = Array.isArray(body.results) ? body.results.slice(0, MAX_IMPORTS_PER_REQUEST) : [];
  const inserts: D1PreparedStatement[] = [];
  for (const e of entries as Record<string, unknown>[]) {
    const config = parseConfig(e?.config);
    if (!config) continue;
    const { found, total, ms, hints, at } = e;
    if (total !== poolFor(config.scope, COUNTRIES).length) continue;
    if (!intIn(found, 0, total) || !intIn(ms, 0, DAY_MS) || !intIn(hints, 0, 100_000)) continue;
    if (!intIn(at, LAUNCH_YEAR_START, LOCAL_IMPORT_BEFORE - 1)) continue;
    const scope = scopeKey(config.scope);
    // The id comes from the run itself, so sending it twice lands on the same row.
    const id = 'imp_' + (await hmac(env.AUTH_SECRET, `import:${user.id}:${config.mode}:${scope}:${config.timeLimitSec ?? 'none'}:${at}`)).slice(0, 22);
    inserts.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO games (id, user_id, claim_hash, ip_hash, config, mode, scope_key, board, seed, started_at, finished_at, found, total, hints, ms, end_reason, ranked, unranked_reason, log)
         VALUES (?, ?, NULL, 'import', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 0, 'imported', NULL)`,
      ).bind(id, user.id, JSON.stringify(config), config.mode, scope, boardFor(config), at - ms, at, found, total, hints, ms, found === total ? 'complete' : 'gaveUp'),
    );
  }
  // Each row is a D1 write, so an account can only ever import so many.
  const have = await env.DB.prepare("SELECT count(*) AS n FROM games WHERE user_id = ? AND unranked_reason = 'imported'").bind(user.id).first<{ n: number }>();
  const room = Math.max(0, MAX_IMPORTED_PER_ACCOUNT - have!.n);
  const batch = inserts.slice(0, room);
  const results = batch.length > 0 ? await env.DB.batch(batch) : [];
  return json({ imported: results.reduce((n, r) => n + r.meta.changes, 0) });
}
