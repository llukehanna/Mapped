import { describe, expect, it } from 'vitest';
import { parseRoute, routePath, type Route } from '../../src/ui/router.ts';

describe('routes', () => {
  it('parses every route', () => {
    expect(parseRoute('/')).toEqual({ name: 'home' });
    expect(parseRoute('/signin')).toEqual({ name: 'signin' });
    expect(parseRoute('/me/')).toEqual({ name: 'me' });
    expect(parseRoute('/leaderboards')).toEqual({ name: 'board', mode: 'type', region: 'world' });
    expect(parseRoute('/leaderboards/locate/north-america')).toEqual({ name: 'board', mode: 'locate', region: 'north-america' });
  });

  it('sends unknown paths home', () => {
    for (const path of ['/nope', '/leaderboards/race/world', '/leaderboards/type/mars', '/api/me']) expect(parseRoute(path)).toEqual({ name: 'home' });
  });

  it('round-trips', () => {
    const routes: Route[] = [{ name: 'home' }, { name: 'signin' }, { name: 'me' }, { name: 'board', mode: 'identify', region: 'oceania' }];
    for (const r of routes) expect(parseRoute(routePath(r))).toEqual(r);
  });
});
