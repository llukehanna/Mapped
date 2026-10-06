import { deleteMe, googleCallback, googleStart, me, nameAvailable, setName, signOut } from './auth.ts';
import type { Env } from './env.ts';
import { checkWrite, errorResponse, HttpError } from './http.ts';

type Handler = (req: Request, env: Env, params: string[]) => Promise<Response>;

const ROUTES: [method: string, path: RegExp, handler: Handler][] = [
  ['GET', /^\/api\/auth\/google$/, googleStart],
  ['GET', /^\/api\/auth\/google\/callback$/, googleCallback],
  ['GET', /^\/api\/auth\/name$/, nameAvailable],
  ['POST', /^\/api\/auth\/name$/, setName],
  ['POST', /^\/api\/auth\/signout$/, signOut],
  ['GET', /^\/api\/me$/, me],
  ['DELETE', /^\/api\/me$/, deleteMe],
];

/** Only /api/* reaches the Worker (assets.run_worker_first); everything else is static. */
export async function handle(req: Request, env: Env): Promise<Response> {
  const path = new URL(req.url).pathname;
  try {
    const matching = ROUTES.filter(([, pattern]) => pattern.test(path));
    if (matching.length === 0) throw new HttpError(404, 'not_found', 'No such endpoint.');
    const route = matching.find(([method]) => method === req.method);
    if (!route) throw new HttpError(405, 'method', 'Method not allowed.');
    checkWrite(req);
    return await route[2](req, env, path.match(route[1])!.slice(1));
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e);
    // Never log request bodies, cookies or tokens.
    console.error('api error', req.method, path, e instanceof Error ? e.message : String(e));
    return errorResponse(new HttpError(500, 'server', 'Something went wrong.'));
  }
}

export default { fetch: handle };
