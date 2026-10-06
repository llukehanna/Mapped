import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { D1Database } from '../../worker/env.ts';
import { cleanName } from '../../src/api/names.ts';
import { checkIdToken, safeReturn } from '../../worker/auth.ts';
import { call, cookiesFrom, signIn, startDb, testEnv, wipe } from './harness.ts';

let db: D1Database;
let dispose: () => Promise<void>;
beforeAll(async () => ({ db, dispose } = await startDb()), 30_000);
afterAll(() => dispose());
beforeEach(() => wipe(db));
afterEach(() => vi.unstubAllGlobals());

const idToken = (claims: Record<string, unknown>) =>
  `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
const goodClaims = { iss: 'https://accounts.google.com', aud: 'client-123', exp: Date.now() / 1000 + 600, sub: 'g-1', email: 'Ana@Example.com', email_verified: true };

describe('pure helpers', () => {
  it('safeReturn keeps same-site paths only', () => {
    expect(safeReturn('/leaderboards/type/world')).toBe('/leaderboards/type/world');
    expect(safeReturn('//evil.com')).toBe('/');
    expect(safeReturn('/\\evil.com')).toBe('/');
    expect(safeReturn('https://evil.com')).toBe('/');
    expect(safeReturn(null)).toBe('/');
    expect(safeReturn('/\t/evil.com')).toBe('/');
    expect(safeReturn('/\n/evil.com')).toBe('/');
    expect(safeReturn('/ /evil.com')).toBe('/%20/evil.com');
    expect(safeReturn('/.//evil.com')).toBe('/');
    expect(safeReturn('/..//evil.com')).toBe('/');
    expect(safeReturn('/%2e//evil.com')).toBe('/');
    expect(safeReturn('/a/..//evil.com')).toBe('/');
  });

  it('cleanName enforces the name rules', () => {
    expect(cleanName('  meridian ')).toBe('meridian');
    expect(cleanName('lat_long-2')).toBe('lat_long-2');
    for (const bad of ['ab', 'x'.repeat(21), 'a  b', 'émile', 'ana!', 42]) expect(cleanName(bad)).toBeNull();
  });

  it('checkIdToken accepts only Google tokens for this app with a verified email', () => {
    const now = Date.now();
    expect(checkIdToken(idToken(goodClaims), 'client-123', now)).toEqual({ sub: 'g-1', email: 'ana@example.com' });
    expect(checkIdToken(idToken({ ...goodClaims, aud: 'other' }), 'client-123', now)).toBeNull();
    expect(checkIdToken(idToken({ ...goodClaims, iss: 'https://evil.com' }), 'client-123', now)).toBeNull();
    expect(checkIdToken(idToken({ ...goodClaims, exp: now / 1000 - 1 }), 'client-123', now)).toBeNull();
    expect(checkIdToken(idToken({ ...goodClaims, email_verified: false }), 'client-123', now)).toBeNull();
    expect(checkIdToken('garbage', 'client-123', now)).toBeNull();
  });
});

describe('request guard', () => {
  it('rejects writes from other origins or without JSON', async () => {
    const env = testEnv(db);
    expect((await call(env, 'POST', '/api/auth/signout', { origin: 'https://evil.com' })).status).toBe(403);
    expect((await call(env, 'POST', '/api/auth/signout', { origin: null })).status).toBe(403);
  });

  it('404s unknown paths and 405s wrong methods', async () => {
    const env = testEnv(db);
    expect((await call(env, 'GET', '/api/nope')).status).toBe(404);
    expect((await call(env, 'GET', '/api/auth/signout')).status).toBe(405);
  });

  it('never caches API responses', async () => {
    expect((await call(testEnv(db), 'GET', '/api/me')).headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('Google sign-in', () => {
  it('sends you to Google with PKCE and a state cookie', async () => {
    const res = await call(testEnv(db, { AUTH_MODE: 'google' }), 'GET', '/api/auth/google?return=/me', { base: 'https://mapped.lukeghanna.com' });
    expect(res.status).toBe(302);
    const to = new URL(res.headers.get('Location')!);
    expect(to.origin + to.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(to.searchParams.get('client_id')).toBe('client-123');
    expect(to.searchParams.get('redirect_uri')).toBe('https://mapped.lukeghanna.com/api/auth/google/callback');
    expect(to.searchParams.get('scope')).toBe('openid email');
    expect(to.searchParams.get('code_challenge_method')).toBe('S256');
    expect(res.headers.get('Set-Cookie')).toMatch(/^__Host-mapped_oauth=.+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=600$/);
  });

  it('exchanges the code, creates the user and session, and goes back where you were', async () => {
    const env = testEnv(db, { AUTH_MODE: 'google' });
    const token = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ id_token: idToken(goodClaims) }));
    vi.stubGlobal('fetch', token);
    const base = 'https://mapped.lukeghanna.com';
    const start = await call(env, 'GET', '/api/auth/google?return=/leaderboards/type/world', { base });
    const state = new URL(start.headers.get('Location')!).searchParams.get('state');
    const back = await call(env, 'GET', `/api/auth/google/callback?code=abc&state=${state}`, { base, cookie: cookiesFrom(start) });
    expect(back.status).toBe(302);
    expect(back.headers.get('Location')).toBe('/leaderboards/type/world');
    const sent = token.mock.calls[0][1].body as URLSearchParams;
    expect(sent.get('code')).toBe('abc');
    expect(sent.get('code_verifier')).toHaveLength(43);
    const me = await call(env, 'GET', '/api/me', { cookie: cookiesFrom(back).split('; ').find((c) => c.startsWith('__Host-mapped_session'))! });
    expect(await me.json()).toEqual({ user: { name: null, email: 'ana@example.com' } });
  });

  it('a returning Google account is the same user, with its email refreshed', async () => {
    const env = testEnv(db);
    await signIn(env, 'ana@example.com', 'meridian');
    await db.prepare("UPDATE users SET google_sub = 'fake:new@example.com'").run();
    const again = await signIn(env, 'new@example.com');
    expect(await (await call(env, 'GET', '/api/me', { cookie: again })).json()).toEqual({ user: { name: 'meridian', email: 'new@example.com' } });
    expect((await db.prepare('SELECT count(*) AS n FROM users').first<{ n: number }>())!.n).toBe(1);
  });

  it('fails back to the page on a state mismatch, a refused token or a cancel', async () => {
    const env = testEnv(db, { AUTH_MODE: 'google' });
    vi.stubGlobal('fetch', async () => Response.json({ id_token: idToken({ ...goodClaims, aud: 'someone-else' }) }));
    const start = await call(env, 'GET', '/api/auth/google?return=/me');
    const state = new URL(start.headers.get('Location')!).searchParams.get('state');
    const cookie = cookiesFrom(start);
    for (const query of [`code=abc&state=wrong`, `code=abc&state=${state}`, `error=access_denied&state=${state}`]) {
      const res = await call(env, 'GET', `/api/auth/google/callback?${query}`, { cookie });
      expect(res.headers.get('Location')).toBe('/me?auth=failed');
      expect(res.headers.getSetCookie().some((c) => c.startsWith('__Host-mapped_session'))).toBe(false);
    }
  });

  it('fake mode is refused anywhere but localhost', async () => {
    const res = await call(testEnv(db), 'GET', '/api/auth/google?as=x@y.z', { base: 'https://mapped.lukeghanna.com' });
    expect(res.status).toBe(500);
    const me = await call(testEnv(db), 'GET', '/api/me', { base: 'https://mapped.lukeghanna.com' });
    expect(me.status).toBe(500);
    const callback = await call(testEnv(db), 'GET', '/api/auth/google/callback?code=abc&state=xyz', { base: 'https://mapped.lukeghanna.com' });
    expect(callback.status).toBe(500);
  });

  it('control characters in return parameter are rejected', async () => {
    const env = testEnv(db);
    const res = await call(env, 'GET', '/api/auth/google?return=%2F%09%2Fevil.com');
    const state = new URL(res.headers.get('Location')!).searchParams.get('state');
    const callback = await call(env, 'GET', `/api/auth/google/callback?code=${encodeURIComponent('fake:test@test.com')}&state=${state}`, {
      cookie: cookiesFrom(res),
    });
    expect(callback.headers.get('Location')).toBe('/');
  });

  it('fetch errors in exchange are handled gracefully', async () => {
    const env = testEnv(db, { AUTH_MODE: 'google' });
    vi.stubGlobal('fetch', async () => {
      throw new Error('network error');
    });
    const start = await call(env, 'GET', '/api/auth/google?return=/me');
    const state = new URL(start.headers.get('Location')!).searchParams.get('state');
    const callback = await call(env, 'GET', `/api/auth/google/callback?code=abc&state=${state}`, { cookie: cookiesFrom(start) });
    expect(callback.headers.get('Location')).toBe('/me?auth=failed');
  });

  it('dot-slash paths that normalize to another host are rejected', async () => {
    const env = testEnv(db);
    const res = await call(env, 'GET', '/api/auth/google?return=%2F.%2F%2Fevil.com');
    const state = new URL(res.headers.get('Location')!).searchParams.get('state');
    const callback = await call(env, 'GET', `/api/auth/google/callback?code=${encodeURIComponent('fake:test@test.com')}&state=${state}`, {
      cookie: cookiesFrom(res),
    });
    expect(callback.headers.get('Location')).toBe('/');
  });
});

describe('names, sign-out and deleting an account', () => {
  it('a name can be picked once, and is unique regardless of case', async () => {
    const env = testEnv(db);
    const ana = await signIn(env, 'ana@example.com');
    expect(await (await call(env, 'GET', '/api/auth/name?name=Meridian')).json()).toEqual({ available: true });
    expect((await call(env, 'POST', '/api/auth/name', { cookie: ana, body: { name: 'Meridian' } })).status).toBe(200);
    expect((await call(env, 'POST', '/api/auth/name', { cookie: ana, body: { name: 'Other' } })).status).toBe(409);
    const bo = await signIn(env, 'bo@example.com');
    const taken = await call(env, 'POST', '/api/auth/name', { cookie: bo, body: { name: 'meridian' } });
    expect([taken.status, (await taken.json()).error]).toEqual([409, 'taken']);
    expect(await (await call(env, 'GET', '/api/auth/name?name=MERIDIAN')).json()).toEqual({ available: false, reason: 'taken' });
    expect(await (await call(env, 'GET', '/api/auth/name?name=a!')).json()).toEqual({ available: false, reason: 'invalid' });
  });

  it('signing out ends that session', async () => {
    const env = testEnv(db);
    const ana = await signIn(env, 'ana@example.com');
    await call(env, 'POST', '/api/auth/signout', { cookie: ana });
    expect(await (await call(env, 'GET', '/api/me', { cookie: ana })).json()).toEqual({ user: null });
  });

  it('deleting the account needs the name typed, and removes everything', async () => {
    const env = testEnv(db);
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    await db.prepare("INSERT INTO games (id, user_id, ip_hash, config, mode, scope_key, seed, started_at) VALUES ('g1', (SELECT id FROM users), 'h', '{}', 'type', 'world', 1, 0)").run();
    expect((await call(env, 'DELETE', '/api/me', { cookie: ana, body: { confirm: 'nope' } })).status).toBe(400);
    expect((await call(env, 'DELETE', '/api/me', { cookie: ana, body: { confirm: 'meridian' } })).status).toBe(200);
    for (const table of ['users', 'sessions', 'games']) {
      expect((await db.prepare(`SELECT count(*) AS n FROM ${table}`).first<{ n: number }>())!.n).toBe(0);
    }
  });

  it('a session past its halfway point is renewed on /api/me', async () => {
    const env = testEnv(db);
    const ana = await signIn(env, 'ana@example.com');
    expect((await call(env, 'GET', '/api/me', { cookie: ana })).headers.get('Set-Cookie')).toBeNull();
    await db.prepare('UPDATE sessions SET expires_at = ?').bind(Date.now() + 100 * 86_400_000).run();
    const res = await call(env, 'GET', '/api/me', { cookie: ana });
    expect(res.headers.get('Set-Cookie')).toMatch(/Max-Age=31536000/);
    const row = await db.prepare('SELECT expires_at FROM sessions').first<{ expires_at: number }>();
    expect(row!.expires_at).toBeGreaterThan(Date.now() + 364 * 86_400_000);
  });

  it('signing in again invalidates the previous session', async () => {
    const env = testEnv(db);
    const first = await signIn(env, 'ana@example.com');
    expect(await (await call(env, 'GET', '/api/me', { cookie: first })).json()).toEqual({ user: { name: null, email: 'ana@example.com' } });
    const start = await call(env, 'GET', '/api/auth/google?return=/&as=ana@example.com');
    const state = new URL(start.headers.get('Location')!).searchParams.get('state');
    const callback = await call(env, 'GET', `/api/auth/google/callback?code=${encodeURIComponent('fake:ana@example.com')}&state=${state}`, {
      cookie: cookiesFrom(start) + '; ' + first,
    });
    expect(await (await call(env, 'GET', '/api/me', { cookie: first })).json()).toEqual({ user: null });
    const newSession = callback.headers.getSetCookie().find((c) => c.startsWith('__Host-mapped_session='))!.split(';')[0];
    expect(await (await call(env, 'GET', '/api/me', { cookie: newSession })).json()).toEqual({ user: { name: null, email: 'ana@example.com' } });
  });
});
