import type { LogEntry } from '../game/log.ts';
import type { Region } from '../game/ranking.ts';
import type { GameConfig, Mode } from '../game/types.ts';
import type { BoardResponse, GameResult, MyGamesResponse, StartResponse, User } from './types.ts';

export class ApiError extends Error {
  /** 0 when the server couldn't be reached */
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Starting a game never waits longer than this; past it the game starts offline. */
export const START_TIMEOUT_MS = 1500;
const TIMEOUT_MS = 10_000;

async function request<T>(method: string, path: string, body?: unknown, timeoutMs = TIMEOUT_MS): Promise<T> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(path, {
      method,
      signal: abort.signal,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? 'server', data.message ?? 'Something went wrong.');
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'offline', "Couldn't reach Mapped.");
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  me: () => request<{ user: User | null }>('GET', '/api/me'),
  checkName: (name: string) => request<{ available: boolean; reason?: 'invalid' | 'taken' }>('GET', `/api/auth/name?name=${encodeURIComponent(name)}`),
  setName: (name: string) => request<{ user: User }>('POST', '/api/auth/name', { name }),
  signOut: () => request<object>('POST', '/api/auth/signout', {}),
  deleteAccount: (confirm: string) => request<object>('DELETE', '/api/me', { confirm }),
  startGame: (config: GameConfig) => request<StartResponse>('POST', '/api/games', { config }, START_TIMEOUT_MS),
  finishGame: (id: string, log: LogEntry[]) => request<GameResult>('POST', `/api/games/${id}/finish`, { log }),
  claim: (claims: { id: string; claim: string }[]) => request<{ results: GameResult[] }>('POST', '/api/games/claim', { claims }),
  board: (mode: Mode, region: Region) => request<BoardResponse>('GET', `/api/boards/${mode}/${region}`),
  myGames: () => request<MyGamesResponse>('GET', '/api/me/games'),
};

/** Where the browser goes to sign in; the Worker sends it on to Google and back to `returnPath`. */
export const signInHref = (returnPath: string) => `/api/auth/google?return=${encodeURIComponent(returnPath)}`;
