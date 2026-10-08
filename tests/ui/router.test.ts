import { describe, expect, it } from 'vitest';
import { parseRoute, routePath, type Route } from '../../src/ui/router.ts';

describe('routes', () => {
  it('parses every route', () => {
    expect(parseRoute('/')).toEqual({ name: 'home' });
    expect(parseRoute('/signin')).toEqual({ name: 'signin' });
    expect(parseRoute('/me/')).toEqual({ name: 'me' });
    expect(parseRoute('/leaderboards')).toEqual({ name: 'board', topic: 'countries', mode: 'type', region: 'world' });
    expect(parseRoute('/leaderboards/locate/north-america')).toEqual({ name: 'board', topic: 'countries', mode: 'locate', region: 'north-america' });
  });

  it('sends unknown paths home', () => {
    for (const path of ['/nope', '/leaderboards/race/world', '/leaderboards/type/mars', '/api/me']) expect(parseRoute(path)).toEqual({ name: 'home' });
  });

  it('round-trips', () => {
    const routes: Route[] = [
      { name: 'home' },
      { name: 'signin' },
      { name: 'me' },
      { name: 'board', topic: 'countries', mode: 'identify', region: 'oceania' },
      { name: 'board', topic: 'flags', mode: 'locate', region: 'asia' },
      { name: 'board', topic: 'capitals', mode: 'type', region: 'world' },
    ];
    for (const r of routes) expect(parseRoute(routePath(r))).toEqual(r);
  });

  it('topic boards', () => {
    expect(parseRoute('/leaderboards/type/world')).toEqual({ name: 'board', topic: 'countries', mode: 'type', region: 'world' });
    expect(parseRoute('/leaderboards/flags/locate/asia')).toEqual({ name: 'board', topic: 'flags', mode: 'locate', region: 'asia' });
    expect(parseRoute('/leaderboards/flags')).toEqual({ name: 'board', topic: 'flags', mode: 'type', region: 'world' });
    expect(parseRoute('/leaderboards/countries/type/world')).toEqual({ name: 'home' });
    expect(routePath({ name: 'board', topic: 'capitals', mode: 'type', region: 'europe' })).toBe('/leaderboards/capitals/type/europe');
    expect(routePath({ name: 'board', topic: 'countries', mode: 'type', region: 'europe' })).toBe('/leaderboards/type/europe');
  });
});
