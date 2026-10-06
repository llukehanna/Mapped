import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, signInHref } from '../../src/api/client.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('api client', () => {
  it('sends JSON writes and returns the parsed body', async () => {
    const fetch = vi.fn(async (_path: string, _init: RequestInit) => Response.json({ user: { name: 'meridian', email: 'a@b.c' } }));
    vi.stubGlobal('fetch', fetch);
    expect(await api.setName('meridian')).toEqual({ user: { name: 'meridian', email: 'a@b.c' } });
    const [path, init] = fetch.mock.calls[0];
    expect(path).toBe('/api/auth/name');
    expect(init).toMatchObject({ method: 'POST', body: '{"name":"meridian"}', headers: { 'Content-Type': 'application/json' } });
  });

  it('turns error responses into ApiErrors with the server code', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'taken', message: 'That name is taken.' }, { status: 409 }));
    await expect(api.setName('x')).rejects.toMatchObject({ status: 409, code: 'taken', message: 'That name is taken.' });
  });

  it('reports network failures as offline', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(api.me()).rejects.toEqual(new ApiError(0, 'offline', "Couldn't reach Mapped."));
  });

  it('gives up on a slow game start after 1.5 s', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', (_path: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted')))));
    const started = api.startGame({ mode: 'type', scope: { continents: [], subregions: [] }, timeLimitSec: null });
    const check = expect(started).rejects.toMatchObject({ code: 'offline' });
    await vi.advanceTimersByTimeAsync(1500);
    await check;
  });

  it('sign-in links carry the return path', () => {
    expect(signInHref('/leaderboards/type/world')).toBe('/api/auth/google?return=%2Fleaderboards%2Ftype%2Fworld');
  });
});
