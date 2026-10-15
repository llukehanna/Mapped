# Mapped v3.1: flag hints, easier Capitals, Flags · Learn

Three changes after v3 (Flags and Capitals) launched:

1. Flags · Type gets a fifth hint: the region first.
2. Capitals is too hard (since launch: 2 games, about 1% found), so every Capitals game now names the country it asks about.
3. A Learn mode for flags: an untimed drill that teaches flags, with no leaderboard. Players choose it when they want; regular games are always available too.

Builds on `docs/superpowers/specs/2026-10-07-mapped-v3-flags-capitals-design.md`.

## 1. Flags · Type: five hints

| Rung | Clue |
|---|---|
| 1 | "In Western Africa": the country's subregion (the names used in the By-region panel) |
| 2 | "Starts with C" |
| 3 | "C _ _ _ · 4 letters" |
| 4 | first and last letters |
| 5 | every other letter |

Rungs 2–5 are today's rungs 1–4. Only Flags · Type changes: Flags · Locate keeps its 3 rungs (the first already names the region) and Flags · Identify keeps its 2 (each removes a wrong flag). `hintLevels` returns 5 for Flags · Type; `clueFor` produces the region rung. The hint card shows "1/5" etc.

## 2. Capitals: always name the country

| | Before | Now |
|---|---|---|
| Capitals · Type | Unordered: name every capital from memory | Ordered: the dock names the country ("Kenya") and it is lit on the map; type its capital. Skip available. Hints: the 4 letter rungs for the capital. |
| Capitals · Identify | Country lit (not named); type its capital | Country named and lit; pick its capital from 4. A wrong pick costs one of 3 tries. Hints: 2 rungs, each removes a wrong choice. |
| Capitals · Locate | "Whose capital is Nairobi?" click the country | Unchanged (the hard mode). |

### Rules table

`src/game/topics.ts` gains one prompt and one answer:

- Prompt `country`: the dock names the target country and the map lights it (Capitals · Type and Identify).
- Answer `capitalPick`: pick the target's capital from 4 (Capitals · Identify). Like Flags · Identify's `flag` answer, a pick is logged and replayed as a `click` on a country id (the country whose capital was picked); any country id is allowed, anything but the target costs a try.

| Capitals | ordered | prompt | answer |
|---|---|---|---|
| Type | true | `country` | `capital` |
| Locate | true | `capital` | `click` |
| Identify | true | `country` | `capitalPick` |

`hintLevels`: `click` → 3, `flag` and `capitalPick` → 2, Flags · Type → 5, otherwise 4.

### Capital choices

`capitalChoices(target, seed)` returns 4 country ids (target included, shuffled, deterministic per game seed and target, like `flagChoices`). Decoys come from the target's neighbors (`GEO_META[id].neighbors`), then the same subregion, then the same continent, then anywhere. The UI shows each choice as its capital name (`capitalOf`). Choice buttons are labelled by the capital name (the capital is the answer, the country is already named, so naming the choices leaks nothing). Keys 1–4 pick.

### Old Capitals runs

Capitals · Type and Capitals · Identify runs played under the old rules are not comparable. A migration marks them `ranked = 0, unranked_reason = 'retired'` and deletes their rows from `bests` (boards `capitals:type:*` and `capitals:identify:*`). They stay in Your games as "Unranked: older rules". Capitals · Locate, Countries and Flags data are untouched. Games of those two modes started before the deploy but finished after it replay against the new rules (rare; accepted). An old-tab Capitals · Type finish fails cleanly (422, and the unfinished row is deleted). An old-tab Capitals · Identify finish logs `found` on the target, which the new reducer accepts, so it verifies and ranks unless the player used more than 2 hint rungs (422). Both are harmless because the old modes were harder.

## 3. Flags · Learn

### Choosing it

- The setup card gets a **Play | Learn** switch at the top, shown only when the topic is Flags; Play is the default and is what every other topic uses. Players switch freely between them at any time: Learn never locks, unlocks or gates anything in Play, and Play never requires Learn.
- In Learn, the Regions row works as in Play; the Mode and Time limit rows are hidden; the board line reads "Practice · not ranked"; the button reads "Start learning".
- Learn is not a `Mode` and has no board, no server game, no account save, and no URL of its own.

### The drill

- One flag at a time, large, in the dock, with 4 country names below it (decoys from `flagChoices`, so lookalikes). Keys 1–4 pick. The map stays neutral until the player answers.
- **Right:** the country lights up on the map (and the map focuses it), with a line "Chad · N'Djamena". After a short beat the next flag appears.
- **Wrong:** the picked button shakes; the right answer is highlighted and lit on the map with "That's Chad · N'Djamena"; the player presses Continue (or Enter). That flag returns 3 cards later.
- A flag is **learned** after 2 right answers in a row. Learned flags leave the round. The round ends when every flag in it is learned.
- No timer pressure: a small clock shows elapsed time for the summary only. No hints.
- Top bar: "Europe · Flags · Learn", a "Learned 12 / 45" counter in place of the score, and **Stop** in place of Give up (no confirmation).
- **Summary** (on finish or Stop): "Learned 45 flags in 6:12", the 3 flags missed most this round with their names, and buttons "Learn again" and "Play Flags" (switches the setup to Play with the same region).

### Progress on this browser

- localStorage key `mapped:learn:v1:flags` holds the ids of every flag learned on this browser. A flag learned in any round counts as learned everywhere: the count for a region is how many of its flags are in that set.
- The setup card in Learn shows "30 / 45 learned" for the selected region and a "Reset" link (clears the selected region's flags from the set).
- A new round includes only the region's not-yet-learned flags; if all are learned, it includes them all again (a review round).
- localStorage only: not synced to the account, not sent to the server. If storage is blocked, Learn still works without remembering.

### Code shape

- `src/game/learn.ts`: a pure reducer for the drill: state `{ queue, streak: Record<id, number>, learned: Set, misses: Record<id, number>, current, phase }`, actions `start(pool, seed)`, `pick(id)`, `continue()`, `stop()`. "Returns 3 cards later" = reinserted at index 3 of the queue (or the end if shorter). Deterministic with a seed.
- `src/store/learned.ts`: read the learned set, add ids, reset a region's ids (wrapped in try/catch like the other stores).
- UI: `LearnCard` (flag + 4 name buttons + feedback line + Continue), `LearnSummary`; App switches between the game and the learn session; the map's highlight/focus reuse the existing map props.

## Revisions during implementation

- Learn's 4 name choices are seeded per round plus the number of cards asked, so a returning flag's options move around (players learn flags, not button positions).
- Esc stops a Learn round (same as the Stop button; no confirmation).
- The Learn summary's "Hardest this round" rows also show the miss count.
- A wrong Capitals · Identify pick says "No, that's Kampala (Uganda)" and briefly lights that country, as Flags · Identify does.
- Flags and capitals share one choices component; dock heights for the new panels are measured constants.
- Learn's card is fixed per question (choices don't reshuffle during feedback); right answers auto-continue after about 0.9 s, wrong ones wait for Continue or Enter.

## Testing

- Hints: Flags · Type rung 1 is the subregion and rungs 2–5 equal the old 1–4; `hintLevels` table.
- Capitals: rules table; reducer accepts capital picks as clicks on any country, wrong costs a try; `capitalChoices` 4 distinct, includes target, neighbors first, deterministic; replay/judge ranks a new Capitals · Type and Identify game; migration retires old rows and their bests.
- Learn reducer: right/wrong flow, requeue offset 3, learned after 2 in a row, finishes when all learned, stop, misses ranking; store read/write/reset and blocked storage.
- E2E: Flags · Type shows "1/5" and the region on hint 1; Capitals · Type names the country and accepts a typed capital; Capitals · Identify picks with keys; Learn: switch to Learn, answer right and wrong, see the requeue and the counter, Stop shows the summary, Play is still available with the same region, setup shows the learned count after a round.

## Out of scope

Learn for Countries or Capitals (easy to add later on the same reducer), syncing Learn progress to accounts, spaced repetition across days.

## Revisions after launch

- Flags · Type skips the region rung when every country in the game shares one subregion (S. America, or a single subregion picked): 4 letter rungs instead of 5. `hasRegionRung(config)` in `src/game/topics.ts` decides it from the game's scope, so the reducer, server replay and hint card agree.
