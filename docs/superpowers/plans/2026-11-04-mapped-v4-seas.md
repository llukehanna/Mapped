# Mapped v4: Seas & Oceans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth topic, Seas: 55 oceans and seas played in Type, Locate and Identify on a map where the water is the board, with 3 new leaderboards.

**Architecture:** A build script turns Natural Earth's marine polygons into `src/data/seas.topo.json` (answers, hatched non-game water, Antarctica) and `seas-meta.json` (anchors, coasts). The game engine already works on string ids; sea ids (lowercase, ≤ 8 chars) flow through the same reducer, replay and boards, with topic-aware helpers where code assumed a country (`poolOf`, `nameOf`, progress rows, hints, name index). `WorldMap` gains an underlay (hatched water), an overlay (quiet land that swallows clicks) and a configurable world band, used only in Seas games.

**Tech Stack:** Vite, React 19, TypeScript, d3-geo, topojson, Cloudflare Worker + D1, Vitest, Playwright. New devDependency: `polygon-clipping` (build script only).

**Spec:** `docs/superpowers/specs/2026-11-04-mapped-v4-seas-design.md`

## Global Constraints

- Node 24+; scripts run as `node scripts/<name>.ts` (type stripping), like `build-geo.ts`.
- Sea ids match `/^[a-z]{2,8}$/` (replay's `isId` limit is 8; lowercase never collides with ISO-3). Non-game water ids are `w-<slug>` and never appear in game logs.
- 55 answers exactly; basins and ids as in Task 1's table.
- `seas.topo.json` is fetched only when the Seas topic is shown; budgeted separately in `check-size.ts` at **600 KB**. Nothing new ships to the browser except that file and app code.
- Topology quantization `1e5` (same as `world.topo.json`).
- Seas world view frames **80°S to 84°N**; Countries keeps 56°S–83°N. Rotation stays `-10` for Seas.
- Copy: topic tab **Seas**; blurbs Type "Name them all, any order", Locate "Click the named sea", Identify "Name the lit-up sea"; review heading "Missed seas".
- Light and dark themes both: seas use `--land`, land uses `--off`/`--border-off`, non-game water uses `#territory-hatch`.
- Countries, Flags and Capitals behave exactly as before (existing tests stay green, no changes to `world.topo.json`).

## Review Focus

1. **Clicking land in Seas · Locate** (sea polygons run under coasts and Antarctica): must do nothing, never cost a try. → Task 6 e2e `seas locate: clicking land costs nothing`.
2. **Typing a country or a gulf in Seas · Type**: a country gives nothing (no crash, no "isn't in this quiz"); a gulf gives its note. → Task 3 tests + Task 6 e2e.
3. **Switching topic in setup with a region picked** (Europe selected → Seas): scope resets to World and the board line reads "World · Seas · Type"; back to Countries keeps World. → Task 6 e2e `seas setup`.
4. **Hand-made URLs and API calls**: `/leaderboards/seas/type/europe` goes home; `POST /api/games` with a Seas config and a continent is refused (400). → Task 4 tests.
5. **Review of a Seas game** (every place that did `COUNTRY.get(id)!`): giving up shows "Missed seas" grouped by basin, the hover tip names the sea and basin, no console errors. → Task 6 e2e `seas review`.

---

### Task 1: Sea list and generated sea data

**Files:**
- Create: `src/data/seas.ts`, `src/data/seaMeta.ts`, `scripts/build-seas.ts`, `scripts/data/ne_50m_geography_marine_polys.geojson`, generated `src/data/seas.topo.json`, `src/data/seas-meta.json`
- Modify: `package.json` (devDependency `polygon-clipping`, script `"seas": "node scripts/build-seas.ts"`)
- Test: `tests/data/seas.test.ts`

**Interfaces:**
- Produces (`src/data/seas.ts`):
  - `type Basin = 'atlantic' | 'mediterranean' | 'pacific' | 'indian' | 'arctic' | 'southern' | 'inland'`
  - `const BASINS: { id: Basin; label: string; place: string }[]` in table order; labels `Atlantic, Mediterranean, Pacific, Indian, Arctic, Southern, Inland`; places `the Atlantic, the Mediterranean, the Pacific, the Indian Ocean, the Arctic, the Southern Ocean, —`
  - `interface SeaDef { id: string; name: string; basin: Basin; aliases: string[]; ne: string[] }`, `const SEAS: SeaDef[]` (55), `const OCEANS: ReadonlySet<string>` = `atl, pac, ind, arc, sou`
  - `type WaterKind = 'gulf' | 'bay' | 'strait' | 'channel' | 'sound' | 'river' | 'sea'`, `interface WaterDef { id: string; name: string; kind: WaterKind; ne: string }`, `const WATERS: WaterDef[]`
  - `const SEA: ReadonlyMap<string, SeaDef>`, `const WATER: ReadonlyMap<string, WaterDef>`
  - `function shortName(name: string): string` — drops a leading "Sea of " or a trailing " Sea"/" Ocean" ("Sea of Japan" → "Japan", "Bo Hai" → "Bo Hai")
  - `const SKIP_NE = ['Great Barrier Reef']`
- Produces (`src/data/seaMeta.ts`): `interface SeaMeta { anchor: [number, number]; coast: string[] }`, `const SEA_META: Readonly<Record<string, SeaMeta>>` (coast = country/territory ids, sorted)
- Produces (`seas.topo.json`): objects `seas` (feature id = sea id), `waters` (id = water id), `antarctica` (one feature, id `antarctica`), coordinates wound for d3 (every polygon's `geoArea` < 2π).

Ids, names and `ne` (Natural Earth names; the Atlantic and Pacific merge North + South, Southern is rebuilt, see Step 3):

| Basin | id: name |
|---|---|
| atlantic | `atl` Atlantic Ocean, `carib` Caribbean Sea, `sargasso` Sargasso Sea, `north` North Sea, `baltic` Baltic Sea, `irish` Irish Sea, `labrador` Labrador Sea |
| mediterranean | `med` Mediterranean Sea, `adriatic`, `aegean`, `ionian`, `tyrrhen` Tyrrhenian Sea, `balearic`, `black` Black Sea |
| pacific | `pac` Pacific Ocean, `bering`, `okhotsk` Sea of Okhotsk, `japan` Sea of Japan, `yellow`, `bohai` Bo Hai, `ecs` East China Sea, `scs` South China Sea, `philip` Philippine Sea, `sulu`, `celebes`, `molucca`, `ceram`, `banda`, `java`, `bismarck`, `solomon`, `coral`, `tasman`, `arafura` |
| indian | `ind` Indian Ocean, `arabian`, `red` Red Sea, `andaman`, `laccad` Laccadive Sea, `timor` |
| arctic | `arc` Arctic Ocean, `barents`, `kara`, `laptev`, `chukchi`, `beaufort`, `greenl` Greenland Sea, `norweg` Norwegian Sea, `white` White Sea |
| southern | `sou` Southern Ocean, `weddell`, `ross`, `amundsen`, `belling` Bellingshausen Sea |
| inland | `caspian` Caspian Sea |

Explicit aliases (beyond `shortName`, which Task 3 adds automatically): japan ← East Sea, Japan Sea; bohai ← Bohai Sea, Bohai; celebes ← Sulawesi Sea; ceram ← Seram Sea; molucca ← Maluku Sea; laccad ← Lakshadweep Sea; sou ← Antarctic Ocean; med ← Med; okhotsk ← Okhotsk Sea.

`WATERS`: every other Natural Earth feature except `SKIP_NE`, `kind` from `featurecla` (the dropped seas Scotia Sea, Inner Sea, Inner Seas get kind `sea`). Clean display names: "Golfo de California" → "Gulf of California", "Bahía de Campeche" → "Bay of Campeche", "Golfe du Lion" → "Gulf of Lion", "Golfo de Panamá" → "Gulf of Panama", "Golfo San Jorge" → "San Jorge Gulf", "Río de la Plata" → "Río de la Plata", "The North Western Passages" → "Northwest Passages". Ids `w-` + slug of the display name.

- [ ] **Step 1: Add the source file and dependency**

Copy the downloaded file (`/private/tmp/claude-501/-Users-luke-Claude-Projects-Mapped/2d57b41e-494f-47df-b21a-9407a08153a8/scratchpad/ne/marine50.geojson`, or download `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_geography_marine_polys.geojson`, 1,163,418 bytes) to `scripts/data/ne_50m_geography_marine_polys.geojson`. `npm install -D polygon-clipping@0.15.7`.

- [ ] **Step 2: Write `src/data/seas.ts`** with the table above, then the failing data tests in `tests/data/seas.test.ts`:

```ts
it('has 55 answers with short lowercase ids', () => {
  expect(SEAS).toHaveLength(55);
  expect(new Set(SEAS.map((s) => s.id)).size).toBe(55);
  for (const s of SEAS) expect(s.id).toMatch(/^[a-z]{2,8}$/);
});
it('groups them by basin as the spec does', () => {
  const count = (b: Basin) => SEAS.filter((s) => s.basin === b).length;
  expect(BASINS.map((b) => count(b.id))).toEqual([7, 7, 20, 6, 9, 5, 1]);
});
it('claims every Natural Earth feature exactly once', () => { /* every NE name is in exactly one of SEAS[].ne, WATERS[].ne, SKIP_NE */ });
it('shortName', () => {
  expect(shortName('Sea of Japan')).toBe('Japan');
  expect(shortName('Pacific Ocean')).toBe('Pacific');
  expect(shortName('Bo Hai')).toBe('Bo Hai');
});
```

Generated-file tests (fail until Step 4 runs):

```ts
const SAMPLES: [string, [number, number], string][] = [
  ['east of Gibraltar', [-4.0, 36.1], 'med'], ['Ligurian', [8.5, 43.7], 'med'], ['Sea of Azov', [36.5, 46.0], 'black'],
  ['East Siberian', [160, 73], 'arc'], ['62°S 20°E', [20, -62], 'sou'], ['50°S 20°E', [20, -50], 'ind'],
  ['65°S 120°W', [-120, -65], 'sou'], ['Aegean', [25, 38.5], 'aegean'], ['Tasman', [160, -38], 'tasman'],
];
it.each(SAMPLES)('%s is in the right answer', (_, point, id) => expect(answerAt(point)).toBe(id));
it('every anchor lies inside its own sea', ...);              // geoContains(shape, SEA_META[id].anchor)
it('coasts are known except open water and Antarctica', ...); // empty only for sargasso, sou, weddell, ross, amundsen, belling
it('the Greenland Sea coast includes Greenland', () => expect(SEA_META.greenl.coast).toContain('t-greenland'));
it('every polygon is wound for d3', ...);                     // geoArea(polygon) < 2π for seas, waters, antarctica
it('open water is in exactly one shape', ...);                // grid lon -179..179 step 3, lat -79..83 step 3; skip points inside land (world.topo countries or antarctica); ≤ 1% of the rest are in 0 or 2+ of seas ∪ waters
```

Run: `npx vitest run tests/data/seas.test.ts` — Expected: data tests PASS once `seas.ts` exists, generated-file tests FAIL (no file).

- [ ] **Step 3: Write `scripts/build-seas.ts`** (header comment in the style of `build-geo.ts`). It fails on any unclaimed or doubly claimed NE name. Work in planar lon/lat with `polygon-clipping`; densify every long straight edge you introduce (the 60°S line, the world box) to 1° steps so d3's great-circle edges follow it. Algorithm:

1. `land` = union of every world-atlas `countries-50m` geometry (Antarctica included).
2. Each answer = union of its `ne` features. `atl`, `pac`, `ind` are intersected with the box north of 60°S. `sou` = (NE "SOUTHERN OCEAN" ∪ NE Atlantic/Pacific/Indian parts) ∩ box south of 60°S. Then remove overlaps: every non-ocean answer keeps its shape; each ocean = ocean − union(non-ocean answers); `sou` also − weddell/ross/amundsen/belling.
3. `gaps` = world box − land − union(all NE features). Split into polygons. Drop polygons under 1,000 km² (spherical `geoArea` × 6371²).
4. Assign each gap: walk its boundary edges; probe the midpoint offset 0.01° to the side outside the gap; add the edge length to whichever answer contains the probe. If no probe hit any NE feature at all (answer or water), it's an inland lake: drop it. If no answer scored, use the answer with the nearest boundary vertex to the gap's centroid. A `FOLD_OVERRIDES: { at: [number, number]; to: string }[]` table (empty to start) reassigns the gap containing `at`.
5. Print every gap over 5,000 km²: area, centroid, chosen answer. Merge gaps into their answers.
6. `waters` = each water feature − union(answers). Antarctica = its world-atlas geometry.
7. Rewind for d3 (reverse every ring of `polygon-clipping` output) and assert `geoArea < 2π` per polygon.
8. `topology({ seas, waters, antarctica }, 1e5)` → `src/data/seas.topo.json`; oceans first in `seas`.
9. Meta: anchor = `geoCentroid` of the largest polygon, unless it isn't inside the shape; then the inside point of a 0.5° grid over that polygon farthest from its boundary (`ANCHOR_OVERRIDES` table for hand fixes). Coast = country and territory shapes from `world.topo.json` with any vertex within 0.2° of the sea's boundary vertices (hash vertices into 0.5° cells), none for `sou` and the four Antarctic seas. Write `src/data/seas-meta.json`. Log the file size.

- [ ] **Step 4: Run it**

Run: `npm run seas` — Expected: a gap list where Alboran/Ligurian → Mediterranean Sea, Azov → Black Sea, East Siberian/Lincoln → Arctic Ocean (add `FOLD_OVERRIDES` if not), and `seas.topo.json` ≤ 600 KB. If the file is larger, lower quantization to `3e4` before anything else and record it in the spec's Revisions.

- [ ] **Step 5: Write `src/data/seaMeta.ts`** (like `geoMeta.ts`). Run `npx vitest run tests/data` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json scripts/build-seas.ts scripts/data src/data/seas.ts src/data/seaMeta.ts src/data/seas.topo.json src/data/seas-meta.json tests/data/seas.test.ts
git commit -m "Data for seas: 55 oceans and seas from Natural Earth, gaps folded in, a full Southern Ocean"
```

---

### Task 2: Seas in the engine — topic, pool, names, hints, progress

**Files:**
- Modify: `src/game/topics.ts`, `src/game/scope.ts`, `src/data/lookup.ts`, `src/game/hints.ts`, `src/game/progress.ts`
- Test: `tests/game/topics.test.ts`, `tests/game/scope.test.ts`, `tests/game/hints.test.ts`, `tests/game/progress.test.ts`

**Interfaces:**
- Consumes: `SEAS`, `SEA`, `WATER`, `BASINS`, `OCEANS` (Task 1), `SEA_META`.
- Produces:
  - `Topic` gains `'seas'`; `TOPICS = ['countries', 'flags', 'capitals', 'seas']`; `TOPIC_LABEL.seas = 'Seas'`; `RULES.seas` = same three rows as countries; `MODE_BLURB.seas` per Global Constraints.
  - `poolOf(config: Pick<GameConfig, 'topic' | 'scope'>): string[]` in `scope.ts`: every sea id for Seas (code-unit sort, like `poolFor`), else `poolFor(config.scope, COUNTRIES)`.
  - `nameOf(id)` also resolves sea and water ids; `noteOf(id: string): string | null` in `lookup.ts`: a territory's note, or for water `a gulf, not on the list` (kind word; kind `sea` → `not on the list`).
  - `seaClue(mode: Mode, level: number, id: string): string` in `hints.ts`.
  - `progressRowsFor(topic: Topic, pool, found): ProgressRow[]` and `groupFor(topic: Topic, id: string, pool): string` in `progress.ts` (Seas: one row per basin present, in `BASINS` order, labelled by basin label; other topics: today's `progressRows`/`groupOf`).

- [ ] **Step 1: Write the failing tests**

```ts
// topics.test.ts
it('seas', () => {
  expect(rulesFor({ mode: 'type', topic: 'seas' })).toEqual({ ordered: false, prompt: null, answer: 'country' });
  expect(rulesFor({ mode: 'locate', topic: 'seas' })).toEqual({ ordered: true, prompt: 'name', answer: 'click' });
  expect(rulesFor({ mode: 'identify', topic: 'seas' })).toEqual({ ordered: true, prompt: 'map', answer: 'country' });
  expect(['type', 'locate', 'identify'].map((mode) => hintLevels({ mode, topic: 'seas' } as never))).toEqual([4, 3, 4]);
  expect(MODE_BLURB.seas.locate).toBe('Click the named sea');
});
// scope.test.ts
it('a seas pool is every sea, sorted, whatever the scope', () => {
  const pool = poolOf({ topic: 'seas', scope: WORLD });
  expect(pool).toHaveLength(55);
  expect(pool).toEqual([...pool].sort((a, b) => (a < b ? -1 : 1)));
  expect(poolOf({ scope: { continents: ['europe'], subregions: [] } })).toEqual(poolFor({ continents: ['europe'], subregions: [] }, COUNTRIES));
});
// hints.test.ts
it('seas · locate rungs', () => {
  expect(seaClue('locate', 1, 'aegean')).toBe('In the Mediterranean');
  expect(seaClue('locate', 1, 'pac')).toBe('One of the five oceans');
  expect(seaClue('locate', 1, 'caspian')).toBe('Inland, between Europe and Asia');
  expect(seaClue('locate', 2, 'tasman')).toBe('Off Australia and New Zealand');
  expect(seaClue('locate', 2, 'sargasso')).toBe('No coastline; in the North Atlantic');
  expect(seaClue('locate', 2, 'ross')).toBe('Off Antarctica');
  expect(seaClue('locate', 2, 'med')).toMatch(/^Off \w.*, .* and \d+ others$/);
  expect(seaClue('locate', 3, 'tasman')).toBe('Look inside the circle');
});
it('seas · letter rungs spell the full name', () => {
  expect(seaClue('identify', 1, 'tasman')).toBe('Starts with T');
  expect(seaClue('type', 2, 'tasman')).toBe('T _ _ _ _ _   _ _ _ · 6 + 3 letters');
});
// progress.test.ts
it('seas rows are basins', () => {
  const rows = progressRowsFor('seas', poolOf({ topic: 'seas', scope: WORLD }), ['med', 'aegean']);
  expect(rows.map((r) => r.label)).toEqual(['Atlantic', 'Mediterranean', 'Pacific', 'Indian', 'Arctic', 'Southern', 'Inland']);
  expect(rows[1]).toEqual({ label: 'Mediterranean', found: 2, total: 7 });
  expect(groupFor('seas', 'tasman', [])).toBe('Pacific');
});
// a lookup test (new file tests/data/lookup.test.ts)
it('names and notes for seas and water', () => {
  expect(nameOf('japan')).toBe('Sea of Japan');
  expect(noteOf('w-gulf-of-mexico')).toBe('a gulf, not on the list');
  expect(noteOf('w-scotia-sea')).toBe('not on the list');
});
```

(Adjust the letter-pattern expectation to whatever `letterPattern`/`letterCount` produce for "Tasman Sea"; the point is that they spell the whole name.)

- [ ] **Step 2: Run** `npx vitest run tests/game tests/data/lookup.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** the Produces list. `seaClue` reuses `clueText('identify', …)` for letter rungs, and `list()` plus the "3 and N others" rule from `nearby()` (coast names sorted with `localeCompare`, territory names via `nameOf`).

- [ ] **Step 4: Run** `npx vitest run` — Expected: all PASS (existing tests unchanged).

- [ ] **Step 5: Commit** — `git commit -m "Seas topic in the engine: rules, pool, names, hints and basins"`

---

### Task 3: Matching sea names

**Files:**
- Modify: `src/match/nameIndex.ts` (widen `territories` to `readonly Named[]`), `src/ui/useGuess.ts` (use `noteOf`)
- Create: `src/match/seaIndex.ts`
- Test: `tests/match/seaIndex.test.ts`

**Interfaces:**
- Consumes: `SEAS`, `WATERS`, `shortName`, `noteOf`.
- Produces: `SEA_INDEX: NameIndex` = `buildIndex(SEAS + shortName aliases, WATERS)`; a short name is added only when it differs from the name and isn't already another entry's key. `useGuess`'s `territory` case says `` `${nameOf(r.id)}: ${noteOf(r.id)}` ``.

- [ ] **Step 1: Failing tests**

```ts
const ctx = (found: string[] = []) => ({ index: SEA_INDEX, inScope: new Set(poolOf({ topic: 'seas', scope: WORLD })), found: new Set(found) });
it('accepts names, short names and alternates', () => {
  for (const [typed, id] of [['Pacific Ocean', 'pac'], ['pacific', 'pac'], ['east sea', 'japan'], ['Sulawesi Sea', 'celebes'], ['med', 'med']])
    expect(matchSubmitted(typed, ctx())).toMatchObject({ kind: 'accept', id });
});
it('forgives a typo on Enter', () => expect(matchSubmitted('Medditeranean Sea', ctx())).toMatchObject({ kind: 'accept', id: 'med', corrected: true }));
it('a gulf is a note, a country is nothing', () => {
  expect(matchSubmitted('Gulf of Mexico', ctx())).toEqual({ kind: 'territory', id: 'w-gulf-of-mexico' });
  expect(matchSubmitted('France', ctx())).toEqual({ kind: 'none' });
});
it('waits while a longer name could follow', () => expect(matchTyped('north', ctx())).toEqual({ kind: 'hold', id: 'north' }));
```

- [ ] **Step 2: Run** `npx vitest run tests/match` — Expected: FAIL.
- [ ] **Step 3: Implement**; `buildIndex` throws on key collisions, so the index building at import time is itself the collision check.
- [ ] **Step 4: Run** `npx vitest run` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Sea names: short forms, alternates, and notes for gulfs and bays"`

---

### Task 4: Boards, routes and the server

**Files:**
- Modify: `src/game/ranking.ts`, `src/ui/router.ts`, `src/ui/Leaderboard.tsx`, `src/ui/YourGames.tsx`, `worker/replay.ts`
- Test: `tests/game/ranking.test.ts`, `tests/ui/router.test.ts`, the worker game tests under `tests/worker/`

**Interfaces:**
- Consumes: `poolOf` (Task 2).
- Produces: `boardRegions(topic: Topic): Region[]` (`['world']` for Seas, else `BOARD_REGIONS`). `parseBoard` rejects a Seas board off World; `parseConfig` rejects a Seas config with any continent or subregion; the router accepts `/leaderboards/seas/<mode>/world` only. `replay()` builds its pool with `poolOf(config)`. Leaderboard and Your games list `boardRegions(topic)` (one chip/row for Seas).

- [ ] **Step 1: Failing tests**

```ts
expect(parseBoard('seas:locate:world')).toEqual({ topic: 'seas', mode: 'locate', region: 'world' });
expect(parseBoard('seas:type:europe')).toBeNull();
expect(boardFor({ topic: 'seas', mode: 'type', scope: WORLD, timeLimitSec: null })).toBe('seas:type:world');
expect(parseConfig({ topic: 'seas', mode: 'type', scope: { continents: ['europe'], subregions: [] }, timeLimitSec: null })).toBeNull();
expect(parseRoute('/leaderboards/seas/identify/world')).toEqual({ name: 'board', topic: 'seas', mode: 'identify', region: 'world' });
expect(parseRoute('/leaderboards/seas/type/europe')).toEqual({ name: 'home' });
```

Worker test (follow the existing Flags/Capitals game test): start a Seas · Type game, finish with a log that types `med` then `pac` at human pace and gives up → ranked on `seas:type:world`, `found` 2, `total` 55. And `POST /api/games` with a Seas config scoped to Europe → 400 `bad_config`.

- [ ] **Step 2: Run** `npx vitest run tests/game/ranking.test.ts tests/ui tests/worker` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "Seas boards: World only, replayed with the sea pool"`

---

### Task 5: The sea map

**Files:**
- Create: `src/map/useSeaShapes.ts`
- Modify: `src/map/geometry.ts`, `src/map/WorldMap.tsx`, `src/styles/map.css`, `scripts/check-size.ts`
- Test: `tests/map/geometry.test.ts`

**Interfaces:**
- Consumes: `seas.topo.json` (Task 1).
- Produces:
  - `type Band = [south: number, north: number]`; `LAND_BAND: Band = [-56, 83]`, `SEA_BAND: Band = [-80, 84]`; `frameBounds(projection, shapes, ids, anchors, band = LAND_BAND)`.
  - `interface SeaMapData { seas: MapShape[]; waters: Feature<Polygon | MultiPolygon>[]; antarctica: Feature<Polygon | MultiPolygon> }`; `useSeaShapes(enabled: boolean): SeaMapData | Error | null` — fetches `seas.topo.json?url` the first time `enabled` is true, then keeps it.
  - New optional `WorldMap` props: `anchors` (default `GEO_META`; used by framing, `boundsOf`, labels, area pulse), `band` (default `LAND_BAND`), `underlay` (features drawn after the graticule, before shapes, class `water`), `overlay` (features drawn after the highlight paths, class `cover`, no `data-id`), `variant: 'land' | 'seas'` (adds class `seas` to the svg).
- Draw order in a Seas map: ocean rect → graticule → `underlay` → sea shapes → highlight paths → `overlay` (land, which therefore hides highlight fill under the coast and takes clicks that would otherwise reach a sea underneath) → markers/labels.

- [ ] **Step 1: Failing test**

```ts
it('the seas band frames down to 80°S', () => {
  const p = baseProjection(1200, 800, -10);
  const [[, landTop], [, landBottom]] = frameBounds(p, [], 'world', {});
  const [[, seaTop], [, seaBottom]] = frameBounds(p, [], 'world', {}, SEA_BAND);
  expect(seaBottom).toBeGreaterThan(landBottom);
  expect(seaBottom).toBeCloseTo(p([10, -80])![1], 0);
  expect(seaTop).toBeLessThanOrEqual(landTop);
});
```

- [ ] **Step 2: Run** `npx vitest run tests/map` — Expected: FAIL.
- [ ] **Step 3: Implement** the Produces list. CSS: `.map.seas .water { fill: url(#territory-hatch); pointer-events: none; }`, `.map.seas .cover { fill: var(--off); stroke: var(--border-off); stroke-width: 0.6; vector-effect: non-scaling-stroke; }`. Sea shapes reuse the existing `.shape` state classes (todo/found/just/missed). In `check-size.ts`, the hashed `assets/seas.topo-*.json` is excluded from the app total and checked against its own `MAX_SEAS = 600 * 1024`; print its size like the flags line.
- [ ] **Step 4: Run** `npx vitest run && npm run build` — Expected: PASS; the size check prints the seas file under 600 KB and the app total is unchanged from `main` within a few KB.
- [ ] **Step 5: Commit** — `git commit -m "Map: hatched water under, quiet land over, and a deeper south for seas"`

---

### Task 6: Seas in the app, end to end

**Files:**
- Modify: `src/App.tsx`, `src/ui/SetupCard.tsx`, `src/ui/ReviewPanel.tsx`, `e2e/helpers.ts`
- Create: `e2e/seas.spec.ts`

**Interfaces:**
- Consumes: everything above.
- What changes in `App.tsx` (each is a place that assumed a country):
  - `seasOn = topicOf(config) === 'seas'` for the shown config (draft in setup, else the game's); `useSeaShapes(seasOn)`; "Loading the map…" while it's null.
  - Pools via `poolOf` (setup preview and `start`). `rotate` is `-10` for Seas. `allIds` = sea ids; `markers` = `[]`.
  - `WorldMap` for Seas: `shapes` = sea shapes, `disputed` = `[]`, `underlay` = waters, `overlay` = the land shapes as features plus Antarctica (memoized), `anchors` = `SEA_META`, `band` = `SEA_BAND`, `variant` = `'seas'`.
  - `clue()` uses `seaClue` for Seas; the level-1 locate hint frames the target's basin (`SEAS` with the same basin); `progressRowsFor`/`groupFor` everywhere `progressRows`/`groupOf` were used; the review tip shows `nameOf(id) · groupFor(topic, id, pool)`.
  - `useGuess` gets `SEA_INDEX` in Seas games. Placeholder `Type a sea…` (Type) / `Name the highlighted sea…` (Identify); input label `Sea name`; Type's no-pick hint toast `Click a sea you haven't found`.
- `SetupCard`: the Regions block is hidden for Seas; `withTopic(config, 'seas')` sets `scope` to `WORLD`.
- `ReviewPanel`: label = `nameOf(id)` for Seas; groups via `groupFor`; `MISSED_LABEL.seas = 'Missed seas'`.
- `e2e/helpers.ts`: `chooseTopic` accepts `'Seas'`.

- [ ] **Step 1: Write `e2e/seas.spec.ts`** (each test uses `watchErrors` and ends with `expect(errors).toEqual([])`):

  - `seas setup`: no request for `seas.topo` has been made on the Countries setup (`page.on('request')`); pick Europe, choose Seas → the request happens, no Regions group, `.setup` contains `World · Seas · Type board`, Locate blurb `Click the named sea`; back to Countries → World chip pressed.
  - `seas type`: start; type `Mediterranean` → score `1 / 55`; type `pacific` → `2 / 55`; type `Gulf of Mexico` → a status containing `Gulf of Mexico: a gulf, not on the list`, score unchanged; type `France` + Enter → score unchanged.
  - `seas locate`: start Locate; read `.prompt[data-target-id]`; `clickCountry(page, target)` → score `1 / 55`.
  - `seas locate: clicking land costs nothing`: start Locate; click the screen point of Alice Springs (`[133.9, -23.7]` projected via the page; or the centre of the Australia `.cover` path's bounding box) → `aria-label="3 tries left"` still, score `0 / 55`.
  - `seas identify`: start Identify; type the lit target's name (`data-target-id` → name from a small id→name map in the test) → `1 / 55`; the hatched `path.water` elements exist and have `pointer-events: none`.
  - `seas review`: start Type, give up → review aside labelled `Missed seas` with group labels including `Mediterranean · 7`; hovering a missed sea shows a tip with its name and basin.

- [ ] **Step 2: Run** `npm run e2e -- e2e/seas.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the App, SetupCard and ReviewPanel changes.
- [ ] **Step 4: Run** `npx vitest run && npm run e2e` — Expected: everything PASS, including the existing specs.
- [ ] **Step 5: Look at it.** In the dev server, both themes: a Seas setup, a Locate game zoomed in on the Aegean and on the Kattegat (no background slivers between land and sea worth noticing), the Ross Sea on screen at world zoom. Fix what looks wrong, then rerun Step 4.
- [ ] **Step 6: Commit** — `git commit -m "Play Seas: setup, map, typing, clicking and review"`

---

### Task 7: Docs

**Files:**
- Modify: `README.md`, `docs/superpowers/specs/2026-11-04-mapped-v4-seas-design.md`, `package.json` (`version` → `4.0.0`)

- [ ] **Step 1:** README: Seas in the intro and Modes paragraph; "There are 66 boards: Countries, Flags and Capitals × 3 modes × 7 regions, plus Seas × 3 modes (World only)"; `npm run seas` in the commands table; Credits: "Seas and oceans from [Natural Earth](https://www.naturalearthdata.com/) marine areas (public domain)."
- [ ] **Step 2:** Spec: a "Revisions during implementation" section for anything that changed (quantization, fold overrides, anchor overrides).
- [ ] **Step 3:** `npm run build` — Expected: PASS.
- [ ] **Step 4: Commit** — `git commit -m "README and spec: v4 Seas"`
