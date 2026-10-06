import { cleanName, NAME_RULE } from '../src/api/names.ts';
import type { User } from '../src/api/types.ts';
import { fromBase64url, hmac, randomToken, sha256 } from './crypto.ts';
import type { Env } from './env.ts';
import { cookie, getCookie, HttpError, json, readBody, redirect } from './http.ts';

export const SESSION_COOKIE = '__Host-mapped_session';
const FLOW_COOKIE = '__Host-mapped_oauth';
const DAY_MS = 86_400_000;
const SESSION_DAYS = 365;
/** Sessions with less than this left are renewed on the next visit. */
const RENEW_UNDER_DAYS = 182;

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  expiresAt: number;
  tokenHash: string;
}

const sessionHash = (env: Env, token: string) => hmac(env.AUTH_SECRET, `session:${token}`);

export async function currentUser(req: Request, env: Env): Promise<SessionUser | null> {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await sessionHash(env, token);
  const row = await env.DB.prepare(
    'SELECT u.id, u.name, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?',
  )
    .bind(tokenHash, Date.now())
    .first<{ id: string; name: string | null; email: string; expires_at: number }>();
  return row && { id: row.id, name: row.name, email: row.email, expiresAt: row.expires_at, tokenHash };
}

export async function requireUser(req: Request, env: Env): Promise<SessionUser> {
  const user = await currentUser(req, env);
  if (!user) throw new HttpError(401, 'signed_out', 'Sign in first.');
  return user;
}

const publicUser = (u: { name: string | null; email: string }): User => ({ name: u.name, email: u.email });

/** GET /api/me. Also renews a session past its halfway point, so regular players stay signed in. */
export async function me(req: Request, env: Env): Promise<Response> {
  const user = await currentUser(req, env);
  if (!user) return json({ user: null });
  const body = { user: publicUser(user) };
  if (user.expiresAt - Date.now() > RENEW_UNDER_DAYS * DAY_MS) return json(body);
  await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(Date.now() + SESSION_DAYS * DAY_MS, user.tokenHash).run();
  const token = getCookie(req, SESSION_COOKIE)!;
  return json(body, { headers: { 'Set-Cookie': cookie(SESSION_COOKIE, token, SESSION_DAYS * 86_400) } });
}

/** Only same-site paths: "/x", never "//evil.com", open redirects or data URIs. Uses URL parsing to validate. */
export function safeReturn(value: string | null): string {
  if (!value || value.length > 200 || /[\x00-\x1f\x7f]/.test(value) || !value.startsWith('/')) return '/';
  try {
    const url = new URL(value, 'http://x');
    if (url.origin !== 'http://x') return '/';
    const result = url.pathname + url.search + url.hash;
    if (result.startsWith('//') || result.startsWith('/\\')) return '/';
    return result;
  } catch {
    return '/';
  }
}

function withParam(path: string, key: string, value: string): string {
  const url = new URL(path, 'http://x');
  url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
}

/** GET /api/auth/google?return=/path */
export async function googleStart(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const back = safeReturn(url.searchParams.get('return'));
  const state = randomToken(16);
  const verifier = randomToken(32);
  const flow = cookie(FLOW_COOKIE, `${state}.${verifier}.${encodeURIComponent(back)}`, 600);
  const callback = `${url.origin}/api/auth/google/callback`;
  if (env.AUTH_MODE === 'fake') {
    const as = url.searchParams.get('as') ?? getCookie(req, 'mapped_fake_as') ?? 'player@example.com';
    return redirect(`${callback}?code=${encodeURIComponent(`fake:${as}`)}&state=${state}`, [flow]);
  }
  const google = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  google.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callback,
    response_type: 'code',
    scope: 'openid email',
    state,
    code_challenge: await sha256(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return redirect(google.toString(), [flow]);
}

export interface Identity {
  sub: string;
  email: string;
}

/**
 * The id_token's claims. It came straight from Google's token endpoint over TLS, so its signature
 * needn't be checked (OpenID Connect Core 3.1.3.7); the issuer, audience, expiry and email still are.
 */
export function checkIdToken(idToken: string, clientId: string, now: number): Identity | null {
  try {
    const claims = JSON.parse(new TextDecoder().decode(fromBase64url(idToken.split('.')[1])));
    const issuer = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    if (!issuer || claims.aud !== clientId || !(claims.exp * 1000 > now) || claims.email_verified !== true) return null;
    if (typeof claims.sub !== 'string' || typeof claims.email !== 'string') return null;
    return { sub: claims.sub, email: claims.email.toLowerCase() };
  } catch {
    return null;
  }
}

async function exchange(env: Env, code: string, verifier: string, redirectUri: string): Promise<Identity | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    if (!res.ok) return null;
    const { id_token } = (await res.json()) as { id_token?: string };
    return id_token ? checkIdToken(id_token, env.GOOGLE_CLIENT_ID, Date.now()) : null;
  } catch {
    return null;
  }
}

/** GET /api/auth/google/callback?code&state */
export async function googleCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const [state, verifier, ...rest] = (getCookie(req, FLOW_COOKIE) ?? '').split('.');
  let back = '/';
  try {
    back = safeReturn(decodeURIComponent(rest.join('.')));
  } catch {
    // keep '/'
  }
  const clear = cookie(FLOW_COOKIE, '', 0);
  const failed = () => redirect(withParam(back, 'auth', 'failed'), [clear]);
  const code = url.searchParams.get('code');
  if (!state || !verifier || !code || url.searchParams.get('state') !== state) return failed();

  const identity =
    env.AUTH_MODE === 'fake'
      ? code.startsWith('fake:') && { sub: code, email: code.slice(5).toLowerCase() }
      : await exchange(env, code, verifier, `${url.origin}/api/auth/google/callback`);
  if (!identity) return failed();

  const now = Date.now();
  const user = await env.DB.prepare(
    'INSERT INTO users (id, google_sub, email, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (google_sub) DO UPDATE SET email = excluded.email RETURNING id',
  )
    .bind(randomToken(16), identity.sub, identity.email, now)
    .first<{ id: string }>();
  const token = randomToken(32);
  const oldToken = getCookie(req, SESSION_COOKIE);
  const statements = [
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(
      await sessionHash(env, token),
      user!.id,
      now,
      now + SESSION_DAYS * DAY_MS,
    ),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
  ];
  if (oldToken) {
    statements.push(env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sessionHash(env, oldToken)));
  }
  await env.DB.batch(statements);
  return redirect(back, [clear, cookie(SESSION_COOKIE, token, SESSION_DAYS * 86_400)]);
}

/** GET /api/auth/name?name= */
export async function nameAvailable(req: Request, env: Env): Promise<Response> {
  const name = cleanName(new URL(req.url).searchParams.get('name'));
  if (!name) return json({ available: false, reason: 'invalid' });
  const taken = await env.DB.prepare('SELECT 1 AS x FROM users WHERE name_key = ?').bind(name.toLowerCase()).first();
  return json(taken ? { available: false, reason: 'taken' } : { available: true });
}

/** POST /api/auth/name { name }: once per account. */
export async function setName(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  const name = cleanName((await readBody(req)).name);
  if (!name) throw new HttpError(400, 'invalid', `${NAME_RULE}.`);
  if (user.name !== null) throw new HttpError(409, 'has_name', 'You already have a name.');
  try {
    const result = await env.DB.prepare('UPDATE users SET name = ?, name_key = ? WHERE id = ? AND name IS NULL').bind(name, name.toLowerCase(), user.id).run();
    if (result.meta.changes === 0) throw new HttpError(409, 'has_name', 'You already have a name.');
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (String(e).includes('UNIQUE')) throw new HttpError(409, 'taken', 'That name is taken.');
    throw e;
  }
  return json({ user: publicUser({ name, email: user.email }) });
}

/** POST /api/auth/signout */
export async function signOut(req: Request, env: Env): Promise<Response> {
  const token = getCookie(req, SESSION_COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sessionHash(env, token)).run();
  return json({}, { headers: { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) } });
}

/** DELETE /api/me { confirm }: confirm is the display name (or the email, before a name is picked). */
export async function deleteMe(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  if ((await readBody(req)).confirm !== (user.name ?? user.email)) throw new HttpError(400, 'confirm', 'Type your name to confirm.');
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id).run();
  return json({}, { headers: { 'Set-Cookie': cookie(SESSION_COOKIE, '', 0) } });
}
