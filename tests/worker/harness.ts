import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import type { D1Database, Env } from '../../worker/env.ts';
import worker from '../../worker/index.ts';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);
export const ORIGIN = 'http://localhost';

/** Statements of a migration file, in order. Statements end with ";" at the end of a line. */
export function statements(sql: string): string[] {
  return sql
    .replace(/--.*$/gm, '')
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A real local D1 (via wrangler/miniflare) with every migration applied. */
export async function startDb() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('./wrangler.test.jsonc', import.meta.url)),
    persist: false,
  });
  const db = proxy.env.DB;
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.batch(statements(readFileSync(new URL(file, MIGRATIONS), 'utf8')).map((s) => db.prepare(s)));
  }
  return { db, dispose: proxy.dispose };
}

export function testEnv(db: D1Database, over: Partial<Env> = {}): Env {
  return { DB: db, AUTH_SECRET: 'test-secret', GOOGLE_CLIENT_ID: 'client-123', GOOGLE_CLIENT_SECRET: 'shh', AUTH_MODE: 'fake', ...over };
}

export async function wipe(db: D1Database) {
  await db.batch(['bests', 'games', 'sessions', 'users'].map((t) => db.prepare(`DELETE FROM ${t}`)));
}

interface CallOptions {
  body?: unknown;
  cookie?: string;
  /** null: send no Origin header */
  origin?: string | null;
  ip?: string;
  /** base URL, for testing other hosts */
  base?: string;
}

export function call(env: Env, method: string, path: string, opts: CallOptions = {}): Promise<Response> {
  const base = opts.base ?? ORIGIN;
  const headers = new Headers({ 'CF-Connecting-IP': opts.ip ?? '203.0.113.7' });
  if (opts.cookie) headers.set('Cookie', opts.cookie);
  const write = method !== 'GET';
  if (write) headers.set('Content-Type', 'application/json');
  if (write && opts.origin !== null) headers.set('Origin', opts.origin ?? base);
  return worker.fetch(new Request(base + path, { method, headers, body: write ? JSON.stringify(opts.body ?? {}) : undefined }), env);
}

/** "name=value" pairs from a response's Set-Cookie headers, ready to send back. */
export function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

/** Signs in through fake mode (the full redirect dance) and optionally picks a name. Returns the session cookie. */
export async function signIn(env: Env, email: string, name?: string): Promise<string> {
  const start = await call(env, 'GET', `/api/auth/google?return=/&as=${encodeURIComponent(email)}`);
  const callback = await call(env, 'GET', new URL(start.headers.get('Location')!).pathname + new URL(start.headers.get('Location')!).search, {
    cookie: cookiesFrom(start),
  });
  const session = callback.headers.getSetCookie().find((c) => c.startsWith('__Host-mapped_session='))!.split(';')[0];
  if (name) await call(env, 'POST', '/api/auth/name', { cookie: session, body: { name } });
  return session;
}
