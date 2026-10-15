# Mapped v3.1 Implementation Plan: flag hints, easier Capitals, Flags · Learn

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Flags · Type a region hint first (5 rungs), make every Capitals game name its country (Type: type the named country's capital; Identify: pick it from 4), and add an opt-in Flags · Learn drill with local progress and no leaderboard.

**Architecture:** Gameplay stays driven by the rules table in `src/game/topics.ts`: one new prompt (`country`) and one new answer (`capitalPick`, a pick logged as a `click`, like Flags · Identify). Learn is separate from the ranked game: a small pure reducer (`src/game/learn.ts`), a localStorage store, and its own dock UI, chosen with a Play | Learn switch on the setup card when the topic is Flags.

**Tech Stack:** Vite, React 19, TypeScript, Vitest 5, Playwright, Cloudflare Workers + D1 (wrangler).

**Spec:** `docs/superpowers/specs/2026-10-14-mapped-v3-1-hints-capitals-learn-design.md` (builds on `docs/superpowers/specs/2026-10-07-mapped-v3-flags-capitals-design.md`)

## Global Constraints

- Countries games, and Flags · Locate / Flags · Identify, behave exactly as today. Capitals · Locate is unchanged.
- Flags · Type hint rung 1 is "In <subregion>" (e.g. "In Western Africa"); rungs 2–5 are today's letter rungs 1–4. `hintLevels`: Flags · Type 5; `click` 3; `flag` and `capitalPick` 2; otherwise 4.
- No new log action types: a capital pick is a `click` on the picked capital's country id; any country id is allowed, anything but the target costs a try (`TRIES_PER_TARGET` = 3).
- Capital choices: 4 country ids incl. the target, decoys from neighbors (`GEO_META[id].neighbors`), then same subregion, then same continent, then anywhere; shuffled; deterministic per (game seed, target). Buttons show the capital name; keys 1–4.
- Old Capitals · Type / Identify runs: migration sets `ranked = 0, unranked_reason = 'retired'` and deletes their `bests`; Your games shows "Unranked: older rules".
- Learn: opt-in via a Play | Learn switch shown only for the Flags topic, Play default; never gates Play. No server calls, no board, no account save, no URL. localStorage key `mapped:learn:v1:flags` = learned country ids (global set). A flag is learned after 2 right answers in a row; a wrong answer requeues it 3 cards later; the round ends when every flag in it is learned or on Stop.
- Copy uses " · " like the existing UI.
- Run `npx tsc -b` and `npx vitest run` before every commit; `npx playwright test` where a task touches UI or adds E2E. Never commit `tsconfig.tsbuildinfo`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Flags · Type gets a region hint first

**Files:** Modify `src/game/topics.ts` (`hintLevels`), `src/game/hints.ts` (`clueFor`); tests `tests/game/topics.test.ts`, `tests/game/hints.test.ts`; E2E check in `e2e/topics.spec.ts`.

**Interfaces:** Produces `hintLevels({ mode: 'type', topic: 'flags' }) === 5`; `clueFor({ mode: 'type', topic: 'flags' }, 1, input) === 'In ' + input.country.subregion`.

- [ ] **Step 1: Failing tests** — in `tests/game/topics.test.ts` change the Flags · Type expectation to 5. In `tests/game/hints.test.ts`:

```ts
it('flags · type: region first, then the letter rungs', () => {
  const flagsType = { mode: 'type' as const, topic: 'flags' as const };
  expect(clueFor(flagsType, 1, input('TCD'))).toBe('In Central Africa');
  for (const lvl of [2, 3, 4, 5]) expect(clueFor(flagsType, lvl, input('TCD'))).toBe(clueText('identify', lvl - 1, input('TCD')));
});
```

(Check `COUNTRY.get('TCD')!.subregion` is 'Central Africa' in `src/data/countries.ts`; use whatever the data says.) Update the existing "flags · type spells the country" case to level 2 if it asserted level 1.

- [ ] **Step 2: Implement.** `hintLevels`: `if (topicOf(config) === 'flags' && config.mode === 'type') return 5;` before the existing rule. `clueFor`: for Flags · Type, `level === 1 ? \`In ${input.country.subregion}\`` : letter rungs with `level - 1`.
- [ ] **Step 3:** Any E2E that asserts a Flags · Type hint count or first clue: update to "x/5" and the region clue; add one assertion in `e2e/topics.spec.ts` that the first Flags · Type hint reads "In …" and the card shows "1/5".
- [ ] **Step 4:** `npx tsc -b`, `npx vitest run`, `npx playwright test e2e/topics.spec.ts` pass. Commit "Flags · Type: region hint first, five rungs".

---

### Task 2: Capitals engine — rules, picks, choices, retiring old runs

**Files:**
- Modify: `src/game/topics.ts`, `src/game/reducer.ts`, `src/game/hints.ts`, `src/api/types.ts` (`UnrankedReason`), `src/ui/accountText.ts` (`REASON_TEXT`)
- Create: `src/game/capitalChoices.ts`, `migrations/0005_retire_old_capitals.sql`
- Tests: `tests/game/topics.test.ts`, `tests/game/reducer.test.ts`, `tests/game/capitalChoices.test.ts` (new), `tests/game/hints.test.ts`, `tests/worker/replay.test.ts`, `tests/worker/games.test.ts`

**Interfaces:**
- `Prompt` gains `'country'`; `Answer` gains `'capitalPick'`; export `isPick(answer: Answer): boolean` (true for `flag` and `capitalPick`).
- Capitals rules: Type `{ ordered: true, prompt: 'country', answer: 'capital' }`; Locate unchanged; Identify `{ ordered: true, prompt: 'country', answer: 'capitalPick' }`.
- `MODE_BLURB.capitals`: `{ type: "Type the named country's capital", locate: "Click the capital's country", identify: "Pick the named country's capital" }`.
- `capitalChoices(target: string, seed: number): string[]`.
- `UnrankedReason` gains `'retired'`; `REASON_TEXT.retired = 'older rules'`.

- [ ] **Step 1: Failing tests.**
  - `tests/game/topics.test.ts`: the Capitals rules above; `hintLevels` for Capitals · Identify is 2, Capitals · Type 4; `isPick`.
  - `tests/game/reducer.test.ts`:

```ts
it('capitals · type is ordered: the named country, typed capital = found on that country', () => {
  let s = start({ topic: 'capitals' }, ['CHL', 'ARG', 'BRA']);
  expect(target(s)).toBe('CHL');
  expect(reduce(s, { type: 'found', id: 'ARG', now: 2000 })).toBe(s);
  s = reduce(s, { type: 'found', id: 'CHL', now: 2000 });
  expect(target(s)).toBe('ARG');
});
it('capitals · identify: a pick is a click on any country; wrong costs a try', () => {
  let s = start({ topic: 'capitals', mode: 'identify' }, ['CHL', 'ARG', 'BRA']);
  s = reduce(s, { type: 'click', id: 'PER', now: 2000 }); // outside the pool
  expect(s.triesLeft).toBe(TRIES_PER_TARGET - 1);
  s = reduce(s, { type: 'click', id: 'CHL', now: 2100 });
  expect(s.found).toEqual(['CHL']);
});
```

  - `tests/game/capitalChoices.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { COUNTRY } from '../../src/data/lookup.ts';
import { GEO_META } from '../../src/data/geoMeta.ts';
import { capitalChoices } from '../../src/game/capitalChoices.ts';

describe('capitalChoices', () => {
  it('four distinct countries including the target', () => {
    for (const id of ['KEN', 'FRA', 'NZL', 'FJI', 'CHL']) {
      const c = capitalChoices(id, 3);
      expect(c).toHaveLength(4);
      expect(new Set(c).size).toBe(4);
      expect(c).toContain(id);
      for (const x of c) expect(COUNTRY.has(x)).toBe(true);
    }
  });
  it('neighbors first', () => {
    const decoys = capitalChoices('KEN', 1).filter((id) => id !== 'KEN');
    for (const id of decoys) expect(GEO_META.KEN.neighbors).toContain(id); // Kenya has 5 neighbors
  });
  it('deterministic per seed, and the target moves around', () => {
    expect(capitalChoices('KEN', 9)).toEqual(capitalChoices('KEN', 9));
    expect(new Set(Array.from({ length: 30 }, (_, s) => capitalChoices('KEN', s).indexOf('KEN'))).size).toBeGreaterThan(1);
  });
});
```

  (Check `GEO_META` export name/shape in `src/data/geoMeta.ts`.)
  - `tests/game/hints.test.ts`: Capitals · Identify rungs read "One wrong capital removed" / "Two wrong capitals removed"; Capitals · Type rung 1 is "Starts with N" for KEN (letter rungs for the capital, unchanged).
  - `tests/worker/replay.test.ts`: a Capitals · Type game (found the target each step) and a Capitals · Identify game (one wrong click on a country outside the region, then the target) both judge `reason: null`.
  - `tests/worker/games.test.ts`: after applying all migrations, a seeded old-style Capitals · Type game row with a `bests` row would be retired — test the migration SQL by running `migrations/0005_retire_old_capitals.sql` against the test DB after inserting rows (see how `recompute-bests` is tested there and do the same): the capitals:type and capitals:identify games become `ranked = 0, unranked_reason = 'retired'`, their bests are gone, a capitals:locate game and its best are untouched, a flags game untouched.

- [ ] **Step 2: Implement.**
  - `topics.ts`: types, rules, `isPick`, blurbs, `hintLevels` (`isPick(answer) → 2`).
  - `reducer.ts` `click`: replace `answer !== 'click' && answer !== 'flag'` with `answer !== 'click' && !isPick(answer)`; the "may be any country" branch applies to `isPick(answer)`.
  - `hints.ts` `clueFor`: `capitalPick` → 'One wrong capital removed' / 'Two wrong capitals removed'.
  - `capitalChoices.ts` (mirror `flagChoices`, same `idHash` approach — export `idHash` from `flagChoices.ts` rather than duplicating it):

```ts
export function capitalChoices(target: string, seed: number): string[] {
  const rand = seededRandom((seed ^ idHash(target) ^ 0x5bd1e995) >>> 0);
  const me = COUNTRY.get(target)!;
  const others = COUNTRIES.filter((c) => c.id !== target);
  const tiers = [
    shuffle(GEO_META[target].neighbors.filter((id) => COUNTRY.has(id)), rand),
    shuffle(others.filter((c) => c.subregion === me.subregion).map((c) => c.id), rand),
    shuffle(others.filter((c) => c.continent === me.continent).map((c) => c.id), rand),
    shuffle(others.map((c) => c.id), rand),
  ];
  const picked: string[] = [];
  for (const tier of tiers) for (const id of tier) if (picked.length < 3 && !picked.includes(id)) picked.push(id);
  return shuffle([target, ...picked], rand);
}
```

  - `migrations/0005_retire_old_capitals.sql`:

```sql
-- Capitals · Type and Identify now name the country (v3.1). Runs under the old rules aren't comparable: unrank them and clear their bests.
UPDATE games SET ranked = 0, unranked_reason = 'retired'
WHERE board LIKE 'capitals:type:%' OR board LIKE 'capitals:identify:%';
DELETE FROM bests WHERE board LIKE 'capitals:type:%' OR board LIKE 'capitals:identify:%';
```

  (Unfinished rows get `ranked = 0` already; setting the reason on them is harmless: if one is finished later it replays against the new rules and either fails or is re-judged — check `finishGame` overwrites `unranked_reason`; it does.)
  - `types.ts` / `accountText.ts`: `'retired'` reason and text.
- [ ] **Step 3:** `npx tsc -b`, `npx vitest run` pass. Commit "Capitals engine: named-country prompts, capital picks, retire old runs".

---

### Task 3: Capitals UI

**Files:** Modify `src/App.tsx`, `src/ui/FlagChoices.tsx` → generalize or add `src/ui/CapitalChoices.tsx`, `src/ui/LocatePrompt.tsx` (or a small `CountryPrompt`), styles; E2E `e2e/topics.spec.ts`.

**Interfaces:** Consumes `rulesFor` (`prompt: 'country'`, `answer: 'capitalPick'`, `isPick`), `capitalChoices`, `capitalOf`, `hintLevels`.

- [ ] **Step 1: Prompt `country`** (Capitals · Type and Identify): the target is lit on the map exactly as `prompt: 'map'` lights it today (same highlight and focus), and the dock names it. For Capitals · Type: a prompt line "Capital of **Kenya**" above `GuessInput` (label "Capital", placeholder "Type its capital…") with the Skip link. For Capitals · Identify: the choices panel's head reads "Capital of **Kenya**".
- [ ] **Step 2: Capital choices.** A choices panel styled like `FlagChoices` (same glass card, tries dots, 2×2 on phones / one row on desktop), each button showing the capital name (`capitalOf(id)`) with its `kbd` 1–4, `aria-label` = the capital name. Keys 1–4 pick (extend the existing `answer === 'flag'` key handling to `isPick(answer)`). Wrong pick shakes and disables that button; hint rung n disables n wrong choices (reuse the flag hint-removal logic for any pick answer; extract it to a small pure helper `removedChoices(choices, goal, wrongPicked, n)` in `src/game/choices.ts` with a unit test while you're here). Double-click guard as for flags. Choices = `capitalChoices(goal, gameSeed)`. Prefer one generalized `Choices` component rendering either flags or capital names over two near-duplicates.
- [ ] **Step 3: Copy.** Found toast for Capitals: "Nairobi · Kenya" (as today). Wrong pick: "No, that's Kampala (Uganda)". Reveal: "It was Nairobi · Kenya". Announcements similar. `dockExtra` / safe-area: account for the capital choices panel and the "Capital of" line so the map frames the target above the dock (phones too).
- [ ] **Step 4: E2E** in `e2e/topics.spec.ts` (replace the old Capitals · Type test):

```ts
test('capitals · type: the country is named; type its capital', async ({ page }) => {
  await openSetup(page);
  await pickTopic(page, 'Capitals');
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await start(page);
  const target = await page.locator('.guess').getAttribute('data-target-id');
  const capitals: Record<string, string> = { ARG: 'Buenos Aires', BOL: 'Sucre', BRA: 'Brasilia', CHL: 'Santiago', COL: 'Bogota', ECU: 'Quito', GUY: 'Georgetown', PRY: 'Asuncion', PER: 'Lima', SUR: 'Paramaribo', URY: 'Montevideo', VEN: 'Caracas' };
  await expect(page.locator('.dock')).toContainText('Capital of');
  await typeLikeAPerson(page, [capitals[target!]], 'Capital');
  await expect(page.locator('.topbar .score')).toHaveText('1 / 12');
});

test('capitals · identify: pick the capital with the number keys', async ({ page }) => {
  await openSetup(page);
  await pickTopic(page, 'Capitals');
  await page.getByRole('button', { name: /^S\. America/ }).click();
  await page.getByRole('button', { name: /^Identify/ }).click();
  await start(page);
  const panel = page.locator('.choices');
  const target = await panel.getAttribute('data-target-id');
  const ids = await panel.locator('button').evaluateAll((els) => els.map((b) => b.getAttribute('data-country-id')));
  const right = ids.indexOf(target);
  const wrong = ids.findIndex((id) => id !== target);
  await expect(panel).toContainText('Capital of');
  await page.keyboard.press(String(wrong + 1));
  await expect(panel.locator('.tries i.on')).toHaveCount(2);
  await page.keyboard.press(String(right + 1));
  await expect(page.locator('.topbar .score')).toHaveText('1 / 12');
});
```

  The choices panel root has class `choices` (flags keep working too: give the shared component both `choices` and `flag-choices` classes for Flags, or update the existing flag tests' selectors) and `data-target-id`; each button carries `data-country-id`.
- [ ] **Step 5:** `npx tsc -b`, `npx vitest run`, `npx playwright test` (desktop + phone) pass. Screenshots for your own check (Capitals · Type and Identify, desktop and 375px phone) in `.superpowers/sdd/<plan>/shots/`; don't commit screenshot code. Commit "Capitals UI: named country, capital choices".

---

### Task 4: Learn engine and store

**Files:** Create `src/game/learn.ts`, `src/store/learned.ts`; tests `tests/game/learn.test.ts`, `tests/store/learned.test.ts`.

**Interfaces:**

```ts
// src/game/learn.ts
export const LEARN_STREAK = 2;   // right answers in a row to learn a flag
export const REQUEUE_AFTER = 3;  // a missed flag comes back this many cards later
export interface LearnState {
  phase: 'asking' | 'answered' | 'done';
  queue: string[];               // queue[0] is the current flag
  pool: string[];                // every flag in the round
  streak: Record<string, number>;
  learned: string[];             // learned this round, in order
  misses: Record<string, number>;
  /** the last answer, while phase is 'answered' */
  last: { picked: string; target: string; right: boolean } | null;
  startedAt: number;
  endedAt: number | null;
}
export type LearnAction =
  | { type: 'start'; pool: string[]; order: string[]; now: number }
  | { type: 'pick'; id: string }
  | { type: 'continue'; now: number }
  | { type: 'stop'; now: number };
export function learnReduce(state: LearnState | null, action: LearnAction): LearnState;
export function hardest(state: LearnState, n?: number): string[]; // most-missed first, ties by first miss order; default n = 3
```

Rules: `pick` only in 'asking'. Right: streak +1; if it reaches `LEARN_STREAK` the flag is learned (removed from the queue, appended to `learned`), else it moves to the back of the queue. Wrong: streak 0, misses +1, the flag is reinserted at index `REQUEUE_AFTER` (or the end if the queue is shorter). Either way phase → 'answered' with `last` set. `continue`: phase → 'asking', or 'done' (with `endedAt`) if the queue is empty. `stop`: 'done' with `endedAt`.

```ts
// src/store/learned.ts
export const LEARNED_KEY = 'mapped:learn:v1:flags';
export function readLearned(storage: Storage | null): Set<string>;
export function addLearned(storage: Storage | null, ids: readonly string[]): void;
export function resetLearned(storage: Storage | null, ids: readonly string[]): void; // removes these ids (the selected region's)
```

Use `readJson`/`writeJson` from `src/store/storage.ts` (they already swallow blocked storage).

- [ ] **Step 1: Failing tests** covering: a right answer moves the flag to the back; two rights in a row learn it; a wrong answer requeues at index 3 (and at the end when fewer than 3 remain); a wrong resets the streak (right, wrong, right ≠ learned); 'done' when the last flag is learned (after `continue`); `stop` from any phase; `pick` ignored when not 'asking'; `hardest` ordering; store read/add/reset, a corrupt value reads as empty, blocked storage (null) is a no-op.
- [ ] **Step 2: Implement** to pass.
- [ ] **Step 3:** `npx tsc -b`, `npx vitest run`. Commit "Learn: drill reducer and learned-flags store".

---

### Task 5: Learn UI

**Files:** Modify `src/ui/SetupCard.tsx`, `src/App.tsx`, `src/ui/TopBar.tsx` (props only), styles; create `src/ui/LearnCard.tsx`, `src/ui/LearnSummary.tsx`; E2E `e2e/learn.spec.ts` (new).

**Interfaces:** Consumes `learnReduce`, `hardest`, `LEARN_STREAK` (Task 4); `readLearned`, `addLearned`, `resetLearned`; `flagChoices` (seed: a random number per round), `flagSrc`, `capitalOf`, `nameOf`, `poolFor`, `scopeLabel`.

- [ ] **Step 1: Setup card.** When the topic is Flags, a `seg` switch "Play | Learn" above TOPIC… (place it at the top of the card body, Play selected by default). Selecting Learn: Mode and Time limit rows hide; the board line reads "Practice · not ranked"; the Start button reads "Start learning"; a line shows "30 / 45 learned" for the selected region (`readLearned` ∩ region pool) with a "Reset" link (`resetLearned(region pool)`, then refresh the count). Switching topic away from Flags returns to Play. The Play/Learn choice is per visit state (not persisted, not in the URL).
- [ ] **Step 2: Session.** "Start learning" builds the round: region pool minus learned flags, or the whole pool if all are learned; shuffled with a random seed; `learnReduce(null, start)`. While a session is active, the app shows the map + top bar + `LearnCard` instead of the game dock; the setup card is hidden as during play.
  - Top bar: pill "Europe · Flags · Learn", center "Learned 12 / 45" (learned this round / round size) plus the elapsed clock, right side **Stop** (no confirmation) and the theme toggle. No hint button.
  - `LearnCard`: the flag (large, like `FlagCard`), 4 buttons with country names (`flagChoices(current, seed)` → `nameOf`), keys 1–4. After a pick: the right button turns gold; a wrong pick shakes red; the line under the flag reads "Chad · N'Djamena" (right) or "That's Chad · N'Djamena" (wrong); the map highlights and focuses the right country (reuse the found/target highlight and `mapRef.focus`). Right answers auto-continue after ~900 ms; wrong answers wait for a Continue button (Enter also continues). Map clicks do nothing in Learn.
  - Each time a flag becomes learned, `addLearned(storage, [id])` immediately (so Stop keeps progress).
- [ ] **Step 3: Summary** (`LearnSummary`, a centered card like the other cards): finished → "Learned 45 flags in 6:12"; stopped → "Learned 12 of 45 flags in 3:40". Below: "Hardest this round" with up to 3 flags (small flag + name) from `hardest()` (hidden if no misses). Buttons: "Learn again" (new round, same region; uses the updated learned set) and "Play Flags" (closes, setup card in Play with the same region). Esc/close returns to the setup card in Learn.
- [ ] **Step 4: E2E** (`e2e/learn.spec.ts`), using a small region to keep it fast (Oceania's "Australia & New Zealand"-style subregion if available via the Subregions picker, or S. America = 12 flags):
  - Switch Flags → Learn: Mode/Time rows hidden, "Practice · not ranked" shown, Start reads "Start learning".
  - Start: a `.learn-card` with a flag and 4 buttons; read the right answer from a `data-target-id` on the card; press a wrong key → "That's …" shown, Continue appears, after Continue the counter is still 0; answer right twice when that flag returns → counter 1.
  - Stop → summary "Learned 1 of 12 flags…"; "Play Flags" → setup in Play with S. America selected; switch to Learn → "1 / 12 learned"; Reset → "0 / 12 learned".
  - No `/api/games` request is made during a Learn session (listen with `page.on('request')`).
  - Phone project: the Learn card fits at 375px without horizontal scroll.
- [ ] **Step 5:** `npx tsc -b`, `npx vitest run`, `npx playwright test` pass. Screenshots for your own check (setup in Learn; a question; a wrong answer; the summary — desktop and phone). Commit "Flags · Learn: setup switch, drill card, summary".

---

### Task 6: Docs

- [ ] README: Flags · Type's five hints, the Capitals changes (named country; Identify is multiple choice), and Flags · Learn (opt-in practice, progress on this browser, no leaderboard).
- [ ] Spec: add "Revisions during implementation" if anything diverged.
- [ ] Commit "README and spec: v3.1".
