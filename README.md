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

There are 21 boards: each mode for the World and for each continent. A run counts when it finds every country without pausing. Boards rank by fewest hints, then fastest time. Signing in adds this browser's earlier games to your account, plus any bests it saved before accounts existed (unranked). Your games shows your best run on each board even if you didn't finish it: most countries found, then fewest hints, then fastest.

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

`npm run deploy` refuses to run while `REPLACE_WITH_` placeholders remain in wrangler.jsonc.
