# Mapped

[![CI](https://github.com/llukehanna/Mapped/actions/workflows/ci.yml/badge.svg)](https://github.com/llukehanna/Mapped/actions/workflows/ci.yml)

How well do you know the map? Name every country, find them by clicking, or identify the highlighted one. Pick a topic: Countries, Flags (a flag, name its country) or Capitals (a country, name its capital; or a capital, find its country). Live at [mapped.lukeghanna.com](https://mapped.lukeghanna.com).

Anyone can play. Sign in with Google to save your games and get on the leaderboards.

## Modes

- **Type**: name them all, in any order. Exact names count as you type, and typos are forgiven on Enter when only one country is that close.
- **Locate**: you're given a name; click the country. You get 3 tries.
- **Identify**: a country lights up; type its name.

The bullets above describe Countries. The modes work on every topic. In Flags, Type shows a flag and you name its country, Locate asks you to click the flag's country, and Identify lights up a country and offers four flags. In Capitals, every game names the country: Type asks you to type the named country's capital, Identify offers four capitals to pick from, and Locate gives you a capital and you click its country (the hard one).

Hints are there if you're stuck, and they cost you on the leaderboard. Flags · Type has five: the region first, then the first letter, the letter count, the first and last letters, and every other letter.

Pick any mix of continents and subregions, and a time limit (or none, for a stopwatch).

## Learn

Flags has an opt-in **Play | Learn** switch at the top of the setup card. Learn is a drill for getting to know the flags, with no timer pressure and no leaderboard. You see a flag and pick its country from 4 names. Get one wrong and it comes back 3 cards later; get it right twice in a row and it's learned. The round ends when every flag in it is learned.

Progress is kept on this browser only, with a Reset link on the setup card. Nothing is sent to the server. Play is always available alongside it.

## Leaderboards

There are 63 boards: 3 topics × 3 modes × 7 regions (the World and each continent). Capitals · Type and Identify runs from before the rules changed show up in Your games as "Unranked: older rules". Boards rank by most countries found, then fewest hints, then fastest time, so unfinished runs count too (a run that found nothing doesn't). Signing in adds this browser's earlier games to your account, plus any bests it saved before accounts existed (unranked). Your games shows your best run on each board even if you didn't finish it: most countries found, then fewest hints, then fastest.

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
| `npm run build-flags` | Rebuild the self-hosted flag SVGs in `public/flags/` from flag-icons |
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

## Credits

Flags from [flag-icons](https://github.com/lipis/flag-icons) (MIT).
