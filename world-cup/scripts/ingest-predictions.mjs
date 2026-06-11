// ---------------------------------------------------------------------------
// ingest-predictions.mjs — pulls World Cup 2026 title odds from the DTAI Sports
// Analytics Lab (KU Leuven) and writes them into src/data/predictions.json.
//
// DTAI runs 20,000 Monte-Carlo simulations of the whole tournament and updates
// after every game (https://dtai.cs.kuleuven.be/sports/worldcup2026/). Their
// interactive page fetches a raw per-team file, data.json, where each team
// carries a `probabilities` map keyed by bracket-slot nodes:
//   gA1..gA4  → finish 1st..4th in the group
//   na1..na16 / nb1..nb16            → the 32 Round-of-32 slots
//   na2x/nb2x, na3x/nb3x, … na6x/nb6x → R16, QF, SF, Final, Champion slots
// A team can reach a given round through several slots, so a stage probability
// is the SUM of `p` over all nodes in that round — not a single value.
//
// The node→round patterns below are lifted verbatim from DTAI's own bundle
// (the `qi={0:"Round of 32",…,5:"Champion"}` aggregation), so the numbers we
// store match what their site shows.
//
//   node scripts/ingest-predictions.mjs
//
// In CI it runs from .github/workflows/update-data.yml on the same schedule as
// the ESPN refresh, so the site tracks DTAI's updates within ~30 minutes.
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "src", "data");

const SOURCE = "DTAI Sports Analytics Lab — KU Leuven";
const SOURCE_URL = "https://dtai.cs.kuleuven.be/sports/worldcup2026/";
const BLOG_URL =
  "https://dtai.cs.kuleuven.be/sports/blog/predicting-the-2026-world-cup:-can-anyone-stop-spain/";
const METHOD = "20,000 Monte-Carlo tournament simulations, updated after each game";
const DATA_JSON = "https://dtai.cs.kuleuven.be/sports/worldcup2026/data/data.json";
// Single-game head-to-head matrix: {CODE: {OPP_CODE: {win, tie, loss}}}, where
// `win` is the row team's chance of beating the column team in one neutral game.
const H2H_JSON = "https://dtai.cs.kuleuven.be/sports/worldcup2026/data/predictions.json";
// Team strength ratings that feed the simulation: Name,Elo,Odm_off,Off,Odm_def,Def
// (Odm_* duplicate Off/Def). `Elo` = overall; `Off` = attack (higher better);
// `Def` = defense, NEGATIVE (more negative = stronger). Keyed by full country name.
const RATINGS_CSV = "https://dtai.cs.kuleuven.be/sports/worldcup2026/data/ratings.csv";

// DTAI's server is a plain academic host, but it rejects the default fetch UA,
// so we present a browser UA like a normal visitor.
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Referer: SOURCE_URL,
  Accept: "application/json",
};

// node→round matchers, straight from DTAI's aggregation. Round of 32 is the
// special case (a bare slot number 1–16); every later round is `n[ab]<r><…>`
// where the leading digit is the round (2=R16 … 6=Champion).
const ROUND = {
  advance: /^n[ab]([1-9]|1[0-6])$/i, // reach the Round of 32 (knockouts)
  round16: /^n[ab]2[0-9]+$/i,
  quarter: /^n[ab]3[0-9]+$/i,
  semi: /^n[ab]4[0-9]+$/i,
  final: /^n[ab]5[0-9]+$/i,
  champion: /^n[ab]6[0-9]+$/i,
};

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

const round2 = (n) => Math.round(n * 10000) / 10000; // keep 4 dp (fractions)

async function getText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

// Strip accents/punctuation/case so country names join across sources.
const norm = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// teams.json name (normalized) → ratings.csv name (normalized), where they differ.
const RATING_ALIASES = {
  "bosnia herzegovina": "bosnia and herzegovina",
  turkiye: "turkey",
  "congo dr": "dr congo",
};

async function main() {
  console.log("Fetching DTAI World Cup simulation data…");
  const sim = await getJson(DATA_JSON);
  if (!Array.isArray(sim)) throw new Error("Unexpected data.json shape (not an array)");
  console.log(`  ${sim.length} teams in the simulation.`);

  // Join DTAI's 3-letter codes to our teams.json (same FIFA codes) for id+flag.
  const ourTeams = JSON.parse(readFileSync(join(DATA_DIR, "teams.json"), "utf8"));
  const byCode = new Map(ourTeams.map((t) => [t.code.toUpperCase(), t]));

  const unmatched = [];
  const teams = sim.map((t) => {
    const probs = t.probabilities ?? {};
    const sum = (re) =>
      Object.entries(probs).reduce(
        (acc, [node, v]) => acc + (re.test(node) ? v.p ?? 0 : 0),
        0,
      );
    // Group finish: gX1 is "win the group".
    const winGroup = Object.entries(probs)
      .filter(([node]) => /^g[A-Z]1$/i.test(node))
      .reduce((acc, [, v]) => acc + (v.p ?? 0), 0);

    const code = String(t.name).toUpperCase();
    const ours = byCode.get(code);
    if (!ours) unmatched.push(code);

    return {
      code,
      teamId: ours?.id ?? null,
      name: ours?.name ?? code,
      flag: ours?.flag ?? "🏳️",
      group: t.group ?? ours?.group ?? "",
      winGroup: round2(winGroup),
      advance: round2(sum(ROUND.advance)),
      round16: round2(sum(ROUND.round16)),
      quarter: round2(sum(ROUND.quarter)),
      semi: round2(sum(ROUND.semi)),
      final: round2(sum(ROUND.final)),
      champion: round2(sum(ROUND.champion)),
    };
  });

  // Sort by title odds — the headline "can anyone stop Spain" ordering.
  teams.sort((a, b) => b.champion - a.champion || b.final - a.final);

  if (unmatched.length)
    console.log(`  Codes with no teams.json match: ${unmatched.join(", ")}`);

  // ---- team strength ratings (input to the simulation) -------------------
  console.log("Fetching DTAI team ratings…");
  const csv = await getText(RATINGS_CSV);
  const ratingByName = new Map(); // normalized name → { elo, off, def }
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    // Split from the right so a comma inside a country name can't shift columns.
    const parts = line.split(",");
    const def = Number(parts.pop());
    parts.pop(); // Odm_def (duplicate of Def)
    const off = Number(parts.pop());
    parts.pop(); // Odm_off (duplicate of Off)
    const elo = Number(parts.pop());
    const name = parts.join(",");
    if (name) ratingByName.set(norm(name), { elo, off, def });
  }

  const noRating = [];
  for (const t of teams) {
    const ours = byCode.get(t.code);
    const key = ours ? norm(ours.name) : "";
    const r = ratingByName.get(RATING_ALIASES[key] ?? key);
    if (!r) {
      noRating.push(t.code);
      t.elo = t.off = t.def = t.attack = t.defense = null;
    } else {
      t.elo = Math.round(r.elo * 10) / 10;
      t.off = round2(r.off);
      t.def = round2(r.def);
    }
  }
  if (noRating.length) console.log(`  No rating match: ${noRating.join(", ")}`);

  // Normalize attack (Off) and defensive strength (−Def) to 0..1 across the WC
  // field, so a full bar = the strongest of the 48 teams in that dimension.
  const offs = teams.filter((t) => t.off != null).map((t) => t.off);
  const defStr = teams.filter((t) => t.def != null).map((t) => -t.def);
  const span = (arr) => {
    const lo = Math.min(...arr);
    const hi = Math.max(...arr);
    return (v) => (hi > lo ? round2((v - lo) / (hi - lo)) : 0.5);
  };
  const attackScale = span(offs);
  const defenseScale = span(defStr);
  for (const t of teams) {
    if (t.off == null) continue;
    t.attack = attackScale(t.off);
    t.defense = defenseScale(-t.def);
  }

  const out = {
    source: SOURCE,
    sourceUrl: SOURCE_URL,
    blogUrl: BLOG_URL,
    method: METHOD,
    fetchedAt: new Date().toISOString(),
    teams,
  };

  writeFileSync(
    join(DATA_DIR, "predictions.json"),
    JSON.stringify(out, null, 2) + "\n",
  );

  const top = teams.slice(0, 5).map((t) => `${t.code} ${Math.round(t.champion * 100)}%`);
  console.log(`Wrote src/data/predictions.json — title odds: ${top.join(", ")}`);

  // ---- head-to-head single-game matrix ----------------------------------
  console.log("Fetching DTAI head-to-head matrix…");
  const h2hRaw = await getJson(H2H_JSON);
  const idOf = (code) => byCode.get(String(code).toUpperCase())?.id ?? null;

  // Re-key by our lowercase team ids so the frontend can look up directly with
  // a match's homeTeamId / awayTeamId. Drop any code we can't map.
  const matrix = {};
  let pairs = 0;
  const skippedCodes = new Set();
  for (const [rowCode, opps] of Object.entries(h2hRaw)) {
    const rowId = idOf(rowCode);
    if (!rowId) {
      skippedCodes.add(rowCode);
      continue;
    }
    const row = {};
    for (const [colCode, p] of Object.entries(opps)) {
      const colId = idOf(colCode);
      if (!colId) {
        skippedCodes.add(colCode);
        continue;
      }
      row[colId] = {
        win: round2(p.win ?? 0),
        tie: round2(p.tie ?? 0),
        loss: round2(p.loss ?? 0),
      };
      pairs++;
    }
    matrix[rowId] = row;
  }
  if (skippedCodes.size)
    console.log(`  Unmapped codes skipped: ${[...skippedCodes].join(", ")}`);

  writeFileSync(
    join(DATA_DIR, "headtohead.json"),
    JSON.stringify(
      { source: SOURCE, sourceUrl: SOURCE_URL, fetchedAt: out.fetchedAt, matrix },
      null,
      2,
    ) + "\n",
  );
  console.log(
    `Wrote src/data/headtohead.json — ${Object.keys(matrix).length} teams, ${pairs} ordered pairs.`,
  );
}

main().catch((err) => {
  console.error("Predictions ingestion failed:", err);
  process.exit(1);
});
