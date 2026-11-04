# Mapped v4: Seas & Oceans

A fourth topic, **Seas**, next to Countries, Flags and Capitals. Same three modes, on a map where the water is the board and the land goes quiet. Luke wanted a way to learn the world's seas and oceans the way Mapped already teaches countries.

Builds on `docs/superpowers/specs/2026-10-07-mapped-v3-flags-capitals-design.md` (topics, rules table, per-topic boards).

## Decided with Luke

- **All three modes**, played like Countries:
  - **Type**: name them all, any order; exact names count as you type, typos forgiven on Enter.
  - **Locate**: a sea is named; click it. 3 tries.
  - **Identify**: a sea lights up; type its name.
- **Oceans and seas only.** No gulfs, bays, straits, channels or sounds as answers.
- **Five oceans**: Atlantic, Pacific, Indian, Arctic, Southern (Natural Earth's North/South Atlantic and North/South Pacific are merged).
- **One world game.** No region picker; the time limit (or stopwatch) stays.
- **Gulfs, bays, straits etc. are plain, unplayable water**, not merged into a neighbouring sea.
- **Look (mockup 1A + 2A):** seas take the role land has in Countries (the light "still to find" tone, gold when found, the lit target in accent); land becomes a dark, quiet, unclickable silhouette; non-game water (gulfs, bays, straits) is hatched like Western Sahara. Thin lines separate neighbouring seas.
- **Source**: Natural Earth `ne_50m_geography_marine_polys` (public domain, same family as the country shapes).

## The list: 55 answers

From the 53 Natural Earth `sea` features, dropped: **Scotia Sea** (a broken 8-point sliver at 1:50m), **Inner Sea** (Seto Inland Sea) and **Inner Seas** (west of Scotland), too obscure. Caspian Sea stays (a lake, but called a sea everywhere). Sargasso Sea stays (no coast, but famous).

Each sea has a **basin**, used for the Locate hint and the By-region panel (my call on the grouping; IHO-style, with the Mediterranean as its own group because "in the Atlantic" is no help for the Aegean):

| Basin | Answers |
|---|---|
| Atlantic (7) | Atlantic Ocean, Caribbean Sea, Sargasso Sea, North Sea, Baltic Sea, Irish Sea, Labrador Sea |
| Mediterranean (7) | Mediterranean Sea, Adriatic Sea, Aegean Sea, Ionian Sea, Tyrrhenian Sea, Balearic Sea, Black Sea |
| Pacific (20) | Pacific Ocean, Bering Sea, Sea of Okhotsk, Sea of Japan, Yellow Sea, Bo Hai, East China Sea, South China Sea, Philippine Sea, Sulu Sea, Celebes Sea, Molucca Sea, Ceram Sea, Banda Sea, Java Sea, Bismarck Sea, Solomon Sea, Coral Sea, Tasman Sea, Arafura Sea |
| Indian (6) | Indian Ocean, Arabian Sea, Red Sea, Andaman Sea, Laccadive Sea, Timor Sea |
| Arctic (9) | Arctic Ocean, Barents Sea, Kara Sea, Laptev Sea, Chukchi Sea, Beaufort Sea, Greenland Sea, Norwegian Sea, White Sea |
| Southern (5) | Southern Ocean, Weddell Sea, Ross Sea, Amundsen Sea, Bellingshausen Sea |
| Inland (1) | Caspian Sea |

Every other Natural Earth marine feature (13 bays, 5 channels, 24 gulfs, 10 straits, 1 sound, the river polygons, and the three dropped seas) is **non-game water**: drawn hatched, not clickable, not in the pool. The Great Barrier Reef polygons are not drawn at all; the Coral Sea covers that water and wins clicks there.

### Water no feature covers (decided with Luke: fold all into neighbours)

Natural Earth's marine features leave about 4.5M km² of ocean uncovered (checked: the Alboran and Ligurian ends of the Mediterranean, the Sea of Azov, the Sea of Marmara, the East Siberian Sea, the Flores/Savu/Bali area, the Kattegat/Skagerrak, Bass/Torres/Tatar Straits, the Lincoln Sea). **Every uncovered piece joins the answer it shares the longest boundary with**, so there is no hatched gap water and no bare holes. Pieces that touch no answer (only non-game water) join the nearest answer. The build computes "all water (sphere minus land, Antarctica included) minus every marine feature", splits it into connected pieces, assigns each, and merges it into that answer's shape. The build prints every assignment of a piece over 5,000 km² so it can be eyeballed; the expected famous ones are Alboran and Ligurian → Mediterranean, Azov → Black Sea, East Siberian and Lincoln → Arctic Ocean. If one lands somewhere absurd, a small override table in the build script fixes it.

### The far south (decided with Luke: 60°S band, Antarctica drawn)

- The Atlantic, Pacific and Indian Oceans stop at **60°S**. Everything south of 60°S that isn't the Weddell, Ross, Amundsen or Bellingshausen Sea (or uncovered water folded elsewhere) is the **Southern Ocean**: one full band around Antarctica. Natural Earth's own "SOUTHERN OCEAN" strip and the overlap with its Indian Ocean polygon are replaced by this.
- **Antarctica is drawn as quiet land in Seas games only** (it stays dropped from the Countries map). Its shape ships in the seas data file, not in `world.topo.json`, so Countries page loads don't change. Land draws on top, so ocean polygons that run over the ice are hidden.

### Names and aliases (my calls)

- Every answer also accepts its name without "Sea"/"Ocean" ("Pacific", "Caribbean", "Red"), unless that collides with another answer's key.
- Known alternates: Sea of Japan ← East Sea, Japan Sea; Bo Hai ← Bohai Sea, Bohai; Celebes Sea ← Sulawesi Sea; Ceram Sea ← Seram Sea; Molucca Sea ← Maluku Sea; Laccadive Sea ← Lakshadweep Sea; Southern Ocean ← Antarctic Ocean; Mediterranean Sea ← Med; Sea of Okhotsk ← Okhotsk Sea. The builder may add obvious spellings.
- Typing a non-game body of water by name in Type mode ("Gulf of Mexico", "Hudson Bay", "Persian Gulf") gets a note like territories do ("Gulf of Mexico: a gulf, not on the list") and counts as nothing. Names come from the Natural Earth features (cleaned: "Golfo de California" → "Gulf of California", "Bahía de Campeche" → "Bay of Campeche", "Golfe du Lion" → "Gulf of Lion"); notes say gulf / bay / strait / channel / sound as the feature class says.
- Seas have their own name index, separate from countries'. Typing a country name in a Seas game counts as nothing (no note).

## Rules

| Seas | ordered | prompt | answer |
|---|---|---|---|
| Type | false | null | `country`* |
| Locate | true | `name` | `click` |
| Identify | true | `map` | `country`* |

*The `answer` values mean "type the target's name" / "click the target": the engine works on ids, and sea ids flow through it the same way country ids do. The builder may rename the answer/prompt values to be topic-neutral if that reads better.

### Hints

| Mode | Rungs |
|---|---|
| Type, Identify | The 4 letter rungs Countries uses, spelling the full answer ("Tasman Sea") |
| Locate | 1: "In the Pacific" (basin; for the five oceans: "One of the five oceans"; for the Caspian: "Inland, between Europe and Asia"). 2: "Off Australia and New Zealand" (coastal countries and territories, same 3-names-and-N-others format as "Borders"; for the open-ocean Sargasso: "No coastline; in the North Atlantic"; for the Southern Ocean and the Weddell, Ross, Amundsen and Bellingshausen Seas: "Off Antarctica"). 3: the circle, as now. |

Coastal lists are computed at build time (country and territory shapes within a small distance of the sea's final, folded shape; territories included so the Greenland Sea reads "Off Greenland, Iceland and Norway"), stored in the seas meta file, and spot-checked by hand for the Mediterranean sub-seas and the oceans (where the list will be long; "3 and N others" handles it). Antarctica is not a coast entry; the Antarctic seas use the fixed phrase above.

## Ids, data and files

- **Sea ids**: lowercase codes of at most 8 characters (the replay's `isId` limit), e.g. `pac`, `atl`, `med`, `aegean`, `tasman`. Lowercase so they can never collide with ISO-3 country ids.
- `src/data/seas.ts`: `SeaDef { id, name, basin, aliases, ne: string[] }` (`ne`: Natural Earth feature names merged into it; two for the Atlantic and Pacific). Plus `WATERS`: non-game water `{ id, name, kind }` for notes and hatching.
- `scripts/build-geo.ts` (or a sibling script, builder's choice) also writes `src/data/seas.topo.json` (objects `seas` and `waters`) and `src/data/seas-meta.json` (anchor, coastal country ids). It fails if any Natural Earth marine feature is unclaimed by either list, as the country build does. The marine source file is committed under `scripts/` or fetched by the script; builder's choice, but `npm run geo` must stay reproducible. The gap-filling and 60°S clipping need polygon boolean operations, which d3 doesn't have: a build-only devDependency (e.g. `polygon-clipping`) is fine (my call); nothing new ships to the browser.
- **Size**: `seas.topo.json` is fetched only when a Seas game (or the Seas setup) is shown, never on a Countries/Flags/Capitals page load. Budget it separately in `check-size.ts` like flags (my call: cap 600 KB). Land draws on top of seas, so sea coastlines can be simplified/quantized hard; the requirement is no visible gap between land and sea at max zoom.
- **Pool**: `poolFor` gains a topic-aware sibling (e.g. `poolForConfig(config)`) that returns all 55 sea ids, sorted by plain code-unit comparison, for Seas, and today's result for every other topic. The browser, the reducer's start and `worker/replay.ts` all use it.

## The map in a Seas game

- Draw order: background → non-game water (hatched, `pointer-events: none`) → seas (state classes `todo` / `found` / `just` / `missed`, hover and click like countries) → land (dark `--off`-style fill, `pointer-events: none`, no hover names).
- Light theme uses the same mapping: seas in `--land`, land in `--off`, non-game water in the territory hatch.
- **Framing**: the world view in a Seas game spans about 80°S to 84°N so the Ross and Weddell Seas are on screen (Countries frames 56°S–83°N). Zoom-to-target and "frame these ids" work on sea shapes.
- No tiny-sea markers (the smallest answer, Irish Sea, is about 50,000 km²); the builder adds markers only if something turns out unclickable.
- Review: missed seas hatched in `--missed`, hover shows names, as in Countries.

## Setup, top bar, review

- Topic tab label: **Seas**. Mode blurbs: Type "Name them all, any order", Locate "Click the named sea", Identify "Name the lit-up sea".
- The Regions row is hidden for Seas; the scope is always World. The board line names the board as usual ("World · Seas · Type").
- In-game "By region" panel shows the basins (Atlantic, Mediterranean, Pacific, Indian, Arctic, Southern, Inland).
- Toasts and dock text say "sea" where they say "country" today where it reads naturally ("Click the named sea"); exact copy is the builder's.
- No Learn mode for Seas.

## Leaderboards and server

- 3 new boards: `seas:type:world`, `seas:locate:world`, `seas:identify:world` (66 in all). `BOARD_REGIONS` for Seas is World only; the Leaderboard screen hides the region chips on the Seas tab.
- `parseBoard`, `boardFor`, the board route regex (`/api/boards/:topic/:mode/:region`) accept `seas`. Board ranking rules unchanged (most found, fewest hints, fastest).
- `worker/replay.ts` replays Seas games with the sea pool. Anti-cheat thresholds unchanged (`MIN_MS_PER_COUNTRY` applies per sea).
- Your games lists Seas runs under their topic. Imports: unchanged (only Countries games existed before accounts).
- No migration needed beyond whatever the board/topic validation already stores (topic is in the game's config JSON).

## Testing

- Data: 55 answers, ids unique and ≤ 8 chars, every Natural Earth marine feature claimed, basins cover everything, no alias key collisions, coastal lists non-empty except Sargasso and the five Antarctic answers. Sample points land in the right answer: just east of Gibraltar → Mediterranean, Sea of Azov → Black Sea, 73°N 160°E → Arctic Ocean, 62°S 20°E → Southern Ocean, 50°S 20°E → Indian Ocean. No water point (sampled on a grid) is in no shape.
- Matching: "pacific", "Pacific Ocean", "east sea", typo forgiveness, a gulf name gives a note, a country name gives nothing.
- Rules/hints: rules table, Locate rungs per the table above, letter rungs.
- Replay/boards: a Seas game replays and ranks on `seas:*:world`; `parseBoard` rejects `seas:type:europe`.
- Size check passes with the seas file budgeted separately; a Countries page load doesn't fetch it.
- E2E: pick Seas, play a Type game (type "Mediterranean"), a Locate game (click the named sea), an Identify game; hatched water isn't clickable; leaderboard Seas tab shows only World.

## Builder's calls already made

Map rotation stays as in Countries (any rotation splits some seas at the map edge; the Bering, Chukchi and Ross Seas will wrap, which d3 handles). Note wording for non-game water. A Seas config with a non-World scope is refused by config parsing on the server.

## Out of scope

Gulfs, bays and straits as answers (a later "Seas+" list could add them from the same data); per-basin boards or scopes; Learn for Seas; lakes and rivers.

## Docs

README: topic list, modes paragraph, boards count (66), credits (Natural Earth marine areas, public domain).
