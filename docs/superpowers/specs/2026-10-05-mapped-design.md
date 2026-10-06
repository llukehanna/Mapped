# Mapped: design spec

**Date:** 2026-10-05
**Status:** Approved in brainstorming, awaiting spec review
**URL:** https://mapped.lukeghanna.com

A map-based world geography quiz, inspired by [Sporcle's "Countries of the World"](https://www.sporcle.com/games/g/world), that fixes its main weaknesses: a small, hard-to-read map, strict and surprising name matching, no region selection, a fixed timer, and a long list of answers under the map that you have to scroll to.

No accounts, no backend. Every visit starts a fresh game. Best times are stored only in the browser.

## Goals

1. The map is the hero. It fills the screen, it can be zoomed, and tiny countries are always visible and clickable.
2. Name matching forgives harmless differences (case, accents, punctuation, aliases, unambiguous typos) and never accepts the wrong country.
3. Players can configure regions, mode and time limit.
4. The UI matches the visual language of Luke's other apps (Solitaire, lukeghanna.com): warm charcoal, gold accent, Geist, glassy chrome.
5. It runs entirely on the free plans of Cloudflare Workers and Vercel Hobby.

## Non-goals (v1)

- Accounts, global leaderboards, multiplayer
- Share-result text (considered, cut)
- Capitals, flags and other quiz types
- Offline/PWA install (easy to add later, as Solitaire did)

## Stack

Matches Solitaire.

- **Vite + React 19 + TypeScript**, no backend
- **d3-geo**, **d3-zoom** and **topojson-client** for the map, rendered as React-owned SVG
- **Geist / Geist Mono** via `@fontsource-variable`
- **Vitest** for unit tests and **Playwright** for end-to-end tests
- **mapshaper** (dev dependency) for the build-time geometry pipeline
- Node 24+

## Hosting and free-plan compliance

The production build is a static `dist/` folder: HTML, JS, CSS and one geometry file. It needs no server functions, database, Worker script, middleware, image optimization or client-side routes.

| Constraint | Cloudflare Workers (free) | Vercel Hobby (free) | Mapped |
| --- | --- | --- | --- |
| Compute | Static asset requests are free and unlimited, and don't count toward the 100k/day Worker request limit, as long as no Worker script runs | Functions not used | No Worker script, no functions |
| File size | 25 MiB per asset | Fine | Largest file is the geometry, budgeted at ≤ 600 KB uncompressed |
| File count | 20,000 per deployment | Fine | Fewer than 30 files |
| Bandwidth | No cap on static assets | 100 GB/month | Budgeted at ≤ 1.2 MB per first visit uncompressed (well under 400 KB gzipped) |
| Builds | Local `wrangler deploy` | 45 min max | Under 1 minute |
| Usage terms | — | Personal, non-commercial only | Personal project, no ads or payments |
| Routing | `not_found_handling: "404-page"` | Default | No client routes, so neither host needs rewrites |

**Primary host:** Cloudflare Workers static assets, configured exactly like Solitaire.

- `wrangler.jsonc` sets `name: "mapped"` and points `assets.directory` at `./dist`. It has no `main`, so no Worker script runs.
- The custom domain route is `mapped.lukeghanna.com`. The `lukeghanna.com` zone is already on Cloudflare.
- `npm run deploy` runs the build and then `wrangler deploy`.

**Portable to Vercel:** a `vercel.json` with framework `vite` and output `dist` mirrors the security and cache headers from `public/_headers`. `vercel deploy --prod` works unchanged.

**Headers** live in both `public/_headers` (Cloudflare) and `vercel.json` (Vercel), and must be kept in sync:
- Hashed assets under `/assets/*`: cache for a year, immutable.
- `index.html`: revalidate on every load.
- On every response: a strict CSP, `X-Content-Type-Options`, `Referrer-Policy`.

## Data

### Country set

There are 197 guessable countries: the 193 UN member states plus Vatican City, Palestine, Kosovo and Taiwan. This matches Sporcle.

Each country record (`src/data/countries.ts`):

```ts
interface Country {
  id: string;            // ISO 3166-1 alpha-3, e.g. "BRA"; Kosovo uses "XKX"
  name: string;          // display name, e.g. "Brazil"
  aliases: string[];     // other accepted names, e.g. ["United States", "USA", "US", "America"]
  continent: Continent;  // one of 6; transcontinental countries get one, chosen deliberately
  subregion: string;     // UN M49 subregion, e.g. "Western Africa"
  tiny: boolean;         // true when too small to see or click at world zoom; drawn with a marker
  anchor: [lon, lat];    // marker and label point; also used to zoom to the country
}
```

**Continents:** Africa (54), Asia, Europe, North America (23), South America (12), Oceania. Final counts are set by the data and checked by tests.

Transcontinental assignments, fixed in data:
- Russia → Europe
- Turkey, Georgia, Armenia, Azerbaijan, Kazakhstan, Cyprus → Asia
- Egypt → Africa
- Panama and the Caribbean → North America
- Timor-Leste → Asia
- Papua New Guinea → Oceania

**Subregions** follow UN M49, with adjustments for gameplay: "Middle East" (Western Asia) and "Caribbean" are exposed as named groups.

### Territories

Territories such as Greenland, Western Sahara, Puerto Rico, French Guiana, New Caledonia and Falkland Islands are drawn on the map but can't be guessed or clicked. Each has a `note` (for example "Territory of Denmark") that appears when someone types its name.

### Geometry pipeline

`scripts/build-geo.ts` takes Natural Earth admin-0 at 1:50m (public domain) and runs it through mapshaper to produce `src/data/world.topo.json`. The steps:

1. Filter to the 197 countries plus the territories, and assign stable IDs.
2. Merge or split features where Natural Earth differs from our country list. For example, Somaliland is merged into Somalia and Northern Cyprus into Cyprus. The script keeps a list of these overrides.
3. Simplify until the file is ≤ 600 KB, while keeping islands. Small polygons are never dropped.
4. Quantize to TopoJSON, which makes shared borders exact.

The generated file is committed, so a normal `npm run build` doesn't need mapshaper.

### Data validation (unit test)

- Exactly 197 guessable countries, each with geometry, a continent, a subregion and an anchor.
- No two countries share a normalized name or alias, and no territory name collides with a country name.
- The continent counts are snapshotted, so a change to them fails loudly.

## Name matching (`src/match/`)

All matching code is pure functions, tested exhaustively.

### Normalization: `normalize(s)`

1. NFKD, then strip combining marks (`Côte d'Ivoire` → `cote d'ivoire`).
2. Lowercase. `&` becomes ` and `.
3. Replace punctuation (`. , ' ’ - ( )`) with a space, and collapse whitespace.
4. Drop a leading `the `.
5. Canonicalize `st` and `saint` to `saint`.
6. Trim.

`"St. Kitts & Nevis"`, `"saint kitts and nevis"` and `"Saint-Kitts and Nevis"` all normalize to the same string.

### Index

The index is a `Map<normalizedName, countryId>` built from the name and aliases of every country, plus a parallel map for territory notes.

**Aliases include at least:**
- USA / US / United States of America / America
- UK / Britain / Great Britain / United Kingdom
- Czechia / Czech Republic
- Myanmar / Burma
- Eswatini / Swaziland
- Timor-Leste / East Timor
- Netherlands / Holland
- Vatican / Holy See
- North Macedonia / Macedonia
- Cabo Verde / Cape Verde
- Ivory Coast / Côte d'Ivoire
- Congo: "DRC", "DR Congo", "Democratic Republic of the Congo" and "Congo-Kinshasa" all map to COD. "Republic of the Congo", "Congo-Brazzaville" and "Congo" map to COG.
- Micronesia / Federated States of Micronesia
- South Korea / Korea, Republic of
- North Korea / DPRK
- UAE
- CAR / Central African Republic
- Bosnia / Bosnia and Herzegovina
- Palestine / State of Palestine
- Taiwan / Republic of China
- Vietnam / Viet Nam
- Laos / Lao PDR
- Brunei / Brunei Darussalam
- Russia / Russian Federation
- Syria
- Iran
- Türkiye / Turkey
- São Tomé / Sao Tome and Principe

### Matching a typed guess: `matchTyped(input, state) → MatchResult`

```ts
type MatchResult =
  | { kind: 'accept'; id: string }
  | { kind: 'hold'; id: string }          // exact match, but also a prefix of another unfound name
  | { kind: 'already'; id: string }
  | { kind: 'outOfScope'; id: string }    // a real country outside the selected regions
  | { kind: 'territory'; note: string }
  | { kind: 'none' };
```

1. **Exact match** (the normalized input is in the index):
   - Already found → `already`.
   - Not in the selected regions → `outOfScope`.
   - It's a strict prefix of another *unfound, in-scope* name → `hold`. The UI accepts after 600 ms of no typing, or immediately on Enter.
   - Otherwise → `accept`. The UI clears the input.
2. **Fuzzy match, only on Enter** (`matchSubmitted`). If there's no exact match:
   - The threshold is Damerau-Levenshtein ≤ 1 for names of 5–9 characters, ≤ 2 for 10 or more, and exact-only for names under 5.
   - Accept only if exactly one name in the **whole index, all countries and territories,** is within the threshold. This rule alone blocks Iran/Iraq, Austria/Australia, Slovenia/Slovakia, Niger/Nigeria, Mali/Malawi, Gambia/Zambia and the Guinea variants, because each has a neighbor within range.
   - On accept, the full name briefly shows in the toast so the player sees what was accepted.
3. Otherwise → `none`. The input shakes gently and keeps its text.

**Identify mode** uses the same normalization but compares only against the target's names, with the same fuzzy rules. A correct guess is accepted as you type. A wrong one is checked on Enter: it shakes, counts as a miss attempt, and the input clears.

### Required test cases (non-exhaustive)

- Every name and alias matches its own country.
- Accent, case and punctuation variants match.
- `niger` → hold while Nigeria is unfound, accept once Nigeria is found. `dominica`, `guinea` and `congo` behave the same way.
- `iran` never matches Iraq. `austria` never matches Australia.
- `brazl` + Enter → Brazil. `brazl` without Enter → none.
- `greenland` → territory note.
- In a Europe-only game, `france` → accept and `japan` → outOfScope.

## Game engine (`src/game/`)

The engine is a pure reducer, `reduce(state, action) → state`, with no DOM. The timer uses an injected clock, so tests are deterministic.

### Config

```ts
interface GameConfig {
  mode: 'type' | 'locate' | 'identify';
  scope: { continents: Continent[]; subregions: string[] };  // union; empty both = world
  timeLimitSec: number | null;   // null = stopwatch; otherwise 300 | 600 | 900 | 1200 | 1800
}
```

### State

```ts
interface GameState {
  config: GameConfig;
  pool: string[];                 // in-scope country IDs; order is shuffled for locate/identify
  found: Set<string>;
  missed: Set<string>;            // locate/identify: skipped or out of tries; type: filled at end
  hintsUsed: number;
  activeHint: { id: string; level: 1 | 2 } | null;
  target: string | null;          // locate/identify: current country
  triesLeft: number;              // locate: 3 per target
  phase: 'setup' | 'playing' | 'paused' | 'review';
  startedAt: number; elapsedMs: number; pausedAt: number | null;
  endReason: 'complete' | 'timeout' | 'gaveUp' | null;
  lastFound: string | null;       // drives the "just found" glow
}
```

### Actions

`start`, `guessTyped`, `guessSubmitted`, `clickCountry`, `skip`, `hint`, `pause`, `resume`, `tick`, `giveUp`, `playAgain`, `toSetup`.

### Rules by mode

- **Type**
  - Accepting a guess adds it to `found`.
  - When `found` equals the pool, the game ends with `complete`.
  - On timeout or give-up, every unfound country goes into `missed`.
- **Locate**
  - Clicking the target adds it to `found` and moves to the next target.
  - Clicking any other in-scope country costs a try and flashes that country with its name.
  - At 0 tries, the target is revealed, added to `missed`, and play advances.
  - `skip` reveals the target, adds it to `missed`, and advances.
- **Identify**
  - A correct name adds the target to `found` and advances.
  - A wrong submission shakes the input and counts the attempt.
  - `skip` reveals the target, adds it to `missed`, and advances.
- **Locate/Identify end:** the game ends when the pool is exhausted, the timer runs out, or the player gives up. Unvisited targets count as missed.

### Hints

The `?` key or the Hint button gives a hint, and each one increments `hintsUsed`.

- **Type, level 1:** pick a random unfound country. Its outline pulses and the toast shows "Starts with B".
- **Type, level 2:** a second hint on the same country zooms the map to that country.
- **Identify:** the first letter of the target, then its length ("B _ _ _ _ _").
- **Locate:** the subregion name, then a pulse over that general area.

### Timer

- The stopwatch counts up when `timeLimitSec` is null. Otherwise a countdown is shown, and the game ends at 0 with `timeout`.
- Under 60 seconds left, the clock turns accent-colored. Under 10 seconds it pulses, or not if the player has reduced motion turned on.
- While paused, the clock stops and the map is hidden behind a blurred "Paused" overlay.
- Switching browser tabs auto-pauses only in stopwatch mode. Countdown keeps running, like Sporcle, so tabbing out to look things up doesn't help.

### Score

The score is `found.size / pool.length`. The result records the score, the elapsed time and the hints used.

## Best times (`src/store/bests.ts`)

- **Key:** `mapped:best:v1:<mode>:<sorted scope ids>:<limit|none>`.
- **Value:** `{ found, total, ms, hints, at }`.
- **Better means:** a higher `found`, then a lower `ms`, then fewer `hints`.
- **Where it's shown:** on the setup card for the current config, and as a "New best" badge on the review screen.
- Every read and write is wrapped in try/catch. If storage is unavailable, the game still works, just without bests.

The light/dark theme choice is stored under `mapped:theme`.

## UI

### Visual language

The tokens come from Solitaire's "studio" theme.

**Dark (default):**

| Token | Value |
| --- | --- |
| bg | `#13110f` with a warm radial glow |
| ink | `#f0ebe3` |
| mute | `#a39d93` |
| accent | `#f2c14e` |
| unfound land | `#3a332c` |
| found land | `#8a6f3e` |
| just found | `#f2c14e` with a glow |
| missed | `#d9654f` |
| out-of-scope land | `#1d1a17` |
| ocean | `#13110f` |

The guiding idea: countries still to find are the lighter tone, found ones recede, and only the newest find glows.

**Light ("paper atlas"):**

| Token | Value |
| --- | --- |
| page | `#f6f3ec` to `#ebe6dc` |
| ocean | `#dfe6e6` |
| unfound land | `#f7f4ee` with `#b9b1a3` borders |
| found land | `#2f3a33` |
| just found and accent | `#7a5a00` |
| missed | `#b5432f` |

**Shared:**
- Chrome is glass: a translucent gradient, a 1px hairline, a blur behind it, and 12–14px radii.
- Type is Geist for UI and Geist Mono (tabular numbers) for the clock and counts.
- The default easing is `cubic-bezier(0.32, 0.72, 0, 1)`.

The approved mockups are in `.superpowers/brainstorm/*/content/` (`play-layout.html` option A, `map-palette.html` option B/D, `setup-review.html` options A and R).

### Screens

One persistent full-bleed map sits under every screen. Only the overlays change.

**1. Setup (floating card over the live map).** The card sits right-of-center and contains:
- The headline "How well do you know the map?"
- **Region chips** with counts: World, Africa, Asia, Europe, N. America, S. America, Oceania. World is exclusive with the continents. A "Subregions ▾" disclosure expands sub-chips for each continent.
- **Mode cards:** Type, Locate, Identify, each with a one-line description.
- **Time limit:** a segmented control with None, 5, 10, 15, 20 and 30 minutes.
- **A summary line**, for example "98 countries · Best 91/98 · 11:04 · 2 hints".
- **A Start button** (Enter).

Behind the card, the map previews the selection live: selected regions are highlighted and fitted into the free space to the left, and everything else dims. The top-left wordmark and top-right theme toggle stay visible.

**2. Play (full-bleed map, floating chrome).**
- **Top glass bar:** the wordmark, a scope and mode pill, a centered `found / total` counter, the clock, and Hint (?), Pause (Esc) and Give up buttons.
- **Bottom-center:**
  - Type: the input. A toast shows above it.
  - Identify: the input, with the target outlined on the map.
  - Locate: a "Find **X**" pill with try dots and a Skip button.
- **Bottom-left:** a "By region" progress card, which collapses to a pill. In a single-region game it shows subregions instead.
- **Bottom-right:** zoom in, zoom out, and fit-to-scope buttons.

**3. Review (after complete, timeout or give-up).** Same map, now showing found (bronze) and missed (coral).
- **Top bar:** score, time, hints used, a "New best" badge when earned, Change setup, and Play again (Enter).
- **Right panel:** "Missed · N", grouped by region. Hovering a name lights up the country; hovering a missed country shows a tooltip with its name and region. Clicking a name zooms to that country.
- In locate and identify modes, the list also shows attempted-but-wrong items.

### The map (`src/map/`)

- **Projection:** Equal Earth. For each scope, `fitExtent` to the in-scope features, inset by the chrome's safe area.
  - The safe area is the top bar on every screen, plus the setup card's width on the setup screen and the review panel's width on the review screen.
  - For an Oceania scope the projection rotates to center around 160°E, so it doesn't split across the antimeridian.
- **Rendering:** one `<path>` per feature. Classes for state (`unfound`, `found`, `just`, `missed`, `off`, `hint`, `target`) drive all styling through CSS custom properties. Paths are memoized, and only class changes re-render.
- **Zoom and pan:** d3-zoom with scale between 1× and 40×, panning limited to the scope's bounds, plus a double-click to zoom. Scope changes and zoom-to-country animate over 500 ms. When the player has reduced motion turned on, they jump.
- **Tiny countries:** `<circle>` markers that stay the same size on screen at any zoom (6px visible radius, 14px invisible hit area). Markers fade out once the real shape is larger than about 12px on screen.
- **Hit testing:** pointer events on the paths and markers. Out-of-scope paths have `pointer-events: none`.
- **Not color alone:** missed countries also get a diagonal hatch pattern, and found countries get a subtle inner stroke.

### Keyboard

| Key | Action |
| --- | --- |
| Typing (type/identify) | Goes to the input automatically; no need to focus it first |
| Enter | Submit with typo tolerance / Start / Play again |
| Esc | Pause / resume |
| ? | Hint. Not H: typing goes straight to the input, so H would collide with Haiti, Honduras and Hungary, and Cmd+H hides the window on macOS |
| S | Skip (locate) |
| + / − / 0 | Zoom in / out / fit |

### Mobile (works, not primary)

- At widths under 768px, the top bar shrinks to the score, the clock and a menu button. The menu holds region progress, Hint, Pause and Give up.
- The input or prompt sticks to the top of the on-screen keyboard (using the `visualViewport` API). The map fills what's left.
- Pinch to zoom.
- Locate mode on touch: tapping a tiny country, or one whose shape is under 24px on screen, first zooms to it and asks for a confirming tap.
- The setup card becomes a bottom sheet, and the review panel becomes a bottom sheet you can swipe up.

### Accessibility

- Real `<input>` and `<button>` elements with visible focus outlines.
- An `aria-live="polite"` region announces "Brazil, found. 87 of 197."
- The clock isn't announced every second; there's a live announcement at 60 and 10 seconds left.
- Animations respect `prefers-reduced-motion`.
- Text contrast meets WCAG AA in both themes.

## Project layout

```
src/
  data/       countries.ts, territories.ts, regions.ts, world.topo.json (generated)
  match/      normalize.ts, index.ts, distance.ts, match.ts
  game/       types.ts, reducer.ts, timer.ts, hints.ts, scope.ts
  store/      bests.ts, theme.ts
  map/        WorldMap.tsx, useZoom.ts, projection.ts, TinyMarkers.tsx
  ui/         SetupCard.tsx, TopBar.tsx, GuessInput.tsx, LocatePrompt.tsx,
              RegionProgress.tsx, Toast.tsx, ReviewPanel.tsx, PauseOverlay.tsx,
              ZoomControls.tsx, useKeyboard.ts, announce.ts
  styles/     tokens.css (both themes), global.css, chrome.css, map.css
  App.tsx, main.tsx
scripts/      build-geo.ts
tests/        unit (vitest) — match/, game/, data/, store/
e2e/          playwright — one game per mode, setup → play → review, mobile smoke
public/       _headers, favicon/og image
wrangler.jsonc, vercel.json
```

## Testing

- **Matcher:** a table-driven suite covering every name and alias, all confusable pairs, hold/accept transitions, fuzzy matching on Enter only, and territories.
- **Reducer:**
  - Every mode's rules and end conditions.
  - Timeout and pause with a fake clock.
  - Hint escalation.
  - Scope union (continents plus subregions).
- **Data:** the validation rules listed above.
- **Bests:** ordering rules, and graceful behavior when storage throws.
- **End-to-end:**
  - Type mode: type every South America country, then reach the review screen with 12/12.
  - Locate mode: click the targets, then use a wrong click and a skip.
  - Identify mode: answer and skip.
  - Choose a subregion.
  - Toggle the theme.
  - At 375px wide: complete a short game.
- **Budget check:** CI fails if `dist/` is over 1.5 MB uncompressed or any single file is over 1 MB.

## Risks and open items

- **Natural Earth disputed borders:** Kashmir, Western Sahara, Crimea and others. Use Natural Earth's default "de facto" view and accept it; the territories list covers the guessable side.
- **Geometry size vs. tiny-island fidelity:** if the 600 KB budget forces visible loss, split the data into a 110m world file plus 50m detail loaded when you zoom past 4×. That is still static, and still free-plan safe.
- **The prefix-hold delay (600 ms)** needs tuning in playtesting.
