# Mapped v3: Flags and Capitals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Flags and Capitals topics to Mapped, played on the same map with the same modes, regions, saving and leaderboards.

**Architecture:** Every answer is still a country id, so the engine stays one reducer. A small rules table (`src/game/topics.ts`) says, per topic × mode, whether the game is ordered (a target queue), what the prompt shows and how the player answers; the reducer, input handling, hints and UI read it instead of checking `mode === 'type'`. New data: capitals with alternatives, self-hosted flag SVGs, flag lookalike groups. Boards gain a topic: Countries keeps `<mode>:<region>`, others use `<topic>:<mode>:<region>`.

**Tech Stack:** Vite, React 19, TypeScript, Vitest 5, Playwright, Cloudflare Workers + D1 (wrangler).

**Spec:** `docs/superpowers/specs/2026-10-07-mapped-v3-flags-capitals-design.md`

## Global Constraints

- Countries games must behave exactly as today: same queue/answer rules, same hint ladders, same board keys (`type:world`), same URLs (`/leaderboards/type/world`, `/api/boards/type/world`), same local-best keys.
- `GameConfig.topic` is optional; a missing topic means `countries` everywhere (old configs in D1, old clients, saved resumes, tests).
- Stored logs replay unchanged: no new log action types. A flag pick is a `click`.
- Flags are self-hosted at `/flags/<ID>.svg` (alpha-3 id, e.g. `/flags/KEN.svg`). CSP stays `img-src 'self' data:`.
- No D1 schema change and no migration.
- One difficulty. Flags · Identify: 4 choices, 3 tries (`TRIES_PER_TARGET`). Flags · Identify hints: 2 rungs, each removes one wrong flag.
- Copy uses the middle dot " · " as the existing UI does ("Europe · Flags · Type").
- Run `npx vitest run` and `npx tsc -b` before every commit; E2E with `npx playwright test` where a task adds E2E tests.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File Structure

- Create `src/game/topics.ts` — `Topic`, `TOPICS`, `topicOf`, `rulesFor`, `hintLevels`, topic labels and mode blurbs.
- Create `src/data/capitals.ts` — capital display name + alternatives per country.
- Create `src/data/flagLookalikes.ts` — lookalike groups.
- Create `src/game/flagChoices.ts` — the 4 flags offered in Flags · Identify.
- Create `src/match/capitalIndex.ts` — the capitals `NameIndex`.
- Create `scripts/build-flags.ts`, `public/flags/*.svg` (197 files).
- Create UI: `src/ui/FlagCard.tsx`, `src/ui/FlagChoices.tsx`, `src/ui/TopicTabs.tsx`.
- Modify: `src/game/types.ts`, `src/game/reducer.ts`, `src/game/ranking.ts`, `src/game/hints.ts`, `src/store/bests.ts`, `src/ui/useGuess.ts`, `src/ui/SetupCard.tsx`, `src/ui/LocatePrompt.tsx`, `src/ui/ReviewPanel.tsx`, `src/ui/Leaderboard.tsx`, `src/ui/YourGames.tsx`, `src/ui/router.ts`, `src/App.tsx`, `src/api/types.ts`, `src/api/client.ts`, `worker/index.ts`, `worker/boards.ts`, styles, README.

---

### Task 1: Topic rules, config, boards and the reducer

**Files:**
- Create: `src/game/topics.ts`
- Modify: `src/game/types.ts`, `src/game/reducer.ts`, `src/game/ranking.ts`, `src/store/bests.ts`
- Test: `tests/game/topics.test.ts` (new), `tests/game/reducer.test.ts`, `tests/game/ranking.test.ts`, `tests/store/bests.test.ts`, `tests/worker/replay.test.ts`, `tests/worker/games.test.ts`

**Interfaces:**
- Produces:
  - `type Topic = 'countries' | 'flags' | 'capitals'`; `TOPICS: Topic[]`; `topicOf(config: { topic?: Topic }): Topic`
  - `type Prompt = 'name' | 'flag' | 'capital' | 'map'`; `type Answer = 'country' | 'capital' | 'click' | 'flag'`
  - `rulesFor(config: Pick<GameConfig, 'mode' | 'topic'>): { ordered: boolean; prompt: Prompt | null; answer: Answer }` (prompt is null for unordered games)
  - `hintLevels(config): number`
  - `TOPIC_LABEL: Record<Topic, string>`; `MODE_BLURB: Record<Topic, Record<Mode, string>>`
  - `GameConfig.topic?: Topic`
  - `Board` = `` `${Mode}:${Region}` | `${Exclude<Topic,'countries'>}:${Mode}:${Region}` ``; `BOARD_TOPICS: Topic[]`; `boardFor`, `parseBoard(board) → { topic; mode; region } | null`, `boardLabel(board)` ("Europe · Flags · Type"; Countries stays "Europe · Type"), `boardKey(topic, mode, region): Board`
  - `bestKey(config)` unchanged for countries; `mapped:best:v1:<topic>:<mode>:<scope>:<limit>` otherwise.

- [ ] **Step 1: Write failing tests for the rules table** (`tests/game/topics.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { hintLevels, rulesFor, topicOf } from '../../src/game/topics.ts';

describe('topic rules', () => {
  it('countries keeps today’s rules', () => {
    expect(rulesFor({ mode: 'type' })).toEqual({ ordered: false, prompt: null, answer: 'country' });
    expect(rulesFor({ mode: 'locate', topic: 'countries' })).toEqual({ ordered: true, prompt: 'name', answer: 'click' });
    expect(rulesFor({ mode: 'identify' })).toEqual({ ordered: true, prompt: 'map', answer: 'country' });
  });
  it('flags', () => {
    expect(rulesFor({ mode: 'type', topic: 'flags' })).toEqual({ ordered: true, prompt: 'flag', answer: 'country' });
    expect(rulesFor({ mode: 'locate', topic: 'flags' })).toEqual({ ordered: true, prompt: 'flag', answer: 'click' });
    expect(rulesFor({ mode: 'identify', topic: 'flags' })).toEqual({ ordered: true, prompt: 'map', answer: 'flag' });
  });
  it('capitals', () => {
    expect(rulesFor({ mode: 'type', topic: 'capitals' })).toEqual({ ordered: false, prompt: null, answer: 'capital' });
    expect(rulesFor({ mode: 'locate', topic: 'capitals' })).toEqual({ ordered: true, prompt: 'capital', answer: 'click' });
    expect(rulesFor({ mode: 'identify', topic: 'capitals' })).toEqual({ ordered: true, prompt: 'map', answer: 'capital' });
  });
  it('a missing topic is countries', () => expect(topicOf({})).toBe('countries'));
  it('hint ladders', () => {
    expect([hintLevels({ mode: 'type' }), hintLevels({ mode: 'locate' }), hintLevels({ mode: 'identify' })]).toEqual([4, 3, 4]);
    expect(hintLevels({ mode: 'type', topic: 'flags' })).toBe(4);
    expect(hintLevels({ mode: 'locate', topic: 'capitals' })).toBe(3);
    expect(hintLevels({ mode: 'identify', topic: 'flags' })).toBe(2);
    expect(hintLevels({ mode: 'type', topic: 'capitals' })).toBe(4);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/game/topics.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Implement `src/game/topics.ts`**

```ts
import type { GameConfig, Mode } from './types.ts';

export type Topic = 'countries' | 'flags' | 'capitals';
export const TOPICS: Topic[] = ['countries', 'flags', 'capitals'];
export const TOPIC_LABEL: Record<Topic, string> = { countries: 'Countries', flags: 'Flags', capitals: 'Capitals' };

/** What the dock shows for the current target. */
export type Prompt = 'name' | 'flag' | 'capital' | 'map';
/** How the player answers: type a country, type a capital, click the country, or pick its flag. */
export type Answer = 'country' | 'capital' | 'click' | 'flag';
export interface Rules {
  /** one target at a time from the seeded queue; false = name them in any order */
  ordered: boolean;
  /** null for unordered games */
  prompt: Prompt | null;
  answer: Answer;
}

export const topicOf = (config: { topic?: Topic }): Topic => config.topic ?? 'countries';

const RULES: Record<Topic, Record<Mode, Rules>> = {
  countries: {
    type: { ordered: false, prompt: null, answer: 'country' },
    locate: { ordered: true, prompt: 'name', answer: 'click' },
    identify: { ordered: true, prompt: 'map', answer: 'country' },
  },
  flags: {
    type: { ordered: true, prompt: 'flag', answer: 'country' },
    locate: { ordered: true, prompt: 'flag', answer: 'click' },
    identify: { ordered: true, prompt: 'map', answer: 'flag' },
  },
  capitals: {
    type: { ordered: false, prompt: null, answer: 'capital' },
    locate: { ordered: true, prompt: 'capital', answer: 'click' },
    identify: { ordered: true, prompt: 'map', answer: 'capital' },
  },
};

export const rulesFor = (config: Pick<GameConfig, 'mode' | 'topic'>): Rules => RULES[topicOf(config)][config.mode];

/** Rungs on the hint ladder: clicking answers get the 3 Locate rungs, picking a flag 2 (each removes a wrong flag), naming 4 letter rungs. */
export function hintLevels(config: Pick<GameConfig, 'mode' | 'topic'>): number {
  const { answer } = rulesFor(config);
  return answer === 'click' ? 3 : answer === 'flag' ? 2 : 4;
}

export const MODE_BLURB: Record<Topic, Record<Mode, string>> = {
  countries: { type: 'Name them all, any order', locate: 'Click the named country', identify: 'Name the lit-up country' },
  flags: { type: "Type the flag's country", locate: "Click the flag's country", identify: "Pick the lit-up country's flag" },
  capitals: { type: 'Name every capital', locate: "Click the capital's country", identify: "Name the lit-up country's capital" },
};
```

Note: `HINT_LEVELS` in `src/game/hints.ts` stays for now (Task 3 removes its uses); `hintLevels` must agree with it for Countries.

- [ ] **Step 4: Add `topic?: Topic` to `GameConfig`** in `src/game/types.ts` (import type from `./topics.ts`), with the comment `/** missing = countries */`.

- [ ] **Step 5: Write failing reducer tests** — append to `tests/game/reducer.test.ts`:

```ts
describe('topics', () => {
  it('flags · type is ordered: one flag at a time, typed answers must be the target', () => {
    let s = start({ topic: 'flags' }, ['CHL', 'ARG', 'BRA']);
    expect(target(s)).toBe('CHL');
    expect(reduce(s, { type: 'found', id: 'ARG', now: 2000 })).toBe(s);
    s = reduce(s, { type: 'found', id: 'CHL', now: 2000 });
    expect(target(s)).toBe('ARG');
    s = reduce(s, { type: 'skip', now: 2500 });
    expect(s.missed).toEqual(['ARG']);
  });

  it('flags · identify: a pick is a click; any country may be picked; wrong picks cost tries', () => {
    let s = start({ topic: 'flags', mode: 'identify' }, ['CHL', 'ARG', 'BRA']);
    s = reduce(s, { type: 'click', id: 'ROU', now: 2000 }); // a lookalike outside the pool
    expect(s.triesLeft).toBe(TRIES_PER_TARGET - 1);
    expect(reduce(s, { type: 'click', id: 'NOPE', now: 2100 })).toBe(s); // not a country
    s = reduce(s, { type: 'click', id: 'CHL', now: 2200 });
    expect(s.found).toEqual(['CHL']);
  });

  it('countries · identify still ignores clicks', () => {
    const s = start({ mode: 'identify' });
    expect(reduce(s, { type: 'click', id: 'ARG', now: 2000 })).toBe(s);
  });

  it('capitals · type is unordered like countries · type', () => {
    const s = start({ topic: 'capitals' });
    expect(target(s)).toBeNull();
    expect(reduce(s, { type: 'found', id: 'BRA', now: 2000 }).found).toEqual(['BRA']);
  });

  it('hint ladders follow the topic', () => {
    let s = start({ topic: 'flags', mode: 'identify' }, ['CHL', 'ARG', 'BRA']);
    s = reduce(s, { type: 'hint', id: 'CHL', now: 2000 });
    s = reduce(s, { type: 'hint', id: 'CHL', now: 2100 });
    expect(s.hintsUsed).toBe(2);
    expect(reduce(s, { type: 'hint', id: 'CHL', now: 2200 })).toBe(s);
  });
});
```

- [ ] **Step 6: Run** `npx vitest run tests/game/reducer.test.ts` — expect the new tests to FAIL.

- [ ] **Step 7: Update `src/game/reducer.ts`**
  - `import { COUNTRY } from '../data/lookup.ts';` and `import { hintLevels, rulesFor } from './topics.ts';`
  - `target`: `export const target = (state: GameState): string | null => (rulesFor(state.config).ordered ? (state.queue[0] ?? null) : null);`
  - `markFound`: replace `state.config.mode !== 'type'` (both places) with `rulesFor(state.config).ordered`.
  - `start`: `queue: rulesFor(action.config).ordered ? action.order : []`.
  - `click` case:

```ts
    case 'click': {
      const goal = target(state);
      const { answer } = rulesFor(state.config);
      if (!goal || (answer !== 'click' && answer !== 'flag')) return state;
      // Locate clicks land on the map, so they must be in the game. A flag pick may be any country (lookalikes come from anywhere).
      if (answer === 'click' ? !state.pool.includes(action.id) : !COUNTRY.has(action.id)) return state;
      if (action.id === goal) return markFound(state, goal, action.now);
      const wrong = { ...state, triesLeft: state.triesLeft - 1, event: emit(state, { kind: 'wrong', id: action.id }) };
      return wrong.triesLeft > 0 ? wrong : reveal(wrong, goal, action.now);
    }
```

  - `giveHint`: `if (level > hintLevels(state.config)) return state;` (drop the `HINT_LEVELS` import if unused).
  - `giveLegacyHint`: keep `LEGACY_LEVELS[state.config.mode]` (legacy clients only ever played Countries).
  - Check that `COUNTRY` import doesn't create a cycle (`lookup.ts` imports only data). The worker already bundles `COUNTRIES`.

- [ ] **Step 8: Run reducer tests** — PASS. Run full `npx vitest run` — PASS.

- [ ] **Step 9: Failing tests for boards and config** — append to `tests/game/ranking.test.ts`:

```ts
describe('topics on boards', () => {
  const europe = { continents: ['europe' as const], subregions: [] };
  it('countries boards keep their keys; other topics are prefixed', () => {
    expect(boardFor({ mode: 'type', scope: europe, timeLimitSec: null })).toBe('type:europe');
    expect(boardFor({ topic: 'countries', mode: 'type', scope: europe, timeLimitSec: null })).toBe('type:europe');
    expect(boardFor({ topic: 'flags', mode: 'identify', scope: europe, timeLimitSec: null })).toBe('flags:identify:europe');
  });
  it('parses and labels both shapes', () => {
    expect(parseBoard('type:world')).toEqual({ topic: 'countries', mode: 'type', region: 'world' });
    expect(parseBoard('capitals:locate:asia')).toEqual({ topic: 'capitals', mode: 'locate', region: 'asia' });
    expect(parseBoard('countries:type:world')).toBeNull(); // countries never carries the prefix
    expect(parseBoard('flags:type:mars')).toBeNull();
    expect(boardLabel('flags:type:europe')).toBe('Europe · Flags · Type');
    expect(boardLabel('type:europe')).toBe('Europe · Type');
    expect(boardKey('countries', 'type', 'world')).toBe('type:world');
    expect(boardKey('flags', 'type', 'world')).toBe('flags:type:world');
  });
  it('parseConfig keeps a valid topic, drops countries, and rejects unknown ones', () => {
    const base = { mode: 'type', scope: { continents: [], subregions: [] }, timeLimitSec: null };
    expect(parseConfig({ ...base, topic: 'flags' })).toMatchObject({ topic: 'flags' });
    expect(parseConfig({ ...base, topic: 'countries' })).not.toHaveProperty('topic');
    expect(parseConfig(base)).not.toHaveProperty('topic');
    expect(parseConfig({ ...base, topic: 'rivers' })).toBeNull();
  });
});
```

(Import `boardKey` alongside the existing imports.)

- [ ] **Step 10: Update `src/game/ranking.ts`**

```ts
export const BOARD_TOPICS: Topic[] = TOPICS;
export type Board = `${Mode}:${Region}` | `${Exclude<Topic, 'countries'>}:${Mode}:${Region}`;

export function boardKey(topic: Topic, mode: Mode, region: Region): Board {
  return (topic === 'countries' ? `${mode}:${region}` : `${topic}:${mode}:${region}`) as Board;
}

export function boardFor(config: GameConfig): Board | null {
  const { continents, subregions } = config.scope;
  const region: Region | null = isWorld(config.scope) ? 'world' : subregions.length === 0 && continents.length === 1 ? continents[0] : null;
  return region && boardKey(topicOf(config), config.mode, region);
}

export function parseBoard(board: string): { topic: Topic; mode: Mode; region: Region } | null {
  const parts = board.split(':');
  const [topic, mode, region] = parts.length === 2 ? ['countries', ...parts] : parts;
  if (parts.length === 3 && topic === 'countries') return null;
  if (parts.length > 3 || !TOPICS.includes(topic as Topic) || !BOARD_MODES.includes(mode as Mode) || !BOARD_REGIONS.includes(region as Region)) return null;
  return { topic: topic as Topic, mode: mode as Mode, region: region as Region };
}

/** "World · Type", or "World · Flags · Type" */
export function boardLabel(board: Board): string {
  const { topic, mode, region } = parseBoard(board)!;
  return [regionLabel(region), ...(topic === 'countries' ? [] : [TOPIC_LABEL[topic]]), MODE_LABEL[mode]].join(' · ');
}
```

  In `parseConfig`: read `topic` from the value; `if (topic !== undefined && !TOPICS.includes(topic as Topic)) return null;` and return `{ ...(topic && topic !== 'countries' ? { topic: topic as Topic } : {}), mode, scope, timeLimitSec }`.

  Fix every caller of `parseBoard` that destructured `{ mode, region }` (it still has them; `topic` is extra) and anything typed on the old `Board` template (search `Board` usages; `worker/boards.ts` `getBoard` builds `${mode}:${region}` — leave it for Task 5 but make it compile).

- [ ] **Step 11: Local bests key** — `src/store/bests.ts`:

```ts
export function bestKey(config: GameConfig): string {
  const topic = topicOf(config);
  return `${BEST_PREFIX}${topic === 'countries' ? '' : `${topic}:`}${config.mode}:${scopeKey(config.scope)}:${config.timeLimitSec ?? 'none'}`;
}
```

  `localBests` already skips keys with an extra segment, so flags/capitals bests are never imported. Add a test in `tests/store/bests.test.ts`:

```ts
it('keys bests by topic, leaving countries keys as they were', () => {
  const world = { continents: [], subregions: [] };
  expect(bestKey({ mode: 'type', scope: world, timeLimitSec: null })).toBe('mapped:best:v1:type:world:none');
  expect(bestKey({ topic: 'flags', mode: 'type', scope: world, timeLimitSec: 600 })).toBe('mapped:best:v1:flags:type:world:600');
});
```

- [ ] **Step 12: Server accepts and ranks other topics** — in `tests/worker/replay.test.ts` add:

```ts
describe('other topics replay', () => {
  it('flags · identify: picks by click, wrong picks may be outside the region', () => {
    const config = cfg({ topic: 'flags', mode: 'identify' });
    let wrongOnce = false;
    const log = play(config, (s, now) => (wrongOnce ? { type: 'click', id: target(s)!, now } : ((wrongOnce = true), { type: 'click', id: 'ROU', now })));
    expect(verdict(config, log)).toMatchObject({ found: 12, reason: null });
  });
  it('capitals · type ranks like countries · type', () => {
    const config = cfg({ topic: 'capitals' });
    expect(verdict(config, play(config, typeAll))).toMatchObject({ found: 12, reason: null });
  });
});
```

  and in `tests/worker/games.test.ts`:

```ts
it('a flags game goes on its own board', async () => {
  const ana = await signIn(env, 'ana@example.com', 'meridian');
  const config: GameConfig = { ...SOUTH_AMERICA, topic: 'flags' };
  const game = await start(ana, config);
  expect(game.board).toBe('flags:type:south-america');
  const log = play(config, game.seed, (s, now) => ({ type: 'found', id: target(s)!, now }));
  const res = await call(env, 'POST', `/api/games/${game.id}/finish`, { cookie: ana, body: { log } });
  expect(await res.json()).toMatchObject({ ranked: true, board: 'flags:type:south-america', best: { rank: 1 } });
});
```

  (import `target` from `src/game/reducer.ts`). Run — PASS once Steps 7–10 are in.

- [ ] **Step 13:** `npx tsc -b` clean, `npx vitest run` all PASS.

- [ ] **Step 14: Commit** — `git commit -m "Topics: rules table, topic on config and boards, reducer reads the rules"`

---

### Task 2: Data — capitals, flags, lookalikes, flag choices

**Files:**
- Create: `src/data/capitals.ts`, `src/data/flagLookalikes.ts`, `src/game/flagChoices.ts`, `scripts/build-flags.ts`, `public/flags/<ID>.svg` ×197
- Modify: `package.json` (devDependency `flag-icons@^7.5.0`, script `"build-flags": "tsx scripts/build-flags.ts"`), `README.md` (credits), `tests/data/data.test.ts`
- Test: `tests/data/data.test.ts`, `tests/game/flagChoices.test.ts` (new)

**Interfaces:**
- Consumes: `COUNTRIES`, `COUNTRY` (`src/data/countries.ts`, `src/data/lookup.ts`), `seededRandom`, `shuffle` (`src/game/rng.ts`).
- Produces:
  - `CAPITALS: ReadonlyMap<string, { name: string; aliases: string[] }>` keyed by country id; `capitalOf(id: string): string`
  - `FLAG_LOOKALIKES: readonly (readonly string[])[]`
  - `flagChoices(target: string, seed: number): string[]` — 4 distinct ids including `target`, shuffled, deterministic
  - `flagSrc(id: string): string` → `/flags/${id}.svg` (put in `src/data/capitals.ts`'s sibling `src/data/flags.ts`)

- [ ] **Step 1: Failing data tests** — append to `tests/data/data.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { CAPITALS, capitalOf } from '../../src/data/capitals.ts';
import { FLAG_LOOKALIKES } from '../../src/data/flagLookalikes.ts';
import { normalize } from '../../src/match/normalize.ts';

describe('capitals and flags', () => {
  it('has a capital for every country, and no capital name belongs to two countries', () => {
    const owner = new Map<string, string>();
    for (const c of COUNTRIES) {
      const cap = CAPITALS.get(c.id);
      expect(cap, c.id).toBeDefined();
      for (const key of [cap!.name, ...cap!.aliases].map(normalize)) {
        expect(owner.get(key) ?? c.id, `${key} for ${c.id}`).toBe(c.id);
        owner.set(key, c.id);
      }
    }
    expect(CAPITALS.size).toBe(COUNTRIES.length);
  });
  it('accepts the alternatives the spec names', () => {
    expect(capitalOf('BOL')).toBe('Sucre');
    expect(CAPITALS.get('BOL')!.aliases).toContain('La Paz');
    expect(CAPITALS.get('UKR')!.aliases).toContain('Kiev');
    expect(CAPITALS.get('ZAF')!.aliases).toEqual(expect.arrayContaining(['Cape Town', 'Bloemfontein']));
    expect(capitalOf('NRU')).toBe('Yaren');
    expect(capitalOf('PSE')).toBe('Ramallah');
  });
  it('has a flag file for every country', () => {
    for (const c of COUNTRIES) expect(existsSync(`public/flags/${c.id}.svg`), c.id).toBe(true);
  });
  it('lookalike groups use real ids, at least 25 groups', () => {
    expect(FLAG_LOOKALIKES.length).toBeGreaterThanOrEqual(25);
    for (const g of FLAG_LOOKALIKES) for (const id of g) expect(COUNTRY.has(id), id).toBe(true);
  });
});
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Write `src/data/capitals.ts`.** Start from every `facts.ts` capital (197 rows) and apply exactly these display/alias rules; everything else is `{ name: <facts capital>, aliases: [] }` plus obvious unaccented or common English spellings only where they differ by more than accents (accents never matter: `normalize` strips them):
  - BOL `Sucre` + `La Paz`; PSE `Ramallah` + `East Jerusalem`; NRU `Yaren`; ZAF `Pretoria` + `Cape Town`, `Bloemfontein`; LKA `Sri Jayawardenepura Kotte` + `Kotte`, `Colombo`; MYS `Kuala Lumpur` + `Putrajaya`; SWZ `Mbabane` + `Lobamba`; KIR `Tarawa` + `South Tarawa`; UKR `Kyiv` + `Kiev`; MNG `Ulaanbaatar` + `Ulan Bator`; MMR `Naypyidaw` + `Nay Pyi Taw`, `Naypyitaw`; USA `Washington, D.C.` + `Washington`, `Washington DC`; KAZ `Astana` + `Nur-Sultan`; TON `Nukuʻalofa` + `Nukualofa`; TTO `Port of Spain` + `Port-of-Spain`; GTM `Guatemala City` + `Guatemala`; PAN `Panama City` + `Panama`; MEX `Mexico City`; KWT `Kuwait City` + `Kuwait`; VAT `Vatican City` + `Vatican`; CIV `Yamoussoukro`; TZA `Dodoma`; BEN `Porto-Novo`; FSM `Palikir`; SGP `Singapore`; MCO `Monaco`; LUX `Luxembourg`; DJI `Djibouti`; SMR `San Marino`; CPV `Praia`; STP `São Tomé`.
  - Note collisions are allowed with *country* names (separate index) but not between capitals; the test enforces it.
  - Export `capitalOf = (id: string) => CAPITALS.get(id)!.name`.

- [ ] **Step 4: Flags.** `npm i -D flag-icons@^7.5.0 tsx` (tsx only if not already present: `npx tsx --version`). Write `scripts/build-flags.ts`:

```ts
// Copies the 4:3 flag of every country from flag-icons (MIT) into public/flags/<ID>.svg. Run: npm run build-flags
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { COUNTRIES } from '../src/data/countries.ts';

/** alpha-3 → flag-icons file name (alpha-2, lower case). */
const ALPHA2: Record<string, string> = {
  /* all 197 ids, e.g. */ AFG: 'af', ALB: 'al', DZA: 'dz', /* … */ XKX: 'xk',
};

mkdirSync('public/flags', { recursive: true });
const missing: string[] = [];
for (const c of COUNTRIES) {
  const a2 = ALPHA2[c.id];
  if (!a2) { missing.push(c.id); continue; }
  const svg = readFileSync(`node_modules/flag-icons/flags/4x3/${a2}.svg`, 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();
  writeFileSync(`public/flags/${c.id}.svg`, svg + '\n');
}
if (missing.length) throw new Error(`No alpha-2 code for: ${missing.join(', ')}`);
console.log(`Wrote ${COUNTRIES.length} flags`);
```

  Fill `ALPHA2` for all 197 ids (ISO 3166-1; Kosovo `xk`; Palestine `ps`; Taiwan `tw`; Vatican `va`). Run `npm run build-flags`; commit the SVGs. Check total size: `du -sh public/flags` (expect a few MB at most; report it).
  - `src/data/flags.ts`: `export const flagSrc = (id: string) => `/flags/${id}.svg`;`
  - README: add a "Credits" line: "Flags from [flag-icons](https://github.com/lipis/flag-icons) (MIT)."

- [ ] **Step 5: `src/data/flagLookalikes.ts`** — at least 25 groups of alpha-3 ids, including every group named in the spec (Chad/Romania/Andorra/Moldova; Indonesia/Monaco/Poland/Singapore; Ireland/Côte d'Ivoire/Italy; Netherlands/Luxembourg/Paraguay/Croatia; Australia/New Zealand; Senegal/Mali/Guinea/Cameroon; Norway/Iceland/Denmark/Finland/Sweden; Slovenia/Slovakia/Russia/Serbia; Venezuela/Ecuador/Colombia; Honduras/El Salvador/Nicaragua/Guatemala/Argentina; Qatar/Bahrain; Jordan/Palestine/Sudan/Kuwait/UAE; Syria/Iraq/Egypt/Yemen; Austria/Latvia/Lebanon; Belgium/Germany; Hungary/Italy/Bulgaria/Tajikistan; Ghana/Bolivia/Lithuania/Guinea-Bissau) and more of your own (e.g. Japan/Bangladesh/Palau; Haiti/Liechtenstein; Cuba/Puerto-Rico-free alternatives like Cuba/Uruguay/Greece; Niger/India; Mexico/Italy; Estonia/Botswana; Thailand/Costa Rica; Malaysia/USA/Liberia; Kenya/South Sudan/Malawi; Mauritania/Pakistan; Tonga/… only where real resemblance exists).

- [ ] **Step 6: Failing tests for `flagChoices`** (`tests/game/flagChoices.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { COUNTRY } from '../../src/data/lookup.ts';
import { flagChoices } from '../../src/game/flagChoices.ts';

describe('flagChoices', () => {
  it('four distinct countries including the target', () => {
    const c = flagChoices('TCD', 7);
    expect(c).toHaveLength(4);
    expect(new Set(c).size).toBe(4);
    expect(c).toContain('TCD');
    for (const id of c) expect(COUNTRY.has(id)).toBe(true);
  });
  it('prefers lookalikes', () => expect(flagChoices('TCD', 7)).toEqual(expect.arrayContaining(['ROU', 'AND', 'MDA'])));
  it('fills from the same subregion when there are few lookalikes', () => {
    const c = flagChoices('NZL', 1).filter((id) => id !== 'NZL' && id !== 'AUS');
    for (const id of c) expect(COUNTRY.get(id)!.continent).toBe('oceania');
  });
  it('is the same for the same seed, and shuffles the target’s position', () => {
    expect(flagChoices('KEN', 42)).toEqual(flagChoices('KEN', 42));
    const spots = new Set(Array.from({ length: 30 }, (_, s) => flagChoices('KEN', s).indexOf('KEN')));
    expect(spots.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 7: Implement `src/game/flagChoices.ts`**

```ts
import { COUNTRIES } from '../data/countries.ts';
import { FLAG_LOOKALIKES } from '../data/flagLookalikes.ts';
import { COUNTRY } from '../data/lookup.ts';
import { seededRandom, shuffle } from './rng.ts';

/** A stable number for a country id, so each target gets its own choices from one game seed. */
const idHash = (id: string) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/**
 * The 4 flags offered in Flags · Identify: the target and 3 others, lookalikes first, then the same subregion, the same
 * continent, then anywhere. Same game seed and target → same choices (a reload or a restored review shows the same flags).
 */
export function flagChoices(target: string, seed: number): string[] {
  const rand = seededRandom((seed ^ idHash(target)) >>> 0);
  const me = COUNTRY.get(target)!;
  const others = COUNTRIES.filter((c) => c.id !== target);
  const tiers = [
    shuffle([...new Set(FLAG_LOOKALIKES.filter((g) => g.includes(target)).flat())].filter((id) => id !== target), rand),
    shuffle(others.filter((c) => c.subregion === me.subregion).map((c) => c.id), rand),
    shuffle(others.filter((c) => c.continent === me.continent).map((c) => c.id), rand),
    shuffle(others.map((c) => c.id), rand),
  ];
  const picked: string[] = [];
  for (const tier of tiers) for (const id of tier) if (picked.length < 3 && !picked.includes(id)) picked.push(id);
  return shuffle([target, ...picked], rand);
}
```

  Check `shuffle`/`seededRandom` signatures in `src/game/rng.ts` and adapt (shuffle may not mutate; it takes `(items, rand)`).

- [ ] **Step 8:** All tests PASS; `npx tsc -b` clean.

- [ ] **Step 9: Commit** — `git commit -m "Data for flags and capitals: capitals with alternatives, self-hosted flags, lookalikes, flag choices"`

---

### Task 3: Matching and hints per topic

**Files:**
- Create: `src/match/capitalIndex.ts`
- Modify: `src/game/hints.ts`, `src/ui/useGuess.ts`, `src/App.tsx` (only the `clue`/`clues` code and the `useGuess` call)
- Test: `tests/match/match.test.ts`, `tests/game/hints.test.ts`

**Interfaces:**
- Consumes: `CAPITALS` (Task 2), `rulesFor`, `hintLevels`, `topicOf` (Task 1), `buildIndex`, `matchTyped`, `matchSubmitted`, `matchTarget`.
- Produces:
  - `CAPITAL_INDEX: NameIndex` (entries `{ id: countryId, name, aliases }`, no territories)
  - `clueFor(config: Pick<GameConfig,'mode'|'topic'>, level: number, input: ClueInput): string`
  - `useGuess` options gain nothing; it picks the index from `rulesFor(state.config).answer` (`capital` → `CAPITAL_INDEX`, else the country index passed in).

- [ ] **Step 1: Failing matching tests** — in `tests/match/match.test.ts`:

```ts
import { CAPITAL_INDEX } from '../../src/match/capitalIndex.ts';

describe('capitals', () => {
  const ctx = (inScope: string[], found: string[] = []) => ({ index: CAPITAL_INDEX, inScope: new Set(inScope), found: new Set(found) });
  it('a typed capital is its country', () => {
    expect(matchTyped('nairobi', ctx(['KEN']))).toEqual({ kind: 'accept', id: 'KEN', corrected: false });
    expect(matchTyped('la paz', ctx(['BOL']))).toEqual({ kind: 'accept', id: 'BOL', corrected: false });
    expect(matchTyped('kiev', ctx(['UKR']))).toEqual({ kind: 'accept', id: 'UKR', corrected: false });
  });
  it('outside the region, already found, typos on Enter', () => {
    expect(matchTyped('nairobi', ctx(['TZA']))).toEqual({ kind: 'outOfScope', id: 'KEN' });
    expect(matchTyped('nairobi', ctx(['KEN'], ['KEN']))).toEqual({ kind: 'already', id: 'KEN' });
    expect(matchSubmitted('nairobbi', ctx(['KEN']))).toEqual({ kind: 'accept', id: 'KEN', corrected: true });
  });
  it('identify: the target’s capital only', () => {
    expect(matchTarget('Ottawa', 'CAN', CAPITAL_INDEX, false)).toBe('accept');
    expect(matchTarget('Toronto', 'CAN', CAPITAL_INDEX, true)).toBe('wrong');
  });
});
```

- [ ] **Step 2: Implement `src/match/capitalIndex.ts`**

```ts
import { CAPITALS } from '../data/capitals.ts';
import { buildIndex } from './nameIndex.ts';

/** Capitals as names of their countries: typing "Nairobi" finds KEN. */
export const CAPITAL_INDEX = buildIndex(
  [...CAPITALS].map(([id, c]) => ({ id, name: c.name, aliases: c.aliases, continent: 'africa', subregion: '', geo: null })),
  [],
);
```

  (`buildIndex` only reads `id`, `name`, `aliases`; if its parameter type is `CountryDef[]`, widen it to `Pick<CountryDef, 'id' | 'name' | 'aliases'>[]` instead of faking fields, and drop the fake fields above.)

- [ ] **Step 3: `useGuess` picks the index and the matcher from the rules.** Replace `s.config.mode === 'identify'` checks with `rulesFor(s.config).ordered` (typed answers in an ordered game are checked against the target: Countries · Identify, Flags · Type, Capitals · Identify) and use `const idx = rulesFor(s.config).answer === 'capital' ? CAPITAL_INDEX : index;` for `matchTarget`, `matchTyped`, `matchSubmitted`. Toasts in the unordered path: for `outOfScope` with capitals say ``${capitalOf(r.id)} is ${nameOf(r.id)}'s capital, which isn't in this quiz``; for `already` say ``Already found: ${capitalOf(r.id)}``. Territories never come up for capitals.

- [ ] **Step 4: Failing hint tests** — in `tests/game/hints.test.ts`:

```ts
describe('clues by topic', () => {
  const input = (id: string) => ({ country: COUNTRY.get(id)!, facts: FACTS.get(id)!, meta: GEO_META[id], nameOf });
  it('capitals spell the capital', () => {
    expect(clueFor({ mode: 'type', topic: 'capitals' }, 1, input('KEN'))).toBe('Starts with N');
    expect(clueFor({ mode: 'identify', topic: 'capitals' }, 2, input('KEN'))).toBe('N _ _ _ _ _ _ · 7 letters');
  });
  it('flags · type spells the country; locate rungs for clicking', () => {
    expect(clueFor({ mode: 'type', topic: 'flags' }, 1, input('KEN'))).toBe('Starts with K');
    expect(clueFor({ mode: 'locate', topic: 'capitals' }, 3, input('KEN'))).toBe('Look inside the circle');
  });
  it('flags · identify rungs say how many flags are left', () => {
    expect(clueFor({ mode: 'identify', topic: 'flags' }, 1, input('KEN'))).toBe('One wrong flag removed');
    expect(clueFor({ mode: 'identify', topic: 'flags' }, 2, input('KEN'))).toBe('Two wrong flags removed');
  });
  it('countries unchanged', () => {
    for (const mode of ['type', 'locate', 'identify'] as const) for (const lvl of [1, 2, 3]) expect(clueFor({ mode }, lvl, input('KEN'))).toBe(clueText(mode, lvl, input('KEN')));
  });
});
```

- [ ] **Step 5: Implement `clueFor`** in `src/game/hints.ts`:

```ts
/** The clue on rung `level` for any topic: letter rungs spell whatever the answer is (country or capital). */
export function clueFor(config: Pick<GameConfig, 'mode' | 'topic'>, level: number, input: ClueInput): string {
  const { answer } = rulesFor(config);
  if (answer === 'click') return clueText('locate', level, input);
  if (answer === 'flag') return level === 1 ? 'One wrong flag removed' : 'Two wrong flags removed';
  const name = answer === 'capital' ? capitalOf(input.country.id) : input.country.name;
  return clueText('identify', level, { ...input, country: { ...input.country, name } });
}
```

  In `src/App.tsx`, replace `clueText(mode, …)` with `clueFor(state.config / draft, …)` and `HINT_LEVELS[mode]` with `hintLevels(config)` everywhere (`clues`, the announcement, the HintCard `levels` prop). Then delete `HINT_LEVELS` if nothing else uses it (the reducer no longer does).

- [ ] **Step 6:** `npx vitest run`, `npx tsc -b` — PASS.

- [ ] **Step 7: Commit** — `git commit -m "Capitals matching and per-topic hint ladders"`

---

### Task 4: Playing the new topics

**Files:**
- Create: `src/ui/FlagCard.tsx`, `src/ui/FlagChoices.tsx`
- Modify: `src/ui/SetupCard.tsx`, `src/ui/LocatePrompt.tsx`, `src/ui/TopBar.tsx` (pill only via props), `src/App.tsx`, `src/styles/*.css` (new classes), `e2e/helpers.ts`, `e2e/game.spec.ts`
- Test: `e2e/topics.spec.ts` (new)

**Interfaces:**
- Consumes: `rulesFor`, `topicOf`, `TOPICS`, `TOPIC_LABEL`, `MODE_BLURB` (Task 1); `flagSrc`, `flagChoices`, `capitalOf` (Task 2); `clueFor`, `hintLevels` (Task 3).
- Produces: `FlagCard({ id }: { id: string })`; `FlagChoices({ ids, disabled, triesLeft, onPick })` where `ids: string[]` (4), `disabled: string[]` (wrong picks + hint-removed), `onPick(id)`; `LocatePrompt` gains `label: string` ("Find" / "Whose capital is") and an optional `flagId` (renders a small flag instead of a name).

Behavior to build (all in the existing visual language: `glass` panels, `chip`/`seg` controls, the dock at the bottom):

- [ ] **Step 1: Setup card topic row.** Above REGIONS: label "TOPIC", three chips (Countries / Flags / Capitals) with `aria-pressed`, default Countries. Changing it updates `draft.topic` (omit the field for countries). Mode buttons show `MODE_BLURB[topic][mode]`. The board line uses `boardLabel(boardFor(draft))` ("Europe · Flags · Type board"). The local best shown uses `readBest(storage, draft)` (key now includes the topic).
- [ ] **Step 2: Rules instead of mode checks in `App.tsx`.** Replace every gameplay `mode === 'type'` / `mode === 'identify'` / `mode === 'locate'` with the rules: `const rules = rulesFor(config)`.
  - Map target highlight only when `rules.prompt === 'map'` (today: `mode === 'identify'`).
  - Map clicks dispatch `click` only when `rules.answer === 'click'` (today: `mode === 'locate'`); the touch "tap again" zoom stays for those.
  - Type-mode "pick a country to hint" applies when `!rules.ordered` (Countries · Type and Capitals · Type).
  - The locate "circle" pulse applies when `rules.answer === 'click'` and hint level ≥ 3.
  - Skip button/`S` key in every ordered game whose prompt is not shown by `LocatePrompt` (that one has its own Skip).
- [ ] **Step 3: Dock prompt by rules.**
  - `prompt: 'name'` → `LocatePrompt` as today ("Find", country name).
  - `prompt: 'capital'` → `LocatePrompt` with label "Whose capital is" and the capital as the name.
  - `prompt: 'flag'` + `answer: 'click'` (Flags · Locate) → `LocatePrompt` with label "Find" and `flagId` (a 64px-wide flag in place of the name).
  - `prompt: 'flag'` + `answer: 'country'` (Flags · Type) → `FlagCard` (flag ~240px wide on desktop, ~160px on phones, rounded 6px, 1px border `--line`) above `GuessInput` with placeholder "Type the country…" and a Skip link like Identify's.
  - `answer: 'flag'` (Flags · Identify) → `FlagChoices`: 4 flag buttons in a 2×2 grid (desktop: one row of 4), each `aria-label="Flag 1"`…`"Flag 4"` (not the country name — that would give it away to screen readers; announce "Correct: Kenya" after), keys `1`–`4` pick, tries dots as in `LocatePrompt`, a wrong pick shakes and disables that flag. Choices = `flagChoices(target, seedOfRun)`; keep the game seed in state next to `run` (offline games: use `state.startedAt` as the seed). Hint rung n disables n wrong flags (the first n wrong ids in `choices` order that aren't already disabled).
  - `answer: 'capital'` ordered (Capitals · Identify) → `GuessInput` placeholder "Name its capital…"; unordered Capitals · Type → "Type a capital…".
  - Preload the next target's flag (`new Image().src = flagSrc(queue[1])`) in Flags games.
- [ ] **Step 4: Copy.** Top bar pill: `${scopeLabel(scope)} · ${TOPIC_LABEL[topic]} · ${modeLabel}` (Countries omits the topic, as today). Found toast for capitals: "Nairobi · Kenya"; for flags: the country name. Revealed (skip/out of tries) toast: "It was Kenya" / "It was Nairobi · Kenya".
- [ ] **Step 5: E2E tests** — `e2e/topics.spec.ts` (fill helpers from `e2e/helpers.ts`: `openSetup`, `start`, `typeLikeAPerson`, `watchErrors`):

```ts
import { expect, test } from '@playwright/test';
import { openSetup, start, typeLikeAPerson, watchErrors } from './helpers.ts';

const pickTopic = async (page, name: string) => page.locator('.setup').getByRole('button', { name, exact: true }).click();

test('flags · type: a flag at a time; typing its country moves on', async ({ page }) => {
  const errors = watchErrors(page);
  await openSetup(page);
  await pickTopic(page, 'Flags');
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await expect(page.locator('.setup')).toContainText('S. America · Flags · Type board');
  await start(page);
  const flag = page.locator('.flag-card img');
  const first = await page.locator('.guess').getAttribute('data-target-id');
  await expect(flag).toHaveAttribute('src', `/flags/${first}.svg`);
  const names: Record<string, string> = { ARG: 'Argentina', BOL: 'Bolivia', BRA: 'Brazil', CHL: 'Chile', COL: 'Colombia', ECU: 'Ecuador', GUY: 'Guyana', PRY: 'Paraguay', PER: 'Peru', SUR: 'Suriname', URY: 'Uruguay', VEN: 'Venezuela' };
  await typeLikeAPerson(page, [names[first!]]);
  await expect(page.locator('.topbar .score')).toHaveText('1 / 12');
  await expect(page.locator('.guess')).not.toHaveAttribute('data-target-id', first!);
  expect(errors).toEqual([]);
});

test('flags · identify: pick with the number keys; a wrong pick costs a try', async ({ page }) => {
  await openSetup(page);
  await pickTopic(page, 'Flags');
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await page.getByRole('button', { name: /^Identify/ }).click();
  await start(page);
  const choices = page.locator('.flag-choices button');
  await expect(choices).toHaveCount(4);
  const target = await page.locator('.flag-choices').getAttribute('data-target-id');
  const srcs = await choices.evaluateAll((els) => els.map((b) => b.querySelector('img')!.getAttribute('src')));
  const wrong = srcs.findIndex((s) => s !== `/flags/${target}.svg`);
  await page.keyboard.press(String(wrong + 1));
  await expect(page.locator('.flag-choices .tries i.on')).toHaveCount(2);
  await page.keyboard.press(String(srcs.indexOf(`/flags/${target}.svg`) + 1));
  await expect(page.locator('.topbar .score')).toHaveText('1 / 12');
});

test('capitals · type: a capital lights up its country', async ({ page }) => {
  await openSetup(page);
  await pickTopic(page, 'Capitals');
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await start(page);
  await typeLikeAPerson(page, ['lima', 'quito']);
  await expect(page.locator('.topbar .score')).toHaveText('2 / 12');
  await typeLikeAPerson(page, ['nairobi']);
  await expect(page.locator('.toast')).toContainText("Nairobi is Kenya's capital, which isn't in this quiz");
});
```

  (`FlagChoices` root: `className="flag-choices"` with `data-target-id={target}` for tests, like `GuessInput`.)
- [ ] **Step 6:** `npx tsc -b`, `npx vitest run`, `npx playwright test` — all PASS. Check the phone project too (the dock must not overflow at 375px: add a phone assertion for Flags · Identify in `e2e/phone.spec.ts` that `scrollWidth <= innerWidth`).
- [ ] **Step 7: Commit** — `git commit -m "Play Flags and Capitals: topic picker, flag card, flag choices, capital prompts"`

---

### Task 5: Review, leaderboards and Your games by topic

**Files:**
- Create: `src/ui/TopicTabs.tsx`
- Modify: `src/ui/ReviewPanel.tsx`, `src/ui/Leaderboard.tsx`, `src/ui/YourGames.tsx`, `src/ui/router.ts`, `src/api/client.ts`, `src/api/types.ts`, `worker/index.ts`, `worker/boards.ts`, `src/App.tsx`
- Test: `tests/ui/router.test.ts`, `tests/worker/games.test.ts`, `e2e/accounts.spec.ts`

**Interfaces:**
- Consumes: `boardKey`, `parseBoard`, `BOARD_TOPICS`, `TOPIC_LABEL`, `topicOf` (Task 1); `flagSrc`, `capitalOf` (Task 2).
- Produces:
  - `Route` board variant: `{ name: 'board'; topic: Topic; mode: Mode; region: Region }`; paths `/leaderboards/<mode>/<region>` (countries) and `/leaderboards/<topic>/<mode>/<region>`.
  - `api.board(topic: Topic, mode: Mode, region: Region)` → `GET /api/boards/<mode>/<region>` for countries, `/api/boards/<topic>/<mode>/<region>` otherwise.
  - `RecentGame.topic: Topic`.
  - `TopicTabs({ topic, onPick })`.

- [ ] **Step 1: Router tests** (`tests/ui/router.test.ts`):

```ts
it('topic boards', () => {
  expect(parseRoute('/leaderboards/type/world')).toEqual({ name: 'board', topic: 'countries', mode: 'type', region: 'world' });
  expect(parseRoute('/leaderboards/flags/locate/asia')).toEqual({ name: 'board', topic: 'flags', mode: 'locate', region: 'asia' });
  expect(parseRoute('/leaderboards/countries/type/world')).toEqual({ name: 'home' });
  expect(routePath({ name: 'board', topic: 'capitals', mode: 'type', region: 'europe' })).toBe('/leaderboards/capitals/type/europe');
  expect(routePath({ name: 'board', topic: 'countries', mode: 'type', region: 'europe' })).toBe('/leaderboards/type/europe');
});
```

  Implement with the regex `^\/leaderboards(?:\/(flags|capitals))?(?:\/([a-z]+)\/([a-z-]+))?$` (no topic segment = countries; `/leaderboards` alone = countries/type/world; `/leaderboards/flags` alone = flags/type/world).

- [ ] **Step 2: Worker route + test.** `worker/index.ts`: add `['GET', /^\/api\/boards\/(flags|capitals)\/([a-z]{1,10})\/([a-z-]{1,20})$/, (req, env, [topic, mode, region]) => getBoard(req, env, boardKey…)]`. Change `getBoard(req, env, board: string)` to take the board key (validate with `parseBoard`, 404 otherwise) and have both routes build the key with `boardKey`. Keep the countries route first; make sure `/api/boards/flags/type/world` doesn't match the 2-segment pattern (it doesn't: 3 segments). Test in `tests/worker/games.test.ts`:

```ts
it('topic board routes', async () => {
  expect((await call(env, 'GET', '/api/boards/flags/type/world')).status).toBe(200);
  expect(await (await call(env, 'GET', '/api/boards/flags/type/world')).json()).toMatchObject({ board: 'flags:type:world', rows: [] });
  expect((await call(env, 'GET', '/api/boards/rivers/type/world')).status).toBe(404);
  expect((await call(env, 'GET', '/api/boards/type/world')).status).toBe(200);
});
```

  `myGames`: add `topic: topicOf(JSON.parse(g.config))` to recent games (select `g.config`); add `topic` to `RecentGame`.

- [ ] **Step 3: Leaderboard card.** `TopicTabs` (a `seg` control with role tablist, "Countries / Flags / Capitals") above the mode tabs; picking keeps mode and region. The `Leaderboard` props become `{ topic, mode, region, onPick(topic, mode, region), onClose }`; `api.board(topic, mode, region)`. The Found column already exists.
- [ ] **Step 4: Your games.** `TopicTabs` above the bests grid (default countries); the grid reads `boardKey(topic, mode, region)`. Clicking a cell opens that topic's board. Recent rows: `${scopeLabel} · ${TOPIC_LABEL[topic]} · ${mode}` for non-countries.
- [ ] **Step 5: Review panel.** Pass `topic` to `ReviewPanel`. Flags: each missed item shows a 24px flag before the name. Capitals: "Nairobi · Kenya". Countries unchanged. The save card's board link uses the result's board (already topic-aware).
- [ ] **Step 6: App wiring.** `openBoard(board)` uses `parseBoard` → route with topic; the leaderboard route renders `Leaderboard` with `route.topic`.
- [ ] **Step 7: E2E** — in `e2e/accounts.spec.ts`:

```ts
test('leaderboards and your games switch topics', async ({ page }) => {
  const player = await asPlayer(page);
  await page.goto('/leaderboards/flags/type/europe');
  const board = page.getByRole('dialog', { name: 'Leaderboards' });
  await expect(board.getByRole('tab', { name: 'Flags' })).toHaveAttribute('aria-selected', 'true');
  await board.getByRole('tab', { name: 'Capitals' }).click();
  await expect(page).toHaveURL(/\/leaderboards\/capitals\/type\/europe$/);
  await board.getByRole('tab', { name: 'Countries' }).click();
  await expect(page).toHaveURL(/\/leaderboards\/type\/europe$/);
});
```

- [ ] **Step 8:** `npx tsc -b`, `npx vitest run`, `npx playwright test` — PASS.
- [ ] **Step 9: Commit** — `git commit -m "Review, leaderboards and Your games by topic"`

---

### Task 6: Docs

**Files:** `README.md`, `docs/superpowers/specs/2026-10-07-mapped-v3-flags-capitals-design.md` (only if implementation diverged: add a "Revisions during implementation" section).

- [ ] **Step 1:** README: describe the three topics in the intro, the 63 boards (3 topics × 3 modes × 7 regions), `npm run build-flags`, the flag-icons credit (if Task 2 didn't already).
- [ ] **Step 2: Commit** — `git commit -m "README: flags and capitals"`
