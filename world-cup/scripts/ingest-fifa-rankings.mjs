// ---------------------------------------------------------------------------
// ingest-fifa-rankings.mjs — fills each team's FIFA/Coca-Cola World Ranking
// position into src/data/teams.json (the `fifaRank` field, which ESPN does not
// expose).
//
// Source: FIFA's own men's ranking page at inside.fifa.com. The page is a
// Next.js app whose data is fetched from:
//   GET /api/ranking-overview?locale=en&dateId=<id>   → { rankings: [ {rankingItem:{rank,name,flag{src}}}, … ] }
// The list of valid <id>s isn't a separate endpoint — it's embedded in the
// page's __NEXT_DATA__ under pageData.ranking.dates (grouped by year, newest
// first). The most recent windows can be unpublished placeholders that return
// an empty `rankings` array, so we walk the dates newest-first and use the
// first id that actually returns a ranking.
//
// FIFA publishes a new ranking only a handful of times a year and NOT during a
// World Cup (the next release is after the final), so this is effectively a
// stable snapshot for the tournament. It still runs on the normal data cron
// (not the per-minute live loop) to stay fresh outside the event.
//
//   node scripts/ingest-fifa-rankings.mjs
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "src", "data");

const RANKING_PAGE = "https://inside.fifa.com/fifa-world-ranking/men";
const API = "https://inside.fifa.com/api/ranking-overview?locale=en&dateId=";

// FIFA rejects the default fetch UA; present a normal browser UA.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json,text/html",
};

const norm = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

async function getText(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Pull the date-id list out of the ranking page's __NEXT_DATA__, newest first.
function parseDateIds(html) {
  const m = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!m) throw new Error("no __NEXT_DATA__ on ranking page");
  const data = JSON.parse(m[1]);
  const groups = data?.props?.pageProps?.pageData?.ranking?.dates ?? [];
  // groups are year-buckets (newest first); each has a `dates` array (newest first).
  return groups.flatMap((g) => (g.dates ?? []).map((d) => d.id)).filter(Boolean);
}

async function main() {
  console.log("Fetching FIFA ranking page…");
  const html = await getText(RANKING_PAGE);
  const dateIds = parseDateIds(html);
  console.log(`  ${dateIds.length} ranking dates; trying newest first…`);

  let rankings = null;
  let usedId = null;
  for (const id of dateIds) {
    try {
      const json = JSON.parse(await getText(API + id));
      if (json.rankings?.length) {
        rankings = json.rankings;
        usedId = id;
        break;
      }
    } catch (e) {
      console.log(`  ${id}: ${e.message}`);
    }
  }
  if (!rankings) throw new Error("no published ranking found across all dates");
  console.log(`  using ${usedId} — ${rankings.length} teams ranked.`);

  // Index by FIFA 3-letter code (from the flag URL) and by normalized name.
  const byCode = new Map();
  const byName = new Map();
  for (const r of rankings) {
    const it = r.rankingItem;
    if (!it) continue;
    const code = (it.flag?.src?.match(/flags-sq-2\/([A-Z]+)/) || [])[1];
    if (code) byCode.set(code, it.rank);
    byName.set(norm(it.name), it.rank);
  }

  const teams = JSON.parse(readFileSync(join(DATA_DIR, "teams.json"), "utf8"));
  let matched = 0;
  const missing = [];
  for (const t of teams) {
    const rank = byCode.get(t.code) ?? byName.get(norm(t.name));
    if (rank != null) {
      t.fifaRank = rank;
      matched++;
    } else {
      missing.push(`${t.code}/${t.name}`);
    }
  }
  console.log(`  matched ${matched}/${teams.length} teams.`);
  if (missing.length) console.log(`  unmatched: ${missing.join(", ")}`);

  writeFileSync(join(DATA_DIR, "teams.json"), JSON.stringify(teams, null, 2) + "\n");
  console.log("Wrote teams.json with FIFA ranks.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
