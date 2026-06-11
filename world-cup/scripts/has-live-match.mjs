// Exits 0 if any match in src/data/matches.json is currently live, else 1.
// Used by the data workflow to decide whether to keep polling scores at a
// fast cadence (see .github/workflows/update-data.yml).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const matchesPath = join(here, "..", "src", "data", "matches.json");

try {
  const matches = JSON.parse(await readFile(matchesPath, "utf8"));
  const live = Array.isArray(matches) && matches.some((m) => m.status === "live");
  if (live) {
    const n = matches.filter((m) => m.status === "live").length;
    console.log(`${n} live match(es)`);
    process.exit(0);
  }
  console.log("no live matches");
  process.exit(1);
} catch (err) {
  // If we can't read the file, assume nothing is live so the job exits cleanly.
  console.error(`has-live-match: ${err.message}`);
  process.exit(1);
}
