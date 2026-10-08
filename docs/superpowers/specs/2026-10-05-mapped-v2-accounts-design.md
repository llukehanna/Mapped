# Mapped v2: accounts and leaderboards

**Date:** 2026-10-05
**Status:** Approved; implemented in v2 (see Revisions during planning)
**Builds on:** [v1 design](2026-10-05-mapped-design.md)
**Mockups:** `.superpowers/brainstorm/39123-1791265063/content/accounts-screens.html` (local only)

Players can sign in with Google. Signed-in players' games are saved, and complete, unpaused runs on standard setups go on public leaderboards ranked by fewest hints, then fastest time. Playing still needs no account.

## Decisions

| Question | Decision |
| --- | --- |
| Sign-in method | Google only (OpenID Connect, server-side redirect). No passwords, no email service. People without a Google account can play but not save. |
| When an account is needed | Never to play. Finishing a game offers "Sign in to save this"; signing in then claims that game. |
| Which setups rank | 21 boards: each mode (Type, Locate, Identify) × World or exactly one whole continent. Any time limit. |
| Ranking | Fewest hints, then fastest time, then earliest finish. One best run per player per board. All-time only. |
| Anti-cheat | The server times each game, picks the target order, and replays the action log through the shared reducer. |
| Stack | One Cloudflare Worker for `/api/*`, and D1 (SQLite). |
| Display identity | A unique display name chosen once at first sign-in. Google names and emails are never shown publicly. |
| Local bests | Kept as in v1. Revised: those saved before v2 are imported, unranked, on first sign-in. |
| Layout | Sign-in, Leaderboards and Your games are centred cards over a dimmed map. The post-game save prompt is a card at bottom centre. |

## Non-goals

- Passwords, emailed codes, Apple or other providers, passkeys
- Weekly or monthly boards, friends, following, profiles of other players
- An admin UI (moderation is `wrangler d1 execute` and a recompute script)
- Bot detection beyond the replay check and speed floor
- Vercel hosting (dropped; D1 is Cloudflare-only)

## Revisions during planning

- A log that fails to replay (bad shape, impossible actions) is answered with 422 unverified and the game row is deleted, instead of being stored with empty stats. Runs that replay but are too fast or out of step with the server clock are still stored as Unranked: couldn't verify.
- The save card's Sign in button goes straight to Google, a single click; the sign-in card is used from the setup corner and /signin.
- The Origin check compares against the request's own origin, so APP_ORIGIN isn't needed.
- Full-stack local dev is npm run dev:full (build + wrangler dev on 8787 in fake sign-in mode). npm run dev (Vite only) still works, offline.
- wrangler dev needs --local-upstream localhost:<port>. Without it the Worker sees the production hostname and refuses fake mode.

## Revisions during implementation

- Clock tolerance is 3 s, not 2 s; the start time is stamped just before the game row is written.
- /finish is idempotent: finishing an already-saved game returns its saved result, so a retry after a lost response works.
- The browser retries a failed /finish once, 800 ms later.
- A claim request handles at most 8 games; the browser sends them in batches of 8.
- The game pool is ordered by country id, not by name, so every browser shuffles the same order whatever its language.
- Sign-in hardening: return paths are normalized and must stay on this site; fake mode is refused for every route off localhost; signing in revokes the session the browser already had.
- Games and claims are protected against double-finish and double-claim races.
- A 401 on a signed-in call signs the browser out locally. The name card opens by itself once per browser session.
- Games played signed out stay claimable for 90 days, not one day. The browser keeps their claim tokens in localStorage (at most 500, oldest dropped), and the server keeps unclaimed finished games for 90 days. Unfinished games are still deleted after a day. Signing in on the same browser claims them all.
- Claims saved by the first version in sessionStorage are moved to localStorage on the next load.
- Local bests are no longer left behind. The first time an account signs in on a browser, the bests saved there before accounts existed (before the v2 launch) are sent to POST /api/me/import, 25 at a time. They show in Your games as "Unranked: played before accounts". They are unverified, so they are never ranked: they can be your personal best in Your games (see below) but never reach a leaderboard. Repeats are ignored. An account can import at most 200 games, and the browser remembers which accounts it has imported for as a hash of the email.

## Revisions after launch

- Boards rank most countries found first, then fewest hints, then fastest, then earliest. Unfinished runs (given up, timed out, skipped) rank, behind every run that found more. A run that found nothing stays unranked (`incomplete`, shown as "nothing found"). The speed check is per country found. `bests` stores `found` and `total` (migration 0004). The leaderboard shows a Found column; its footer reads "Most found, then fewest hints, then fastest."
- Pause is gone: it let players stop the clock to look answers up. There is no Pause button, Esc opens the "Give up?" question, hiding the tab does nothing, and the clock keeps running while the question is open. The reducer still understands `pause`/`resume`, so the server still marks any new log that contains one as `paused` (unranked). The first version's "Give up?" dialog paused the clock, so a pause straight into giving up isn't counted as pausing; that run's time runs to the give-up instead, so a squashed log can't hide behind it. Unfinished games saved before this change were re-judged by a one-off script.
- Paused games from before pause was removed are grandfathered: a one-off script re-judged them without the pause rule (time is the played time; the server clock is checked against the log's wall time, pauses included) and ranked those that passed. A pause in a new game's log still means `paused`, since the app can no longer send one.

## Architecture

```
browser ──/assets, /, /leaderboards/…──▶ Workers static assets (no Worker runs)
        ──/api/*─────────────────────▶ Worker (worker/index.ts)
                                          ├─ D1 database  (binding DB)
                                          ├─ Google OAuth token endpoint (server-to-server)
                                          └─ src/game/*  (shared reducer, scope, rng)
```

- `wrangler.jsonc` gains `main: "worker/index.ts"`, a `d1_databases` binding `DB`, and `assets.run_worker_first: ["/api/*"]`, so the Worker only ever runs for API calls. `assets.not_found_handling` changes from `404-page` to `single-page-application` so client routes load the app.
- Secrets: `GOOGLE_CLIENT_SECRET`, and `AUTH_SECRET`, an HMAC key for hashing session tokens, claim tokens and IPs.
- Vars: `GOOGLE_CLIENT_ID`, and `AUTH_MODE` (`google` in production, `fake` for local end-to-end tests).
- Schema migrations live in `migrations/` and run with `wrangler d1 migrations apply`.
- The Worker imports `src/game/reducer.ts`, `scope.ts`, `rng.ts` and `src/data/countries.ts` directly. It never imports React or anything under `src/ui`.

### Free-plan fit

| Resource | Free limit | Mapped usage |
| --- | --- | --- |
| Worker requests | 100k/day | Only `/api/*` calls: about 3–6 per game, plus board views |
| Worker CPU | 10 ms per request | Replaying a 197-country game is well under 5 ms; measured in tests |
| D1 | 5M rows read and 100k rows written per day; 5 GB | About 3–5 writes per game; board reads are indexed |
| Google sign-in | Free; no app verification needed for the `openid email` scopes | One token exchange per sign-in |

Source: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

## Data model (D1)

```sql
users (
  id TEXT PRIMARY KEY,            -- random 128-bit, base64url
  google_sub TEXT NOT NULL UNIQUE,  -- Google's stable account id ("sub" claim)
  email TEXT NOT NULL,            -- from Google, shown only to its owner in the user menu
  name TEXT,                      -- null until chosen
  name_key TEXT UNIQUE,           -- lowercased name, for case-insensitive uniqueness
  created_at INTEGER NOT NULL
)
sessions (
  token_hash TEXT PRIMARY KEY,    -- HMAC of the cookie value
  user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL     -- created + 365 days, extended when under 182 days remain
)
games (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users ON DELETE CASCADE,  -- null until claimed
  claim_hash TEXT,                -- HMAC of the claim token; cleared once claimed
  ip_hash TEXT NOT NULL,          -- HMAC of the client IP; never the raw IP
  mode TEXT NOT NULL,
  scope_key TEXT NOT NULL,        -- v1 scopeKey()
  time_limit_sec INTEGER,
  board TEXT,                     -- e.g. 'type:world', 'locate:europe'; null for custom scopes
  seed INTEGER NOT NULL,
  started_at INTEGER NOT NULL,    -- server clock
  finished_at INTEGER,            -- server clock, stamped on receipt of /finish
  found INTEGER, total INTEGER, hints INTEGER, ms INTEGER,  -- from the server's replay
  end_reason TEXT,                -- complete | timeout | gaveUp
  ranked INTEGER NOT NULL DEFAULT 0,
  unranked_reason TEXT,           -- custom | incomplete | paused | unverified | anonymous
  log TEXT                        -- JSON action log
)
bests (
  user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
  board TEXT NOT NULL,
  game_id TEXT NOT NULL REFERENCES games ON DELETE CASCADE,
  hints INTEGER NOT NULL, ms INTEGER NOT NULL, finished_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, board)
)
INDEX bests_rank ON bests (board, hints, ms, finished_at)
INDEX games_user ON games (user_id, finished_at DESC)
INDEX games_cleanup ON games (user_id, started_at)
INDEX games_ip ON games (ip_hash, started_at)
```

**Housekeeping, done lazily on writes (no cron):**

- Unclaimed games older than 24 hours are deleted when a game starts, at most 50 rows per call.
- Expired sessions are deleted when someone signs in.

## API

All bodies are JSON. Every non-GET request must carry `Content-Type: application/json` and an `Origin` equal to the request's own origin (so it works on localhost and in production without configuration); anything else gets a 403. All API responses send `Cache-Control: no-store`. Errors look like `{ "error": "<code>", "message": "<human text>" }`.

| Method and path | Body / query | Response |
| --- | --- | --- |
| `GET /api/auth/google?return=/path` | — | `302` to Google, with a short-lived state cookie |
| `GET /api/auth/google/callback` | `?code&state` (or `?error`) | Creates or finds the user, sets the session cookie, `302` back to `return`. On failure, `302` to `return?auth=failed`. |
| `GET /api/auth/name?name=` | — | `{ available, reason? }` for the live check while typing |
| `POST /api/auth/name` | `{ name }` | `200 { user }`, `409 taken` or `400 invalid`. Only allowed while the name is null. |
| `POST /api/auth/signout` | — | Deletes the session and clears the cookie |
| `GET /api/me` | — | `{ user: { name, email } | null }`; `name` is null until chosen |
| `DELETE /api/me` | `{ confirm: name }` | Deletes the user and, by cascade, their sessions, games and bests. Clears the cookie. |
| `POST /api/games` | `{ config }` | `{ id, claim, seed, board }`. Owned from the start when signed in. `claim` is null when signed in. |
| `POST /api/games/:id/finish` | `{ log }` | `{ found, total, hints, ms, endReason, ranked, reason?, rank?, newBest?, wouldRank? }` |
| `POST /api/games/claim` | `{ claims: [{ id, claim }] }` | The same result shape per claimed game, now owned |
| `GET /api/boards/:mode/:region` | — | `{ rows: top 50 [{ rank, name, hints, ms, finishedAt }], players, you?: row }` |
| `GET /api/me/games` | — | `{ bests: [{ board, hints, ms, rank }], personal: [{ board, found, total, hints, ms, ranked }], recent: last 50 games }` |

**Session cookie:** `__Host-mapped_session=<random 256-bit>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`.

## Sign-in

**Flow (OpenID Connect authorization code with PKCE, all server-side; no Google JavaScript on the page, so the CSP is unchanged):**

1. **Before leaving.** The client saves anything it needs to come back to in `sessionStorage`:
   - `mapped:claims:v1`: claim tokens for games finished while signed out.
   - `mapped:resume:v1`: the finished game's review state, so the review screen reappears after the round trip.

   Then it navigates to `/api/auth/google?return=<current path>`.
2. **`/api/auth/google`.**
   - Makes a random `state` and a PKCE `verifier`.
   - Stores `state`, `verifier` and `return` in an `HttpOnly; Secure; SameSite=Lax; Max-Age=600` cookie called `__Host-mapped_oauth`.
   - `return` is accepted only if it starts with `/` and not `//`; otherwise it's `/`.
   - Redirects to `https://accounts.google.com/o/oauth2/v2/auth` with `scope=openid email`, `response_type=code`, `prompt=select_account`, `code_challenge_method=S256`, `client_id`, `redirect_uri` (`<origin>/api/auth/google/callback`) and `state`.
3. **`/api/auth/google/callback`.**
   - Checks that `state` matches the cookie, then clears the cookie.
   - POSTs the code, client id and secret, redirect URI and verifier to `https://oauth2.googleapis.com/token`.
   - Reads the `id_token` payload. It came straight from Google's token endpoint over TLS, so per OIDC §3.1.3.7 its signature needn't be checked. The checks that remain:
     - `iss` is `https://accounts.google.com` or `accounts.google.com`
     - `aud` equals `GOOGLE_CLIENT_ID`
     - `exp` is in the future
     - `email_verified` is true
   - Upserts the user by `sub`, refreshing the stored email.
   - Creates a session, sets the cookie, deletes expired sessions, and redirects to `return`.
   - Any failure, including the user cancelling (`?error=access_denied`), redirects to `return` with `?auth=failed`. The client shows "Sign-in didn't finish." and strips the parameter.
4. **Back in the app.** On load, the client calls `GET /api/me`. When signed in, it claims every game in `mapped:claims:v1` and restores `mapped:resume:v1` if that's under 30 minutes old.
5. **Name.** When `name` is null, the "Pick a name" card opens.
   - 3–20 characters from `[A-Za-z0-9 _-]`, trimmed, with no double spaces. Unique by `name_key`.
   - "Not now" leaves the account without a name. The name chip then reads "Pick a name".
   - Without a name you don't appear on boards, but ranked games still record bests, which appear once you choose one.

**Rate limit:** game starts are capped at 200 per IP hash per hour, counted over `games`. Sign-in needs no limit of its own: Google rate-limits its side, and a callback without a valid state cookie does nothing.

**Fake mode, for end-to-end tests:** with `AUTH_MODE=fake`, `/api/auth/google?return=…&as=<email>` skips Google and goes straight to the callback with `code=fake:<email>`. The callback then uses `sub = 'fake:' + email` without calling Google.
- Fake mode only works when the request host is `localhost` or `127.0.0.1`.
- On any other host, if the Worker sees `AUTH_MODE=fake`, it answers every auth route with a 500.

**Google Cloud setup (one-time, Luke):**
1. Create a project.
2. Set up the OAuth consent screen: External; app name Mapped; support email; authorized domain `lukeghanna.com`; scopes `openid` and `email` only; publish to production.
3. Create a Web OAuth client with these redirect URIs:
   - `https://mapped.lukeghanna.com/api/auth/google/callback`
   - `http://localhost:8787/api/auth/google/callback`
4. Basic scopes don't need Google's verification review.

## Game lifecycle and anti-cheat

### Client

- **Start.** `start()` calls `POST /api/games` before the game begins.
  - It builds the Locate/Identify order with `shuffle(pool, seededRandom(seed))` from the server's seed.
  - If the call fails or takes more than 1.5 s, the game starts locally with `Math.random`, exactly as in v1, and is marked offline: not saved, not ranked, and the review shows "Offline: this game wasn't saved".
- **Log.** A thin wrapper around `dispatch` appends each game action to a log as `{ t, a }`.
  - `t` is milliseconds since start.
  - `a` is the action without `now`: `found {id, corrected?}`, `click {id}`, `skip`, `hint {rand}`, `pause`, `resume`, `giveUp`.
  - The tick that ends a timed game is logged as `tick`. Other ticks aren't logged.
- **Finish.** On entering review, the client sends `POST /api/games/:id/finish`. Unclaimed claim tokens are kept in `sessionStorage` (`mapped:claims:v1`) for 24 hours, and sent with `POST /api/games/claim` right after a successful sign-in.
- **Restore.** A `restore` reducer action replaces the state with a saved review state (`GameState` is plain JSON).
- **Ranked setups:**
  - The top bar shows a Ranked tag next to the setup pill.
  - The pause card adds "Pausing makes this run unranked."
  - Hiding the tab no longer auto-pauses (v1 only did so for untimed games); the clock keeps running.
- **Setup card:** on a ranked setup it shows the board ("World · Type board"). Signed in, it shows your server best and rank; otherwise your local best as in v1. A custom setup shows "Unranked: custom regions".

### Server (`/finish`)

1. **Stamp.** `finished_at = now()` as the first thing. Reject if the game is already finished or doesn't exist.
2. **Rebuild.** Rebuild the start state from the stored config: `poolFor(scope)`, and the order from `shuffle(pool, seededRandom(seed))`.
3. **Replay.** Run each log entry through `reduce()` with `now = started_at + t`.
   - Reject the log (`unverified`) if any of these hold:
     - `t` decreases
     - an action is malformed
     - a `hint.rand` falls outside [0, 1)
     - an entry follows the game's end
     - the replay never reaches `review`
     - it's over 5,000 entries or 256 KB
   - `found`, `total`, `hints`, `ms` and `endReason` all come from the replayed state.
4. **Decide whether it ranks,** in this order:
   - `board` is null → `custom`
   - not every country found → `incomplete`
   - any `pause` → `paused`
   - replayed `ms` is less than `(finished_at − started_at) − 2000` → `unverified` (network delay only ever makes the server's measurement longer)
   - any two successful finds (a `found`, or a `click` on the target) less than 100 ms apart, or `ms / total` under 300 → `unverified`
   - no owner yet → recorded as `anonymous`, re-evaluated on claim
5. **Store.** Save the result and log. If it ranks and has an owner, upsert `bests` only when `(hints, ms)` beats the existing row.
6. **Respond.** Return the result plus `rank` (signed in), `newBest`, or `wouldRank` for an unclaimed game. `wouldRank` is `1 + count(bests on that board better than this run)`.

**Claim** verifies the HMAC of each claim token, sets `user_id`, clears `claim_hash`, then re-runs step 4 onward without the anonymous rule.

**Constants** (`src/game/ranking.ts`, shared by client and server): `MIN_FIND_GAP_MS = 100`, `MIN_MS_PER_COUNTRY = 300`, `CLOCK_TOLERANCE_MS = 3000`, `BOARD_REGIONS = ['world', 'africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania']`, `boardFor(config)`, `compareRuns(a, b)`.

**Known gaps:**

- **Fabricated logs at human speed.** A bot that submits a made-up log at believable human speed passes.
- **Hint counts.** Hints are computed in the browser from bundled data, so a modified client could use hints and leave them out of the log. The server can't tell that apart from a player looking answers up in another tab, which no quiz can prevent.

The answer to both is manual deletion followed by `npm run recompute-bests`.

## Screens

All new screens use the v1 tokens and glass styles and work in both themes. On phones (<768 px) each card becomes a bottom sheet, as setup and review already do.

- **Corner during setup** (top right): a Leaderboards link (trophy icon), then either a Sign in button or the name chip, then the theme toggle.
  - The name chip opens a menu: "Signed in as m•••@gmail.com", Your games, Leaderboards, Sign out, Delete account….
- **Sign-in card** (`/signin`, or opened from the save prompt): a centred card over a dimmed map.
  - The card says "Sign in to Mapped", then "Save your games and get on the leaderboards."
  - Then a standard "Sign in with Google" button, following Google's branding: the white button with the four-colour G as inline SVG.
  - Below it: "Only your display name is ever shown." and "Not now". Esc closes the card.
- **Name card:** "Pick a name", with a live availability check, then Done and Not now. It opens by itself after the first sign-in.
- **After signing in from review:** you land back on the same review screen. The game is claimed and the save card updates.
- **Review save card** (bottom centre, where the guess box was). One of:
  - Signed out: "Sign in to save this run · 0 hints · 14:07 would put you #12 on World · Type", with Not now and Sign in.
  - New best: "Saved · #12 on World · Type · new personal best".
  - Saved, not a best: "Saved · your best stays 0 hints · 13:52 (#9)".
  - Unranked: "Saved · Unranked: paused / not complete / custom regions / couldn't verify".
  - Offline: "Offline: this game wasn't saved".
- **Leaderboards** (`/leaderboards/:mode/:region`, defaulting to `type/world`): a centred card about 700 px wide over a dimmed map.
  - Mode tabs, region chips, then a table: #, Name, Hints, Time, Date. The top 3 ranks are in gold, and 0-hint counts are gold.
  - Your row is highlighted, and pinned below a "···" gap when you're outside the top 50.
  - Footer: "Fewest hints, then fastest. Complete, unpaused runs only." and the player count.
  - Changing a tab or chip updates the URL with `replaceState`.
- **Your games** (`/me`, signed in only): the same card style.
  - A 7×3 grid of your bests: time, hints and rank, with dashes where you haven't played. Revised: each cell is your personal best on that board, finished or not, imported runs included: most found, then a ranked run, then fewest hints, then fastest. Unfinished runs show found/total instead of a time; only ranked runs show a rank.
  - Then the last 50 games: date, setup, found/total, time, hints, and a Ranked tag (with rank and "new best") or the unranked reason.
- **Delete account:** a confirm dialog like Give up, where you type your name to confirm.

**Routing:** a small hand-written router using the History API, with no library.

- Paths: `/`, `/signin`, `/leaderboards/:mode/:region`, `/me`. The `/api/*` paths are server-only.
- During play and review the URL stays `/`.
- Closing a card goes back to `/`. Unknown paths render setup.

## Code layout

```
worker/
  index.ts          route table, Origin/content-type guard, error mapping
  auth.ts           Google OAuth, fake mode, sessions, cookies, names
  games.ts          start, finish, claim
  replay.ts         log validation + replay (pure; unit-tested without D1)
  boards.ts         board and Your games queries, recompute
  crypto.ts         HMAC, random ids
  env.ts            Env type and the small D1 interface the Worker uses
migrations/0001_init.sql
src/game/ranking.ts       boards, compareRuns, constants (shared)
src/game/log.ts           action log types and recorder (shared)
src/api/client.ts         typed fetch wrappers, timeout, offline handling
src/api/session.ts        useSession() hook: user, signIn (redirect), setName, signOut
src/api/resume.ts         sessionStorage for claims and the review to restore
src/ui/SignInCard.tsx  src/ui/NameCard.tsx  src/ui/SaveCard.tsx  src/ui/Leaderboard.tsx
src/ui/YourGames.tsx   src/ui/UserMenu.tsx  src/ui/router.ts
scripts/recompute-bests.ts
```

`App.tsx` is already 479 lines. Routing and the card overlays go into a new `src/ui/Overlays.tsx`, so `App.tsx` only gains the start/finish calls and the log wrapper.

## Error handling

- **Network:** any API failure during play is silent. The game is never blocked by the server.
- **Save card:** shows "Couldn't save: Retry" when `/finish` fails. Retrying resends the same log; the server's `finished_at` is the first receipt.
- **Sign-in failure** (cancelled, state mismatch, Google error): "Sign-in didn't finish. Try again." as a toast. No details are leaked.
- **Name errors** appear inline under the field: "That name is taken." or "3–20 letters, numbers, spaces, - or _".
- **Session:** a 401 on a signed-in call clears the local session state and shows Sign in. It never logs a game out mid-play.
- **Worker:** all errors are caught at the router. Unexpected errors return `500 { error: 'server' }` and are logged with the request id, never with emails, tokens or codes.

## Testing

- **Unit tests (Vitest, Node):**
  - `replay.ts`:
    - An honest log replays to the same result the client computed. Covered for all three modes, plus a timeout.
    - Each doctored log is rejected:
      - an unknown id
      - finds after the end
      - a shortened clock
      - a pause hidden by shifting later timestamps
      - finds 50 ms apart
      - a rand outside [0, 1)
      - a reordered Locate queue
  - `ranking.ts`: `boardFor()` and `compareRuns()`.
  - Name rules, the `return` path check, ID-token claim checks, cookie building, PKCE challenge, and HMAC helpers.
  - A CPU check: replaying a 197-country Type log 1,000 times stays under 2 ms per replay.
- **Worker integration (Vitest in Node, calling the Worker's `fetch` with bindings from wrangler's `getPlatformProxy()`, so D1 is real and local):**
  - `@cloudflare/vitest-pool-workers` needs Vitest 4, so it isn't used.
  - Every endpoint.
  - The Google flow with Google's token endpoint mocked through a stubbed `fetch`:
    - a state mismatch
    - a wrong `aud`
    - an unverified email
    - a returning user (same `sub`, new email)
    - a cancelled sign-in
  - The game-start rate limit.
  - Claiming a game.
  - Ranked vs unranked outcomes.
  - The `bests` upsert, and recompute after a delete.
  - Delete account cascades.
  - The Origin guard, and fake mode being refused on non-localhost hosts.
- **E2E (Playwright against `wrangler dev`, local D1, `AUTH_MODE=fake`):**
  - Play a seeded South America Type game signed out, then sign in through fake mode: you come back to the same review, pick a name, and the game is claimed and appears on `/leaderboards/type/south-america`.
  - A paused run shows "Unranked: paused".
  - A deep link to `/leaderboards/locate/asia` opens that board.
  - Sign out.
  - Phone layout for the sign-in card.
  - The existing 13 v1 specs keep passing.
- **CI:** applies migrations to a local D1 before running the tests. The size budget check stays.

## Rollout

1. Luke creates the Google OAuth client (see Sign-in).
2. Create the D1 database, apply migrations, and set `GOOGLE_CLIENT_ID` (var) and the `GOOGLE_CLIENT_SECRET` and `AUTH_SECRET` secrets (`wrangler secret put`).
3. Deploy. v1 behaviour is unchanged for anyone who never signs in.
4. Update the README (stack, local dev with `wrangler dev`, migrations). Remove the Vercel files (`vercel.json`) and the Vercel row from the headers sync test.
