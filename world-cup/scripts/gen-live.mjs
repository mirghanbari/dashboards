// ---------------------------------------------------------------------------
// gen-live.mjs — emits a slim public/live.json from src/data/matches.json.
//
// The full dataset is bundled into the JS at build time (a static import), so a
// loaded tab only sees new scores on a full reload. This tiny file is served as
// a stable static asset that the client polls (see src/data/live.ts) to update
// live-match cards in place. It carries only the fields a card needs and only
// the non-scheduled matches (live + finished), so it stays a few KB.
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

const matches = JSON.parse(readFileSync(MATCHES, "utf8"));
const live = matches
  .filter((m) => m.status !== "scheduled")
  .map(({ id, status, homeScore, awayScore, minute }) => ({
    id,
    status,
    homeScore,
    awayScore,
    minute,
  }));

mkdirSync(PUBLIC_DIR, { recursive: true });
writeFileSync(join(PUBLIC_DIR, "live.json"), JSON.stringify(live) + "\n");
console.log(`gen-live: wrote ${live.length} non-scheduled match(es) to public/live.json`);
