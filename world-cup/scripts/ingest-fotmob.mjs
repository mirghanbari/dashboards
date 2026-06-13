// ---------------------------------------------------------------------------
// ingest-fotmob.mjs — enriches the dataset with advanced stats from FotMob.
//
// Why FotMob and not FBref? FBref (the obvious free source for Opta-derived
// numbers) now sits behind Cloudflare's managed challenge, which a CI runner on
// a datacenter IP can't reliably pass. FotMob exposes the same class of data —
// xG, xA, xGOT, chances created, tackles/interceptions/clearances, final-third
// passes, plus a shot-level shotmap — over a plain public JSON API with no
// Cloudflare. So we use it for everything ESPN doesn't carry.
//
// This runs AFTER ingest-espn.mjs. ESPN builds teams/players/matches and fills
// goals/assists/shots; this script reads those JSON files back and fills in the
// advanced fields (which ESPN leaves at 0), then writes them out again.
//
//   node scripts/ingest-espn.mjs   # base data + ESPN stats
//   node scripts/ingest-fotmob.mjs # advanced stats on top
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "src", "data");

// FotMob's public data API. No key, no Cloudflare — but it does reject the
// default fetch UA, so we send a browser UA + Referer like the website does.
const FOTMOB = "https://www.fotmob.com/api/data";
const WORLD_CUP_LEAGUE_ID = 77; // FotMob's id for the men's World Cup
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Referer: "https://www.fotmob.com/",
  Accept: "application/json",
};
const PAUSE_MS = 1500; // be polite between match requests

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- name matching -------------------------------------------------------
// Strip accents, punctuation and case so "Türkiye" === "Turkiye", etc.
const norm = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// FotMob team name → our team name, where normalization alone isn't enough.
const TEAM_ALIASES = {
  "bosnia and herzegovina": "bosnia herzegovina",
  "dr congo": "congo dr",
  usa: "united states",
  "korea republic": "south korea",
  "czech republic": "czechia",
};
const teamKey = (name) => {
  const n = norm(name);
  return TEAM_ALIASES[n] ?? n;
};

// FotMob player name → our (ESPN) player name, keyed by teamId, for the cases
// the automatic matcher (exact / reordered tokens / unique last name) can't
// reach: cross-provider romanization or surname differences. Keys/values are
// raw names — both sides are run through norm() at lookup. Only add an entry
// when you've confirmed the FotMob player and the ESPN target are the same
// person; a wrong alias misattributes stats, which is worse than Min=0.
// (Bosnia's "Arjan Malic" is intentionally absent: an unused sub with no stats
// and no ESPN squad entry — nothing to attach, no target to attach to.)
const PLAYER_ALIASES = {
  kor: {
    "Jin-Seob Park": "Park Jin-Seop",
    "Hyun-Gyu Oh": "Oh Hyeon-Gyu",
  },
  par: {
    "Alejandro Romero": "Alejandro Romero Gamarra",
    Mauricio: "Maurício",
    "Orlando Gill": "Orlando Gil",
  },
};

// FotMob shot `situation` values we count as set-piece xG (dead-ball origin).
const SET_PIECE_SITUATIONS = new Set([
  "SetPiece",
  "FromCorner",
  "FreeKick",
  "Penalty",
  "ThrowInSetPiece",
]);

// Pull the numeric value out of a FotMob player-stat cell. FotMob now nests the
// numbers under `stat`: { key, stat: { value, total, type } } (a fraction like
// "Accurate passes" carries both value and total). Older payloads put them flat
// on the cell, so read either shape.
const num = (cell) => (cell && typeof cell.stat === "object" ? cell.stat : cell) ?? {};
const val = (cell) => {
  const v = num(cell).value;
  return typeof v === "number" ? v : 0;
};
const total = (cell) => {
  const t = num(cell).total;
  return typeof t === "number" ? t : 0;
};

// Find a named stat inside a player's grouped stat blocks.
function playerStat(p, label) {
  for (const group of p.stats ?? []) {
    const cell = group.stats?.[label];
    if (cell) return cell;
  }
  return null;
}

async function main() {
  // ---- load the base data ESPN already produced --------------------------
  const read = (f) => JSON.parse(readFileSync(join(DATA_DIR, f), "utf8"));
  const teams = read("teams.json");
  const players = read("players.json");

  // teamKey → teamId, teamId → team object, and teamId → (normName → player)
  const teamIdByKey = new Map(teams.map((t) => [teamKey(t.name), t.id]));
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const playersByTeam = new Map(); // teamId → Map(normName → player)
  for (const p of players) {
    if (!playersByTeam.has(p.teamId)) playersByTeam.set(p.teamId, new Map());
    playersByTeam.get(p.teamId).set(norm(p.name), p);
  }

  // Order-independent token signature so "Kim Seung-Gyu" (ESPN, family-given)
  // matches "Seung-Gyu Kim" (FotMob, given-family). Sorted token set.
  const tokenSig = (n) => n.split(" ").filter(Boolean).sort().join(" ");

  const resolvePlayer = (teamId, fmName) => {
    const byName = playersByTeam.get(teamId);
    if (!byName) return null;
    // hand-curated alias first (overrides the heuristics below).
    const alias = PLAYER_ALIASES[teamId]?.[fmName];
    if (alias && byName.has(norm(alias))) return byName.get(norm(alias));
    const n = norm(fmName);
    if (byName.has(n)) return byName.get(n);
    // reversed/reordered name parts (e.g. Korean family-given vs given-family):
    // match if the sorted token set is unique within the squad.
    const sig = tokenSig(n);
    const sigHits = [...byName.entries()].filter(([k]) => tokenSig(k) === sig);
    if (sigHits.length === 1) return sigHits[0][1];
    // loose fallback: match on last name if unique within the squad
    const last = n.split(" ").pop();
    const hits = [...byName.entries()].filter(([k]) => k.split(" ").pop() === last);
    return hits.length === 1 ? hits[0][1] : null;
  };

  // ---- enumerate WC matches ---------------------------------------------
  console.log("Fetching FotMob World Cup fixtures…");
  const league = await getJson(
    `${FOTMOB}/leagues?id=${WORLD_CUP_LEAGUE_ID}`,
  );
  const all = league.fixtures?.allMatches ?? [];
  const finished = all.filter((m) => m.status?.finished);
  console.log(`  ${all.length} fixtures, ${finished.length} finished.`);

  // Track what matched so name-mismatches are visible and fixable.
  const unmatchedTeams = new Set();
  const unmatchedPlayers = new Set();
  let matchedPlayerRows = 0;

  // Reset the fields THIS script owns before re-summing, so the script is
  // idempotent: running it twice (or on a non-fresh players.json) can never
  // double-count. ESPN already zeroes these and runs first in the pipeline, so
  // this is a no-op there — it only guards standalone / repeated invocations.
  // (ESPN owns goals/assists/shots/cards/appearances — left untouched.)
  const OWNED_FIELDS = [
    "minutes", "xg", "xa", "xgot", "chancesCreated", "finalThirdEntries",
    "tackles", "interceptions", "clearances", "setPieceXg", "passCompletion",
  ];
  for (const p of players) {
    for (const f of OWNED_FIELDS) p[f] = 0;
    delete p._passAcc;
    delete p._passAtt;
  }
  // Team xG for/against are likewise owned + re-summed here.
  for (const t of teams) {
    t.xgFor = 0;
    t.xgAgainst = 0;
  }

  // ---- pull each finished match and fold its stats into our players ------
  for (const fx of finished) {
    let detail;
    try {
      detail = await getJson(`${FOTMOB}/matchDetails?matchId=${fx.id}`);
    } catch (err) {
      console.warn(`  ! match ${fx.id} failed: ${err.message}`);
      continue;
    }
    await sleep(PAUSE_MS);

    const ps = detail.content?.playerStats ?? {};
    const shotmap = detail.content?.shotmap?.shots ?? [];

    // Per-player set-piece xG, summed from the shotmap (keyed by FotMob id).
    const setPieceByFmId = new Map();
    for (const s of shotmap) {
      if (SET_PIECE_SITUATIONS.has(s.situation)) {
        const prev = setPieceByFmId.get(s.playerId) ?? 0;
        setPieceByFmId.set(s.playerId, prev + (s.expectedGoals ?? 0));
      }
    }

    // Team xG for this match, summed per side from every player's xG (including
    // unmatched ones, so the team total is complete). Attributed for/against
    // after the loop.
    const matchXgByTeam = new Map();

    for (const fmId of Object.keys(ps)) {
      const fp = ps[fmId];
      const teamId = teamIdByKey.get(teamKey(fp.teamName));
      if (!teamId) {
        unmatchedTeams.add(fp.teamName);
        continue;
      }
      const fpXg = val(playerStat(fp, "Expected goals (xG)"));
      matchXgByTeam.set(teamId, (matchXgByTeam.get(teamId) ?? 0) + fpXg);

      const player = resolvePlayer(teamId, fp.name);
      if (!player) {
        unmatchedPlayers.add(`${fp.name} (${fp.teamName})`);
        continue;
      }
      if (!(fp.stats?.length)) continue; // didn't feature
      matchedPlayerRows++;

      // --- advanced fields ESPN doesn't provide ---
      player.minutes += val(playerStat(fp, "Minutes played"));
      player.xg += fpXg;
      player.xa += val(playerStat(fp, "Expected assists (xA)"));
      player.xgot += val(playerStat(fp, "Expected goals on target (xGOT)"));
      player.chancesCreated += val(playerStat(fp, "Chances created"));
      player.finalThirdEntries += val(playerStat(fp, "Passes into final third"));
      player.tackles += val(playerStat(fp, "Tackles"));
      player.interceptions += val(playerStat(fp, "Interceptions"));
      player.clearances += val(playerStat(fp, "Clearances"));
      player.setPieceXg += setPieceByFmId.get(fp.id) ?? 0;

      // Pass completion: accumulate as a fraction, average at the end.
      const passCell = playerStat(fp, "Accurate passes");
      const acc = val(passCell);
      const att = total(passCell);
      if (att > 0) {
        player._passAcc = (player._passAcc ?? 0) + acc;
        player._passAtt = (player._passAtt ?? 0) + att;
      }
    }

    // Attribute team xG for/against (exactly two sides per match).
    const sides = [...matchXgByTeam.keys()];
    if (sides.length === 2) {
      const [a, b] = sides;
      const xa = matchXgByTeam.get(a);
      const xb = matchXgByTeam.get(b);
      teamById.get(a).xgFor += xa;
      teamById.get(a).xgAgainst += xb;
      teamById.get(b).xgFor += xb;
      teamById.get(b).xgAgainst += xa;
    }
    process.stdout.write(".");
  }
  console.log();

  // Finalize pass completion (% across all matches played).
  for (const p of players) {
    if (p._passAtt > 0) {
      p.passCompletion = Math.round((p._passAcc / p._passAtt) * 1000) / 10;
    }
    delete p._passAcc;
    delete p._passAtt;
    // round the float-y expected-value fields
    for (const k of ["xg", "xa", "xgot", "setPieceXg"]) {
      p[k] = Math.round(p[k] * 100) / 100;
    }
  }

  // Round team xG totals.
  for (const t of teams) {
    t.xgFor = Math.round(t.xgFor * 100) / 100;
    t.xgAgainst = Math.round(t.xgAgainst * 100) / 100;
  }

  // ---- report ------------------------------------------------------------
  console.log(`Matched ${matchedPlayerRows} player-match rows.`);
  if (unmatchedTeams.size)
    console.log("Unmatched teams (add to TEAM_ALIASES):", [...unmatchedTeams].join(", "));
  if (unmatchedPlayers.size)
    console.log(`Unmatched players (${unmatchedPlayers.size}):`, [...unmatchedPlayers].slice(0, 30).join(", "));

  // ---- write back --------------------------------------------------------
  const write = (f, o) => writeFileSync(join(DATA_DIR, f), JSON.stringify(o, null, 2) + "\n");
  write("players.json", players);
  write("teams.json", teams);
  console.log("Wrote advanced stats into src/data/players.json + teams.json.");

  // NOTE: still unfilled (FotMob doesn't expose these) — candidates for the
  // worldfootballR_data CSV fallback later: progressivePasses, progressiveCarries,
  // highTurnovers, lineBreakingPasses (provider), and team ppda.
}

main().catch((err) => {
  console.error("FotMob ingestion failed:", err);
  process.exit(1);
});
