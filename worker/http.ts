export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export const errorResponse = (e: HttpError) => json({ error: e.code, message: e.message }, { status: e.status });

export function redirect(location: string, cookies: string[] = []): Response {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}

export const MAX_BODY_BYTES = 262_144;

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', 'That request is too large.');
  try {
    const value: unknown = JSON.parse(text || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, 'bad_json', "That request isn't valid JSON.");
}

/** Writes must come from this site and be JSON, so another site can't act with a visitor's cookie. */
export function checkWrite(req: Request): void {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const sameOrigin = req.headers.get('Origin') === new URL(req.url).origin;
  const isJson = req.headers.get('Content-Type')?.startsWith('application/json') ?? false;
  if (!sameOrigin || !isJson) throw new HttpError(403, 'forbidden', 'Requests must come from Mapped.');
}

export function getCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('Cookie') ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export function cookie(name: string, value: string, maxAgeSec: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export const clientIp = (req: Request) => req.headers.get('CF-Connecting-IP') ?? 'unknown';

export const isLocalHost = (req: Request) => ['localhost', '127.0.0.1'].includes(new URL(req.url).hostname);
