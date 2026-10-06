import { deleteMe, googleCallback, googleStart, me, nameAvailable, setName, signOut } from './auth.ts';
import { getBoard, myGames } from './boards.ts';
import type { Env } from './env.ts';
import { claimGames, finishGame, startGame } from './games.ts';
import { checkWrite, errorResponse, HttpError, isLocalHost } from './http.ts';

type Handler = (req: Request, env: Env, params: string[]) => Promise<Response>;

const ROUTES: [method: string, path: RegExp, handler: Handler][] = [
  ['GET', /^\/api\/auth\/google$/, googleStart],
  ['GET', /^\/api\/auth\/google\/callback$/, googleCallback],
  ['GET', /^\/api\/auth\/name$/, nameAvailable],
  ['POST', /^\/api\/auth\/name$/, setName],
  ['POST', /^\/api\/auth\/signout$/, signOut],
  ['GET', /^\/api\/me$/, me],
  ['DELETE', /^\/api\/me$/, deleteMe],
  ['GET', /^\/api\/me\/games$/, myGames],
  ['POST', /^\/api\/games$/, startGame],
  ['POST', /^\/api\/games\/claim$/, claimGames],
  ['POST', /^\/api\/games\/([\w-]{1,64})\/finish$/, (req, env, [id]) => finishGame(req, env, id)],
  ['GET', /^\/api\/boards\/([a-z]{1,10})\/([a-z-]{1,20})$/, (req, env, [mode, region]) => getBoard(req, env, mode, region)],
];

/** Only /api/* reaches the Worker (assets.run_worker_first); everything else is static. */
export async function handle(req: Request, env: Env): Promise<Response> {
  const path = new URL(req.url).pathname;
  try {
    if (env.AUTH_MODE === 'fake' && !isLocalHost(req)) throw new HttpError(500, 'misconfigured', 'Sign-in is misconfigured.');
    const matching = ROUTES.filter(([, pattern]) => pattern.test(path));
    if (matching.length === 0) throw new HttpError(404, 'not_found', 'No such endpoint.');
    const route = matching.find(([method]) => method === req.method);
    if (!route) throw new HttpError(405, 'method', 'Method not allowed.');
    checkWrite(req);
    return await route[2](req, env, path.match(route[1])!.slice(1));
  } catch (e) {
    if (e instanceof HttpError) return errorResponse(e);
    // Never log request bodies, cookies or tokens.
    console.error('api error', req.method, path, req.headers.get('cf-ray') ?? '-', e instanceof Error ? e.message : String(e));
    return errorResponse(new HttpError(500, 'server', 'Something went wrong.'));
  }
}

export default { fetch: handle };
