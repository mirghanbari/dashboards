# World Cup 2026 Dashboard

A React + TypeScript + Vite dashboard tracking the FIFA World Cup 2026 — every
game, all 48 teams, real squads, and player/team stats — with a navbar, footer,
and a small set of focused pages. **All teams, groups, squads, and fixtures are
real data pulled from ESPN's public API**, refreshed on a schedule.

## Pages

| Page | What it shows |
| --- | --- |
| **Overview** (`/`) | Tournament summary, key stats, charts, live games, top scorers, latest & upcoming matches |
| **Matches** (`/matches`) | Every fixture, filterable by stage / group / status, grouped by day — plus a **bracket** view |
| **Teams** (`/teams`) | Live standings for all 12 groups; click a team for its detail page |
| **Team detail** (`/teams/:id`) | Group position, record, full squad by position, fixtures |
| **Players** (`/players`) | All ~1,245 players, searchable and sortable |
| **Player detail** (`/players/:id`) | Bio + per-player stats |
| **Stats** (`/stats`) | Every tracked metric (basic → elite), each linked to its leading players/teams, with data-source labels |
| **Friendlies** (`/friendlies`) | International friendlies (POC): live scores, goal scorers, assists, cards, and team records from ESPN's `fifa.friendly` feed |

Routing uses `HashRouter` so deep links work on GitHub Pages without server config.

## Run locally

```bash
cd world-cup
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # type-check + production build into dist/
npm run preview      # serve the production build
npm run ingest             # rebuild src/data/ from ESPN's live API (no key needed)
npm run ingest:friendlies  # rebuild friendlies.json from ESPN's fifa.friendly feed
npm run fetch-data         # optional: LLM agent for stats ESPN doesn't expose (needs ANTHROPIC_API_KEY)
```

## Where the data lives

The app reads four JSON files imported at build time:

```
src/data/meta.json      tournament metadata + last-updated stamp
src/data/teams.json     48 real teams with group, record, team-level stats
src/data/matches.json   104 real fixtures (72 group + 32 knockout)
src/data/players.json   ~1,245 real players with bios + full stat schema
```

`src/data/index.ts` wraps them with typed accessors (standings, top scorers,
bracket, chart aggregations). **This is real data**, produced by
`scripts/ingest-espn.mjs` from ESPN's public API — not generated/sample data.

## Refreshing the data — `scripts/ingest-espn.mjs`

The primary updater. It rebuilds the dataset from ESPN's public JSON API
(`site.api.espn.com`) — **no API key required**:

```bash
npm run ingest
```

| Source | Gives |
| --- | --- |
| `…/standings` | 12 groups, the 48 teams, live group records |
| `…/teams/{id}/roster` | real squad bios (name, number, position, age, height, weight) |
| `…/scoreboard?dates=…` | real fixtures (date, venue, teams, score, status) |

Run on a schedule, this keeps groups, squads, fixtures, scores, and standings
current throughout the tournament.

## Stats sourcing (important)

The Stats page tracks every metric you'd expect, in three tiers — but **not all
of them are freely available**, and the UI labels each metric with where its
value comes from so nothing fake is ever shown as real:

| Source badge | Meaning | Examples |
| --- | --- | --- |
| **ESPN · live** | From ESPN's match feed | goals, assists, shots on target |
| **Derived** | Computed from other tracked stats | shot accuracy %, xG overperformance |
| **FBref/Opta** | Event data, addable as matches are played | xG, xA, tackles, progressive passes, PPDA |
| **Tracking provider** | Needs StatsBomb / Opta / SkillCorner | OBV, xT, VAEP, high-speed running, sprint count, set-piece xG |

The **elite/tracking** metrics come from optical/positional tracking data and
require a paid provider feed. The schema and UI are ready for them; wire a
provider into the ingestion and they populate automatically. Until then they're
shown empty rather than invented.

## Optional LLM agent — `scripts/fetch-data.mjs`

A supplementary agent that calls Claude (`claude-opus-4-8`) with web search to
fill stats ESPN doesn't surface cleanly. Optional and not in the default
workflow; exits cleanly if `ANTHROPIC_API_KEY` is unset.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run fetch-data
```

## Deploying to GitHub Pages

Two workflows live at the **repository root** in `.github/workflows/` (GitHub only
runs workflows from there, not from subfolders):

- **`deploy.yml`** — builds `world-cup/` and publishes `dist/` to Pages on every
  push to `main` that touches `world-cup/**`.
- **`update-data.yml`** — runs `npm run ingest` (ESPN) every 30 minutes, commits
  refreshed JSON, which then triggers a redeploy. No secret required.

Pages is configured to build from **GitHub Actions** (Settings → Pages → Source).
The Vite `base` is `"/dashboards/"`, matching the project-page URL:

**Live:** https://mirghanbari.github.io/dashboards/
