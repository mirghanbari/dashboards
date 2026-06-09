# Magnum, P.I. — Top 25 Episodes Dashboard

A small, self-contained dashboard ranking the 25 best episodes of the original
*Magnum, P.I.* (1980–1988) series. No build step, no dependencies — just static
HTML, CSS, and vanilla JavaScript.

## Features
- Summary stat cards (episode count, average score, top score, most-featured season)
- Live search across titles and synopses
- Sort by rank, score, season, or title
- Filter by season with chips
- Color-coded score bars and responsive card grid

## Run it locally

**Option A — just open the file:**
Double-click `index.html`, or open it in your browser. Everything works from
`file://` because the data is embedded in `data.js`.

**Option B — serve it (recommended for a clean URL):**
```bash
cd ~/code/dashboards/magnum-pi
python3 -m http.server 8000
```
Then visit http://localhost:8000

## Files
| File | Purpose |
|------|---------|
| `index.html` | Page structure |
| `styles.css` | Styling (Hawaiian-sunset theme) |
| `app.js`     | Search, sort, filter, rendering |
| `data.js`    | The 20 episodes + scores (edit here to update data) |

## Scoring
Each episode is scored on a 10-point scale — a composite blending IMDb fan
ratings (via episode.ninja) with editorial/critical consensus (ScreenRant, AV
Club). Season/episode numbering and synopses are from Wikipedia.

## Adding to git
This folder is ready to commit. From `~/code/dashboards`:
```bash
git init
git add magnum-pi
git commit -m "Add Magnum P.I. top-20 episodes dashboard"
```
