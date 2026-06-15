// ---------------------------------------------------------------------------
// gen-live.mjs — emits a slim public/live.json from src/data/matches.json.
//
// The full dataset is bundled into the JS at build time (a static import), so a
// loaded tab only sees new scores on a full reload. This tiny file is served as
// a stable static asset that the client polls (see src/data/live.ts) to update
// match cards AND the match-detail page in place.
//
// Every non-scheduled match carries the slim card fields (score/status/minute).
// Matches that are live — or finished within the last few hours, so a tab
// watching one through full time keeps the final picture — ALSO carry the
// heavier `timeline` and `stats` the detail page renders. Older finished matches
// stay slim: their complete timeline/stats are already in the build-time bundle,
// so the file stays a few KB instead of growing with all 104 fixtures.
//
// Run as a prebuild step (see package.json `build`); it regenerates from the
// committed matches.json on every deploy, so it can't drift and isn't committed.
//   node scripts/gen-live.mjs
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MATCHES = join(__dirname, "..", "src", "data", "matches.json");
const PUBLIC_DIR = join(__dirname, "..", "public");

// Include heavy detail fields for finished matches whose kickoff was within this
// window of build time (a match runs ~2h; 5h leaves a comfortable buffer).
const RECENT_MS = 5 * 60 * 60 * 1000;
const now = Date.now();

const matches = JSON.parse(readFileSync(MATCHES, "utf8"));
const live = matches
  .filter((m) => m.status !== "scheduled")
  .map((m) => {
    const slim = {
      id: m.id,
      status: m.status,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      minute: m.minute,
    };
    const recentlyFinished =
      m.status === "finished" && now - new Date(m.date).getTime() <= RECENT_MS;
    if (m.status === "live" || recentlyFinished) {
      // Carry the detail-page fields too (omit if absent to keep it tight).
      if (m.timeline) slim.timeline = m.timeline;
      if (m.stats) slim.stats = m.stats;
    }
    return slim;
  });

mkdirSync(PUBLIC_DIR, { recursive: true });
writeFileSync(join(PUBLIC_DIR, "live.json"), JSON.stringify(live) + "\n");
console.log(`gen-live: wrote ${live.length} non-scheduled match(es) to public/live.json`);
