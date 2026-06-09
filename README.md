# Dashboards

A collection of small, self-contained dashboards.

## Projects

### [`magnum-pi/`](./magnum-pi) — Magnum, P.I. Top 25 (static)
A zero-dependency static dashboard (HTML/CSS/vanilla JS) ranking the 25 best
episodes of the original *Magnum, P.I.* (1980–1988). Open `index.html` directly,
or serve it with `python3 -m http.server`.

### [`magnum-pi-react/`](./magnum-pi-react) — Magnum, P.I. Top 25 (React + TypeScript)
The same dashboard rebuilt with React + TypeScript + Vite.
```bash
cd magnum-pi-react
npm install
npm run dev
```

### [`world-cup/`](./world-cup) — FIFA World Cup 2026 (React + TypeScript)
A multi-page dashboard tracking all games, 48 teams, squads, and player stats,
with a nav, footer, and four pages. Ships with realistic sample data and an AI
agent (`scripts/fetch-data.mjs`) that refreshes live data from the web on a
schedule via GitHub Actions.
```bash
cd world-cup
npm install
npm run dev
```

See each project's own `README.md` for details.
