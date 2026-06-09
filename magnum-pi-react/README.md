# Magnum, P.I. — Top 25 Episodes Dashboard (React + TypeScript)

A React + TypeScript + Vite port of the Magnum, P.I. top-25 episodes dashboard.
Same look and data as the static version, rebuilt as typed components with React
state for search, sort, and season filtering.

## Requirements
- Node.js 18+ (Vite 5 requires Node 18 or 20+)

## Run it locally
```bash
cd ~/code/dashboards/magnum-pi-react
npm install      # first time only
npm run dev      # start the dev server
```
Vite prints a local URL (default http://localhost:5173) — open it in your browser.
Hot-reload is on, so edits update instantly.

## Other scripts
| Command | What it does |
|---------|--------------|
| `npm run dev`       | Start the dev server with hot reload |
| `npm run build`     | Type-check (`tsc`) and build to `dist/` |
| `npm run preview`   | Serve the production build locally |
| `npm run typecheck` | Type-check only, no build |

## Project structure
```
src/
  main.tsx                 # React entry point
  App.tsx                  # State (search/sort/filter) + layout
  types.ts                 # Episode + SortKey types
  data.ts                  # The 25 episodes (typed) — edit here to update data
  index.css                # Styles (Hawaiian-sunset theme)
  components/
    Hero.tsx
    Stats.tsx              # Summary stat cards
    Controls.tsx           # Search box, sort dropdown, season chips
    EpisodeCard.tsx        # Individual episode card
```

## Scoring
Composite 10-point scale blending IMDb/fan ratings (episode.ninja, episodehive)
with editorial/critical consensus (ScreenRant, AV Club). Numbering and synopses
from Wikipedia. See `src/data.ts` for the full note on Season 1 representation.

## Adding to git
This folder is ready to commit (`node_modules`/`dist` are gitignored):
```bash
cd ~/code/dashboards/magnum-pi-react
git init
git add .
git commit -m "Add React+TS Magnum P.I. dashboard"
```
