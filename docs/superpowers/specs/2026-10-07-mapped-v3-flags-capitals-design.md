# Mapped v3: Flags and Capitals

Mapped gets two new topics next to Countries: **Flags** and **Capitals**. They are played on the same map, with the same regions, time limits, modes, accounts, saving, anti-cheat and leaderboards. The answer to every question is still a country, so the game engine barely changes. What changes is the prompt the player sees and how they answer.

## Decisions

| Topic | Decision |
|---|---|
| Structure | A **topic** picker on the setup card: Countries / Flags / Capitals (default Countries). Same map, regions, modes, time limits, boards. |
| Learning | No separate learn mode. The review screen teaches: missed countries show their flag or capital, and clicking one shows it on the map. |
| Difficulty | One difficulty. Regions, time limits and hints are the difficulty. |
| Flags · Identify | A country is lit up; pick its flag from 4. The wrong 3 are lookalikes where possible. A wrong pick costs one of 3 tries, like Locate. |
| Boards | 3 topics × 3 modes × 7 regions = 63 boards, ranked as today: most found, then fewest hints, then fastest. |
| Flag images | Self-hosted SVGs (from the MIT-licensed `flag-icons` package), one file per country under `/flags/`. No third-party requests (CSP stays `img-src 'self'`). |

## The nine games

Every game asks about countries in the chosen region. A game is either **unordered** (name them in any order, like Countries · Type today) or **ordered** (one target at a time from a server-seeded queue, like Locate and Identify today).

| | Type | Locate | Identify |
|---|---|---|---|
| **Countries** (unchanged) | Unordered. Type country names. | Ordered. Prompt: country name. Click it. 3 tries. | Ordered. Prompt: country lit up. Type its name. |
| **Flags** | Ordered. Prompt: a flag. Type its country. | Ordered. Prompt: a flag. Click its country. 3 tries. | Ordered. Prompt: country lit up. Pick its flag from 4. 3 tries. |
| **Capitals** | Unordered. Type capitals; each lights up its country. | Ordered. Prompt: a capital. Click its country. 3 tries. | Ordered. Prompt: country lit up. Type its capital. |

- In Flags · Type and Flags · Locate the map never highlights the target before it is answered, so it never gives the answer away. Once answered (or revealed), the country lights up as today.
- Skip is available in every ordered game (it is today in Locate and Identify), and reveals the target as a miss.
- Flags · Type and Capitals · Identify use typed answers checked against the current target only, like Countries · Identify today (typos forgiven on Enter when unambiguous).
- Capitals · Type matches typed text against every capital in the region, like Countries · Type matches country names (exact names count as you type; "hold" while a longer capital could still match; typos on Enter). Typing a capital outside the region says "Nairobi is Kenya's capital, which isn't in this quiz".

### Topic rules as data

`src/game/topics.ts` describes each topic × mode with three facts, and everything else (reducer, input, prompts, hints) reads them instead of branching on names:

- `ordered`: false for Countries · Type and Capitals · Type, true otherwise.
- `prompt`: what the dock shows for the current target: `name` (country name), `flag`, `capital`, or `map` (the target is lit up on the map).
- `answer`: `country` (type a country name), `capital` (type a capital), `click` (click the country), or `flag` (pick 1 of 4 flags).

Countries keeps exactly today's behavior: Type = unordered/country, Locate = name/click, Identify = map/country.

## Data

### Capitals

`src/data/capitals.ts`: for each of the 197 countries, the display capital and accepted alternatives, e.g.

- Display names come from today's `facts.ts` capital, cleaned up: Bolivia "Sucre" (also accepts "La Paz"), Palestine "Ramallah" (also "East Jerusalem"), Nauru "Yaren", South Africa "Pretoria" (also "Cape Town", "Bloemfontein"), Sri Lanka "Sri Jayawardenepura Kotte" (also "Kotte", "Colombo"), Malaysia "Kuala Lumpur" (also "Putrajaya"), Eswatini "Mbabane" (also "Lobamba"), Kiribati "Tarawa" (also "South Tarawa").
- Spelling aliases where common: Kyiv/Kiev, Ulaanbaatar/Ulan Bator, Naypyidaw/Nay Pyi Taw/Naypyitaw, Washington, D.C./Washington/Washington DC, Astana/Nur-Sultan, Nukuʻalofa/Nukualofa, Port of Spain/Port-of-Spain, and so on. Accents never matter (the existing `normalize` strips them).
- `facts.ts` keeps its capital string for hints; tests assert every country has a capital entry and no key belongs to two countries.

A capitals `NameIndex` is built with the existing `buildIndex` (entries `{ id: countryId, name: capital, aliases }`, no territories), so `matchTyped`, `matchSubmitted` and `matchTarget` work unchanged.

### Flags

- `scripts/build-flags.ts` copies the 4:3 SVG for each of the 197 countries from the `flag-icons` devDependency into `public/flags/<ID>.svg` (alpha-3 ids, Kosovo `XKX` → `xk`), minified, and the output is committed (like `build-geo.ts`). It fails if any country has no flag. A test checks that every country has `public/flags/<ID>.svg`.
- Flags load lazily as `<img src="/flags/XXX.svg" alt="">`. Upcoming targets' flags are preloaded one ahead. Static assets never invoke the Worker.
- The license notice for `flag-icons` goes in the README's credits.

### Flag lookalikes

`src/data/flagLookalikes.ts`: hand-made groups of flags that are easy to confuse, at least 25 groups, e.g. Chad/Romania/Andorra/Moldova, Indonesia/Monaco/Poland/Singapore, Ireland/Côte d'Ivoire/Italy, Netherlands/Luxembourg/Paraguay/Croatia, Australia/New Zealand, Senegal/Mali/Guinea/Cameroon, the Nordic crosses, Slovenia/Slovakia/Russia/Serbia, Venezuela/Ecuador/Colombia, Honduras/El Salvador/Nicaragua/Guatemala/Argentina, Qatar/Bahrain, Jordan/Palestine/Sudan/Kuwait/UAE, Syria/Iraq/Egypt/Yemen, Austria/Latvia/Lebanon, Belgium/Germany, Hungary/Italy/Bulgaria/Tajikistan, Ghana/Bolivia/Lithuania/Guinea-Bissau.

`flagChoices(target, seed)` returns 4 country ids in a shuffled order: the target, then up to 3 from its lookalike groups, filled from the same subregion, then the same continent, then anywhere. Distractors may be outside the game's region (Chad vs Romania is the point). It is deterministic for a given game seed and target, so a restored review or a reload shows the same choices. The server does not need the choices: a pick is logged as a `click` on a country id and judged like Locate.

## Engine

- `GameConfig` gains `topic: 'countries' | 'flags' | 'capitals'`. `parseConfig` treats a missing topic as `countries`, so stored configs, old clients and old logs keep working.
- `target()` returns the queue head whenever the game is ordered (not only when mode isn't Type).
- `click` is accepted when the answer is `click` (must be a country in the pool, as today) or `flag` (may be any country id in `COUNTRIES`; anything but the target costs a try).
- Hint ladders become per topic × mode: `HINT_LEVELS[topic][mode]`.
- The log format is unchanged. Replay and the judge work as today; the per-country speed and clock checks apply to every topic.

## Hints

Hints still count against ranking. Ladders (each rung adds a line to the hint card):

| Game | Ladder |
|---|---|
| Countries · * | Unchanged: Type/Identify spell out the country name over 4 rungs (starts with, first letter + count, first and last, every other letter); Locate has 3 (where, neighbors, circle on the map). |
| Flags · Type | The 4 letter rungs, for the target country's name. |
| Flags · Locate, Capitals · Locate | The 3 Locate rungs, for the target country. |
| Flags · Identify | 2 rungs: each removes one wrong flag. |
| Capitals · Type, Capitals · Identify | The 4 letter rungs, for the capital's name. In Type, the player picks the country to hint on the map, as in Countries · Type. |

The letter rungs are the existing `letterPattern`/`letterCount` helpers, applied to whichever name is the answer.

## Screens

- **Setup card:** a TOPIC row (three chips) above REGIONS. Mode blurbs follow the topic (e.g. Flags: "Type the flag's country", "Click the flag's country", "Pick the lit-up country's flag"; Capitals: "Name every capital", "Click the capital's country", "Name the lit-up country's capital"). The board label reads "Europe · Flags · Type board". Your best for the setup reflects the topic.
- **Dock prompts:** a flag card (the flag, large, with a subtle frame; on phones it fits above the input) for `prompt: flag`; "Nairobi" in the locate-style prompt for `prompt: capital`; the input placeholder follows the answer ("Type the country…", "Type a capital…", "Name its capital…"). Flags · Identify shows four flag buttons (keys 1–4) with tries left; a wrong pick shakes and dims that flag.
- **Top bar pill:** "Europe · Flags · Locate".
- **Review:** missed items show a small flag (Flags) or "Capital — Country" (Capitals). Clicking focuses the country on the map as today.
- **Toasts:** found messages name what was asked ("Kenya" / "Nairobi · Kenya").
- **Leaderboards:** a topic row (tabs) above the mode tabs. URLs: `/leaderboards/<mode>/<region>` stays Countries; `/leaderboards/<topic>/<mode>/<region>` for Flags and Capitals.
- **Your games:** the bests grid gets topic tabs; recent games show the topic ("Europe · Flags · Type").

## Boards and server

- Board keys: Countries keeps `<mode>:<region>` (no data migration); new topics use `<topic>:<mode>:<region>` (e.g. `flags:type:europe`). `parseBoard`, `boardFor`, `boardLabel` and the `Board` type handle both; `BOARD_TOPICS = ['countries', 'flags', 'capitals']`.
- `GET /api/boards/<mode>/<region>` stays; `GET /api/boards/<topic>/<mode>/<region>` is added. Invalid combinations 404.
- `games` rows: the topic lives in `config` JSON and in the board key. No schema change. Recent games include `topic` (from config, default countries).
- Local bests (`mapped:best:v1:...`) for Countries keep their keys; new topics add the topic to the key. Pre-accounts imports stay Countries-only (they can only be Countries).

## Testing

- Data: every country has a capital entry and a flag file; capital keys unique; lookalike groups only use known ids; `flagChoices` returns 4 distinct ids including the target, deterministic per seed.
- Engine: reducer tests per topic × mode (ordered vs unordered, flag pick costing tries, picks outside the pool, skip); replay/judge tests for a Flags and a Capitals game; `parseConfig` defaulting.
- Matching: capitals typed exact/held/typo/out of region; alternatives (La Paz, Kiev) accepted.
- Worker: start/finish/rank a Flags and a Capitals game; new board route; Countries routes unchanged.
- E2E: play Flags · Type (type 3 countries from shown flags, give up, save card offers a rank), Flags · Identify (pick by key), Capitals · Type; the topic tabs on Leaderboards and Your games.

## Out of scope

Study/flashcard mode, difficulty levels, multiple-choice for anything but Flags · Identify, territories' flags or capitals.

## Revisions during implementation

- `scripts/check-size.ts` budgets `flags/` separately (at most 250 files, 3 MB total, 256 KB per flag) because flags load one per question, not with the page. The app keeps its 1.5 MB / 1 MB per file / 100 files budget.
- The game seed is kept on the saved run (`Run.seed`, optional) so Flags · Identify shows the same four flags after a reload. Offline games use the game's start time.
- The answer box is announced to screen readers as "Capital" in Capitals games ("Country name" otherwise).
- When a target is revealed (skipped or out of tries), Flags and Capitals say "It was …". Countries keeps its existing wording.
- In Flags · Identify a wrong pick briefly lights up that flag's country on the map, which teaches whose flag it was without giving away the target.
- India also accepts "Delhi".
- The README describes the topics.
