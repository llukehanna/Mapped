# Mapped v2: accounts and leaderboards. Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players sign in with Google, save their games, and compete on 21 leaderboards (each mode × World or one continent), ranked by fewest hints then fastest time, with the server timing and replaying every ranked run.

**Architecture:**

- **Worker for `/api/*` only.** A Cloudflare Worker (`worker/`) answers `/api/*` and nothing else. The Vite app is still served as static assets; `assets.run_worker_first: ["/api/*"]`, plus a single-page-app fallback for client routes.
- **D1 holds the data:** users, sessions, games and bests.
- **The game logic is shared.** The reducer now records every action that changed the game in `state.log`. The Worker imports `src/game/*`, so it can replay a log from its own seed and its own clock.
- **The browser** gets a small API client, a History-API router, and centred cards over a dimmed map.

**Tech Stack:**

- Existing: Vite 8, React 19, TypeScript 7, Vitest 5, Playwright 1.63.
- Wrangler 4.147: Workers, D1, and `getPlatformProxy` to run a real local D1 in Node tests.
- Google OpenID Connect (authorization code + PKCE, all server-side).

**Spec:** `docs/superpowers/specs/2026-10-05-mapped-v2-accounts-design.md` (read it alongside this plan)

## Global Constraints

- **Node 24+.** `.ts` scripts run directly with `node`. `tsconfig` uses `allowImportingTsExtensions` and `erasableSyntaxOnly`: write `.ts` extensions in imports, and no enums, namespaces or constructor parameter properties.
- **One `tsconfig.json`** covers `src`, `worker`, `tests`, `scripts` and `e2e`. Worker code uses only web-standard APIs (`Request`, `Response`, `crypto.subtle`, `fetch`) plus the small D1 interface in `worker/env.ts`. Don't add `@cloudflare/workers-types` (it conflicts with the DOM lib).
- **Worker tests run in Node with Vitest 5.** They get bindings from `getPlatformProxy` in `wrangler`. Don't add `@cloudflare/vitest-pool-workers`: it requires Vitest 4.
- **Free plans only.** The Worker runs only for `/api/*`. No paid Cloudflare features. No email service.
- **Sign-in is Google only,** with scopes `openid email`. Google's JavaScript is never loaded on the page; the CSP in `src/headers.ts` and `public/_headers` is unchanged.
- **Cookies** are `__Host-` prefixed with `Path=/; HttpOnly; Secure; SameSite=Lax`. Every non-GET API call must be JSON from the same origin.
- **Display names:** 3–20 characters from `[A-Za-z0-9 _-]`, trimmed, no double spaces, unique case-insensitively. Google names and emails are never shown publicly.
- **Anti-cheat constants:** `MIN_FIND_GAP_MS = 100`, `MIN_MS_PER_COUNTRY = 300`, `CLOCK_TOLERANCE_MS = 2000`. Game starts are limited to 200 per IP per hour.
- **Copy rules (from v1):** no em dashes in UI text; plain, short sentences; Geist fonts; gold accent. Use existing tokens (`var(--accent)`, `var(--panel-bg)`, …).
- **Opaque cards.** `backdrop-filter` isn't applied in every browser, so cards that sit over other content are opaque (panel colour layered over `var(--page)`).
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Deviations from the spec, decided while building and testing this plan

- **A log that fails to replay** (bad shape, impossible actions) is answered with `422 unverified` and the game row is deleted, instead of being stored with empty stats. Runs that replay but are too fast or out of step with the server clock are still stored as `Unranked: couldn't verify`.
- **The save card's Sign in button** goes straight to Google, a single click; the sign-in card is used from the setup corner and `/signin`.
- **The Origin check** compares against the request's own origin, so `APP_ORIGIN` isn't needed.
- **Full-stack local dev** is `npm run dev:full` (build + `wrangler dev` on 8787 in fake sign-in mode). `npm run dev` (Vite only) still works, offline.
- **`wrangler dev` needs `--local-upstream localhost:<port>`.** Without it the Worker sees the production hostname and refuses fake mode.

## File map

| File | Responsibility |
| --- | --- |
| `src/game/log.ts` | Action-log types; `toLogged` / `toAction` |
| `src/game/ranking.ts` | Boards, labels, `compareRuns`, `parseConfig`, anti-cheat constants |
| `src/api/types.ts` | JSON shapes shared by Worker and browser |
| `src/api/names.ts` | Display-name rule (shared) |
| `worker/replay.ts` | `parseLog`, `replay`, `judge` (pure) |
| `worker/env.ts` | `Env` and the D1 interface subset |
| `worker/crypto.ts` | Random tokens, HMAC, SHA-256, base64url |
| `worker/http.ts` | JSON responses, errors, cookies, write guard |
| `worker/auth.ts` | Google OAuth + fake mode, sessions, names, sign-out, delete |
| `worker/games.ts` | Start, finish (judge), claim |
| `worker/boards.ts` | Ranks, bests, leaderboard and Your games queries |
| `worker/index.ts` | Route table and error mapping |
| `migrations/0001_init.sql` | Schema |
| `scripts/recompute-bests.sql` | Rebuild `bests` after manual deletes |
| `src/api/client.ts` | Typed fetch wrappers with timeouts |
| `src/api/resume.ts` | sessionStorage for claims and the review to restore |
| `src/api/session.ts` | `useSession()` |
| `src/ui/router.ts` | `parseRoute`, `routePath`, `useRoute` |
| `src/ui/accountText.ts` | Save-card text, email masking |
| `src/ui/CenterCard.tsx`, `SignInCard.tsx`, `NameCard.tsx`, `UserMenu.tsx`, `DeleteAccount.tsx`, `SaveCard.tsx`, `Leaderboard.tsx`, `YourGames.tsx`, `RankedTag.tsx` | New UI |
| `src/styles/account.css` | Styles for all of the above |
| `tests/worker/harness.ts`, `play.ts`, `wrangler.test.jsonc` | Worker test harness (real local D1) and honest-log builder |

---
### Task 1: Record an action log in the game state

The server can only replay what the browser did if the browser records it. The log lives in `GameState` and the reducer appends to it. That keeps it pure, safe under StrictMode, and identical to what the server's own replay produces. Hints gain a `now` so they can be timed, and a `restore` action brings back a saved review after the Google round trip.

**Files:**
- Create: `src/game/log.ts`, `tests/game/log.test.ts`
- Modify: `src/game/types.ts`, `src/game/reducer.ts`, `tests/game/reducer.test.ts`, `src/App.tsx` (two hint dispatches)

**Interfaces:**
- Produces:
  - `LoggedAction`, `LogEntry { t: number; a: LoggedAction }`, `toLogged(action): LoggedAction | null`, `toAction(entry, startedAt): GameAction`.
  - `GameState.startedAt: number | null` and `GameState.log: LogEntry[]`.
  - `GameAction` gains `{ type: 'hint'; rand; now }` and `{ type: 'restore'; state: GameState }`.
  - `reduce()` appends `{ t: now - startedAt, a }` for every action that changed the state (never for `start`, `toSetup` or `restore`).

- [ ] **Step 1: Write the failing test**

**`tests/game/log.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { toAction, toLogged } from '../../src/game/log.ts';
import { initialState, reduce } from '../../src/game/reducer.ts';
import type { GameConfig, GameState } from '../../src/game/types.ts';

const POOL = ['ARG', 'BRA', 'CHL'];
const cfg = (mode: GameConfig['mode'] = 'type'): GameConfig => ({ mode, scope: { continents: ['south-america'], subregions: [] }, timeLimitSec: null });
const start = (mode: GameConfig['mode'] = 'type'): GameState =>
  reduce(initialState(cfg(mode)), { type: 'start', config: cfg(mode), pool: POOL, order: POOL, now: 1000 });

describe('action log', () => {
  it('starts empty and records the start time', () => {
    const s = start();
    expect(s.startedAt).toBe(1000);
    expect(s.log).toEqual([]);
  });

  it('records each action that changed the game, with ms since the start', () => {
    let s = start();
    s = reduce(s, { type: 'found', id: 'BRA', now: 2500 });
    s = reduce(s, { type: 'hint', rand: 0.4, now: 3000 });
    s = reduce(s, { type: 'pause', now: 3500 });
    s = reduce(s, { type: 'resume', now: 9000 });
    s = reduce(s, { type: 'found', id: 'ARG', now: 9500, corrected: true });
    expect(s.log).toEqual([
      { t: 1500, a: { type: 'found', id: 'BRA' } },
      { t: 2000, a: { type: 'hint', rand: 0.4 } },
      { t: 2500, a: { type: 'pause' } },
      { t: 8000, a: { type: 'resume' } },
      { t: 8500, a: { type: 'found', id: 'ARG', corrected: true } },
    ]);
  });

  it('skips actions that changed nothing: repeats, outsiders, ticks before time is up', () => {
    let s = reduce(start(), { type: 'found', id: 'BRA', now: 2000 });
    s = reduce(s, { type: 'found', id: 'BRA', now: 2100 });
    s = reduce(s, { type: 'found', id: 'FRA', now: 2200 });
    s = reduce(s, { type: 'tick', now: 2300 });
    s = reduce(s, { type: 'resume', now: 2400 });
    expect(s.log).toHaveLength(1);
  });

  it('records the tick that ends a timed game', () => {
    const timed = { ...cfg(), timeLimitSec: 60 };
    let s = reduce(initialState(timed), { type: 'start', config: timed, pool: POOL, order: POOL, now: 0 });
    s = reduce(s, { type: 'tick', now: 30_000 });
    s = reduce(s, { type: 'tick', now: 60_050 });
    expect(s.phase).toBe('review');
    expect(s.log).toEqual([{ t: 60_050, a: { type: 'tick' } }]);
  });

  it('records wrong clicks in locate', () => {
    const s = reduce(start('locate'), { type: 'click', id: 'CHL', now: 1200 });
    expect(s.log).toEqual([{ t: 200, a: { type: 'click', id: 'CHL' } }]);
  });

  it('starting again clears the log', () => {
    const s = reduce(start(), { type: 'found', id: 'BRA', now: 2000 });
    const again = reduce(s, { type: 'start', config: cfg(), pool: POOL, order: POOL, now: 50_000 });
    expect(again.log).toEqual([]);
    expect(again.startedAt).toBe(50_000);
  });

  it('restore replaces the whole state', () => {
    const saved = reduce(start(), { type: 'giveUp', now: 4000 });
    expect(reduce(initialState(cfg()), { type: 'restore', state: saved })).toBe(saved);
  });

  it('toAction undoes toLogged', () => {
    for (const action of [
      { type: 'found', id: 'BRA', now: 1700 },
      { type: 'found', id: 'BRA', now: 1700, corrected: true },
      { type: 'click', id: 'CHL', now: 1700 },
      { type: 'hint', rand: 0.25, now: 1700 },
      { type: 'skip', now: 1700 },
      { type: 'giveUp', now: 1700 },
    ] as const) {
      expect(toAction({ t: 700, a: toLogged(action)! }, 1000)).toEqual(action);
    }
    expect(toLogged({ type: 'toSetup' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/game/log.test.ts`
Expected: FAIL, cannot find module `../../src/game/log.ts`

- [ ] **Step 3: Implement**

**`src/game/log.ts`**

```ts
import type { GameAction } from './types.ts';

/** A game action as recorded for the server's replay: the action without its clock time. */
export type LoggedAction =
  | { type: 'found'; id: string; corrected?: boolean }
  | { type: 'click'; id: string }
  | { type: 'skip' }
  | { type: 'hint'; rand: number }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'giveUp' }
  | { type: 'tick' };

/** `t`: ms since the game started, on the clock of whoever recorded it. */
export interface LogEntry {
  t: number;
  a: LoggedAction;
}

/** The loggable part of an action, or null for actions that aren't part of play (start, toSetup, restore). */
export function toLogged(action: GameAction): LoggedAction | null {
  switch (action.type) {
    case 'found':
      return action.corrected ? { type: 'found', id: action.id, corrected: true } : { type: 'found', id: action.id };
    case 'click':
      return { type: 'click', id: action.id };
    case 'hint':
      return { type: 'hint', rand: action.rand };
    case 'skip':
    case 'pause':
    case 'resume':
    case 'giveUp':
    case 'tick':
      return { type: action.type };
    default:
      return null;
  }
}

/** Turns a log entry back into the action it came from, with its clock time restored. */
export function toAction(entry: LogEntry, startedAt: number): GameAction {
  const now = startedAt + entry.t;
  const a = entry.a;
  switch (a.type) {
    case 'found':
      return a.corrected ? { type: 'found', id: a.id, now, corrected: true } : { type: 'found', id: a.id, now };
    case 'click':
      return { type: 'click', id: a.id, now };
    case 'hint':
      return { type: 'hint', rand: a.rand, now };
    default:
      return { type: a.type, now };
  }
}
```

**`src/game/types.ts`** (modify)

```diff
--- a/src/game/types.ts
+++ b/src/game/types.ts
@@ -1,4 +1,5 @@
 import type { Continent } from '../data/types.ts';
+import type { LogEntry } from './log.ts';
 
 export type Mode = 'type' | 'locate' | 'identify';
 
@@ -46,6 +47,10 @@ export interface GameState {
   endReason: EndReason | null;
   /** latest thing that happened, for toasts and map flashes; seq retriggers animations */
   event: (GameEvent & { seq: number }) | null;
+  /** clock time the game started; null before the first start */
+  startedAt: number | null;
+  /** every action that changed the game, for the server to replay */
+  log: LogEntry[];
 }
 
 export type GameAction =
@@ -53,9 +58,10 @@ export type GameAction =
   | { type: 'found'; id: string; now: number; corrected?: boolean }
   | { type: 'click'; id: string; now: number }
   | { type: 'skip'; now: number }
-  | { type: 'hint'; rand: number }
+  | { type: 'hint'; rand: number; now: number }
   | { type: 'pause'; now: number }
   | { type: 'resume'; now: number }
   | { type: 'tick'; now: number }
   | { type: 'giveUp'; now: number }
-  | { type: 'toSetup' };
+  | { type: 'toSetup' }
+  | { type: 'restore'; state: GameState };
```

**`src/game/reducer.ts`** (modify)

```diff
--- a/src/game/reducer.ts
+++ b/src/game/reducer.ts
@@ -1,4 +1,5 @@
 import { HINT_LEVELS } from './hints.ts';
+import { toLogged } from './log.ts';
 import type { EndReason, GameAction, GameConfig, GameEvent, GameState } from './types.ts';
 
 export const TRIES_PER_TARGET = 3;
@@ -18,6 +19,8 @@ export function initialState(config: GameConfig): GameState {
     runningSince: null,
     endReason: null,
     event: null,
+    startedAt: null,
+    log: [],
   };
 }
 
@@ -93,7 +96,16 @@ function giveHint(state: GameState, rand: number): GameState {
   return climb(left[Math.min(left.length - 1, Math.floor(rand * left.length))], 1);
 }
 
+/** Applies `action`, recording it in the log when it changed the game. */
 export function reduce(state: GameState, action: GameAction): GameState {
+  const next = step(state, action);
+  if (next === state || next.startedAt === null) return next;
+  const logged = toLogged(action);
+  return logged && 'now' in action ? { ...next, log: [...state.log, { t: action.now - next.startedAt, a: logged }] } : next;
+}
+
+function step(state: GameState, action: GameAction): GameState {
+  if (action.type === 'restore') return action.state;
   if (action.type === 'start') {
     return {
       ...initialState(action.config),
@@ -101,6 +113,7 @@ export function reduce(state: GameState, action: GameAction): GameState {
       pool: action.pool,
       queue: action.config.mode === 'type' ? [] : action.order,
       runningSince: action.now,
+      startedAt: action.now,
     };
   }
   if (action.type === 'toSetup') return { ...initialState(state.config), event: null };
```

`reducer.test.ts`: every hint action now needs a clock time (any number; hints don't read it except for the log):

**`tests/game/reducer.test.ts`** (modify)

```diff
--- a/tests/game/reducer.test.ts
+++ b/tests/game/reducer.test.ts
@@ -87,24 +87,24 @@ describe('timer', () => {
 describe('hints in type mode', () => {
   it('first hint picks an unfound country at level 1; more hints climb its ladder', () => {
     let s = reduce(start(), { type: 'found', id: 'ARG', now: 2000 });
-    s = reduce(s, { type: 'hint', rand: 0.99 });
+    s = reduce(s, { type: 'hint', rand: 0.99, now: 5000 });
     expect(s.hint).toEqual({ id: 'CHL', level: 1 });
-    s = reduce(s, { type: 'hint', rand: 0 });
+    s = reduce(s, { type: 'hint', rand: 0, now: 5000 });
     expect(s.hint).toEqual({ id: 'CHL', level: 2 });
     expect(s.hintsUsed).toBe(2);
   });
 
   it('after the top rung, the next hint moves on to a new country', () => {
     let s = start();
-    for (let i = 0; i < 6; i++) s = reduce(s, { type: 'hint', rand: 0 });
+    for (let i = 0; i < 6; i++) s = reduce(s, { type: 'hint', rand: 0, now: 5000 });
     expect(s.hint).toEqual({ id: 'ARG', level: 6 });
-    s = reduce(s, { type: 'hint', rand: 0.99 });
+    s = reduce(s, { type: 'hint', rand: 0.99, now: 5000 });
     expect(s.hint).toEqual({ id: 'CHL', level: 1 });
     expect(s.hintsUsed).toBe(7);
   });
 
   it('finding the hinted country clears the hint', () => {
-    let s = reduce(start(), { type: 'hint', rand: 0 });
+    let s = reduce(start(), { type: 'hint', rand: 0, now: 5000 });
     s = reduce(s, { type: 'found', id: 'ARG', now: 2000 });
     expect(s.hint).toBeNull();
   });
@@ -156,9 +156,9 @@ describe('locate mode', () => {
   });
 
   it('hints target the current country and stop at the top rung (3 in locate)', () => {
-    let s = reduce(locate(), { type: 'hint', rand: 0.5 });
+    let s = reduce(locate(), { type: 'hint', rand: 0.5, now: 5000 });
     expect(s.hint).toEqual({ id: 'CHL', level: 1 });
-    for (let i = 0; i < 4; i++) s = reduce(s, { type: 'hint', rand: 0.5 });
+    for (let i = 0; i < 4; i++) s = reduce(s, { type: 'hint', rand: 0.5, now: 5000 });
     expect(s.hint).toEqual({ id: 'CHL', level: 3 });
     expect(s.hintsUsed).toBe(3);
   });
```

`src/App.tsx`: both hint dispatches (`onHint` passed to `useGuess`, and `const hint = …`) become:

```ts
dispatch({ type: 'hint', rand: random(), now: Date.now() })
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx tsc -p . && npx vitest run`
Expected: PASS, 156 tests (148 before + 8 new)

- [ ] **Step 5: Commit**

```bash
git add src/game tests/game src/App.tsx
git commit -m "Record every game action in the state so the server can replay it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Boards, ranking order and setup validation

**Files:**
- Create: `src/game/ranking.ts`, `tests/game/ranking.test.ts`

**Interfaces:**
- Consumes: `CONTINENTS`, `isWorld` (`src/game/scope.ts`), `COUNTRIES`.
- Produces:
  - Constants `MIN_FIND_GAP_MS`, `MIN_MS_PER_COUNTRY`, `CLOCK_TOLERANCE_MS`, `BOARD_MODES`, `BOARD_REGIONS`.
  - Types `Region = 'world' | Continent`, `Board = \`${Mode}:${Region}\``, `Run { hints; ms; finishedAt }`.
  - Functions:
    - `regionLabel(region)`
    - `boardFor(config): Board | null`
    - `parseBoard(string): { mode, region } | null`
    - `boardLabel(board)`, e.g. `"World · Type"`
    - `compareRuns(a, b)` (negative = a ranks higher)
    - `parseConfig(unknown): GameConfig | null`

- [ ] **Step 1: Write the failing test**

**`tests/game/ranking.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { BOARD_REGIONS, boardFor, boardLabel, compareRuns, parseBoard, parseConfig } from '../../src/game/ranking.ts';
import type { GameConfig } from '../../src/game/types.ts';

const cfg = (continents: string[], subregions: string[] = [], mode: GameConfig['mode'] = 'type'): GameConfig =>
  ({ mode, scope: { continents, subregions }, timeLimitSec: null }) as GameConfig;

describe('boards', () => {
  it('World and single whole continents rank; mixes and subregions do not', () => {
    expect(boardFor(cfg([]))).toBe('type:world');
    expect(boardFor(cfg(['europe'], [], 'locate'))).toBe('locate:europe');
    expect(boardFor({ ...cfg(['asia']), timeLimitSec: 600 })).toBe('type:asia');
    expect(boardFor(cfg(['europe', 'asia']))).toBeNull();
    expect(boardFor(cfg([], ['Caribbean']))).toBeNull();
    expect(boardFor(cfg(['europe'], ['Caribbean']))).toBeNull();
  });

  it('there are 21 boards', () => {
    expect(BOARD_REGIONS).toHaveLength(7);
  });

  it('parses and labels board ids', () => {
    expect(parseBoard('identify:north-america')).toEqual({ mode: 'identify', region: 'north-america' });
    expect(parseBoard('type:mars')).toBeNull();
    expect(parseBoard('type:world:x')).toBeNull();
    expect(boardLabel('type:world')).toBe('World · Type');
    expect(boardLabel('locate:south-america')).toBe('S. America · Locate');
  });

  it('ranks fewer hints first, then time, then the earlier finish', () => {
    const runs = [
      { hints: 1, ms: 50_000, finishedAt: 1 },
      { hints: 0, ms: 90_000, finishedAt: 5 },
      { hints: 0, ms: 90_000, finishedAt: 2 },
      { hints: 0, ms: 80_000, finishedAt: 9 },
    ];
    expect([...runs].sort(compareRuns)).toEqual([runs[3], runs[2], runs[1], runs[0]]);
  });
});

describe('parseConfig', () => {
  it('accepts what the setup card makes', () => {
    const c = { mode: 'identify', scope: { continents: ['africa'], subregions: ['Caribbean'] }, timeLimitSec: 600 };
    expect(parseConfig(c)).toEqual(c);
    expect(parseConfig({ mode: 'type', scope: { continents: [], subregions: [] }, timeLimitSec: null })).not.toBeNull();
  });

  it('rejects anything else', () => {
    const ok = { mode: 'type', scope: { continents: [], subregions: [] }, timeLimitSec: null };
    for (const bad of [
      null,
      'x',
      { ...ok, mode: 'race' },
      { ...ok, scope: { continents: ['mars'], subregions: [] } },
      { ...ok, scope: { continents: [], subregions: ['Atlantis'] } },
      { ...ok, scope: { continents: ['asia', 'asia'], subregions: [] } },
      { ...ok, scope: { continents: 'asia', subregions: [] } },
      { ...ok, timeLimitSec: 5 },
      { ...ok, timeLimitSec: 90.5 },
      { ...ok, timeLimitSec: '600' },
    ]) {
      expect(parseConfig(bad)).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/game/ranking.test.ts`
Expected: FAIL, cannot find module

- [ ] **Step 3: Implement**

**`src/game/ranking.ts`**

```ts
import { COUNTRIES } from '../data/countries.ts';
import type { Continent } from '../data/types.ts';
import { CONTINENTS, isWorld } from './scope.ts';
import type { GameConfig, Mode, Scope } from './types.ts';

/** Anti-cheat thresholds, shared by the client (to explain) and the server (to judge). */
export const MIN_FIND_GAP_MS = 100;
export const MIN_MS_PER_COUNTRY = 300;
export const CLOCK_TOLERANCE_MS = 2000;

export type Region = 'world' | Continent;
export const BOARD_MODES: Mode[] = ['type', 'locate', 'identify'];
export const BOARD_REGIONS: Region[] = ['world', ...CONTINENTS.map((c) => c.id)];
export type Board = `${Mode}:${Region}`;

const MODE_LABEL: Record<Mode, string> = { type: 'Type', locate: 'Locate', identify: 'Identify' };
export const regionLabel = (region: Region) => (region === 'world' ? 'World' : CONTINENTS.find((c) => c.id === region)!.label);

/** The leaderboard a setup counts toward: World or exactly one whole continent. Any time limit. */
export function boardFor(config: GameConfig): Board | null {
  const { continents, subregions } = config.scope;
  if (isWorld(config.scope)) return `${config.mode}:world`;
  if (subregions.length === 0 && continents.length === 1) return `${config.mode}:${continents[0]}`;
  return null;
}

export function parseBoard(board: string): { mode: Mode; region: Region } | null {
  const [mode, region, extra] = board.split(':');
  if (extra !== undefined || !BOARD_MODES.includes(mode as Mode) || !BOARD_REGIONS.includes(region as Region)) return null;
  return { mode: mode as Mode, region: region as Region };
}

/** "World · Type" */
export function boardLabel(board: Board): string {
  const { mode, region } = parseBoard(board)!;
  return `${regionLabel(region)} · ${MODE_LABEL[mode]}`;
}

export interface Run {
  hints: number;
  ms: number;
  finishedAt: number;
}

/** Negative when `a` ranks above `b`: fewer hints, then faster, then earlier. */
export function compareRuns(a: Run, b: Run): number {
  return a.hints - b.hints || a.ms - b.ms || a.finishedAt - b.finishedAt;
}

const SUBREGIONS = new Set(COUNTRIES.map((c) => c.subregion));
const CONTINENT_IDS = new Set<string>(CONTINENTS.map((c) => c.id));
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 40 && v.every((x) => typeof x === 'string');

/** A game config from untrusted JSON, or null if it isn't one the setup card could have made. */
export function parseConfig(value: unknown): GameConfig | null {
  if (!value || typeof value !== 'object') return null;
  const { mode, scope, timeLimitSec } = value as Record<string, unknown>;
  if (!BOARD_MODES.includes(mode as Mode)) return null;
  if (!scope || typeof scope !== 'object') return null;
  const { continents, subregions } = scope as Record<string, unknown>;
  if (!strings(continents) || !strings(subregions)) return null;
  if (!continents.every((c) => CONTINENT_IDS.has(c)) || !subregions.every((s) => SUBREGIONS.has(s))) return null;
  if (new Set(continents).size !== continents.length || new Set(subregions).size !== subregions.length) return null;
  const limitOk = timeLimitSec === null || (Number.isInteger(timeLimitSec) && (timeLimitSec as number) >= 60 && (timeLimitSec as number) <= 3600);
  if (!limitOk) return null;
  const clean: Scope = { continents: continents as Continent[], subregions };
  return { mode: mode as Mode, scope: clean, timeLimitSec: timeLimitSec as number | null };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx tsc -p . && npx vitest run`
Expected: PASS, 162 tests

- [ ] **Step 5: Commit**

```bash
git add src/game/ranking.ts tests/game/ranking.test.ts
git commit -m "Leaderboard boards, ranking order and setup validation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: The server's replay judge

Pure functions that turn an untrusted log into a verified result. No D1 yet. `tests/worker/play.ts` builds honest logs the way the browser does, and the Worker tests reuse it later.

**Files:**
- Create: `src/api/types.ts`, `worker/replay.ts`, `tests/worker/play.ts`, `tests/worker/replay.test.ts`
- Modify: `tsconfig.json` (include `worker`)

**Interfaces:**
- Consumes: `reduce`, `initialState`, `toAction`, `poolFor`, `shuffle`, `seededRandom`, ranking constants.
- Produces:
  - `parseLog(unknown): LogEntry[] | null`
  - `replay(config, seed, log): { state, findTimes, paused } | null`
  - `judge({ config, seed, log, board, serverElapsedMs }): Verdict | null`, where `Verdict = { found; total; hints; ms; endReason; reason: 'custom' | 'incomplete' | 'paused' | 'unverified' | null }`.
  - The API types in `src/api/types.ts`: `UnrankedReason`, `User`, `StartResponse`, `BestSummary`, `GameResult`, `BoardRow`, `BoardResponse`, `RecentGame`, `MyGamesResponse`.
  - From `tests/worker/play.ts`: `play(config, seed, moves, step)`, plus `typeAll` and `clickTarget`.

- [ ] **Step 1: Include `worker/` in the typecheck**

**`tsconfig.json`** (modify)

```diff
--- a/tsconfig.json
+++ b/tsconfig.json
@@ -17,5 +17,5 @@
     "noFallthroughCasesInSwitch": true,
     "types": ["node", "vite/client"]
   },
-  "include": ["src", "tests", "scripts", "e2e", "vite.config.ts", "playwright.config.ts"]
+  "include": ["src", "worker", "tests", "scripts", "e2e", "vite.config.ts", "playwright.config.ts"]
 }
```

- [ ] **Step 2: Write the shared API types** (used by the judge for `UnrankedReason`)

**`src/api/types.ts`**

```ts
import type { Board } from '../game/ranking.ts';
import type { EndReason, Mode } from '../game/types.ts';

/** Shared between the Worker and the browser: the JSON each API route sends back. */

export type UnrankedReason = 'custom' | 'incomplete' | 'paused' | 'unverified' | 'anonymous';

export interface User {
  /** null until the player picks one */
  name: string | null;
  email: string;
}

export interface StartResponse {
  id: string;
  /** proves ownership of a game played signed out; null when signed in */
  claim: string | null;
  seed: number;
  board: Board | null;
}

export interface BestSummary {
  hints: number;
  ms: number;
  /** null while the player has no name and so isn't on the board */
  rank: number | null;
}

export interface GameResult {
  id: string;
  board: Board | null;
  found: number;
  total: number;
  hints: number;
  ms: number;
  endReason: EndReason;
  ranked: boolean;
  reason: UnrankedReason | null;
  /** this run became the player's best on its board */
  newBest: boolean;
  /** the player's best on this board after this run (owned games on a board) */
  best: BestSummary | null;
  /** unclaimed ranked-eligible games: the rank this run would get */
  wouldRank: number | null;
}

export interface BoardRow {
  rank: number;
  name: string;
  hints: number;
  ms: number;
  finishedAt: number;
  you: boolean;
}

export interface BoardResponse {
  board: Board;
  rows: BoardRow[];
  players: number;
  /** your own row when you're on this board, even outside the top 50 */
  you: BoardRow | null;
}

export interface RecentGame {
  id: string;
  mode: Mode;
  scopeKey: string;
  found: number;
  total: number;
  hints: number;
  ms: number;
  endReason: EndReason;
  ranked: boolean;
  reason: UnrankedReason | null;
  /** this game is the player's current best on its board */
  isBest: boolean;
  finishedAt: number;
}

export interface MyGamesResponse {
  bests: (BestSummary & { board: Board })[];
  recent: RecentGame[];
}
```

- [ ] **Step 3: Write the honest-log builder and the failing tests**

**`tests/worker/play.ts`**

```ts
import { COUNTRIES } from '../../src/data/countries.ts';
import type { LogEntry } from '../../src/game/log.ts';
import { initialState, reduce, target } from '../../src/game/reducer.ts';
import { seededRandom, shuffle } from '../../src/game/rng.ts';
import { poolFor } from '../../src/game/scope.ts';
import type { GameAction, GameConfig, GameState } from '../../src/game/types.ts';

export type Move = (s: GameState, now: number) => GameAction | null;

/** Plays like the browser does: the server's seed for the order, the real reducer, and the state's own log. */
export function play(config: GameConfig, seed: number, moves: Move, step = 2000): LogEntry[] {
  const pool = poolFor(config.scope, COUNTRIES);
  let s = reduce(initialState(config), { type: 'start', config, pool, order: shuffle(pool, seededRandom(seed)), now: 1_000_000 });
  for (let now = 1_000_000 + step; s.phase !== 'review'; now += step) {
    const action = moves(s, now);
    if (!action) break;
    s = reduce(s, action);
  }
  return s.log;
}

export const typeAll: Move = (s, now) => ({ type: 'found', id: s.pool.find((id) => !s.found.includes(id))!, now });
export const clickTarget: Move = (s, now) => ({ type: 'click', id: target(s)!, now });
```

**`tests/worker/replay.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../src/game/log.ts';
import { boardFor } from '../../src/game/ranking.ts';
import { target } from '../../src/game/reducer.ts';
import type { GameConfig } from '../../src/game/types.ts';
import { judge, parseLog, replay } from '../../worker/replay.ts';
import { clickTarget, play as basePlay, typeAll, type Move } from './play.ts';

const SEED = 42;
const cfg = (over: Partial<GameConfig> = {}): GameConfig => ({ mode: 'type', scope: { continents: ['south-america'], subregions: [] }, timeLimitSec: null, ...over });

const play = (config: GameConfig, moves: Move, step = 2000, seed = SEED) => basePlay(config, seed, moves, step);
const verdict = (config: GameConfig, log: LogEntry[], serverElapsedMs = log.at(-1)!.t + 300) =>
  judge({ config, seed: SEED, log, board: boardFor(config), serverElapsedMs });

describe('honest games rank', () => {
  it('type: every country, 2 s apart', () => {
    const log = play(cfg(), typeAll);
    expect(verdict(cfg(), log)).toEqual({ found: 12, total: 12, hints: 0, ms: 24_000, endReason: 'complete', reason: null });
  });

  it('locate: clicking each target in the server order', () => {
    const config = cfg({ mode: 'locate' });
    expect(verdict(config, play(config, clickTarget))).toMatchObject({ found: 12, reason: null });
  });

  it('identify, with hints along the way', () => {
    const config = cfg({ mode: 'identify' });
    let hinted = 0;
    const log = play(config, (s, now) => (hinted++ % 3 === 0 ? { type: 'hint', rand: 0.5, now } : { type: 'found', id: target(s)!, now }));
    expect(verdict(config, log)).toMatchObject({ found: 12, hints: 6, reason: null });
  });

  it('a timed game that finishes in time still ranks', () => {
    const config = cfg({ timeLimitSec: 300 });
    expect(verdict(config, play(config, typeAll))).toMatchObject({ reason: null });
  });
});

describe('honest games that do not rank', () => {
  it('custom scope', () => {
    const config = cfg({ scope: { continents: [], subregions: ['Caribbean'] } });
    expect(verdict(config, play(config, typeAll))).toMatchObject({ reason: 'custom' });
  });

  it('giving up', () => {
    const log = play(cfg(), (s, now) => (s.found.length < 3 ? typeAll(s, now) : { type: 'giveUp', now }));
    expect(verdict(cfg(), log)).toMatchObject({ found: 3, endReason: 'gaveUp', reason: 'incomplete' });
  });

  it('running out of time', () => {
    const config = cfg({ timeLimitSec: 60 });
    const log = play(config, (s, now) => (s.found.length < 5 ? typeAll(s, now) : { type: 'tick', now }), 10_000);
    expect(verdict(config, log)).toMatchObject({ found: 5, endReason: 'timeout', ms: 60_000, reason: 'incomplete' });
  });

  it('skipping in identify', () => {
    const config = cfg({ mode: 'identify' });
    let skipped = false;
    const log = play(config, (s, now) => (skipped ? { type: 'found', id: target(s)!, now } : ((skipped = true), { type: 'skip', now })));
    expect(verdict(config, log)).toMatchObject({ found: 11, reason: 'incomplete' });
  });

  it('pausing', () => {
    let paused = false;
    const log = play(cfg(), (s, now) => {
      if (s.found.length === 4 && !paused) return (paused = true), { type: 'pause', now };
      if (s.phase === 'paused') return { type: 'resume', now: now + 60_000 };
      return typeAll(s, now + (paused ? 60_000 : 0));
    });
    expect(verdict(cfg(), log, log.at(-1)!.t + 300)).toMatchObject({ found: 12, reason: 'paused' });
  });
});

describe('doctored logs', () => {
  it('a shortened clock: the replay is quicker than the server saw', () => {
    const log = play(cfg(), typeAll);
    expect(verdict(cfg(), log, log.at(-1)!.t + 1900)).toMatchObject({ reason: null });
    expect(verdict(cfg(), log, log.at(-1)!.t + 2100)).toMatchObject({ reason: 'unverified' });
  });

  it('finds closer together than anyone can type', () => {
    const log = play(cfg(), typeAll).map((e, i) => (i === 5 ? { ...e, t: e.t - 1950 } : e));
    expect(verdict(cfg(), log)).toMatchObject({ reason: 'unverified' });
  });

  it('a whole game faster than 0.3 s per country', () => {
    const log = play(cfg(), typeAll, 250);
    expect(verdict(cfg(), log)).toMatchObject({ reason: 'unverified' });
  });

  it('a pause hidden by shifting the later times back', () => {
    let paused = false;
    const honest = play(cfg(), (s, now) => {
      if (s.found.length === 4 && !paused) return (paused = true), { type: 'pause', now };
      if (s.phase === 'paused') return { type: 'resume', now: now + 60_000 };
      return typeAll(s, now + (paused ? 60_000 : 0));
    });
    const p = honest.findIndex((e) => e.a.type === 'pause');
    const gap = honest[p + 1].t - honest[p].t;
    const hidden = [...honest.slice(0, p), ...honest.slice(p + 2).map((e) => ({ ...e, t: e.t - gap }))];
    expect(verdict(cfg(), hidden, honest.at(-1)!.t + 300)).toMatchObject({ reason: 'unverified' });
  });

  it('a locate log made for a different target order does not complete', () => {
    const config = cfg({ mode: 'locate' });
    const other = play(config, clickTarget, 2000, 7);
    const v = verdict(config, other);
    expect(v === null || v.reason !== null).toBe(true);
  });

  it('finds of countries outside the game, or repeats, do not replay', () => {
    const log = play(cfg(), typeAll);
    expect(replay(cfg(), SEED, [{ t: 100, a: { type: 'found', id: 'FRA' } }, ...log])).toBeNull();
    expect(replay(cfg(), SEED, [log[0], { ...log[0], t: log[0].t + 1 }, ...log.slice(1)])).toBeNull();
  });

  it('entries after the end do not replay', () => {
    const log = play(cfg(), typeAll);
    expect(replay(cfg(), SEED, [...log, { t: log.at(-1)!.t + 10, a: { type: 'giveUp' } }])).toBeNull();
  });

  it('a game that never ended does not replay', () => {
    expect(replay(cfg(), SEED, play(cfg(), typeAll).slice(0, -1))).toBeNull();
  });
});

describe('parseLog', () => {
  it('accepts what the reducer records', () => {
    const log = play(cfg({ mode: 'identify' }), (s, now) => ({ type: 'found', id: target(s)!, now, corrected: true }));
    expect(parseLog(JSON.parse(JSON.stringify(log)))).toEqual(log);
  });

  it('rejects malformed entries', () => {
    for (const bad of [
      'x',
      [{ t: 5, a: { type: 'found' } }],
      [{ t: 5, a: { type: 'teleport' } }],
      [{ t: 5, a: { type: 'hint', rand: 1 } }],
      [{ t: 5, a: { type: 'hint', rand: -0.1 } }],
      [{ t: 5.5, a: { type: 'skip' } }],
      [{ t: 9, a: { type: 'skip' } }, { t: 8, a: { type: 'skip' } }],
      [{ t: 5, a: { type: 'found', id: 'TOOLONGID' } }],
      Array.from({ length: 5001 }, (_, i) => ({ t: i, a: { type: 'skip' } })),
    ]) {
      expect(parseLog(bad)).toBeNull();
    }
  });
});

it('replays a whole-world game in well under the Worker CPU budget', () => {
  const config = cfg({ scope: { continents: [], subregions: [] } });
  const log = play(config, typeAll, 1000);
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) replay(config, SEED, log);
  expect((performance.now() - t0) / 50).toBeLessThan(5);
});
```

- [ ] **Step 4: Run them to make sure they fail**

Run: `npx vitest run tests/worker/replay.test.ts`
Expected: FAIL, cannot find module `../../worker/replay.ts`

- [ ] **Step 5: Implement**

**`worker/replay.ts`**

```ts
import type { UnrankedReason } from '../src/api/types.ts';
import { COUNTRIES } from '../src/data/countries.ts';
import { toAction, type LogEntry, type LoggedAction } from '../src/game/log.ts';
import { CLOCK_TOLERANCE_MS, MIN_FIND_GAP_MS, MIN_MS_PER_COUNTRY, type Board } from '../src/game/ranking.ts';
import { initialState, reduce } from '../src/game/reducer.ts';
import { seededRandom, shuffle } from '../src/game/rng.ts';
import { poolFor } from '../src/game/scope.ts';
import type { EndReason, GameConfig, GameState } from '../src/game/types.ts';

export const MAX_LOG_ENTRIES = 5000;
const DAY_MS = 86_400_000;
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 8;

function parseAction(value: unknown): LoggedAction | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as Record<string, unknown>;
  switch (a.type) {
    case 'found':
      if (!isId(a.id)) return null;
      return a.corrected === true ? { type: 'found', id: a.id, corrected: true } : { type: 'found', id: a.id };
    case 'click':
      return isId(a.id) ? { type: 'click', id: a.id } : null;
    case 'hint':
      return typeof a.rand === 'number' && a.rand >= 0 && a.rand < 1 ? { type: 'hint', rand: a.rand } : null;
    case 'skip':
    case 'pause':
    case 'resume':
    case 'giveUp':
    case 'tick':
      return { type: a.type };
    default:
      return null;
  }
}

/** A log from untrusted JSON: well-formed entries with times that never go backwards. */
export function parseLog(value: unknown): LogEntry[] | null {
  if (!Array.isArray(value) || value.length > MAX_LOG_ENTRIES) return null;
  const out: LogEntry[] = [];
  let last = 0;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const { t, a } = entry as Record<string, unknown>;
    if (!Number.isInteger(t) || (t as number) < last || (t as number) > DAY_MS) return null;
    const action = parseAction(a);
    if (!action) return null;
    last = t as number;
    out.push({ t: last, a: action });
  }
  return out;
}

export interface Replayed {
  state: GameState;
  /** log times of each successful find, in order */
  findTimes: number[];
  paused: boolean;
}

/**
 * Plays the game again from the server's seed. Null when an entry changed nothing (an honest client
 * only logs actions that did something), when entries follow the end, or when the game never ended.
 */
export function replay(config: GameConfig, seed: number, log: LogEntry[]): Replayed | null {
  const pool = poolFor(config.scope, COUNTRIES);
  let state = reduce(initialState(config), { type: 'start', config, pool, order: shuffle(pool, seededRandom(seed)), now: 0 });
  const findTimes: number[] = [];
  let paused = false;
  for (const entry of log) {
    if (state.phase === 'review') return null;
    const next = reduce(state, toAction(entry, 0));
    if (next === state) return null;
    if (next.found.length > state.found.length) findTimes.push(entry.t);
    if (entry.a.type === 'pause') paused = true;
    state = next;
  }
  return state.phase === 'review' ? { state, findTimes, paused } : null;
}

export interface Verdict {
  found: number;
  total: number;
  hints: number;
  ms: number;
  endReason: EndReason;
  /** null: ranks (once it has an owner) */
  reason: Exclude<UnrankedReason, 'anonymous'> | null;
}

export interface JudgeInput {
  config: GameConfig;
  seed: number;
  log: LogEntry[];
  board: Board | null;
  /** server clock: receipt of /finish minus the recorded start */
  serverElapsedMs: number;
}

/** The game's result from the server's own replay, and whether it may rank. Null if the log doesn't replay. */
export function judge({ config, seed, log, board, serverElapsedMs }: JudgeInput): Verdict | null {
  const played = replay(config, seed, log);
  if (!played) return null;
  const { state, findTimes, paused } = played;
  const result = { found: state.found.length, total: state.pool.length, hints: state.hintsUsed, ms: state.elapsedMs, endReason: state.endReason! };
  const tooFast =
    result.ms / result.total < MIN_MS_PER_COUNTRY || findTimes.some((t, i) => i > 0 && t - findTimes[i - 1] < MIN_FIND_GAP_MS);
  const reason = !board
    ? 'custom'
    : result.found < result.total
      ? 'incomplete'
      : paused
        ? 'paused'
        : result.ms < serverElapsedMs - CLOCK_TOLERANCE_MS || tooFast
          ? 'unverified'
          : null;
  return { ...result, reason };
}
```

- [ ] **Step 6: Run the tests**

Run: `npx tsc -p . && npx vitest run`
Expected: PASS, 182 tests. The CPU test replays a 197-country game in well under 5 ms.

- [ ] **Step 7: Commit**

```bash
git add tsconfig.json src/api/types.ts worker/replay.ts tests/worker
git commit -m "Replay judge: verify a game log from the server's seed and clock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Worker foundation and Google sign-in

The schema, request plumbing, sessions and Google OAuth (with a localhost-only fake mode for tests), all tested against a real local D1 through `getPlatformProxy`. The router starts with the auth routes only; Task 5 adds the game routes.

**Files:**
- Create:
  - `migrations/0001_init.sql`, `src/api/names.ts`
  - `worker/env.ts`, `worker/crypto.ts`, `worker/http.ts`, `worker/auth.ts`, `worker/index.ts`
  - `tests/worker/wrangler.test.jsonc`, `tests/worker/harness.ts`, `tests/worker/auth.test.ts`

**Interfaces:**
- Produces:
  - **Types:** `Env { DB; AUTH_SECRET; GOOGLE_CLIENT_ID; GOOGLE_CLIENT_SECRET; AUTH_MODE: 'google' | 'fake' }`, plus `D1Database` / `D1PreparedStatement` / `D1Result`.
  - **`worker/crypto.ts`:** `randomToken(bytes)`, `randomSeed()`, `hmac(secret, data)`, `sha256(data)`, `base64url`, `fromBase64url`.
  - **`worker/http.ts`:** `HttpError(status, code, message)`, `json(data, init)`, `errorResponse`, `redirect(location, cookies)`, `readBody(req)`, `checkWrite(req)`, `getCookie`, `cookie(name, value, maxAgeSec)`, `clientIp`, `isLocalHost`.
  - **`worker/auth.ts`:**
    - Session helpers: `SESSION_COOKIE`, `currentUser(req, env)`, `requireUser(req, env)`.
    - Google helpers: `safeReturn`, `checkIdToken`.
    - Handlers: `me`, `googleStart`, `googleCallback`, `nameAvailable`, `setName`, `signOut`, `deleteMe`.
  - **`src/api/names.ts`:** `NAME_RULE`, `cleanName(raw)`.
  - **`worker/index.ts`:** `handle(req, env)` and the default `{ fetch }`.
  - **Test harness:** `startDb()`, `testEnv(db, over)`, `wipe(db)`, `call(env, method, path, opts)`, `cookiesFrom(res)`, `signIn(env, email, name?)`, `statements(sql)`.

- [ ] **Step 1: Write the schema**

**`migrations/0001_init.sql`**

```sql
-- Mapped v2: accounts, games and leaderboards. Times are epoch ms on the server's clock.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  name_key TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users (id) ON DELETE CASCADE,
  claim_hash TEXT,
  ip_hash TEXT NOT NULL,
  config TEXT NOT NULL,
  mode TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  board TEXT,
  seed INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  found INTEGER,
  total INTEGER,
  hints INTEGER,
  ms INTEGER,
  end_reason TEXT,
  ranked INTEGER NOT NULL DEFAULT 0,
  unranked_reason TEXT,
  log TEXT
);
CREATE INDEX games_user ON games (user_id, finished_at DESC);
CREATE INDEX games_ip ON games (ip_hash, started_at);
CREATE INDEX games_stale ON games (started_at) WHERE user_id IS NULL OR finished_at IS NULL;

CREATE TABLE bests (
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  board TEXT NOT NULL,
  game_id TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  hints INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  finished_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, board)
);
CREATE INDEX bests_rank ON bests (board, hints, ms, finished_at);
```

- [ ] **Step 2: Write the test harness and the failing tests**

**`tests/worker/wrangler.test.jsonc`**

```jsonc
// Bindings for the Worker integration tests: a throwaway local D1 per test file.
{
  "name": "mapped-test",
  "compatibility_date": "2026-10-01",
  "d1_databases": [{ "binding": "DB", "database_name": "mapped-test", "database_id": "00000000-0000-0000-0000-000000000000" }]
}
```

**`tests/worker/harness.ts`**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getPlatformProxy } from 'wrangler';
import type { D1Database, Env } from '../../worker/env.ts';
import worker from '../../worker/index.ts';

const MIGRATIONS = new URL('../../migrations/', import.meta.url);
export const ORIGIN = 'http://localhost';

/** Statements of a migration file, in order. Statements end with ";" at the end of a line. */
export function statements(sql: string): string[] {
  return sql
    .replace(/--.*$/gm, '')
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A real local D1 (via wrangler/miniflare) with every migration applied. */
export async function startDb() {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath: fileURLToPath(new URL('./wrangler.test.jsonc', import.meta.url)),
    persist: false,
  });
  const db = proxy.env.DB;
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await db.batch(statements(readFileSync(new URL(file, MIGRATIONS), 'utf8')).map((s) => db.prepare(s)));
  }
  return { db, dispose: proxy.dispose };
}

export function testEnv(db: D1Database, over: Partial<Env> = {}): Env {
  return { DB: db, AUTH_SECRET: 'test-secret', GOOGLE_CLIENT_ID: 'client-123', GOOGLE_CLIENT_SECRET: 'shh', AUTH_MODE: 'fake', ...over };
}

export async function wipe(db: D1Database) {
  await db.batch(['bests', 'games', 'sessions', 'users'].map((t) => db.prepare(`DELETE FROM ${t}`)));
}

interface CallOptions {
  body?: unknown;
  cookie?: string;
  /** null: send no Origin header */
  origin?: string | null;
  ip?: string;
  /** base URL, for testing other hosts */
  base?: string;
}

export function call(env: Env, method: string, path: string, opts: CallOptions = {}): Promise<Response> {
  const base = opts.base ?? ORIGIN;
  const headers = new Headers({ 'CF-Connecting-IP': opts.ip ?? '203.0.113.7' });
  if (opts.cookie) headers.set('Cookie', opts.cookie);
  const write = method !== 'GET';
  if (write) headers.set('Content-Type', 'application/json');
  if (write && opts.origin !== null) headers.set('Origin', opts.origin ?? base);
  return worker.fetch(new Request(base + path, { method, headers, body: write ? JSON.stringify(opts.body ?? {}) : undefined }), env);
}

/** "name=value" pairs from a response's Set-Cookie headers, ready to send back. */
export function cookiesFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

/** Signs in through fake mode (the full redirect dance) and optionally picks a name. Returns the session cookie. */
export async function signIn(env: Env, email: string, name?: string): Promise<string> {
  const start = await call(env, 'GET', `/api/auth/google?return=/&as=${encodeURIComponent(email)}`);
  const callback = await call(env, 'GET', new URL(start.headers.get('Location')!).pathname + new URL(start.headers.get('Location')!).search, {
    cookie: cookiesFrom(start),
  });
  const session = callback.headers.getSetCookie().find((c) => c.startsWith('__Host-mapped_session='))!.split(';')[0];
  if (name) await call(env, 'POST', '/api/auth/name', { cookie: session, body: { name } });
  return session;
}
```

**`tests/worker/auth.test.ts`**

```ts
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
});
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `npx vitest run tests/worker/auth.test.ts`
Expected: FAIL, cannot find module `../../worker/env.ts` / `../../worker/index.ts`

- [ ] **Step 4: Implement**

**`worker/env.ts`**

```ts
/** The slice of the D1 client API the Worker uses. Declared here so the app keeps a single tsconfig with DOM types. */
export interface D1Result<T> {
  results: T[];
  meta: { changes: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]>;
}

export interface Env {
  DB: D1Database;
  /** HMAC key for session tokens, claim tokens and IP hashes (secret) */
  AUTH_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  /** secret */
  GOOGLE_CLIENT_SECRET: string;
  /** 'fake' skips Google for local end-to-end tests; refused on any host but localhost */
  AUTH_MODE: 'google' | 'fake';
}
```

**`worker/crypto.ts`**

```ts
const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Unguessable id or token: 32 bytes is 256 bits. */
export const randomToken = (bytes = 32) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

export const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

export async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(data))));
}

export async function sha256(data: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(data))));
}
```

**`worker/http.ts`**

```ts
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
```

**`src/api/names.ts`**

```ts
/** Display names: 3–20 letters, digits, spaces, - or _, trimmed, no double spaces. Shared by the name card and the Worker. */
export const NAME_RULE = '3–20 letters, numbers, spaces, - or _';

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  return /^[A-Za-z0-9 _-]{3,20}$/.test(name) && !name.includes('  ') ? name : null;
}
```

**`worker/auth.ts`**

```ts
import { cleanName, NAME_RULE } from '../src/api/names.ts';
import type { User } from '../src/api/types.ts';
import { fromBase64url, hmac, randomToken, sha256 } from './crypto.ts';
import type { Env } from './env.ts';
import { cookie, getCookie, HttpError, isLocalHost, json, readBody, redirect } from './http.ts';

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

/** Only same-site paths: "/x", never "//evil.com" or "/\evil.com". */
export function safeReturn(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') && value.length <= 200 ? value : '/';
}

function withParam(path: string, key: string, value: string): string {
  const url = new URL(path, 'http://x');
  url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
}

/** Fake mode exists for local end-to-end tests. Anywhere else it would let anyone sign in as anyone. */
function checkMode(req: Request, env: Env): void {
  if (env.AUTH_MODE === 'fake' && !isLocalHost(req)) throw new HttpError(500, 'misconfigured', 'Sign-in is misconfigured.');
}

/** GET /api/auth/google?return=/path */
export async function googleStart(req: Request, env: Env): Promise<Response> {
  checkMode(req, env);
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
}

/** GET /api/auth/google/callback?code&state */
export async function googleCallback(req: Request, env: Env): Promise<Response> {
  checkMode(req, env);
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
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(
      await sessionHash(env, token),
      user!.id,
      now,
      now + SESSION_DAYS * DAY_MS,
    ),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
  ]);
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
    await env.DB.prepare('UPDATE users SET name = ?, name_key = ? WHERE id = ? AND name IS NULL').bind(name, name.toLowerCase(), user.id).run();
  } catch (e) {
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
```

**`worker/index.ts`** (auth routes only; Task 5 adds games and boards)

```ts
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
```

- [ ] **Step 5: Run the tests**

Run: `npx tsc -p . && npx vitest run`
Expected: PASS, 197 tests. The first Worker test file takes ~3 s to start its local D1.

- [ ] **Step 6: Commit**

```bash
git add migrations src/api/names.ts worker tests/worker
git commit -m "Worker: schema, sessions and Google sign-in, tested against local D1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Games, claims and leaderboards

**Files:**
- Create: `worker/boards.ts`, `worker/games.ts`, `scripts/recompute-bests.sql`, `tests/worker/games.test.ts`
- Modify: `worker/index.ts` (add the game and board routes)

**Interfaces:**
- Consumes: `judge`, `parseLog` (Task 3); `currentUser`, `requireUser` (Task 4); `boardFor`, `parseBoard`, `parseConfig` (Task 2).
- Produces:
  - **`worker/boards.ts`:** `rankOf(db, board, run)`, `recordBest(db, userId, board, gameId, run): Promise<boolean>`, `bestOf(db, userId, board)`, plus the handlers `getBoard` and `myGames`.
  - **`worker/games.ts`:** `startGame`, `finishGame`, `claimGames`, and `STARTS_PER_HOUR = 200`.
  - **Routes:**
    - `POST /api/games`
    - `POST /api/games/:id/finish`
    - `POST /api/games/claim`
    - `GET /api/boards/:mode/:region`
    - `GET /api/me/games`

- [ ] **Step 1: Write the failing tests**

**`tests/worker/games.test.ts`**

```ts
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BoardResponse, GameResult, MyGamesResponse, StartResponse } from '../../src/api/types.ts';
import type { GameConfig } from '../../src/game/types.ts';
import type { D1Database, Env } from '../../worker/env.ts';
import { STARTS_PER_HOUR } from '../../worker/games.ts';
import { call, signIn, startDb, statements, testEnv, wipe } from './harness.ts';
import { play, typeAll, type Move } from './play.ts';

let db: D1Database;
let dispose: () => Promise<void>;
let env: Env;
beforeAll(async () => {
  ({ db, dispose } = await startDb());
  env = testEnv(db);
}, 30_000);
afterAll(() => dispose());
beforeEach(() => wipe(db));

const SOUTH_AMERICA: GameConfig = { mode: 'type', scope: { continents: ['south-america'], subregions: [] }, timeLimitSec: null };

async function start(cookie?: string, config: GameConfig = SOUTH_AMERICA): Promise<StartResponse> {
  return (await call(env, 'POST', '/api/games', { cookie, body: { config } })).json();
}

/** Starts a game and finishes it with an honest log, `step` ms between moves. */
async function playGame(cookie?: string, { step = 2000, moves = typeAll, config = SOUTH_AMERICA }: { step?: number; moves?: Move; config?: GameConfig } = {}) {
  const game = await start(cookie, config);
  const res = await call(env, 'POST', `/api/games/${game.id}/finish`, { cookie, body: { log: play(config, game.seed, moves, step) } });
  return { game, res, result: (await res.clone().json()) as GameResult };
}

const board = async (cookie?: string, path = 'type/south-america'): Promise<BoardResponse> => (await call(env, 'GET', `/api/boards/${path}`, { cookie })).json();

describe('starting a game', () => {
  it('returns an id, a seed and the board; a claim token only when signed out', async () => {
    const anon = await start();
    expect(anon).toMatchObject({ board: 'type:south-america', claim: expect.any(String) });
    expect(Number.isInteger(anon.seed)).toBe(true);
    const ana = await signIn(env, 'ana@example.com');
    expect(await start(ana)).toMatchObject({ claim: null });
    const custom = await start(undefined, { ...SOUTH_AMERICA, scope: { continents: [], subregions: ['Caribbean'] } });
    expect(custom.board).toBeNull();
  });

  it('rejects setups the app could not make', async () => {
    const res = await call(env, 'POST', '/api/games', { body: { config: { ...SOUTH_AMERICA, mode: 'race' } } });
    expect(res.status).toBe(400);
  });

  it('limits starts per IP per hour', async () => {
    const first = await start();
    const { ip_hash } = (await db.prepare('SELECT ip_hash FROM games WHERE id = ?').bind(first.id).first<{ ip_hash: string }>())!;
    await db.batch(
      Array.from({ length: STARTS_PER_HOUR - 1 }, (_, i) =>
        db.prepare("INSERT INTO games (id, ip_hash, config, mode, scope_key, seed, started_at) VALUES (?, ?, '{}', 'type', 'world', 1, ?)").bind(`g${i}`, ip_hash, Date.now()),
      ),
    );
    expect((await call(env, 'POST', '/api/games', { body: { config: SOUTH_AMERICA } })).status).toBe(429);
    expect((await call(env, 'POST', '/api/games', { body: { config: SOUTH_AMERICA }, ip: '198.51.100.9' })).status).toBe(200);
  });

  it('clears unclaimed and abandoned games older than a day', async () => {
    const old = await start();
    await db.prepare('UPDATE games SET started_at = ?').bind(Date.now() - 2 * 86_400_000).run();
    await start();
    expect(await db.prepare('SELECT 1 FROM games WHERE id = ?').bind(old.id).first()).toBeNull();
  });
});

describe('finishing a game', () => {
  it('signed in: ranks, becomes the best, and shows on the board', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const { result } = await playGame(ana);
    expect(result).toMatchObject({ found: 12, total: 12, hints: 0, ms: 24_000, ranked: true, reason: null, newBest: true, best: { hints: 0, ms: 24_000, rank: 1 } });
    expect((await board(ana)).rows).toEqual([{ rank: 1, name: 'meridian', hints: 0, ms: 24_000, finishedAt: expect.any(Number), you: true }]);
  });

  it('a slower run is saved but the best stays', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    await playGame(ana);
    const { result } = await playGame(ana, { step: 3000 });
    expect(result).toMatchObject({ ranked: true, newBest: false, best: { ms: 24_000, rank: 1 } });
  });

  it('signed out: saved as anonymous with the rank it would get; claiming it ranks it', async () => {
    const bo = await signIn(env, 'bo@example.com', 'kestrel');
    await playGame(bo, { step: 1500 });
    const { game, result } = await playGame();
    expect(result).toMatchObject({ ranked: false, reason: 'anonymous', wouldRank: 2, best: null });

    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const claimed = await (await call(env, 'POST', '/api/games/claim', { cookie: ana, body: { claims: [{ id: game.id, claim: game.claim }] } })).json();
    expect(claimed.results).toEqual([expect.objectContaining({ id: game.id, ranked: true, reason: null, newBest: true, best: { hints: 0, ms: 24_000, rank: 2 } })]);
    expect((await board()).rows.map((r) => r.name)).toEqual(['kestrel', 'meridian']);
  });

  it('a wrong claim token claims nothing', async () => {
    const { game } = await playGame();
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const res = await call(env, 'POST', '/api/games/claim', { cookie: ana, body: { claims: [{ id: game.id, claim: 'guess' }] } });
    expect((await res.json()).results).toEqual([]);
  });

  it('pausing saves the game unranked', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    let paused = false;
    const { result } = await playGame(ana, {
      moves: (s, now) => (s.phase === 'paused' ? { type: 'resume', now } : !paused && s.found.length === 2 ? ((paused = true), { type: 'pause', now }) : typeAll(s, now)),
    });
    expect(result).toMatchObject({ ranked: false, reason: 'paused', best: null });
    expect((await board()).rows).toEqual([]);
  });

  it('a replay quicker than the server clock is unverified', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const game = await start(ana);
    await db.prepare('UPDATE games SET started_at = started_at - 60000').run();
    const res = await call(env, 'POST', `/api/games/${game.id}/finish`, { cookie: ana, body: { log: play(SOUTH_AMERICA, game.seed, typeAll, 2000) } });
    expect(await res.json()).toMatchObject({ ranked: false, reason: 'unverified' });
  });

  it('a log that does not replay is refused and the game discarded', async () => {
    const game = await start();
    const res = await call(env, 'POST', `/api/games/${game.id}/finish`, { body: { log: [{ t: 10, a: { type: 'found', id: 'FRA' } }] } });
    expect(res.status).toBe(422);
    expect(await db.prepare('SELECT 1 FROM games WHERE id = ?').bind(game.id).first()).toBeNull();
  });

  it('a game can only be finished once', async () => {
    const { game } = await playGame();
    const again = await call(env, 'POST', `/api/games/${game.id}/finish`, { body: { log: [] } });
    expect(again.status).toBe(409);
    expect((await call(env, 'POST', '/api/games/nope/finish', { body: { log: [] } })).status).toBe(404);
  });
});

describe('leaderboards and your games', () => {
  it('orders by hints, then time; players without a name are left off', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const bo = await signIn(env, 'bo@example.com', 'kestrel');
    const cy = await signIn(env, 'cy@example.com');
    let hinted = false;
    await playGame(ana, { step: 1000, moves: (s, now) => (hinted ? typeAll(s, now) : ((hinted = true), { type: 'hint', rand: 0.5, now })) });
    await playGame(bo, { step: 3000 });
    await playGame(cy, { step: 500 });
    const res = await board(ana);
    expect(res.rows.map((r) => [r.rank, r.name, r.hints])).toEqual([
      [1, 'kestrel', 0],
      [2, 'meridian', 1],
    ]);
    expect(res.players).toBe(2);
    expect(res.you).toMatchObject({ rank: 2, name: 'meridian', you: true });
  });

  it('pins your row when you are outside the top 50', async () => {
    const now = Date.now();
    await db.batch(
      Array.from({ length: 55 }, (_, i) => [
        db.prepare('INSERT INTO users (id, google_sub, email, name, name_key, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(`u${i}`, `s${i}`, `${i}@x.y`, `player${i}`, `player${i}`, now),
        db.prepare("INSERT INTO games (id, user_id, ip_hash, config, mode, scope_key, board, seed, started_at, finished_at, found, total, hints, ms, end_reason, ranked) VALUES (?, ?, 'h', '{}', 'type', 'south-america', 'type:south-america', 1, ?, ?, 12, 12, 0, ?, 'complete', 1)").bind(`g${i}`, `u${i}`, now, now, 10_000 + i),
        db.prepare("INSERT INTO bests (user_id, board, game_id, hints, ms, finished_at) VALUES (?, 'type:south-america', ?, 0, ?, ?)").bind(`u${i}`, `g${i}`, 10_000 + i, now),
      ]).flat(),
    );
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    await playGame(ana);
    const res = await board(ana);
    expect(res.rows).toHaveLength(50);
    expect(res.players).toBe(56);
    expect(res.you).toMatchObject({ rank: 56, name: 'meridian' });
    expect((await call(env, 'GET', '/api/boards/type/mars')).status).toBe(404);
  });

  it('your games: bests with ranks, then recent games newest first', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    await playGame(ana);
    await playGame(ana, { config: { ...SOUTH_AMERICA, scope: { continents: [], subregions: ['Caribbean'] } } });
    const mine: MyGamesResponse = await (await call(env, 'GET', '/api/me/games', { cookie: ana })).json();
    expect(mine.bests).toEqual([{ board: 'type:south-america', hints: 0, ms: 24_000, rank: 1 }]);
    expect(mine.recent.map((g) => [g.scopeKey, g.ranked, g.reason, g.isBest])).toEqual([
      ['Caribbean', false, 'custom', false],
      ['south-america', true, null, true],
    ]);
    expect((await call(env, 'GET', '/api/me/games')).status).toBe(401);
  });

  it('recompute-bests rebuilds bests after a game is deleted by hand', async () => {
    const ana = await signIn(env, 'ana@example.com', 'meridian');
    const fast = await playGame(ana, { step: 1500 });
    await playGame(ana, { step: 2500 });
    await db.prepare('DELETE FROM games WHERE id = ?').bind(fast.game.id).run();
    expect((await board()).rows).toEqual([]);
    const sql = readFileSync(new URL('../../scripts/recompute-bests.sql', import.meta.url), 'utf8');
    await db.batch(statements(sql).map((s) => db.prepare(s)));
    expect((await board()).rows).toMatchObject([{ name: 'meridian', ms: 30_000 }]);
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/worker/games.test.ts`
Expected: FAIL, cannot find module `../../worker/games.ts`

- [ ] **Step 3: Implement**

**`worker/boards.ts`**

```ts
import type { BestSummary, BoardResponse, BoardRow, MyGamesResponse, RecentGame } from '../src/api/types.ts';
import { parseBoard, type Board, type Run } from '../src/game/ranking.ts';
import type { EndReason, Mode } from '../src/game/types.ts';
import { currentUser, requireUser } from './auth.ts';
import type { D1Database, Env } from './env.ts';
import { HttpError, json } from './http.ts';

const TOP = 50;

/** 1 + how many named players' bests on `board` beat `run`. */
export async function rankOf(db: D1Database, board: Board, run: Run): Promise<number> {
  const row = await db
    .prepare(
      `SELECT count(*) AS n FROM bests b JOIN users u ON u.id = b.user_id
       WHERE b.board = ?1 AND u.name IS NOT NULL
         AND (b.hints < ?2 OR (b.hints = ?2 AND (b.ms < ?3 OR (b.ms = ?3 AND b.finished_at < ?4))))`,
    )
    .bind(board, run.hints, run.ms, run.finishedAt)
    .first<{ n: number }>();
  return row!.n + 1;
}

/** Keeps `run` as the player's best on `board` if it beats the one on record. Returns whether it did. */
export async function recordBest(db: D1Database, userId: string, board: Board, gameId: string, run: Run): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT INTO bests (user_id, board, game_id, hints, ms, finished_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, board) DO UPDATE SET game_id = excluded.game_id, hints = excluded.hints, ms = excluded.ms, finished_at = excluded.finished_at
       WHERE excluded.hints < bests.hints OR (excluded.hints = bests.hints AND excluded.ms < bests.ms)`,
    )
    .bind(userId, board, gameId, run.hints, run.ms, run.finishedAt)
    .run();
  return res.meta.changes > 0;
}

/** The player's best on `board`, ranked when they have a name (nameless players aren't on boards). */
export async function bestOf(db: D1Database, userId: string, board: Board): Promise<(BestSummary & { finishedAt: number }) | null> {
  const row = await db
    .prepare('SELECT b.hints, b.ms, b.finished_at, u.name FROM bests b JOIN users u ON u.id = b.user_id WHERE b.user_id = ? AND b.board = ?')
    .bind(userId, board)
    .first<{ hints: number; ms: number; finished_at: number; name: string | null }>();
  if (!row) return null;
  const run = { hints: row.hints, ms: row.ms, finishedAt: row.finished_at };
  return { ...run, rank: row.name === null ? null : await rankOf(db, board, run) };
}

/** GET /api/boards/:mode/:region */
export async function getBoard(req: Request, env: Env, mode: string, region: string): Promise<Response> {
  const board = `${mode}:${region}`;
  if (!parseBoard(board)) throw new HttpError(404, 'not_found', 'No such leaderboard.');
  const user = await currentUser(req, env);
  const [top, count] = await env.DB.batch([
    env.DB.prepare(
      `SELECT b.user_id, u.name, b.hints, b.ms, b.finished_at FROM bests b JOIN users u ON u.id = b.user_id
       WHERE b.board = ? AND u.name IS NOT NULL ORDER BY b.hints, b.ms, b.finished_at LIMIT ${TOP}`,
    ).bind(board),
    env.DB.prepare('SELECT count(*) AS n FROM bests b JOIN users u ON u.id = b.user_id WHERE b.board = ? AND u.name IS NOT NULL').bind(board),
  ]);
  type Row = { user_id: string; name: string; hints: number; ms: number; finished_at: number };
  const rows: BoardRow[] = (top.results as Row[]).map((r, i) => ({
    rank: i + 1,
    name: r.name,
    hints: r.hints,
    ms: r.ms,
    finishedAt: r.finished_at,
    you: r.user_id === user?.id,
  }));
  let you = rows.find((r) => r.you) ?? null;
  if (!you && user?.name) {
    const best = await bestOf(env.DB, user.id, board as Board);
    if (best?.rank) you = { rank: best.rank, name: user.name, hints: best.hints, ms: best.ms, finishedAt: best.finishedAt, you: true };
  }
  const players = (count.results[0] as { n: number }).n;
  return json({ board: board as Board, rows, players, you } satisfies BoardResponse);
}

/** GET /api/me/games */
export async function myGames(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  const [bests, recent] = await env.DB.batch([
    env.DB.prepare('SELECT board, hints, ms, finished_at FROM bests WHERE user_id = ?').bind(user.id),
    env.DB.prepare(
      `SELECT g.id, g.mode, g.scope_key, g.found, g.total, g.hints, g.ms, g.end_reason, g.ranked, g.unranked_reason, g.finished_at,
              b.game_id IS NOT NULL AS is_best
       FROM games g LEFT JOIN bests b ON b.game_id = g.id
       WHERE g.user_id = ? AND g.finished_at IS NOT NULL ORDER BY g.finished_at DESC LIMIT 50`,
    ).bind(user.id),
  ]);
  type BestRow = { board: Board; hints: number; ms: number; finished_at: number };
  const ranked = await Promise.all(
    (bests.results as BestRow[]).map(async (b) => ({
      board: b.board,
      hints: b.hints,
      ms: b.ms,
      rank: user.name === null ? null : await rankOf(env.DB, b.board, { hints: b.hints, ms: b.ms, finishedAt: b.finished_at }),
    })),
  );
  type GameRow = {
    id: string; mode: Mode; scope_key: string; found: number; total: number; hints: number; ms: number;
    end_reason: EndReason; ranked: number; unranked_reason: RecentGame['reason']; finished_at: number; is_best: number;
  };
  const games: RecentGame[] = (recent.results as GameRow[]).map((g) => ({
    id: g.id,
    mode: g.mode,
    scopeKey: g.scope_key,
    found: g.found,
    total: g.total,
    hints: g.hints,
    ms: g.ms,
    endReason: g.end_reason,
    ranked: g.ranked === 1,
    reason: g.unranked_reason,
    isBest: g.is_best === 1,
    finishedAt: g.finished_at,
  }));
  return json({ bests: ranked, recent: games } satisfies MyGamesResponse);
}
```

**`worker/games.ts`**

```ts
import type { GameResult, StartResponse, UnrankedReason } from '../src/api/types.ts';
import { boardFor, parseConfig, type Board } from '../src/game/ranking.ts';
import { scopeKey } from '../src/game/scope.ts';
import type { EndReason, GameConfig } from '../src/game/types.ts';
import { currentUser, requireUser } from './auth.ts';
import { bestOf, rankOf, recordBest } from './boards.ts';
import { hmac, randomSeed, randomToken } from './crypto.ts';
import type { Env } from './env.ts';
import { clientIp, HttpError, json, readBody } from './http.ts';
import { judge, parseLog } from './replay.ts';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
export const STARTS_PER_HOUR = 200;

interface GameRow {
  id: string;
  user_id: string | null;
  claim_hash: string | null;
  config: string;
  board: Board | null;
  seed: number;
  started_at: number;
  finished_at: number | null;
  found: number;
  total: number;
  hints: number;
  ms: number;
  end_reason: EndReason;
  ranked: number;
  unranked_reason: UnrankedReason | null;
}

/** POST /api/games { config } */
export async function startGame(req: Request, env: Env): Promise<Response> {
  const config = parseConfig((await readBody(req)).config);
  if (!config) throw new HttpError(400, 'bad_config', "That setup isn't valid.");
  const now = Date.now();
  const ipHash = await hmac(env.AUTH_SECRET, `ip:${clientIp(req)}`);
  const recent = await env.DB.prepare('SELECT count(*) AS n FROM games WHERE ip_hash = ? AND started_at > ?').bind(ipHash, now - HOUR_MS).first<{ n: number }>();
  if (recent!.n >= STARTS_PER_HOUR) throw new HttpError(429, 'rate_limited', 'Too many games from here. Try again in a bit.');

  const user = await currentUser(req, env);
  const id = randomToken(16);
  const seed = randomSeed();
  const claim = user ? null : randomToken(24);
  const board = boardFor(config);
  await env.DB.batch([
    // Housekeeping: unclaimed or abandoned games older than a day.
    env.DB.prepare(
      'DELETE FROM games WHERE id IN (SELECT id FROM games WHERE (user_id IS NULL OR finished_at IS NULL) AND started_at < ? LIMIT 50)',
    ).bind(now - DAY_MS),
    env.DB.prepare(
      'INSERT INTO games (id, user_id, claim_hash, ip_hash, config, mode, scope_key, board, seed, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(id, user?.id ?? null, claim && (await hmac(env.AUTH_SECRET, `claim:${claim}`)), ipHash, JSON.stringify(config), config.mode, scopeKey(config.scope), board, seed, now),
  ]);
  return json({ id, claim, seed, board } satisfies StartResponse);
}

/** The response for a finished game; records a new best first when the game ranks and has an owner. */
async function result(env: Env, game: GameRow): Promise<GameResult> {
  const run = { hints: game.hints, ms: game.ms, finishedAt: game.finished_at! };
  const owned = game.user_id !== null && game.board !== null;
  const newBest = owned && game.ranked === 1 ? await recordBest(env.DB, game.user_id!, game.board!, game.id, run) : false;
  return {
    id: game.id,
    board: game.board,
    found: game.found,
    total: game.total,
    hints: game.hints,
    ms: game.ms,
    endReason: game.end_reason,
    ranked: game.ranked === 1,
    reason: game.unranked_reason,
    newBest,
    best: owned ? await bestOf(env.DB, game.user_id!, game.board!).then((b) => b && { hints: b.hints, ms: b.ms, rank: b.rank }) : null,
    wouldRank: game.unranked_reason === 'anonymous' ? await rankOf(env.DB, game.board!, run) : null,
  };
}

/** POST /api/games/:id/finish { log } */
export async function finishGame(req: Request, env: Env, id: string): Promise<Response> {
  const receivedAt = Date.now();
  const body = await readBody(req);
  const game = await env.DB.prepare('SELECT * FROM games WHERE id = ?').bind(id).first<GameRow>();
  if (!game) throw new HttpError(404, 'not_found', "That game isn't on record.");
  if (game.finished_at !== null) throw new HttpError(409, 'finished', 'That game was already saved.');

  const log = parseLog(body.log);
  const config = JSON.parse(game.config) as GameConfig;
  const verdict = log && judge({ config, seed: game.seed, log, board: game.board, serverElapsedMs: receivedAt - game.started_at });
  if (!verdict) {
    await env.DB.prepare('DELETE FROM games WHERE id = ?').bind(id).run();
    throw new HttpError(422, 'unverified', "This game couldn't be verified.");
  }
  // Everything checks out but nobody owns it yet: it ranks once claimed.
  const reason: UnrankedReason | null = verdict.reason ?? (game.user_id ? null : 'anonymous');
  const done: GameRow = {
    ...game,
    finished_at: receivedAt,
    found: verdict.found,
    total: verdict.total,
    hints: verdict.hints,
    ms: verdict.ms,
    end_reason: verdict.endReason,
    ranked: reason === null ? 1 : 0,
    unranked_reason: reason,
  };
  const saved = await env.DB.prepare(
    'UPDATE games SET finished_at = ?, found = ?, total = ?, hints = ?, ms = ?, end_reason = ?, ranked = ?, unranked_reason = ?, log = ? WHERE id = ? AND finished_at IS NULL',
  )
    .bind(receivedAt, done.found, done.total, done.hints, done.ms, done.end_reason, done.ranked, reason, JSON.stringify(log), id)
    .run();
  if (saved.meta.changes === 0) throw new HttpError(409, 'finished', 'That game was already saved.');
  return json(await result(env, done));
}

/** POST /api/games/claim { claims: [{ id, claim }] }: games played signed out, now owned. */
export async function claimGames(req: Request, env: Env): Promise<Response> {
  const user = await requireUser(req, env);
  const body = await readBody(req);
  const claims = Array.isArray(body.claims) ? body.claims.slice(0, 20) : [];
  const results: GameResult[] = [];
  for (const c of claims as { id?: unknown; claim?: unknown }[]) {
    if (typeof c?.id !== 'string' || typeof c.claim !== 'string') continue;
    const game = await env.DB.prepare('SELECT * FROM games WHERE id = ? AND user_id IS NULL').bind(c.id).first<GameRow>();
    if (!game || game.claim_hash !== (await hmac(env.AUTH_SECRET, `claim:${c.claim}`))) continue;
    const ranked = game.unranked_reason === 'anonymous';
    const owned: GameRow = { ...game, user_id: user.id, claim_hash: null, ranked: ranked ? 1 : game.ranked, unranked_reason: ranked ? null : game.unranked_reason };
    await env.DB.prepare('UPDATE games SET user_id = ?, claim_hash = NULL, ranked = ?, unranked_reason = ? WHERE id = ? AND user_id IS NULL')
      .bind(user.id, owned.ranked, owned.unranked_reason, game.id)
      .run();
    if (owned.finished_at !== null) results.push(await result(env, owned));
  }
  return json({ results });
}
```

**`scripts/recompute-bests.sql`**

```sql
-- Rebuilds every player's best from their ranked games. Run after deleting games by hand:
--   npm run recompute-bests -- --remote   (production)
--   npm run recompute-bests -- --local    (local dev database)
DELETE FROM bests;
INSERT INTO bests (user_id, board, game_id, hints, ms, finished_at)
SELECT user_id, board, id, hints, ms, finished_at FROM (
  SELECT g.*, row_number() OVER (PARTITION BY user_id, board ORDER BY hints, ms, finished_at) AS n
  FROM games g WHERE ranked = 1 AND user_id IS NOT NULL AND board IS NOT NULL
) WHERE n = 1;
```

**`worker/index.ts`** (full route table)

```ts
import { deleteMe, googleCallback, googleStart, me, nameAvailable, setName, signOut } from './auth.ts';
import { getBoard, myGames } from './boards.ts';
import type { Env } from './env.ts';
import { claimGames, finishGame, startGame } from './games.ts';
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
```

- [ ] **Step 4: Run the tests**

Run: `npx tsc -p . && npx vitest run`
Expected: PASS, 213 tests

- [ ] **Step 5: Commit**

```bash
git add worker scripts/recompute-bests.sql tests/worker/games.test.ts
git commit -m "Worker: start, finish and claim games; leaderboards and your games

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Deploy configuration, local full stack, Vercel removed

**Files:**
- Modify: `wrangler.jsonc` (full replacement), `public/_headers`, `tests/deploy/headers.test.ts`, `package.json`, `.gitignore`
- Create: `.dev.vars.example`
- Delete: `vercel.json`

- [ ] **Step 1: Update the deploy test first** (it now expects the Worker, D1 and SPA fallback)

**`tests/deploy/headers.test.ts`** (modify)

```diff
--- a/tests/deploy/headers.test.ts
+++ b/tests/deploy/headers.test.ts
@@ -9,16 +9,16 @@ describe('deploy headers', () => {
     expect(read('public/_headers')).toContain(`Content-Security-Policy: ${CSP}`);
   });
 
-  it('vercel.json carries the same CSP', () => {
-    const vercel = JSON.parse(read('vercel.json'));
-    const all = vercel.headers.find((h: { source: string }) => h.source === '/(.*)');
-    expect(all.headers).toContainEqual({ key: 'Content-Security-Policy', value: CSP });
-  });
-
-  it('wrangler serves static assets only, with no Worker script', () => {
+  it('wrangler runs the Worker only for /api/* and serves the app for client routes', () => {
     const config = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
-    expect(config.main).toBeUndefined();
-    expect(config.assets.directory).toBe('./dist');
+    expect(config.main).toBe('worker/index.ts');
+    expect(config.assets).toEqual({ directory: './dist', not_found_handling: 'single-page-application', run_worker_first: ['/api/*'] });
     expect(config.routes).toContainEqual({ pattern: 'mapped.lukeghanna.com', custom_domain: true });
+    expect(config.d1_databases).toEqual([expect.objectContaining({ binding: 'DB', database_name: 'mapped', migrations_dir: 'migrations' })]);
+    expect(config.vars.AUTH_MODE).toBe('google');
+  });
+
+  it('client routes are never cached', () => {
+    for (const path of ['/index.html', '/signin', '/me', '/leaderboards/*']) expect(read('public/_headers')).toContain(`${path}\n  Cache-Control: no-cache`);
   });
 });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/deploy/headers.test.ts`
Expected: FAIL: `config.main` is undefined, and `/signin` has no Cache-Control rule

- [ ] **Step 3: Update the config**

**`wrangler.jsonc`** (`database_id` and `GOOGLE_CLIENT_ID` are filled in during Task 11)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  // The Vite build is served as static assets. The Worker runs only for /api/* (run_worker_first),
  // so loading the app and the map never costs a Worker request on the free plan.
  "name": "mapped",
  "main": "worker/index.ts",
  "routes": [{ "pattern": "mapped.lukeghanna.com", "custom_domain": true }],
  "compatibility_date": "2026-10-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application",
    "run_worker_first": ["/api/*"]
  },
  "d1_databases": [
    { "binding": "DB", "database_name": "mapped", "database_id": "REPLACE_WITH_D1_ID", "migrations_dir": "migrations" }
  ],
  // Secrets (wrangler secret put): AUTH_SECRET, GOOGLE_CLIENT_SECRET. Local dev reads .dev.vars.
  "vars": { "AUTH_MODE": "google", "GOOGLE_CLIENT_ID": "REPLACE_WITH_GOOGLE_CLIENT_ID" },
  "observability": { "enabled": true }
}
```

**`public/_headers`** (modify)

```diff
--- a/public/_headers
+++ b/public/_headers
@@ -1,4 +1,5 @@
-# Cloudflare Workers static assets: per-path response headers. Keep CSP in sync with src/headers.ts and vercel.json.
+# Cloudflare Workers static assets: per-path response headers. Keep CSP in sync with src/headers.ts.
+# API responses come from the Worker and set their own headers.
 /*
   Content-Security-Policy: default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
   X-Content-Type-Options: nosniff
@@ -11,3 +12,13 @@
 
 /index.html
   Cache-Control: no-cache
+
+# Client routes are served index.html by the single-page-application fallback.
+/signin
+  Cache-Control: no-cache
+
+/me
+  Cache-Control: no-cache
+
+/leaderboards/*
+  Cache-Control: no-cache
```

**`package.json`** (modify)

```diff
--- a/package.json
+++ b/package.json
@@ -1,7 +1,7 @@
 {
   "name": "mapped",
   "private": true,
-  "version": "1.0.0",
+  "version": "2.0.0",
   "type": "module",
   "engines": {
     "node": ">=24"
@@ -14,7 +14,10 @@
     "test:watch": "vitest",
     "e2e": "playwright test",
     "geo": "node scripts/build-geo.ts",
-    "deploy": "npm run build && wrangler deploy"
+    "deploy": "npm run build && wrangler d1 migrations apply mapped --remote && wrangler deploy",
+    "serve:e2e": "rm -rf .wrangler/e2e && wrangler d1 migrations apply mapped --local --persist-to .wrangler/e2e && wrangler dev --port 4173 --local-upstream localhost:4173 --persist-to .wrangler/e2e --var AUTH_MODE:fake --var AUTH_SECRET:e2e-secret --var GOOGLE_CLIENT_SECRET:unused",
+    "recompute-bests": "wrangler d1 execute mapped --file scripts/recompute-bests.sql",
+    "dev:full": "npm run build && wrangler d1 migrations apply mapped --local && wrangler dev --port 8787 --local-upstream localhost:8787"
   },
   "dependencies": {
     "@fontsource-variable/geist": "^5.3.0",
```

**`.dev.vars.example`**

```
# Copy to .dev.vars for `npm run dev:full`. Fake mode signs you in without Google (localhost only).
AUTH_MODE=fake
AUTH_SECRET=local-dev-secret
GOOGLE_CLIENT_SECRET=unused-in-fake-mode
```

**`.gitignore`** (full replacement: drops `.vercel/`, adds `.dev.vars`)

```
node_modules/
dist/
.superpowers/
.wrangler/
.dev.vars
test-results/
playwright-report/
.DS_Store
```

```bash
git rm vercel.json
```

- [ ] **Step 4: Run the tests, then check the full stack by hand**

Run: `npx vitest run`
Expected: PASS, 213 tests

Run: `npm run build && npm run serve:e2e` in one terminal. Then:

```bash
curl -s -D - -o /dev/null localhost:4173/leaderboards/type/world | grep -iE "^HTTP|content-security|cache-control"
curl -s -c /tmp/jar -o /dev/null -w "%{redirect_url}\n" "localhost:4173/api/auth/google?return=/me&as=t@x.y"
```

Expected:

- The first command shows `200`, the production CSP, and `Cache-Control: no-cache`.
- The second prints `http://localhost:4173/api/auth/google/callback?code=fake%3At%40x.y&state=…`.

Stop the server.

- [ ] **Step 5: Commit**

```bash
git add -A wrangler.jsonc public/_headers tests/deploy package.json package-lock.json .gitignore .dev.vars.example vercel.json
git commit -m "Deploy the Worker for /api/* with D1; full-stack local dev; drop Vercel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: Browser API layer, sign-in round trip and routes

**Files:**
- Create:
  - `src/api/client.ts`, `src/api/resume.ts`, `src/api/session.ts`, `src/ui/router.ts`
  - `tests/api/client.test.ts`, `tests/api/resume.test.ts`, `tests/ui/router.test.ts`
- Modify: `src/game/scope.ts` (add `scopeFromKey`), `tests/game/scope.test.ts`

**Interfaces:**
- Produces:
  - **`src/api/client.ts`:** `ApiError { status; code }`, `START_TIMEOUT_MS = 1500`, `signInHref(returnPath)`, and the `api` methods:
    - `me`, `checkName`, `setName`, `signOut`, `deleteAccount`
    - `startGame`, `finishGame`, `claim`
    - `board`, `myGames`
  - **`src/api/resume.ts`:**
    - Types: `Run { id; claim; board }`, `SaveState` (`offline | saving | error | unverified | saved { result }`), `Resume`.
    - Functions: `sessionStore()`, `readClaims`, `addClaim`, `clearClaims`, `saveResume`, `takeResume`.
  - **`src/api/session.ts`:** `useSession(): { user: User | null | undefined; setUser; signOut }`.
  - **`src/ui/router.ts`:** `Route`, `parseRoute`, `routePath`, `useRoute(): [Route, go(route, { replace? })]`.
  - **`src/game/scope.ts`:** `scopeFromKey(key): Scope`.

- [ ] **Step 1: Write the failing tests**

**`tests/api/client.test.ts`**

```ts
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
```

**`tests/api/resume.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { addClaim, clearClaims, readClaims, saveResume, takeResume } from '../../src/api/resume.ts';
import { initialState } from '../../src/game/reducer.ts';

/** A Map-backed Storage, since tests run in Node. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const HOUR = 3_600_000;

describe('claims', () => {
  it('keeps claims for a day, without duplicates', () => {
    const s = memoryStorage();
    addClaim(s, { id: 'a', claim: 'x' }, 0);
    addClaim(s, { id: 'a', claim: 'x' }, 10);
    addClaim(s, { id: 'b', claim: 'y' }, 20 * HOUR);
    expect(readClaims(s, 23 * HOUR).map((c) => c.id)).toEqual(['a', 'b']);
    expect(readClaims(s, 25 * HOUR).map((c) => c.id)).toEqual(['b']);
    clearClaims(s);
    expect(readClaims(s, 0)).toEqual([]);
  });

  it('survives storage being unavailable', () => {
    addClaim(null, { id: 'a', claim: 'x' }, 0);
    expect(readClaims(null, 0)).toEqual([]);
  });
});

describe('resume', () => {
  const state = { ...initialState({ mode: 'type', scope: { continents: [], subregions: [] }, timeLimitSec: null }), phase: 'review' as const };

  it('comes back once', () => {
    const s = memoryStorage();
    saveResume(s, { state, run: { id: 'g', claim: 'c', board: 'type:world' }, save: { status: 'saving' } }, 0);
    expect(takeResume(s, 60_000)).toMatchObject({ state, run: { id: 'g' } });
    expect(takeResume(s, 60_000)).toBeNull();
  });

  it('expires after 30 minutes', () => {
    const s = memoryStorage();
    saveResume(s, { state, run: null, save: null }, 0);
    expect(takeResume(s, 31 * 60_000)).toBeNull();
  });
});
```

**`tests/ui/router.test.ts`**

```ts
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
```

**`tests/game/scope.test.ts`** (modify)

```diff
--- a/tests/game/scope.test.ts
+++ b/tests/game/scope.test.ts
@@ -1,6 +1,7 @@
 import { describe, expect, it } from 'vitest';
 import { COUNTRIES } from '../../src/data/countries.ts';
-import { poolFor, scopeKey, scopeLabel, subregionsOf, WORLD } from '../../src/game/scope.ts';
+import { poolFor, scopeFromKey, scopeKey, scopeLabel, subregionsOf, WORLD } from '../../src/game/scope.ts';
+import type { Scope } from '../../src/game/types.ts';
 
 describe('scope', () => {
   it('world is every country', () => expect(poolFor(WORLD, COUNTRIES)).toHaveLength(197));
@@ -30,3 +31,13 @@ describe('scope', () => {
     expect(scopeKey(WORLD)).toBe('world');
   });
 });
+
+describe('scopeFromKey', () => {
+  it('round-trips every scope key', () => {
+    const subregions = [...new Set(COUNTRIES.map((c) => c.subregion))];
+    for (const scope of [WORLD, { continents: ['europe', 'asia'], subregions: [] }, { continents: ['africa'], subregions: subregions.slice(0, 5) }, { continents: [], subregions }] as Scope[]) {
+      expect(scopeKey(scopeFromKey(scopeKey(scope)))).toBe(scopeKey(scope));
+    }
+    expect(subregions.every((s) => !s.includes(','))).toBe(true);
+  });
+});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/api tests/ui/router.test.ts tests/game/scope.test.ts`
Expected: FAIL, missing modules and `scopeFromKey`

- [ ] **Step 3: Implement**

**`src/api/client.ts`**

```ts
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
```

**`src/api/resume.ts`**

```ts
import type { GameState } from '../game/types.ts';
import { readJson, writeJson } from '../store/storage.ts';
import type { GameResult } from './types.ts';

/** What survives the round trip to Google: games to claim, and the review screen to come back to. */

const CLAIMS = 'mapped:claims:v1';
const RESUME = 'mapped:resume:v1';
const CLAIM_TTL_MS = 24 * 3_600_000;
const RESUME_TTL_MS = 30 * 60_000;

export interface Claim {
  id: string;
  claim: string;
  at: number;
}

/** The online game behind the current screen. */
export interface Run {
  id: string;
  claim: string | null;
  board: GameResult['board'];
}

export type SaveState =
  | { status: 'offline' }
  | { status: 'saving' }
  | { status: 'error' }
  | { status: 'unverified' }
  | { status: 'saved'; result: GameResult };

export interface Resume {
  state: GameState;
  run: Run | null;
  save: SaveState | null;
  at: number;
}

export function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readClaims(storage: Storage | null, now: number): Claim[] {
  return (readJson<Claim[]>(storage, CLAIMS) ?? []).filter((c) => now - c.at < CLAIM_TTL_MS);
}

export function addClaim(storage: Storage | null, claim: { id: string; claim: string }, now: number): void {
  writeJson(storage, CLAIMS, [...readClaims(storage, now).filter((c) => c.id !== claim.id), { ...claim, at: now }]);
}

export function clearClaims(storage: Storage | null): void {
  try {
    storage?.removeItem(CLAIMS);
  } catch {
    // nothing to clear
  }
}

export function saveResume(storage: Storage | null, resume: Omit<Resume, 'at'>, now: number): void {
  writeJson(storage, RESUME, { ...resume, at: now });
}

/** The saved review, once: reading it removes it. Null when missing or older than 30 minutes. */
export function takeResume(storage: Storage | null, now: number): Resume | null {
  const resume = readJson<Resume>(storage, RESUME);
  try {
    storage?.removeItem(RESUME);
  } catch {
    // ignore
  }
  return resume && now - resume.at < RESUME_TTL_MS ? resume : null;
}
```

**`src/api/session.ts`**

```ts
import { useEffect, useState } from 'react';
import { api } from './client.ts';
import type { User } from './types.ts';

/** The signed-in player: undefined while loading, null when signed out (or offline). */
export function useSession() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    api.me().then(
      (r) => setUser(r.user),
      () => setUser(null),
    );
  }, []);
  const signOut = async () => {
    await api.signOut().catch(() => undefined);
    setUser(null);
  };
  return { user, setUser, signOut };
}
```

**`src/ui/router.ts`**

```ts
import { useEffect, useState } from 'react';
import { BOARD_MODES, BOARD_REGIONS, type Region } from '../game/ranking.ts';
import type { Mode } from '../game/types.ts';

export type Route = { name: 'home' } | { name: 'signin' } | { name: 'me' } | { name: 'board'; mode: Mode; region: Region };

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/signin') return { name: 'signin' };
  if (path === '/me') return { name: 'me' };
  const board = /^\/leaderboards(?:\/([a-z]+)\/([a-z-]+))?$/.exec(path);
  if (board) {
    const mode = (board[1] ?? 'type') as Mode;
    const region = (board[2] ?? 'world') as Region;
    if (BOARD_MODES.includes(mode) && BOARD_REGIONS.includes(region)) return { name: 'board', mode, region };
  }
  return { name: 'home' };
}

export function routePath(route: Route): string {
  if (route.name === 'board') return `/leaderboards/${route.mode}/${route.region}`;
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
```

**`src/game/scope.ts`** (modify)

```diff
--- a/src/game/scope.ts
+++ b/src/game/scope.ts
@@ -46,3 +46,11 @@ export function scopeKey(scope: Scope): string {
   if (isWorld(scope)) return 'world';
   return [...[...scope.continents].sort(), ...[...scope.subregions].sort()].join(',');
 }
+
+/** The scope a `scopeKey` came from (continent ids and subregion names never collide). */
+export function scopeFromKey(key: string): Scope {
+  if (key === 'world') return WORLD;
+  const parts = key.split(',');
+  const isContinent = (p: string) => CONTINENTS.some((c) => c.id === p);
+  return { continents: parts.filter(isContinent) as Continent[], subregions: parts.filter((p) => !isContinent(p)) };
+}
```

- [ ] **Step 4: Run the tests**

Run: `npx tsc -p . && npx vitest run`
Expected: PASS, 226 tests

- [ ] **Step 5: Commit**

```bash
git add src/api src/ui/router.ts src/game/scope.ts tests/api tests/ui/router.test.ts tests/game/scope.test.ts
git commit -m "Browser API client, sign-in round-trip storage, and routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Account and leaderboard components

These are self-contained components; Task 9 wires them in.

**Files:**
- Create:
  - `src/ui/accountText.ts`, `tests/ui/accountText.test.ts`
  - Components: `src/ui/CenterCard.tsx`, `RankedTag.tsx`, `SignInCard.tsx`, `NameCard.tsx`, `UserMenu.tsx`, `DeleteAccount.tsx`, `SaveCard.tsx`, `Leaderboard.tsx`, `YourGames.tsx`
  - `src/styles/account.css`
- Modify: `src/ui/Icon.tsx` (add `down` and `trophy`), `src/main.tsx` (import the stylesheet)

**Interfaces:**
- Consumes: `api` and `SaveState` (Task 7); `boardLabel`, `regionLabel`, `BOARD_MODES`, `BOARD_REGIONS` (Task 2); `MODES` from `SetupCard.tsx`.
- Produces:
  - **Text helpers:** `hintsText(n)`, `REASON_TEXT`, `maskEmail(email)`, `saveMessage(save, signedIn): SaveMessage`.
  - **Component props:**
    - `<CenterCard label title subtitle? wide? onClose>`
    - `<RankedTag text?>`
    - `<SignInCard onSignIn onClose>`
    - `<NameCard onDone(user) onClose>`
    - `<UserMenu user onGames onBoards onPickName onSignOut onDelete>`
    - `<DeleteAccount user onDeleted onClose>`
    - `<SaveCard save signedIn onSignIn onRetry onBoard(board)>`
    - `<Leaderboard mode region onPick(mode, region) onClose>`
    - `<YourGames user onBoard(board) onClose>`

- [ ] **Step 1: Write the failing test for the save-card text**

**`tests/ui/accountText.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import type { GameResult } from '../../src/api/types.ts';
import { maskEmail, saveMessage } from '../../src/ui/accountText.ts';

const result = (over: Partial<GameResult> = {}): GameResult => ({
  id: 'g',
  board: 'type:world',
  found: 197,
  total: 197,
  hints: 0,
  ms: 847_000,
  endReason: 'complete',
  ranked: true,
  reason: null,
  newBest: false,
  best: null,
  wouldRank: null,
  ...over,
});
const saved = (over: Partial<GameResult> = {}) => ({ status: 'saved' as const, result: result(over) });

describe('save card text', () => {
  it('signed out, rankable: invites you to sign in with the rank you would get', () => {
    expect(saveMessage(saved({ ranked: false, reason: 'anonymous', wouldRank: 12 }), false)).toMatchObject({
      tone: 'gold',
      title: 'Sign in to save this run',
      detail: '0 hints · 14:07 would put you #12 on World · Type.',
      signIn: true,
    });
  });

  it('signed out, not rankable: still offers to keep it', () => {
    expect(saveMessage(saved({ ranked: false, reason: 'custom', board: null }), false)).toMatchObject({
      title: 'Sign in to keep your games',
      detail: 'Unranked: custom regions.',
      signIn: true,
    });
  });

  it('a new best, with and without a name', () => {
    expect(saveMessage(saved({ newBest: true, best: { hints: 0, ms: 847_000, rank: 12 } }), true)).toMatchObject({
      tone: 'gold',
      title: 'Saved · #12 on World · Type',
      detail: 'New personal best.',
      board: 'type:world',
    });
    expect(saveMessage(saved({ newBest: true, best: { hints: 0, ms: 847_000, rank: null } }), true).detail).toBe(
      'Pick a name to appear on the leaderboard.',
    );
  });

  it('ranked but not a best', () => {
    expect(saveMessage(saved({ best: { hints: 1, ms: 832_000, rank: 9 } }), true).detail).toBe('Your best on World · Type stays 1 hint · 13:52 (#9).');
  });

  it('unranked, signed in', () => {
    expect(saveMessage(saved({ ranked: false, reason: 'paused' }), true)).toMatchObject({ title: 'Saved', detail: 'Unranked: paused.', signIn: false });
  });

  it('offline, saving, failed, unverified', () => {
    expect(saveMessage({ status: 'offline' }, false).detail).toBe("This game wasn't saved.");
    expect(saveMessage({ status: 'saving' }, true).title).toBe('Saving…');
    expect(saveMessage({ status: 'error' }, true)).toMatchObject({ tone: 'warn', retry: true });
    expect(saveMessage({ status: 'unverified' }, true).detail).toBe("This game couldn't be verified.");
  });
});

it('masks emails for the user menu', () => {
  expect(maskEmail('meridian@gmail.com')).toBe('m•••@gmail.com');
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/ui/accountText.test.ts`
Expected: FAIL, cannot find module

- [ ] **Step 3: Implement the text helpers**

**`src/ui/accountText.ts`**

```ts
import type { SaveState } from '../api/resume.ts';
import type { UnrankedReason } from '../api/types.ts';
import { formatClock } from '../game/format.ts';
import { boardLabel, type Board } from '../game/ranking.ts';

export const hintsText = (n: number) => `${n} hint${n === 1 ? '' : 's'}`;

export const REASON_TEXT: Record<UnrankedReason, string> = {
  custom: 'custom regions',
  incomplete: 'not complete',
  paused: 'paused',
  unverified: "couldn't verify",
  anonymous: 'not signed in',
};

/** "m•••@gmail.com" */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  return at < 1 ? email : `${email[0]}•••${email.slice(at)}`;
}

export interface SaveMessage {
  tone: 'gold' | 'plain' | 'warn';
  title: string;
  detail: string | null;
  /** show Sign in */
  signIn: boolean;
  /** show Retry */
  retry: boolean;
  /** the board to link to */
  board: Board | null;
}

const msg = (tone: SaveMessage['tone'], title: string, detail: string | null = null, extra: Partial<SaveMessage> = {}): SaveMessage => ({
  tone,
  title,
  detail,
  signIn: false,
  retry: false,
  board: null,
  ...extra,
});

/** What the save card says after a game. */
export function saveMessage(save: SaveState, signedIn: boolean): SaveMessage {
  if (save.status === 'offline') return msg('plain', 'Offline', "This game wasn't saved.");
  if (save.status === 'saving') return msg('plain', 'Saving…');
  if (save.status === 'error') return msg('warn', "Couldn't save this game.", null, { retry: true });
  if (save.status === 'unverified') return msg('plain', 'Not saved', "This game couldn't be verified.");
  const r = save.result;
  const label = r.board && boardLabel(r.board);
  if (r.reason === 'anonymous') {
    const detail = `${hintsText(r.hints)} · ${formatClock(r.ms)} would put you #${r.wouldRank} on ${label}.`;
    return msg('gold', 'Sign in to save this run', detail, { signIn: true, board: r.board });
  }
  if (!r.ranked && !signedIn) return msg('plain', 'Sign in to keep your games', `Unranked: ${REASON_TEXT[r.reason!]}.`, { signIn: true });
  if (!r.ranked) return msg('plain', 'Saved', `Unranked: ${REASON_TEXT[r.reason!]}.`);
  if (r.newBest) {
    return r.best?.rank
      ? msg('gold', `Saved · #${r.best.rank} on ${label}`, 'New personal best.', { board: r.board })
      : msg('gold', 'Saved · new personal best', 'Pick a name to appear on the leaderboard.');
  }
  const b = r.best!;
  const rank = b.rank ? ` (#${b.rank})` : '';
  return msg('plain', 'Saved', `Your best on ${label} stays ${hintsText(b.hints)} · ${formatClock(b.ms)}${rank}.`, { board: r.board });
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run tests/ui/accountText.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Add the icons, components and styles**

**`src/ui/Icon.tsx`** (modify)

```diff
--- a/src/ui/Icon.tsx
+++ b/src/ui/Icon.tsx
@@ -12,6 +12,8 @@ const PATHS = {
   close: 'M6 6l12 12M18 6 6 18',
   skip: 'M6 5.5v13l9-6.5zM18 5v14',
   back: 'M10 6 4 12l6 6M4 12h16',
+  down: 'M6 9l6 6 6-6',
+  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4v4h-4z',
 } as const;
 
 export type IconName = keyof typeof PATHS;
```

**`src/ui/CenterCard.tsx`**

```tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';

interface CenterCardProps {
  label: string;
  title: string;
  subtitle?: ReactNode;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}

/** A centred card over a dimmed map (a bottom sheet on phones). Esc or a click outside closes it. */
export function CenterCard({ label, title, subtitle, wide = false, onClose, children }: CenterCardProps) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="veil" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className={`center-card glass ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="card-head">
          <div>
            <h2 className="card-title">{title}</h2>
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
```

**`src/ui/RankedTag.tsx`**

```tsx
import { Icon } from './Icon.tsx';

/** The gold trophy pill: "Ranked", "World · Type board", "#12". */
export function RankedTag({ text = 'Ranked' }: { text?: string }) {
  return (
    <span className="ranked">
      <Icon name="trophy" size={12} />
      {text}
    </span>
  );
}
```

**`src/ui/SignInCard.tsx`**

```tsx
import { CenterCard } from './CenterCard.tsx';

/** Google's four-colour G, per their sign-in branding guidelines. */
function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function SignInCard({ onSignIn, onClose }: { onSignIn: () => void; onClose: () => void }) {
  return (
    <CenterCard label="Sign in" title="Sign in to Mapped" subtitle="Save your games and get on the leaderboards." onClose={onClose}>
      <button type="button" className="google-btn" onClick={onSignIn}>
        <GoogleG />
        Sign in with Google
      </button>
      <div className="card-foot">
        <span className="mute">Only your display name is ever shown.</span>
        <button type="button" className="link-btn" onClick={onClose}>
          Not now
        </button>
      </div>
    </CenterCard>
  );
}
```

**`src/ui/NameCard.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import { cleanName, NAME_RULE } from '../api/names.ts';
import type { User } from '../api/types.ts';
import { CenterCard } from './CenterCard.tsx';

type Check = { ok: boolean; text: string } | null;

/** Picks the display name, once, right after the first sign-in. */
export function NameCard({ onDone, onClose }: { onDone: (user: User) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const [check, setCheck] = useState<Check>(null);
  const [busy, setBusy] = useState(false);

  // Live check, 300 ms after typing stops. Stale answers are ignored.
  useEffect(() => {
    if (!name.trim()) return setCheck(null);
    const clean = cleanName(name);
    if (!clean) return setCheck({ ok: false, text: NAME_RULE });
    let live = true;
    const id = window.setTimeout(() => {
      api.checkName(clean).then(
        (r) => live && setCheck(r.available ? { ok: true, text: 'Available' } : { ok: false, text: r.reason === 'taken' ? 'That name is taken.' : NAME_RULE }),
        () => live && setCheck(null),
      );
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [name]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (!clean || busy) return;
    setBusy(true);
    api.setName(clean).then(
      (r) => onDone(r.user),
      (err: Error) => {
        setBusy(false);
        setCheck({ ok: false, text: err.message });
      },
    );
  };

  return (
    <CenterCard label="Pick a name" title="Pick a name" subtitle="This is what the leaderboards show. Your email never appears." onClose={onClose}>
      <form className="name-form" onSubmit={submit}>
        <label className="label" htmlFor="display-name">
          Display name
        </label>
        <input
          id="display-name"
          className="field"
          value={name}
          maxLength={20}
          autoComplete="nickname"
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <div className={`field-note ${check?.ok ? 'ok' : check ? 'bad' : ''}`} aria-live="polite">
          {check ? (check.ok ? `✓ ${check.text}` : check.text) : NAME_RULE}
        </div>
        <button type="submit" className="btn primary wide-btn" disabled={busy || !cleanName(name)}>
          {busy ? 'Saving…' : 'Done'}
        </button>
      </form>
      <div className="card-foot">
        <span className="mute">You can play without one; you just won't show on boards.</span>
        <button type="button" className="link-btn" onClick={onClose}>
          Not now
        </button>
      </div>
    </CenterCard>
  );
}
```

**`src/ui/UserMenu.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import type { User } from '../api/types.ts';
import { maskEmail } from './accountText.ts';
import { Icon } from './Icon.tsx';

interface UserMenuProps {
  user: User;
  onGames: () => void;
  onBoards: () => void;
  onPickName: () => void;
  onSignOut: () => void;
  onDelete: () => void;
}

/** The name chip and its menu. */
export function UserMenu({ user, onGames, onBoards, onPickName, onSignOut, onDelete }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="namechip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="avatar" aria-hidden="true">
          {(user.name ?? user.email)[0].toUpperCase()}
        </span>
        <span className="namechip-name">{user.name ?? 'Pick a name'}</span>
        <Icon name="down" size={14} />
      </button>
      {open && (
        <div className="menu glass" role="menu">
          <div className="menu-who mute">Signed in as {maskEmail(user.email)}</div>
          {user.name === null && (
            <button type="button" role="menuitem" onClick={pick(onPickName)}>
              Pick a name
            </button>
          )}
          <button type="button" role="menuitem" onClick={pick(onGames)}>
            Your games
          </button>
          <button type="button" role="menuitem" onClick={pick(onBoards)}>
            Leaderboards
          </button>
          <hr />
          <button type="button" role="menuitem" onClick={pick(onSignOut)}>
            Sign out
          </button>
          <button type="button" role="menuitem" className="danger" onClick={pick(onDelete)}>
            Delete account…
          </button>
        </div>
      )}
    </div>
  );
}
```

**`src/ui/DeleteAccount.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { api } from '../api/client.ts';
import type { User } from '../api/types.ts';
import { CenterCard } from './CenterCard.tsx';

/** Like Give up: a deliberate confirm. You type your name (or email, before you have one). */
export function DeleteAccount({ user, onDeleted, onClose }: { user: User; onDeleted: () => void; onClose: () => void }) {
  const expected = user.name ?? user.email;
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    api.deleteAccount(typed).then(onDeleted, (err: Error) => {
      setBusy(false);
      setError(err.message);
    });
  };
  return (
    <CenterCard label="Delete account" title="Delete your account?" subtitle="Your games, bests and leaderboard places are removed for good." onClose={onClose}>
      <form className="name-form" onSubmit={submit}>
        <label className="label" htmlFor="confirm-delete">
          Type <b>{expected}</b> to confirm
        </label>
        <input id="confirm-delete" className="field" value={typed} autoFocus autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        {error && <div className="field-note bad">{error}</div>}
        <div className="pause-actions">
          <button type="button" className="btn" onClick={onClose}>
            Keep my account
          </button>
          <button type="submit" className="btn danger" disabled={busy || typed !== expected}>
            Delete account
          </button>
        </div>
      </form>
    </CenterCard>
  );
}
```

**`src/ui/SaveCard.tsx`**

```tsx
import { useState } from 'react';
import type { SaveState } from '../api/resume.ts';
import type { Board } from '../game/ranking.ts';
import { saveMessage } from './accountText.ts';

interface SaveCardProps {
  save: SaveState;
  signedIn: boolean;
  onSignIn: () => void;
  onRetry: () => void;
  onBoard: (board: Board) => void;
}

/** Bottom centre of the review screen: what happened to this game on the server. */
export function SaveCard({ save, signedIn, onSignIn, onRetry, onBoard }: SaveCardProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const m = saveMessage(save, signedIn);
  return (
    <div className={`savecard glass ${m.tone}`} role="status">
      <div className="savecard-text">
        <b>{m.title}</b>
        {m.detail && <span>{m.detail}</span>}
      </div>
      {m.board && !m.signIn && (
        <button type="button" className="btn" onClick={() => onBoard(m.board!)}>
          Leaderboard
        </button>
      )}
      {m.retry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
      {m.signIn && (
        <>
          <button type="button" className="btn ghost" onClick={() => setDismissed(true)}>
            Not now
          </button>
          <button type="button" className="btn primary" onClick={onSignIn}>
            Sign in
          </button>
        </>
      )}
    </div>
  );
}
```

**`src/ui/Leaderboard.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import type { BoardResponse, BoardRow } from '../api/types.ts';
import { formatClock } from '../game/format.ts';
import { BOARD_MODES, BOARD_REGIONS, regionLabel, type Region } from '../game/ranking.ts';
import type { Mode } from '../game/types.ts';
import { CenterCard } from './CenterCard.tsx';
import { MODES } from './SetupCard.tsx';

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function Row({ row }: { row: BoardRow }) {
  return (
    <tr className={`${row.rank <= 3 ? 'top' : ''} ${row.you ? 'you' : ''}`}>
      <td className="rank mono">{row.rank}</td>
      <td className="who">
        {row.name}
        {row.you && <span className="mute"> (you)</span>}
      </td>
      <td className={`num mono ${row.hints === 0 ? 'gold' : 'mute'}`}>{row.hints}</td>
      <td className="num mono">{formatClock(row.ms)}</td>
      <td className="num mute hide-sm">{day(row.finishedAt)}</td>
    </tr>
  );
}

interface LeaderboardProps {
  mode: Mode;
  region: Region;
  onPick: (mode: Mode, region: Region) => void;
  onClose: () => void;
}

export function Leaderboard({ mode, region, onPick, onClose }: LeaderboardProps) {
  const [data, setData] = useState<BoardResponse | 'error' | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    api.board(mode, region).then(
      (d) => live && setData(d),
      () => live && setData('error'),
    );
    return () => {
      live = false;
    };
  }, [mode, region]);
  const pinned = data && data !== 'error' && data.you && !data.rows.some((r) => r.you) ? data.you : null;

  return (
    <CenterCard label="Leaderboards" title="Leaderboards" wide onClose={onClose}>
      <div className="seg board-modes" role="tablist" aria-label="Mode">
        {BOARD_MODES.map((m) => (
          <button key={m} type="button" role="tab" aria-selected={m === mode} className={m === mode ? 'on' : ''} onClick={() => onPick(m, region)}>
            {MODES.find((x) => x.id === m)!.label}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label="Region">
        {BOARD_REGIONS.map((r) => (
          <button key={r} type="button" className={`chip ${r === region ? 'on' : ''}`} aria-pressed={r === region} onClick={() => onPick(mode, r)}>
            {regionLabel(r)}
          </button>
        ))}
      </div>
      <div className="board-body">
        {data === null && <p className="mute">Loading…</p>}
        {data === 'error' && <p className="mute">Couldn't load this board. Try again in a moment.</p>}
        {data && data !== 'error' && data.rows.length === 0 && <p className="mute">No runs yet. Be the first.</p>}
        {data && data !== 'error' && data.rows.length > 0 && (
          <table className="board-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th className="num">Hints</th>
                <th className="num">Time</th>
                <th className="num hide-sm">Date</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <Row key={row.rank} row={row} />
              ))}
              {pinned && (
                <>
                  <tr className="gap" aria-hidden="true">
                    <td colSpan={5}>···</td>
                  </tr>
                  <Row row={pinned} />
                </>
              )}
            </tbody>
          </table>
        )}
      </div>
      <div className="card-foot mute">
        <span>Fewest hints, then fastest. Complete, unpaused runs only.</span>
        {data && data !== 'error' && <span>{data.players} {data.players === 1 ? 'player' : 'players'}</span>}
      </div>
    </CenterCard>
  );
}
```

**`src/ui/YourGames.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { api } from '../api/client.ts';
import type { MyGamesResponse, User } from '../api/types.ts';
import { formatClock } from '../game/format.ts';
import { BOARD_MODES, BOARD_REGIONS, regionLabel, type Board } from '../game/ranking.ts';
import { scopeFromKey, scopeLabel } from '../game/scope.ts';
import { hintsText, REASON_TEXT } from './accountText.ts';
import { CenterCard } from './CenterCard.tsx';
import { RankedTag } from './RankedTag.tsx';
import { MODES } from './SetupCard.tsx';

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const modeLabel = (id: string) => MODES.find((m) => m.id === id)!.label;

export function YourGames({ user, onBoard, onClose }: { user: User; onBoard: (board: Board) => void; onClose: () => void }) {
  const [data, setData] = useState<MyGamesResponse | 'error' | null>(null);
  useEffect(() => {
    api.myGames().then(setData, () => setData('error'));
  }, []);
  const bests = new Map(data && data !== 'error' ? data.bests.map((b) => [b.board, b]) : []);

  return (
    <CenterCard label="Your games" title="Your games" subtitle={user.name ?? 'No name yet: pick one to appear on the boards.'} wide onClose={onClose}>
      {data === null && <p className="mute">Loading…</p>}
      {data === 'error' && <p className="mute">Couldn't load your games. Try again in a moment.</p>}
      {data && data !== 'error' && (
        <>
          <div>
            <div className="label">Your bests</div>
            <div className="bests-grid">
              <span />
              {BOARD_MODES.map((m) => (
                <span key={m} className="label">
                  {modeLabel(m)}
                </span>
              ))}
              {BOARD_REGIONS.map((r) => (
                <div key={r} className="bests-row">
                  <span className="mute">{regionLabel(r)}</span>
                  {BOARD_MODES.map((m) => {
                    const board: Board = `${m}:${r}`;
                    const b = bests.get(board);
                    return b ? (
                      <button key={m} type="button" className="best-cell" onClick={() => onBoard(board)}>
                        <span>
                          <b className="mono">{formatClock(b.ms)}</b> <span className="mute">· {hintsText(b.hints)}</span>
                        </span>
                        {b.rank && <span className="gold mono">#{b.rank}</span>}
                      </button>
                    ) : (
                      <span key={m} className="best-cell none">
                        —
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="label">Recent</div>
            {data.recent.length === 0 ? (
              <p className="mute">No saved games yet.</p>
            ) : (
              <ul className="recent">
                {data.recent.map((g) => (
                  <li key={g.id}>
                    <span className="mute">{day(g.finishedAt)}</span>
                    <span>
                      {scopeLabel(scopeFromKey(g.scopeKey))} · {modeLabel(g.mode)}
                    </span>
                    <span className="mono">
                      {g.found}/{g.total}
                    </span>
                    <span className="mono">{formatClock(g.ms)}</span>
                    <span className="mute hide-sm">{hintsText(g.hints)}</span>
                    <span>{g.ranked ? <RankedTag text={g.isBest ? 'Best' : 'Ranked'} /> : <span className="unranked">Unranked: {REASON_TEXT[g.reason!]}</span>}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </CenterCard>
  );
}
```

**`src/styles/account.css`**

```css
/* v2: accounts and leaderboards. Centred cards over a dimmed map; bottom sheets on phones.
   Cards are opaque (panel colour over the page colour): backdrop-filter isn't applied in every browser. */
.gold { color: var(--accent); }

.ranked { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; padding: 3px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); white-space: nowrap; vertical-align: middle; }
.unranked { display: inline-flex; font-size: 11.5px; padding: 3px 8px; border-radius: 999px; border: 1px solid var(--chrome-line); color: var(--mute); white-space: nowrap; }

.veil { position: fixed; z-index: 40; inset: 0; display: grid; place-items: center; padding: 16px; background: color-mix(in srgb, var(--page) 62%, transparent); animation: veil-in 200ms var(--ease); }
@keyframes veil-in { from { opacity: 0; } }
.center-card { width: min(420px, 100%); max-height: calc(100dvh - 32px); overflow-y: auto; padding: 22px 24px 24px; display: grid; gap: 16px; align-content: start; background: linear-gradient(var(--panel-bg), var(--panel-bg)), var(--page); border-radius: 16px; animation: card-up 320ms var(--ease); }
.center-card.wide { width: min(720px, 100%); }
@keyframes card-up { from { opacity: 0; transform: translateY(10px); } }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.card-title { font-size: 21px; font-weight: 600; letter-spacing: -0.02em; margin: 0; }
.card-sub { font-size: 13px; color: var(--mute); margin: 5px 0 0; line-height: 1.45; }
.card-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12.5px; }
.link-btn { border: 0; background: none; padding: 4px 0; font-size: 12.5px; font-weight: 500; white-space: nowrap; }
.link-btn:hover { text-decoration: underline; }

.google-btn { display: flex; align-items: center; justify-content: center; gap: 12px; height: 46px; border-radius: 11px; border: 1px solid #dadce0; background: #fff; color: #1f1f1f; font-size: 14.5px; font-weight: 500; }
.google-btn:hover { background: #f8f9fa; }

.name-form { display: grid; gap: 8px; }
.field { height: 46px; padding: 0 14px; border-radius: 11px; border: 1px solid var(--chrome-line); background: color-mix(in srgb, var(--ink) 4%, transparent); font-size: 15px; outline: none; }
.field:focus { border-color: color-mix(in srgb, var(--accent) 55%, transparent); }
.field-note { font-size: 12px; color: var(--mute); min-height: 16px; }
.field-note.ok { color: #8fc28a; }
.field-note.bad { color: var(--danger); }
.btn.wide-btn { justify-content: center; height: 44px; margin-top: 6px; }
.btn:disabled { opacity: 0.45; cursor: default; }
.btn.ghost { border-color: transparent; color: var(--mute); }

/* Setup corner: Leaderboards, Sign in or the name chip, theme. Above the setup card so the menu can overlap it. */
.corner { z-index: 22; }
.corner-actions { display: flex; align-items: center; gap: 8px; }
.corner-actions .btn { background: var(--chrome-bg); box-shadow: var(--chrome-shadow); }
.user-menu { position: relative; }
.namechip { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 4px 10px 4px 5px; border-radius: 999px; border: 1px solid var(--chrome-line); background: var(--chrome-bg); box-shadow: var(--chrome-shadow); font-size: 13.5px; font-weight: 500; }
.namechip-name { max-width: 14ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.avatar { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); font-size: 12px; font-weight: 600; }
.menu { position: absolute; z-index: 30; top: calc(100% + 8px); right: 0; width: 210px; padding: 6px; display: grid; background: linear-gradient(var(--panel-bg), var(--panel-bg)), var(--page); }
.menu button { text-align: left; border: 0; background: none; padding: 8px 10px; border-radius: 7px; font-size: 13.5px; }
.menu button:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); }
.menu button.danger { color: var(--danger); }
.menu hr { border: 0; border-top: 1px solid var(--chrome-line); margin: 4px 2px; }
.menu-who { font-size: 12px; padding: 6px 10px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Review: what happened to this game on the server, where the guess box was. */
.save-dock { position: fixed; z-index: 20; bottom: calc(22px + env(safe-area-inset-bottom)); left: calc(50% - 150px); transform: translateX(-50%); width: min(560px, calc(100% - 340px)); }
.savecard { display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 18px; background: var(--panel-bg); }
.savecard.gold { border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
.savecard.warn { border-color: color-mix(in srgb, var(--danger) 40%, transparent); }
.savecard-text { flex: 1; min-width: 0; display: grid; gap: 2px; }
.savecard-text b { font-size: 14.5px; font-weight: 600; }
.savecard.gold .savecard-text b { color: var(--accent); }
.savecard-text span { font-size: 12.5px; color: var(--mute); }

/* Leaderboards */
.board-modes { width: fit-content; }
.board-body { min-height: 120px; }
.board-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.board-table th { font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mute); font-weight: 500; text-align: left; padding: 0 8px 8px; }
.board-table td { padding: 7px 8px; border-top: 1px solid color-mix(in srgb, var(--ink) 6%, transparent); white-space: nowrap; }
.board-table .num { text-align: right; }
.board-table .rank { width: 34px; color: var(--mute); font-size: 12.5px; }
.board-table tr.top .rank { color: var(--accent); }
.board-table .who { overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
.board-table tr.you td { background: var(--accent-soft); }
.board-table tr.you td:first-child { border-radius: 8px 0 0 8px; }
.board-table tr.you td:last-child { border-radius: 0 8px 8px 0; }
.board-table tr.gap td { border: 0; padding: 2px 8px; color: var(--mute); text-align: center; letter-spacing: 0.3em; }

/* Your games */
.bests-grid { display: grid; grid-template-columns: 92px repeat(3, minmax(0, 1fr)); gap: 6px; font-size: 12.5px; margin-top: 8px; }
.bests-grid > .label { padding: 0 10px; margin: 0; }
.bests-row { display: contents; }
.bests-row > .mute { display: flex; align-items: center; }
.best-cell { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; padding: 7px 10px; border: 1px solid var(--chrome-line); border-radius: 9px; background: none; text-align: left; font-size: 12.5px; }
button.best-cell:hover { background: color-mix(in srgb, var(--ink) 6%, transparent); }
.best-cell b { font-weight: 500; }
.best-cell.none { justify-content: center; border-style: dashed; color: color-mix(in srgb, var(--ink) 25%, transparent); }
.recent { list-style: none; margin: 8px 0 0; padding: 0; font-size: 13px; }
.recent li { display: grid; grid-template-columns: 56px minmax(0, 1fr) 64px 58px 64px auto; gap: 8px; align-items: center; padding: 8px 2px; border-top: 1px solid color-mix(in srgb, var(--ink) 6%, transparent); }
.recent li > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

@media (max-width: 767px) {
  .veil { place-items: end stretch; padding: 0; }
  .center-card, .center-card.wide { width: 100%; max-height: 88dvh; border-radius: 18px 18px 0 0; padding: 18px 16px calc(18px + env(safe-area-inset-bottom)); }
  .save-dock { left: 10px; right: 10px; width: auto; transform: none; bottom: calc(40dvh + 10px); }
  .corner-actions .btn-label { display: none; }
  .bests-grid { grid-template-columns: 70px repeat(3, minmax(0, 1fr)); }
  .best-cell { flex-direction: column; gap: 0; }
  .best-cell .mute { display: none; }
  .recent li { grid-template-columns: 48px minmax(0, 1fr) 54px auto; }
  .recent li > span:nth-child(4) { display: none; }
}
```

**`src/main.tsx`** (modify)

```diff
--- a/src/main.tsx
+++ b/src/main.tsx
@@ -5,6 +5,7 @@ import './styles/global.css';
 import './styles/map.css';
 import './styles/chrome.css';
 import './styles/screens.css';
+import './styles/account.css';
 import { StrictMode } from 'react';
 import { createRoot } from 'react-dom/client';
 import { App } from './App.tsx';
```

- [ ] **Step 6: Typecheck and run everything**

Run: `npx tsc -p . && npx vitest run`
Expected: PASS, 233 tests

- [ ] **Step 7: Commit**

```bash
git add src/ui src/styles/account.css src/main.tsx tests/ui/accountText.test.ts
git commit -m "Sign-in, name, save, leaderboard and your-games components

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: Wire accounts into the app

This task changes the existing screens.

**`start()`:**
- Asks the server for a game, waiting at most 1.5 s, and takes the Locate/Identify order from the server's seed.
- If the server doesn't answer in time, the game plays offline.

**Entering review:** sends the log to the server, unless that review was restored from before the sign-in redirect.

**Once the session is known:**
- Restores the review saved before the redirect.
- Claims any games played signed out.
- Loads your bests.
- Asks for a display name if the account doesn't have one yet.

**Ranked runs:**
- Show the Ranked tag in the top bar.
- Don't auto-pause when the tab is hidden.
- The pause card warns that pausing unranks the run.

**Setup card:** shows the board, or "Unranked: custom regions", and your server best.

**Setup corner:** gets Leaderboards, then either Sign in or the name menu, then the theme toggle.

**Cards:** open from the URL (`/signin`, `/leaderboards/…`, `/me`) or in place (name, delete). They only show during setup and review. While one is open, the app's keyboard shortcuts are suspended.

**Files:**
- Modify: `src/ui/SetupCard.tsx`, `src/ui/TopBar.tsx`, `src/ui/PauseOverlay.tsx`, `src/App.tsx`

- [ ] **Step 1: Setup card, top bar and pause card**

**`src/ui/SetupCard.tsx`** (modify)

```diff
--- a/src/ui/SetupCard.tsx
+++ b/src/ui/SetupCard.tsx
@@ -4,7 +4,11 @@ import type { Continent } from '../data/types.ts';
 import { formatClock } from '../game/format.ts';
 import { CONTINENTS, isWorld, poolFor, subregionsOf, WORLD } from '../game/scope.ts';
 import type { GameConfig, Mode, Scope } from '../game/types.ts';
+import type { BestSummary } from '../api/types.ts';
+import { boardFor, boardLabel } from '../game/ranking.ts';
 import type { Result } from '../store/bests.ts';
+import { hintsText } from './accountText.ts';
+import { RankedTag } from './RankedTag.tsx';
 
 export const MODES: { id: Mode; label: string; blurb: string }[] = [
   { id: 'type', label: 'Type', blurb: 'Name them all, any order' },
@@ -41,15 +45,18 @@ export function toggleSubregion(scope: Scope, name: string): Scope {
 interface SetupCardProps {
   config: GameConfig;
   best: Result | null;
+  /** signed in: your best on this setup's board, from the server */
+  serverBest: BestSummary | null;
   /** functional, so quick successive clicks never work from a stale config */
   onChange: (update: (config: GameConfig) => GameConfig) => void;
   onStart: () => void;
 }
 
-export function SetupCard({ config, best, onChange, onStart }: SetupCardProps) {
+export function SetupCard({ config, best, serverBest, onChange, onStart }: SetupCardProps) {
   const [showSubs, setShowSubs] = useState(config.scope.subregions.length > 0);
   const scope = config.scope;
   const total = countIn(scope);
+  const board = boardFor(config);
   const setScope = (update: (scope: Scope) => Scope) => onChange((c) => ({ ...c, scope: update(c.scope) }));
 
   return (
@@ -141,8 +148,20 @@ export function SetupCard({ config, best, onChange, onStart }: SetupCardProps) {
       </div>
 
       <div className="best">
-        <span>{total} countries</span>
-        {best ? (
+        <span>
+          {total} countries · {board ? <RankedTag text={`${boardLabel(board)} board`} /> : <span>Unranked: custom regions</span>}
+        </span>
+        {serverBest ? (
+          <span>
+            Best <b>{hintsText(serverBest.hints)}</b> · <b>{formatClock(serverBest.ms)}</b>
+            {serverBest.rank && (
+              <>
+                {' '}
+                · <b className="gold">#{serverBest.rank}</b>
+              </>
+            )}
+          </span>
+        ) : best ? (
           <span>
             Best <b>{best.found}/{best.total}</b> · <b>{formatClock(best.ms)}</b>
             {best.hints ? ` · ${best.hints} hint${best.hints === 1 ? '' : 's'}` : ''}
```

**`src/ui/TopBar.tsx`** (modify)

```diff
--- a/src/ui/TopBar.tsx
+++ b/src/ui/TopBar.tsx
@@ -1,4 +1,5 @@
 import { Icon } from './Icon.tsx';
+import { RankedTag } from './RankedTag.tsx';
 
 export function Wordmark() {
   return (
@@ -39,6 +40,8 @@ export function GiveUpButton({ onGiveUp }: { onGiveUp: () => void }) {
 
 interface TopBarProps {
   pill: string;
+  /** this run can go on a leaderboard */
+  ranked: boolean;
   found: number;
   total: number;
   clock: string;
@@ -57,6 +60,11 @@ export function TopBar(p: TopBarProps) {
     <header className="topbar glass">
       <Wordmark />
       <span className="pill mono hide-sm">{p.pill}</span>
+      {p.ranked && (
+        <span className="hide-sm">
+          <RankedTag />
+        </span>
+      )}
       <div className="tb-spacer" />
       <Score found={p.found} total={p.total} />
       <div className="tb-divider" />
```

**`src/ui/PauseOverlay.tsx`** (modify)

```diff
--- a/src/ui/PauseOverlay.tsx
+++ b/src/ui/PauseOverlay.tsx
@@ -3,6 +3,8 @@ import { Icon } from './Icon.tsx';
 interface PauseOverlayProps {
   /** true: ask "Give up?"; false: the plain pause card */
   confirming: boolean;
+  /** this run can go on a leaderboard, and pausing will cost it that */
+  ranked: boolean;
   onResume: () => void;
   /** pause card: open the give-up question */
   onAskGiveUp: () => void;
@@ -13,7 +15,7 @@ interface PauseOverlayProps {
 }
 
 /** The one central card for pausing and for confirming a give-up. The map behind it is blurred and the clock stopped. */
-export function PauseOverlay({ confirming, onResume, onAskGiveUp, onCancel, onGiveUp }: PauseOverlayProps) {
+export function PauseOverlay({ confirming, ranked, onResume, onAskGiveUp, onCancel, onGiveUp }: PauseOverlayProps) {
   return (
     <div className="pause-overlay">
       {confirming ? (
@@ -33,6 +35,7 @@ export function PauseOverlay({ confirming, onResume, onAskGiveUp, onCancel, onGi
         <div className="pause-card glass" role="dialog" aria-modal="true" aria-label="Paused">
           <div className="pause-title">Paused</div>
           <p className="mute">The map is hidden while the clock is stopped.</p>
+          {ranked && <p className="gold">Pausing makes this run unranked.</p>}
           <div className="pause-actions">
             <button type="button" className="btn primary" onClick={onResume} autoFocus>
               <Icon name="play" /> Resume <kbd>Esc</kbd>
```

- [ ] **Step 2: App** (diff against the Task 1 version)

**`src/App.tsx`** (modify)

```diff
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -1,4 +1,8 @@
-import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
+import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties, type ReactNode } from 'react';
+import { api, signInHref, type ApiError } from './api/client.ts';
+import { addClaim, clearClaims, readClaims, saveResume, sessionStore, takeResume, type Run, type SaveState } from './api/resume.ts';
+import { useSession } from './api/session.ts';
+import type { BestSummary } from './api/types.ts';
 import { COUNTRIES } from './data/countries.ts';
 import { GEO_META } from './data/geoMeta.ts';
 import { COUNTRY, nameOf } from './data/lookup.ts';
@@ -6,6 +10,8 @@ import { TERRITORIES } from './data/territories.ts';
 import { formatClock, formatCountdown } from './game/format.ts';
 import { FACTS } from './data/facts.ts';
 import { clueText, HINT_LEVELS } from './game/hints.ts';
+import type { LogEntry } from './game/log.ts';
+import { boardFor, parseBoard, type Board } from './game/ranking.ts';
 import { groupOf, progressRows } from './game/progress.ts';
 import { elapsed, initialState, reduce, target } from './game/reducer.ts';
 import { seededRandom, shuffle } from './game/rng.ts';
@@ -29,6 +35,14 @@ import { MODES, SetupCard } from './ui/SetupCard.tsx';
 import { shapeStates } from './ui/shapeStates.ts';
 import { Toast, type ToastMessage } from './ui/Toast.tsx';
 import { HintCard } from './ui/HintCard.tsx';
+import { DeleteAccount } from './ui/DeleteAccount.tsx';
+import { Leaderboard } from './ui/Leaderboard.tsx';
+import { NameCard } from './ui/NameCard.tsx';
+import { routePath, useRoute } from './ui/router.ts';
+import { SaveCard } from './ui/SaveCard.tsx';
+import { SignInCard } from './ui/SignInCard.tsx';
+import { UserMenu } from './ui/UserMenu.tsx';
+import { YourGames } from './ui/YourGames.tsx';
 import { GiveUpButton, Score, ThemeToggle, TopBar, Wordmark } from './ui/TopBar.tsx';
 import { useGuess } from './ui/useGuess.ts';
 import { ZoomControls } from './ui/ZoomControls.tsx';
@@ -40,6 +54,7 @@ const OWNERS = new Map(TERRITORIES.flatMap((t) => (t.sovereign && t.geo ? [[t.id
 const clue = (mode: GameConfig['mode'], level: number, id: string) =>
   clueText(mode, level, { country: COUNTRY.get(id)!, facts: FACTS.get(id)!, meta: GEO_META[id], nameOf });
 const storage = safeStorage();
+const session = sessionStore();
 /** `?seed=42` makes target order reproducible (used by end-to-end tests). */
 const SEED = Number(new URLSearchParams(window.location.search).get('seed')) || null;
 const random = SEED ? seededRandom(SEED) : Math.random;
@@ -87,6 +102,17 @@ export function App() {
   /** The "Give up?" dialog is open. `resume`: it paused a running game, so cancelling resumes it. */
   const [confirming, setConfirming] = useState<{ resume: boolean } | null>(null);
   const toastSeq = useRef(0);
+  const { user, setUser, signOut } = useSession();
+  const [route, go] = useRoute();
+  /** The server's record of the current game; null when it started offline. */
+  const [run, setRun] = useState<Run | null>(null);
+  const [save, setSave] = useState<SaveState | null>(null);
+  /** Signed in: your best on each board, for the setup card. */
+  const [bests, setBests] = useState<Map<Board, BestSummary>>(new Map());
+  const [card, setCard] = useState<'name' | 'delete' | null>(null);
+  const starting = useRef(false);
+  /** startedAt of the last game whose end was handled, so a restored review isn't saved twice. */
+  const finished = useRef<number | null>(null);
 
   const say = (text: string, tone: ToastMessage['tone']) => {
     toastSeq.current += 1;
@@ -101,6 +127,7 @@ export function App() {
   const limitMs = state.config.timeLimitSec === null ? null : state.config.timeLimitSec * 1000;
   const spent = elapsed(state, now);
   const left = limitMs === null ? Infinity : limitMs - spent;
+  const rankedRun = run?.board != null;
 
   // Theme: <html data-theme>, browser chrome color, and remember the choice.
   useEffect(() => {
@@ -125,14 +152,15 @@ export function App() {
     }
   }, [left, state.phase]);
 
-  // Leaving the tab pauses a stopwatch game. A countdown keeps running so looking answers up costs time.
+  // Leaving the tab pauses a stopwatch game. A countdown keeps running so looking answers up costs time,
+  // and so does a ranked run, since pausing would unrank it.
   useEffect(() => {
     const onVisibility = () => {
-      if (document.hidden && state.phase === 'playing' && limitMs === null) dispatch({ type: 'pause', now: Date.now() });
+      if (document.hidden && state.phase === 'playing' && limitMs === null && !rankedRun) dispatch({ type: 'pause', now: Date.now() });
     };
     document.addEventListener('visibilitychange', onVisibility);
     return () => document.removeEventListener('visibilitychange', onVisibility);
-  }, [state.phase, limitMs]);
+  }, [state.phase, limitMs, rankedRun]);
 
   // React to game events: glow, flashes, toasts, screen-reader announcements.
   useEffect(() => {
@@ -173,9 +201,11 @@ export function App() {
     return () => window.clearTimeout(id);
   }, [goal, mode, state.phase]);
 
-  // Entering review: save a best if earned.
+  // Entering review: save a local best if earned, and send the game to the server.
   useEffect(() => {
-    if (state.phase !== 'review') return;
+    if (state.phase !== 'review' || finished.current === state.startedAt) return;
+    finished.current = state.startedAt;
+    if (run) finish(run, state.log);
     setNewBest(
       recordResult(storage, state.config, {
         found: state.found.length,
@@ -188,9 +218,87 @@ export function App() {
     setAnnouncement(`Game over. ${state.found.length} of ${state.pool.length}.`);
   }, [state.phase]);
 
-  function start(config: GameConfig = draft) {
+  // Once we know who's signed in: come back from Google, claim games played signed out, load bests.
+  const loaded = useRef(false);
+  useEffect(() => {
+    if (user === undefined || loaded.current) return;
+    loaded.current = true;
+    const params = new URLSearchParams(window.location.search);
+    if (params.get('auth') === 'failed') {
+      say("Sign-in didn't finish. Try again.", 'warn');
+      params.delete('auth');
+      const rest = params.toString();
+      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
+    }
+    const resume = takeResume(session, Date.now());
+    if (resume?.state.phase === 'review') {
+      finished.current = resume.state.startedAt;
+      dispatch({ type: 'restore', state: resume.state });
+      setRun(resume.run);
+      setSave(resume.save);
+    }
+    if (!user) return;
+    if (user.name === null) setCard('name');
+    const claims = readClaims(session, Date.now());
+    if (claims.length === 0) return void refreshBests();
+    api.claim(claims.map(({ id, claim }) => ({ id, claim }))).then(({ results }) => {
+      clearClaims(session);
+      const mine = results.find((r) => r.id === resume?.run?.id);
+      if (mine) setSave({ status: 'saved', result: mine });
+      refreshBests();
+    }, refreshBests);
+  }, [user]);
+
+  // Already signed in: /signin has nothing to show.
+  useEffect(() => {
+    if (user && route.name === 'signin') go({ name: 'home' }, { replace: true });
+  }, [user, route.name]);
+
+  /** Reloads your bests, and the rank on the save card (it changes once you pick a name). */
+  function refreshBests() {
+    api.myGames().then(({ bests: list }) => {
+      const map = new Map(list.map((b) => [b.board, b]));
+      setBests(map);
+      setSave((s) => {
+        const best = s?.status === 'saved' && s.result.ranked && s.result.board ? map.get(s.result.board) : undefined;
+        return best && s?.status === 'saved' ? { status: 'saved', result: { ...s.result, best } } : s;
+      });
+    }, () => undefined);
+  }
+
+  function finish(game: Run, log: LogEntry[]) {
+    setSave({ status: 'saving' });
+    api.finishGame(game.id, log).then(
+      (result) => {
+        setSave({ status: 'saved', result });
+        if (game.claim) addClaim(session, { id: game.id, claim: game.claim }, Date.now());
+        if (result.board && result.best) setBests((m) => new Map(m).set(result.board!, result.best!));
+      },
+      (e: ApiError) => setSave(e.code === 'unverified' ? { status: 'unverified' } : { status: 'error' }),
+    );
+  }
+
+  /** Off to Google. A finished game's review comes back with us. */
+  function beginSignIn() {
+    if (state.phase === 'review') saveResume(session, { state, run, save }, Date.now());
+    window.location.assign(signInHref(route.name === 'signin' ? '/' : routePath(route)));
+  }
+
+  const openBoard = (board: Board) => {
+    const { mode, region } = parseBoard(board)!;
+    go({ name: 'board', mode, region });
+  };
+
+  async function start(config: GameConfig = draft) {
+    if (starting.current) return;
+    starting.current = true;
+    // The server picks the target order and times the game. If it can't be reached quickly, play offline.
+    const online = await api.startGame(config).catch(() => null);
+    starting.current = false;
     const pool = poolFor(config.scope, COUNTRIES);
-    dispatch({ type: 'start', config, pool, order: shuffle(pool, random), now: Date.now() });
+    setRun(online && { id: online.id, claim: online.claim, board: online.board });
+    setSave(online ? null : { status: 'offline' });
+    dispatch({ type: 'start', config, pool, order: shuffle(pool, online ? seededRandom(online.seed) : random), now: Date.now() });
     setNewBest(false);
     warned.current = null;
     setMenuOpen(false);
@@ -236,14 +344,17 @@ export function App() {
   }
 
   // Keyboard: Esc pause, ? hint, S skip, + − 0 zoom, Enter start/replay, typing goes to the input.
-  const keys = useRef({ state, guess, start, hint, togglePause, confirming, cancelGiveUp });
+  const overlay = renderOverlay();
+  const keys = useRef({ state, guess, start, hint, togglePause, confirming, cancelGiveUp, blocked: false });
   useLayoutEffect(() => {
-    keys.current = { state, guess, start, hint, togglePause, confirming, cancelGiveUp };
+    keys.current = { state, guess, start, hint, togglePause, confirming, cancelGiveUp, blocked: overlay !== null };
   });
   useEffect(() => {
     const onKey = (e: KeyboardEvent) => {
       if (e.metaKey || e.ctrlKey || e.altKey) return;
-      const { state: s, guess: g, start: go, hint: h, togglePause: pause, confirming: asking, cancelGiveUp: cancel } = keys.current;
+      const { state: s, guess: g, start: go, hint: h, togglePause: pause, confirming: asking, cancelGiveUp: cancel, blocked } = keys.current;
+      // A card is open over the map: it handles its own keys.
+      if (blocked) return;
       const inField = e.target instanceof HTMLInputElement;
       const onButton = e.target instanceof HTMLButtonElement;
       if (e.key === 'Escape' && asking) return void cancel();
@@ -298,6 +409,46 @@ export function App() {
   const hinted = state.hint && state.phase === 'playing' && (mode === 'type' || state.hint.id === goal) ? state.hint : null;
   const clues = hinted ? Array.from({ length: hinted.level }, (_, i) => clue(mode, i + 1, hinted.id)) : [];
   const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
+  const draftBoard = boardFor(draft);
+
+  /** The card over the map, if any: from the URL (sign in, leaderboards, your games) or opened in place. */
+  function renderOverlay(): ReactNode {
+    if ((state.phase !== 'setup' && state.phase !== 'review') || user === undefined) return null;
+    const home = () => go({ name: 'home' });
+    if (card === 'name' && user) {
+      return (
+        <NameCard
+          onDone={(u) => {
+            setUser(u);
+            setCard(null);
+            refreshBests();
+          }}
+          onClose={() => setCard(null)}
+        />
+      );
+    }
+    if (card === 'delete' && user) {
+      return (
+        <DeleteAccount
+          user={user}
+          onDeleted={() => {
+            setUser(null);
+            setBests(new Map());
+            setCard(null);
+            home();
+            say('Account deleted', 'info');
+          }}
+          onClose={() => setCard(null)}
+        />
+      );
+    }
+    if (route.name === 'board') {
+      return <Leaderboard mode={route.mode} region={route.region} onPick={(mode, region) => go({ name: 'board', mode, region }, { replace: true })} onClose={home} />;
+    }
+    if (route.name === 'me' && user) return <YourGames user={user} onBoard={openBoard} onClose={home} />;
+    if ((route.name === 'me' || route.name === 'signin') && !user) return <SignInCard onSignIn={beginSignIn} onClose={home} />;
+    return null;
+  }
   const safe = safeArea(state.phase === 'paused' ? 'playing' : state.phase, small, size.width, size.height, keyboard);
 
   const clock = limitMs === null ? formatClock(spent) : formatCountdown(limitMs - spent);
@@ -340,9 +491,41 @@ export function App() {
         <>
           <div className="corner">
             <Wordmark />
-            <ThemeToggle theme={theme} onToggle={toggleTheme} />
+            <div className="corner-actions">
+              <button type="button" className="btn" aria-label="Leaderboards" onClick={() => openBoard(draftBoard ?? 'type:world')}>
+                <Icon name="trophy" size={15} />
+                <span className="btn-label">Leaderboards</span>
+              </button>
+              {user ? (
+                <UserMenu
+                  user={user}
+                  onGames={() => go({ name: 'me' })}
+                  onBoards={() => openBoard(draftBoard ?? 'type:world')}
+                  onPickName={() => setCard('name')}
+                  onSignOut={() => {
+                    void signOut();
+                    setBests(new Map());
+                    say('Signed out', 'info');
+                  }}
+                  onDelete={() => setCard('delete')}
+                />
+              ) : (
+                user === null && (
+                  <button type="button" className="btn" onClick={() => go({ name: 'signin' })}>
+                    Sign in
+                  </button>
+                )
+              )}
+              <ThemeToggle theme={theme} onToggle={toggleTheme} />
+            </div>
           </div>
-          <SetupCard config={draft} best={readBest(storage, draft)} onChange={setDraft} onStart={() => start()} />
+          <SetupCard
+            config={draft}
+            best={readBest(storage, draft)}
+            serverBest={user && draftBoard ? (bests.get(draftBoard) ?? null) : null}
+            onChange={setDraft}
+            onStart={() => start()}
+          />
         </>
       )}
 
@@ -350,6 +533,7 @@ export function App() {
         <>
           <TopBar
             pill={pill}
+            ranked={rankedRun}
             found={state.found.length}
             total={state.pool.length}
             clock={clock}
@@ -394,6 +578,7 @@ export function App() {
           {state.phase === 'paused' && (
             <PauseOverlay
               confirming={confirming !== null}
+              ranked={rankedRun}
               onResume={togglePause}
               onAskGiveUp={askGiveUp}
               onCancel={cancelGiveUp}
@@ -450,6 +635,11 @@ export function App() {
               Play again <kbd>↵</kbd>
             </button>
           </header>
+          {save && (
+            <div className="save-dock">
+              <SaveCard save={save} signedIn={!!user} onSignIn={beginSignIn} onRetry={() => run && finish(run, state.log)} onBoard={openBoard} />
+            </div>
+          )}
           <ReviewPanel
             pool={state.pool}
             missed={state.missed}
@@ -471,6 +661,7 @@ export function App() {
         </>
       )}
 
+      {overlay}
       <div className="sr-only" aria-live="polite">
         {announcement}
       </div>
```

- [ ] **Step 3: Typecheck and run the unit tests**

Run: `npx tsc -p . && npx vitest run`
Expected: PASS, 233 tests
The browser tests run in Task 10, once Playwright serves the app with the real Worker.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/ui/SetupCard.tsx src/ui/TopBar.tsx src/ui/PauseOverlay.tsx
git commit -m "Wire sign-in, saving, claims, ranked runs and leaderboards into the app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: End-to-end tests against the real Worker

Playwright now builds the app and serves it with `wrangler dev`: the real Worker, a fresh local D1 and fake sign-in. The 13 v1 tests must keep passing unchanged.

**Files:**
- Modify: `playwright.config.ts`, `e2e/helpers.ts`, `e2e/phone.spec.ts`
- Create: `e2e/accounts.spec.ts`

- [ ] **Step 1: Point Playwright at the Worker**

**`playwright.config.ts`** (modify)

```diff
--- a/playwright.config.ts
+++ b/playwright.config.ts
@@ -5,8 +5,9 @@ export default defineConfig({
   timeout: 60_000,
   fullyParallel: true,
   use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
+  // The real Worker and a fresh local D1, with fake sign-in (localhost only).
   webServer: {
-    command: 'npm run build && npm run preview',
+    command: 'npm run build && npm run serve:e2e',
     port: 4173,
     reuseExistingServer: true,
     timeout: 180_000,
```

- [ ] **Step 2: Run the v1 suite on the new stack**

Run: `npx playwright test`
Expected: PASS, 13 tests

- [ ] **Step 3: Add helpers and the account tests**

**`e2e/helpers.ts`** (modify)

```diff
--- a/e2e/helpers.ts
+++ b/e2e/helpers.ts
@@ -49,3 +49,28 @@ export async function clickCountry(page: Page, id: string) {
   const { x, y } = (await point.jsonValue())!;
   await page.mouse.click(x, y);
 }
+
+/** A unique player for this test: fake sign-in uses the `mapped_fake_as` cookie as the Google account. */
+export async function asPlayer(page: Page) {
+  const tag = `${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1e4)}`;
+  const email = `p${tag}@example.com`;
+  await page.context().addCookies([{ name: 'mapped_fake_as', value: email, url: 'http://localhost:4173' }]);
+  return { email, name: `p${tag}` };
+}
+
+/** Types each name at a believable human pace, so the server ranks the run. */
+export async function typeLikeAPerson(page: Page, names: string[]) {
+  const input = page.getByLabel('Country name');
+  for (const name of names) {
+    await input.pressSequentially(name.toLowerCase(), { delay: 25 });
+    await page.waitForTimeout(250);
+  }
+}
+
+export async function pickName(page: Page, name: string) {
+  const card = page.getByRole('dialog', { name: 'Pick a name' });
+  await card.getByLabel('Display name').fill(name);
+  await expect(card.getByText('✓ Available')).toBeVisible();
+  await card.getByRole('button', { name: 'Done' }).click();
+  await expect(card).toBeHidden();
+}
```

**`e2e/accounts.spec.ts`**

```ts
import { expect, test } from '@playwright/test';
import { asPlayer, openSetup, pickName, start, typeLikeAPerson, watchErrors } from './helpers.ts';

const SOUTH_AMERICA = ['Argentina', 'Bolivia', 'Brazil', 'Chile', 'Colombia', 'Ecuador', 'Guyana', 'Paraguay', 'Peru', 'Suriname', 'Uruguay', 'Venezuela'];

test('play signed out, sign in from the review: the game is claimed and on the board', async ({ page }) => {
  const errors = watchErrors(page);
  const player = await asPlayer(page);
  await openSetup(page);
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await expect(page.locator('.setup').getByText('S. America · Type board')).toBeVisible();
  await start(page);
  await expect(page.locator('.topbar .ranked')).toHaveText('Ranked');
  await typeLikeAPerson(page, SOUTH_AMERICA);

  const saveCard = page.locator('.savecard');
  await expect(saveCard).toContainText('Sign in to save this run');
  await expect(saveCard).toContainText(/would put you #\d+ on S\. America · Type/);
  await saveCard.getByRole('button', { name: 'Sign in' }).click();

  // Back from (fake) Google on the same review, asked for a name.
  await expect(page.getByText('Every one. Nothing missed.')).toBeVisible();
  await pickName(page, player.name);
  await expect(saveCard).toContainText(/Saved · #\d+ on S\. America · Type/);
  await saveCard.getByRole('button', { name: 'Leaderboard' }).click();

  await expect(page).toHaveURL(/\/leaderboards\/type\/south-america$/);
  const board = page.getByRole('dialog', { name: 'Leaderboards' });
  await expect(board.locator('tr.you')).toContainText(player.name);
  expect(errors).toEqual([]);
});

test('a paused run is saved unranked', async ({ page }) => {
  await openSetup(page);
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await start(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toContainText('Pausing makes this run unranked.');
  await page.keyboard.press('Escape');
  await typeLikeAPerson(page, SOUTH_AMERICA);
  await expect(page.locator('.savecard')).toContainText('Unranked: paused.');
});

test('a leaderboard link opens that board, and closing it goes home', async ({ page }) => {
  await page.goto('/leaderboards/locate/asia');
  const board = page.getByRole('dialog', { name: 'Leaderboards' });
  await expect(board.getByRole('tab', { name: 'Locate' })).toHaveAttribute('aria-selected', 'true');
  await expect(board.getByRole('button', { name: 'Asia' })).toHaveAttribute('aria-pressed', 'true');
  await board.getByRole('button', { name: 'Europe' }).click();
  await expect(page).toHaveURL(/\/leaderboards\/locate\/europe$/);
  await board.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/localhost:4173\/$/);
  await expect(board).toBeHidden();
});

test('sign in from setup, then sign out', async ({ page }) => {
  const player = await asPlayer(page);
  await openSetup(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('dialog', { name: 'Sign in' }).getByRole('button', { name: 'Sign in with Google' }).click();
  await pickName(page, player.name);
  const chip = page.locator('.namechip');
  await expect(chip).toContainText(player.name);
  await chip.click();
  await page.getByRole('menuitem', { name: 'Your games' }).click();
  await expect(page.getByRole('dialog', { name: 'Your games' })).toContainText('No saved games yet.');
  await page.keyboard.press('Escape');
  await chip.click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});
```

**`e2e/phone.spec.ts`** (modify)

```diff
--- a/e2e/phone.spec.ts
+++ b/e2e/phone.spec.ts
@@ -13,3 +13,16 @@ test('phone: setup sheet, play, menu', async ({ page }) => {
   expect(overflow).toBe(false);
   expect(errors).toEqual([]);
 });
+
+test('phone: the sign-in card is a bottom sheet', async ({ page }) => {
+  await page.goto('/signin');
+  const card = page.getByRole('dialog', { name: 'Sign in' });
+  await expect(card.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
+  // Once its slide-up animation settles, the sheet sits on the bottom edge.
+  await expect
+    .poll(async () => {
+      const box = (await card.boundingBox())!;
+      return Math.abs(box.y + box.height - page.viewportSize()!.height);
+    })
+    .toBeLessThan(2);
+});
```

- [ ] **Step 4: Run all browser tests**

Run: `npx playwright test`
Expected: PASS, 18 tests. If the name menu test times out on "intercepts pointer events", the `.corner { z-index: 22; }` rule in `account.css` is missing.

- [ ] **Step 5: Look at it**

Run `npm run build && npm run serve:e2e`, open http://localhost:4173 in the browser pane and check each of these:

- **Setup corner:** shows Leaderboards and Sign in.
- **`/signin`:** a centred card with the white Google button.
- **After signing in:** the "Pick a name" card appears; set a name and the chip shows it.
- **`/leaderboards/type/world` and `/me`:** both cards are opaque, with nothing showing through.
- **Light theme:** looks right.
- **Phone width (375 px):** cards become bottom sheets.

Then stop the server and reset the pane's viewport.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e
git commit -m "End-to-end tests for accounts, ranked runs and leaderboards on the real Worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: Docs, production setup and launch

**Files:**
- Modify: `README.md` (full replacement), `docs/superpowers/specs/2026-10-05-mapped-v2-accounts-design.md` (add the deviations), `wrangler.jsonc` (real ids)

- [ ] **Step 1: README**

**`README.md`**

````markdown
# Mapped

[![CI](https://github.com/llukehanna/Mapped/actions/workflows/ci.yml/badge.svg)](https://github.com/llukehanna/Mapped/actions/workflows/ci.yml)

How well do you know the map? Name every country, find them by clicking, or identify the highlighted one. Live at [mapped.lukeghanna.com](https://mapped.lukeghanna.com).

Anyone can play. Sign in with Google to save your games and get on the leaderboards.

## Modes

- **Type**: name them all, in any order. Exact names count as you type, and typos are forgiven on Enter when only one country is that close.
- **Locate**: you're given a name; click the country. You get 3 tries.
- **Identify**: a country lights up; type its name.

Pick any mix of continents and subregions, and a time limit (or none, for a stopwatch).

## Leaderboards

There are 21 boards: each mode for the World and for each continent. A run counts when it finds every country without pausing. Boards rank by fewest hints, then fastest time.

The server keeps the score honest:

- It picks the target order and times the game on its own clock.
- At the end it replays every guess, click and hint through the same game logic the browser runs.
- Runs faster than a person can type are left unranked.

## Stack

- **Vite**, **React 19** and **TypeScript**
- **d3-geo** and **d3-zoom** drawing Natural Earth 1:50m shapes (public domain, via `world-atlas`) as SVG
- A **Cloudflare Worker** for `/api/*` only, with **D1** (SQLite) and Google sign-in (OpenID Connect, server-side)
- **Vitest** unit and Worker tests (against a real local D1), and **Playwright** end-to-end tests

## Running locally

Requires Node 24 or newer.

```bash
npm install
npm run dev
```

`npm run dev` serves the app alone; games play offline. For the full app with accounts, copy `.dev.vars.example` to `.dev.vars` and run `npm run dev:full`. It builds, sets up a local database, and serves on port 8787 with a fake Google sign-in that only works on localhost.

| Command | What it does |
| --- | --- |
| `npm test` | Unit and Worker tests |
| `npm run e2e` | Playwright end-to-end tests against the real Worker (builds first) |
| `npm run dev:full` | The whole app locally, with a local D1 and fake sign-in |
| `npm run geo` | Rebuild `src/data/world.topo.json` from Natural Earth |
| `npm run build` | Typecheck, build, enforce the size budget |
| `npm run deploy` | Build, apply database migrations, deploy to Cloudflare |
| `npm run recompute-bests -- --remote` | Rebuild bests after deleting games by hand |

## Moderation

There's no admin screen. To remove a run, delete its game and rebuild bests:

```bash
npx wrangler d1 execute mapped --remote --command "DELETE FROM games WHERE id = '<game id>'"
npm run recompute-bests -- --remote
```
````

- [ ] **Step 2: Record the deviations in the spec**

Append a `## Revisions during planning` section that copies the five bullets from "Deviations from the spec" at the top of this plan. Set the spec's status line to `**Status:** Approved; implemented in v2 (see Revisions during planning)`.

- [ ] **Step 3: Luke creates the Google OAuth client (needs his Google account)**

Ask Luke to do this in https://console.cloud.google.com and paste back the Client ID. He then stores the Client secret himself (Step 5), so it never appears in the chat.

1. Create a project named `Mapped`.
2. Go to **APIs & Services → OAuth consent screen**:
   - User type **External**; app name **Mapped**; support email his own.
   - Authorized domain `lukeghanna.com`.
   - Scopes: `openid` and `.../auth/userinfo.email` only.
   - **Publish app** (to production). Basic scopes need no verification review.
3. Go to **Credentials → Create credentials → OAuth client ID**:
   - Type **Web application**, named `Mapped web`.
   - Authorized redirect URI: `https://mapped.lukeghanna.com/api/auth/google/callback`.

- [ ] **Step 4: Create the production database and fill in ids**

```bash
npx wrangler d1 create mapped
```

Copy the printed `database_id` into `wrangler.jsonc`, replacing `REPLACE_WITH_D1_ID`. Replace `REPLACE_WITH_GOOGLE_CLIENT_ID` with the Client ID from Step 3. A client ID isn't secret.

- [ ] **Step 5: Set the secrets**

```bash
openssl rand -base64 32 | npx wrangler secret put AUTH_SECRET
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Luke pastes the Google client secret at the second prompt himself, so it never goes through the chat.

- [ ] **Step 6: Final checks and deploy**

Run: `npx tsc -p . && npx vitest run && npx playwright test`
Expected: 233 unit/Worker tests and 18 browser tests pass
Run: `npm run deploy`
Expected: the build succeeds, `0001_init.sql` is applied to the remote D1, and the deploy prints the `mapped.lukeghanna.com` route

- [ ] **Step 7: Verify production**

```bash
curl -s https://mapped.lukeghanna.com/api/me
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" "https://mapped.lukeghanna.com/api/auth/google?return=/"
curl -s -o /dev/null -w "%{http_code}\n" "https://mapped.lukeghanna.com/api/auth/google?as=x@y.z"
curl -s -I https://mapped.lukeghanna.com/leaderboards/type/world | grep -iE "^HTTP|content-security"
```

Expected:

1. `{"user":null}`
2. `302 https://accounts.google.com/o/oauth2/v2/auth?client_id=…`
3. `302` (the `as` parameter is ignored in google mode)
4. `200` and the CSP

Then sign in for real in a browser. Play a ranked Oceania Type game without hints or pauses, pick a name, and confirm the run appears on `/leaderboards/type/oceania`.

- [ ] **Step 8: Commit and push**

```bash
git add README.md docs wrangler.jsonc
git commit -m "v2: accounts and leaderboards live; README and spec revisions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

Watch CI with `gh run watch`. It needs no changes: the Worker tests start their own local D1.
