# Mapped

How well do you know the map? Name every country, find them by clicking, or identify the highlighted one. Live at [mapped.lukeghanna.com](https://mapped.lukeghanna.com).

No accounts and no backend. Each game starts fresh; best results stay in your browser.

## Modes

- **Type**: name them all, in any order. Exact names count as you type, and typos are forgiven on Enter when only one country is that close.
- **Locate**: you're given a name; click the country. You get 3 tries.
- **Identify**: a country lights up; type its name.

Pick any mix of continents and subregions, and a time limit (or none, for a stopwatch).

## Stack

- **Vite**, **React 19** and **TypeScript**, with no backend
- **d3-geo** and **d3-zoom** drawing Natural Earth 1:50m shapes (public domain, via `world-atlas`) as SVG
- **Vitest** unit tests and **Playwright** end-to-end tests
- Served as **Cloudflare Workers static assets**; `vercel.json` makes it deployable to Vercel unchanged

## Running locally

Requires Node 24 or newer.

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests |
| `npm run e2e` | Playwright end-to-end tests (builds first) |
| `npm run geo` | Rebuild `src/data/world.topo.json` from Natural Earth |
| `npm run build` | Typecheck, build, enforce the size budget |
| `npm run deploy` | Build and deploy to Cloudflare |
