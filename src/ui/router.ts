import { useEffect, useState } from 'react';
import { BOARD_MODES, BOARD_REGIONS, type Region } from '../game/ranking.ts';
import type { Topic } from '../game/topics.ts';
import type { Mode } from '../game/types.ts';

export type Route = { name: 'home' } | { name: 'signin' } | { name: 'me' } | { name: 'board'; topic: Topic; mode: Mode; region: Region };

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/signin') return { name: 'signin' };
  if (path === '/me') return { name: 'me' };
  const board = /^\/leaderboards(?:\/(flags|capitals))?(?:\/([a-z]+)\/([a-z-]+))?$/.exec(path);
  if (board) {
    const topic = (board[1] ?? 'countries') as Topic;
    const mode = (board[2] ?? 'type') as Mode;
    const region = (board[3] ?? 'world') as Region;
    if (BOARD_MODES.includes(mode) && BOARD_REGIONS.includes(region)) return { name: 'board', topic, mode, region };
  }
  return { name: 'home' };
}

export function routePath(route: Route): string {
  if (route.name === 'board') return `/leaderboards/${route.topic === 'countries' ? '' : `${route.topic}/`}${route.mode}/${route.region}`;
  return route.name === 'home' ? '/' : `/${route.name}`;
}

/** The current route and a way to change it. Back and forward work; nothing reloads. */
export function useRoute(): [Route, (route: Route, opts?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (next: Route, { replace = false } = {}) => {
    const path = routePath(next);
    if (path !== window.location.pathname) window.history[replace ? 'replaceState' : 'pushState'](null, '', path);
    setRoute(next);
  };
  return [route, go];
}
