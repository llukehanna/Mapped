# Mapped v2: accounts and leaderboards

**Date:** 2026-10-05
**Status:** Approved in brainstorming; awaiting spec review
**Builds on:** [v1 design](2026-10-05-mapped-design.md)
**Mockups:** `.superpowers/brainstorm/39123-1791265063/content/accounts-screens.html` (local only)

Players can sign in with an emailed code. Signed-in players' games are saved, and complete, unpaused runs on standard setups go on public leaderboards ranked by fewest hints, then fastest time. Playing still needs no account.

## Decisions

| Question | Decision |
| --- | --- |
| Sign-in method | Email one-time code only. No passwords. |
| When an account is needed | Never to play. Finishing a game offers "Sign in to save this"; signing in then claims that game. |
| Which setups rank | 21 boards: each mode (Type, Locate, Identify) × World or exactly one whole continent. Any time limit. |
| Ranking | Fewest hints, then fastest time, then earliest finish. One best run per player per board. All-time only. |
| Anti-cheat | The server times each game, picks the target order, and replays the action log through the shared reducer. |
| Stack | One Cloudflare Worker for `/api/*`, D1 (SQLite), Resend for email. |
| Display identity | A unique display name chosen once at first sign-in. Emails are never shown. |
| Local bests | Kept exactly as in v1, and not migrated into accounts. |
| Layout | Sign-in, Leaderboards and Your games are centred cards over a dimmed map. The post-game save prompt is a card at bottom centre. |

## Non-goals

- Passwords, OAuth, passkeys, changing your email
- Weekly or monthly boards, friends, following, profiles of other players
- An admin UI (moderation is `wrangler d1 execute` and a recompute script)
- Bot detection beyond the replay check and speed floor (Turnstile is the fallback if sign-in abuse appears)
- Vercel hosting (dropped; D1 is Cloudflare-only)

## Architecture

```
browser ──/assets, /, /leaderboards/…──▶ Workers static assets (no Worker runs)
        ──/api/*─────────────────────▶ Worker (worker/index.ts)
                                          ├─ D1 database  (binding DB)
                                          ├─ Resend HTTP API (secret RESEND_API_KEY)
                                          └─ src/game/*  (shared reducer, scope, rng)
```

- `wrangler.jsonc` gains `main: "worker/index.ts"`, a `d1_databases` binding `DB`, and `assets.run_worker_first: ["/api/*"]`, so the Worker only ever runs for API calls. `assets.not_found_handling` changes from `404-page` to `single-page-application` so client routes load the app.
- Secrets: `RESEND_API_KEY`, and `AUTH_SECRET`, an HMAC key for hashing login codes and session tokens.
- Vars: `MAIL_MODE` (`resend` in production, `log` locally and in tests), `APP_ORIGIN`.
- Schema migrations live in `migrations/` and run with `wrangler d1 migrations apply`.
- The Worker imports `src/game/reducer.ts`, `scope.ts`, `rng.ts` and `src/data/countries.ts` directly. It never imports React or anything under `src/ui`.

### Free-plan fit

| Resource | Free limit | Mapped usage |
| --- | --- | --- |
| Worker requests | 100k/day | Only `/api/*` calls: about 3–6 per game, plus board views |
| Worker CPU | 10 ms per request | Replaying a 197-country game is well under 5 ms; measured in tests |
| D1 | 5M rows read and 100k rows written per day; 5 GB | About 3–5 writes per game; board reads are indexed |
| Resend | 100 emails/day, 3,000/month | Capped at 90 codes/day by the Worker |

Sources: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Resend pricing](https://resend.com/pricing). Cloudflare's own [Email Sending](https://developers.cloudflare.com/email-service/) needs the paid Workers plan to reach arbitrary recipients, so it isn't used.

## Data model (D1)

```sql
users (
  id TEXT PRIMARY KEY,            -- random 128-bit, base64url
  email TEXT NOT NULL UNIQUE,     -- trimmed, lowercased
  name TEXT,                      -- null until chosen
  name_key TEXT UNIQUE,           -- lowercased name, for case-insensitive uniqueness
  created_at INTEGER NOT NULL
)
login_codes (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  ip_hash TEXT NOT NULL,          -- HMAC of the client IP; never the raw IP
  code_hash TEXT NOT NULL,        -- HMAC(AUTH_SECRET, email + code)
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,    -- created + 10 min
  attempts_left INTEGER NOT NULL, -- starts at 5
  used_at INTEGER                 -- set on success or when superseded by a newer code
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
  ip_hash TEXT NOT NULL,
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
INDEX codes_email ON login_codes (email, created_at)
INDEX codes_ip ON login_codes (ip_hash, created_at)
```

**Housekeeping, done lazily on writes (no cron):**

- Unclaimed games older than 24 hours are deleted when a game starts, at most 50 rows per call.
- Login codes older than 2 days are deleted when a code is issued.
- Expired sessions are deleted when someone signs in.

## API

All bodies are JSON. Every non-GET request must carry `Content-Type: application/json` and an `Origin` equal to `APP_ORIGIN`; anything else gets a 403. Errors look like `{ "error": "<code>", "message": "<human text>" }`.

| Method and path | Body / query | Response |
| --- | --- | --- |
| `POST /api/auth/code` | `{ email }` | `200 {}` whether or not the account exists. `429 { retryAfter }` when rate limited; `503 busy` when the daily cap is hit. |
| `POST /api/auth/verify` | `{ email, code }` | `200 { user: { name } }` and sets the session cookie; `name` is null for a new account. `400 wrong_code { attemptsLeft }`; `410 expired`. |
| `GET /api/auth/name?name=` | — | `{ available, reason? }` for the live check while typing |
| `POST /api/auth/name` | `{ name }` | `200 { user }`, `409 taken` or `400 invalid`. Only allowed while the name is null. |
| `POST /api/auth/signout` | — | Deletes the session and clears the cookie |
| `GET /api/me` | — | `{ user: { name } | null }` |
| `DELETE /api/me` | `{ confirm: name }` | Deletes the user and, by cascade, their sessions, games and bests. Clears the cookie. |
| `POST /api/games` | `{ config }` | `{ id, claim, seed, board }`. Owned from the start when signed in. `claim` is null when signed in. |
| `POST /api/games/:id/finish` | `{ log }` | `{ found, total, hints, ms, endReason, ranked, reason?, rank?, newBest?, wouldRank? }` |
| `POST /api/games/claim` | `{ claims: [{ id, claim }] }` | The same result shape per claimed game, now owned |
| `GET /api/boards/:mode/:region` | — | `{ rows: top 50 [{ rank, name, hints, ms, finishedAt }], players, you?: row }` |
| `GET /api/me/games` | — | `{ bests: [{ board, hints, ms, rank }], recent: last 50 games }` |

**Session cookie:** `__Host-mapped_session=<random 256-bit>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`.

## Sign-in

1. **Email.** `POST /api/auth/code`.
   - Normalizes the email and checks the rate limits.
   - Marks any older unused code for that email as used, then stores the new code's HMAC.
   - Sends "Your Mapped code is 481 207", in both the subject and the body, from `Mapped <signin@lukeghanna.com>`.
2. **Code.** Six boxes with `autocomplete="one-time-code"` and `inputmode="numeric"`. Pasting the full code fills all six.
   - A wrong code decrements `attempts_left`; at zero, that code is dead.
   - A correct code marks it used, creates the user if they're new, and creates a session.
3. **Name.** New accounts only. 3–20 characters from `[A-Za-z0-9 _-]`, trimmed, with no double spaces. Unique by `name_key`.
   - While the name is null, the user can't appear on boards. Their ranked games are still recorded, and their bests take effect once a name exists.

**Rate limits:** each is a count over `login_codes` rows, so no extra writes are needed.

- Per email: one code per 60 s, and at most 5 per hour.
- Per IP hash: at most 10 codes per hour.
- Site-wide: at most 90 codes per rolling 24 h. Past that, the card shows "Sign-in is busy right now. Try again tomorrow." The game keeps working.
- Game starts: at most 200 per IP hash per hour, counted over `games`.

**Mail mode:** with `MAIL_MODE=log`, codes are written to the Worker log and returned by a dev-only `GET /api/dev/last-code?email=` for tests. That endpoint returns 404 unless `MAIL_MODE=log` *and* the request host is `localhost` or `127.0.0.1`. If the Worker sees `MAIL_MODE=log` on any other host, it refuses every auth request with a 500.

**DNS (one-time setup):** add Resend's DKIM and SPF records for `lukeghanna.com`, using Resend's send subdomain so existing mail for the domain is unaffected.

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

**Constants** (`src/game/ranking.ts`, shared by client and server): `MIN_FIND_GAP_MS = 100`, `MIN_MS_PER_COUNTRY = 300`, `CLOCK_TOLERANCE_MS = 2000`, `BOARD_REGIONS = ['world', 'africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania']`, `boardFor(config)`, `compareRuns(a, b)`.

**Known gaps:**

- **Fabricated logs at human speed.** A bot that submits a made-up log at believable human speed passes.
- **Hint counts.** Hints are computed in the browser from bundled data, so a modified client could use hints and leave them out of the log. The server can't tell that apart from a player looking answers up in another tab, which no quiz can prevent.

The answer to both is manual deletion followed by `npm run recompute-bests`.

## Screens

All new screens use the v1 tokens and glass styles and work in both themes. On phones (<768 px) each card becomes a bottom sheet, as setup and review already do.

- **Corner during setup** (top right): a Leaderboards link (trophy icon), then either a Sign in button or the name chip, then the theme toggle.
  - The name chip opens a menu: "Signed in as m•••@gmail.com", Your games, Leaderboards, Sign out, Delete account….
- **Sign-in card** (`/signin`, or opened from the save prompt): a centred card over a dimmed map.
  - Three steps with a progress bar: Email, then "Check your email" with six code boxes, "← Different email" and "Resend in 0:42", then "Pick a name" with a live availability check.
  - "Not now" closes it. Esc closes it.
  - Afterwards it returns to wherever it was opened from. From review, the just-finished game is claimed and the save card updates.
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
  - A 7×3 grid of your bests: time, hints and rank, with dashes where you haven't played.
  - Then the last 50 games: date, setup, found/total, time, hints, and a Ranked tag (with rank and "new best") or the unranked reason.
- **Delete account:** a confirm dialog like Give up, where you type your name to confirm.

**Routing:** a small hand-written router using the History API, with no library.

- Paths: `/`, `/signin`, `/leaderboards/:mode/:region`, `/me`.
- During play and review the URL stays `/`.
- Closing a card goes back to `/`. Unknown paths render setup.

## Code layout

```
worker/
  index.ts          route table, Origin/content-type guard, error mapping
  auth.ts           codes, sessions, cookies, rate limits
  games.ts          start, finish, claim
  replay.ts         log validation + replay (pure; unit-tested without D1)
  boards.ts         board and Your games queries, recompute
  mail.ts           Resend + log modes
  crypto.ts         HMAC, random ids
  env.d.ts
migrations/0001_init.sql
src/game/ranking.ts       boards, compareRuns, constants (shared)
src/game/log.ts           action log types and recorder (shared)
src/api/client.ts         typed fetch wrappers, timeout, offline handling
src/api/session.ts        useSession() hook: user, signIn steps, signOut
src/ui/SignInCard.tsx  src/ui/SaveCard.tsx  src/ui/Leaderboard.tsx
src/ui/YourGames.tsx   src/ui/UserMenu.tsx  src/ui/router.ts
scripts/recompute-bests.ts
```

`App.tsx` is already 479 lines. Routing and the card overlays go into a new `src/ui/Overlays.tsx`, so `App.tsx` only gains the start/finish calls and the log wrapper.

## Error handling

- **Network:** any API failure during play is silent. The game is never blocked by the server.
- **Save card:** shows "Couldn't save: Retry" when `/finish` fails. Retrying resends the same log; the server's `finished_at` is the first receipt.
- **Sign-in errors** appear inline under the field:
  - Wrong code: "That code isn't right. 3 tries left."
  - Expired: "That code expired. Send a new one."
  - Rate limited: "Wait 0:42 before asking for another code."
  - Busy: as above.
- **Session:** a 401 on a signed-in call clears the local session state and shows Sign in. It never logs a game out mid-play.
- **Worker:** all errors are caught at the router. Unexpected errors return `500 { error: 'server' }` and are logged with the request id, never with emails or codes.

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
  - Name rules, email normalization, cookie building, and HMAC helpers.
  - A CPU check: replaying a 197-country Type log 1,000 times stays under 2 ms per replay.
- **Worker integration (`@cloudflare/vitest-pool-workers`, real local D1):**
  - Every endpoint.
  - The code flow: a wrong code, expiry, a superseded code.
  - Every rate limit and the daily cap.
  - Claiming a game.
  - Ranked vs unranked outcomes.
  - The `bests` upsert, and recompute after a delete.
  - Delete account cascades.
  - The Origin guard, and the dev endpoint being unreachable on non-localhost hosts.
  - Compatibility with Vitest 5 gets confirmed first in planning. If it doesn't work, use Miniflare's API directly from Vitest instead.
- **E2E (Playwright against `wrangler dev`, local D1, `MAIL_MODE=log`):**
  - Play a seeded Europe Type game signed out, finish, sign in via the dev code endpoint, pick a name: the game is claimed and appears at its rank on `/leaderboards/type/europe`.
  - A paused run shows "Unranked: paused".
  - A deep link to `/leaderboards/locate/asia` opens that board.
  - Sign out.
  - Phone layout for the sign-in sheet.
  - The existing 13 v1 specs keep passing.
- **CI:** applies migrations to a local D1 before running the tests. The size budget check stays.

## Rollout

1. Create the D1 database, apply migrations, and set secrets (`wrangler secret put`).
2. Add the Resend DNS records and verify the domain in Resend.
3. Deploy. v1 behaviour is unchanged for anyone who never signs in.
4. Update the README (stack, local dev with `wrangler dev`, migrations). Remove the Vercel files (`vercel.json`) and the Vercel row from the headers sync test.
