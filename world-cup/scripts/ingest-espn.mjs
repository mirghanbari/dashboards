// ---------------------------------------------------------------------------
// ingest-espn.mjs — rebuilds the dataset from ESPN's real 2026 World Cup data.
//
// Sources (public ESPN JSON API):
//   standings  → 12 groups, the 48 teams, and live group records
//   roster     → real squad bios (name, number, position, age, height, weight)
//   scoreboard → real fixtures (date, venue, teams, score, status) per day
//
// Stats fields are part of the schema but start at 0 — the tournament hasn't
// kicked off, and per-match stats are filled in later by fetch-data.mjs.
//
//   node scripts/ingest-espn.mjs
// ---------------------------------------------------------------------------
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "src", "data");
const BASE = "https://site.api.espn.com/apis";

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === tries - 1) throw err;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

// Run an array of async tasks with bounded concurrency.
async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

const FLAG = {
  MEX: "🇲🇽", CZE: "🇨🇿", KOR: "🇰🇷", RSA: "🇿🇦", CAN: "🇨🇦", BIH: "🇧🇦",
  SUI: "🇨🇭", QAT: "🇶🇦", BRA: "🇧🇷", SCO: "🏴", HAI: "🇭🇹",
  MAR: "🇲🇦", PAR: "🇵🇾", TUR: "🇹🇷", AUS: "🇦🇺", USA: "🇺🇸", ECU: "🇪🇨",
  GER: "🇩🇪", CIV: "🇨🇮", CUW: "🇨🇼", NED: "🇳🇱", SWE: "🇸🇪", JPN: "🇯🇵",
  TUN: "🇹🇳", BEL: "🇧🇪", IRN: "🇮🇷", EGY: "🇪🇬", NZL: "🇳🇿", ESP: "🇪🇸",
  URU: "🇺🇾", KSA: "🇸🇦", CPV: "🇨🇻", NOR: "🇳🇴", FRA: "🇫🇷", SEN: "🇸🇳",
  IRQ: "🇮🇶", ARG: "🇦🇷", AUT: "🇦🇹", ALG: "🇩🇿", JOR: "🇯🇴", COL: "🇨🇴",
  POR: "🇵🇹", UZB: "🇺🇿", COD: "🇨🇩", ENG: "🏴", CRO: "🇭🇷",
  PAN: "🇵🇦", GHA: "🇬🇭",
};

const CONF = {
  UEFA: ["CZE", "SUI", "BIH", "SCO", "TUR", "GER", "NED", "SWE", "BEL", "ESP", "NOR", "FRA", "AUT", "POR", "ENG", "CRO"],
  CONMEBOL: ["BRA", "PAR", "ECU", "URU", "COL", "ARG"],
  CONCACAF: ["MEX", "CAN", "HAI", "USA", "PAN", "CUW"],
  CAF: ["RSA", "MAR", "CIV", "TUN", "EGY", "CPV", "SEN", "ALG", "COD", "GHA"],
  AFC: ["KOR", "QAT", "JPN", "IRN", "KSA", "IRQ", "JOR", "UZB", "AUS"],
  OFC: ["NZL"],
};
const confOf = (abbr) =>
  Object.entries(CONF).find(([, list]) => list.includes(abbr))?.[0] ?? "UEFA";

const POS = { G: "GK", D: "DEF", M: "MID", F: "FWD" };

function zeroPlayerStats() {
  return {
    appearances: 0, minutes: 0, yellowCards: 0, redCards: 0,
    goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, passCompletion: 0,
    chancesCreated: 0, tackles: 0, interceptions: 0, clearances: 0,
    xg: 0, xa: 0, xgot: 0, progressivePasses: 0, progressiveCarries: 0,
    finalThirdEntries: 0, lineBreakingPasses: 0, pressSuccess: 0, highTurnovers: 0,
    obv: 0, offBallRuns: 0, xt: 0, vaep: 0, highSpeedRunning: 0,
    sprintCount: 0, spaceCreation: 0, setPieceXg: 0,
  };
}

const stat = (entry, name) => {
  const s = entry.stats.find((x) => x.name === name);
  return s ? Number(s.value ?? s.displayValue ?? 0) : 0;
};

async function main() {
  console.log("Fetching standings (groups + records)…");
  const standings = await getJson(`${BASE}/v2/sports/soccer/fifa.world/standings`);

  const teams = [];
  const espnIdToTeamId = new Map();
  for (const group of standings.children) {
    const letter = group.name.replace("Group ", "");
    for (const e of group.standings.entries) {
      const abbr = e.team.abbreviation;
      const id = abbr.toLowerCase();
      espnIdToTeamId.set(e.team.id, id);
      teams.push({
        id,
        espnId: e.team.id,
        name: e.team.displayName,
        code: abbr,
        flag: FLAG[abbr] ?? "🏳️",
        group: letter,
        confederation: confOf(abbr),
        fifaRank: 0, // ESPN does not expose FIFA ranking here
        played: stat(e, "gamesPlayed"),
        won: stat(e, "wins"),
        drawn: stat(e, "ties"),
        lost: stat(e, "losses"),
        goalsFor: stat(e, "pointsFor"),
        goalsAgainst: stat(e, "pointsAgainst"),
        points: stat(e, "points"),
        possession: 0, ppda: 0, cleanSheets: 0, passCompletion: 0,
      });
    }
  }
  console.log(`  ${teams.length} teams across ${standings.children.length} groups.`);

  console.log("Fetching squads…");
  const players = [];
  const playerByEspnId = new Map(); // ESPN athlete id → player object
  await pool(teams, 6, async (team) => {
    const roster = await getJson(
      `${BASE}/site/v2/sports/soccer/fifa.world/teams/${team.espnId}/roster`,
    );
    for (const a of roster.athletes ?? []) {
      const player = {
        id: `${team.id}-${a.id}`,
        // ESPN builds fullName as "first last"; for mononym players (Casemiro,
        // Endrick, Zizo…) the missing surname comes through as the literal
        // token "null" — strip it. displayName is the clean fallback.
        name: ((a.fullName ?? a.displayName ?? "")
          .replace(/\bnull\b/gi, "")
          .replace(/\s+/g, " ")
          .trim()) || a.displayName,
        teamId: team.id,
        position: POS[a.position?.abbreviation] ?? "MID",
        number: a.jersey ? Number(a.jersey) : 0,
        age: a.age ?? 0,
        club: "", // ESPN national-team rosters don't include club
        height: a.displayHeight ?? "",
        weight: a.displayWeight ?? "",
        ...zeroPlayerStats(),
      };
      players.push(player);
      playerByEspnId.set(String(a.id), player);
    }
    process.stdout.write(`  ${team.code} (${(roster.athletes ?? []).length})  `);
  });
  console.log(`\n  ${players.length} players.`);

  console.log("Fetching fixtures…");
  const dates = [];
  for (let d = new Date("2026-06-11"); d <= new Date("2026-07-19"); d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  const STAGE_BY_DATE = (iso) => {
    const day = iso.slice(0, 10);
    if (day <= "2026-06-27") return "group";
    if (day <= "2026-07-03") return "round32";
    if (day <= "2026-07-07") return "round16";
    if (day <= "2026-07-11") return "quarter";
    if (day <= "2026-07-16") return "semi";
    if (day === "2026-07-18") return "third";
    return "final";
  };
  const mapStatus = (name) =>
    name === "STATUS_SCHEDULED" || name === "STATUS_PRE"
      ? "scheduled"
      : name === "STATUS_IN_PROGRESS" || name === "STATUS_HALFTIME" || name === "STATUS_FIRST_HALF" || name === "STATUS_SECOND_HALF"
        ? "live"
        : "finished";

  const matches = [];
  let mid = 1;
  const dayResults = await pool(dates, 6, (date) =>
    getJson(`${BASE}/site/v2/sports/soccer/fifa.world/scoreboard?dates=${date}`).catch(() => null),
  );
  for (const sb of dayResults) {
    for (const ev of sb?.events ?? []) {
      const c = ev.competitions[0];
      const home = c.competitors.find((x) => x.homeAway === "home");
      const away = c.competitors.find((x) => x.homeAway === "away");
      const homeId = espnIdToTeamId.get(home?.team?.id) ?? "tbd";
      const awayId = espnIdToTeamId.get(away?.team?.id) ?? "tbd";
      const homeTeam = teams.find((t) => t.id === homeId);
      const awayTeam = teams.find((t) => t.id === awayId);
      const sameGroup = homeTeam && awayTeam && homeTeam.group === awayTeam.group;
      const stage = sameGroup ? "group" : STAGE_BY_DATE(ev.date);
      const status = mapStatus(ev.status?.type?.name);
      matches.push({
        id: `M${String(mid++).padStart(3, "0")}`,
        espnEventId: ev.id,
        stage,
        group: sameGroup ? homeTeam.group : null,
        matchday: null,
        date: ev.date,
        venue: c.venue?.fullName ?? "TBD",
        city: c.venue?.address?.city ?? "",
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeScore: status === "scheduled" ? null : Number(home?.score ?? 0),
        awayScore: status === "scheduled" ? null : Number(away?.score ?? 0),
        status,
        minute: status === "live" ? Number(ev.status?.displayClock?.replace?.("'", "") ?? 0) || null : null,
      });
    }
  }
  console.log(`  ${matches.length} fixtures.`);

  // ---- Aggregate per-player and per-team stats from finished matches --------
  const finished = matches.filter(
    (m) => m.status === "finished" && m.espnEventId && m.homeTeamId !== "tbd" && m.awayTeamId !== "tbd",
  );
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const espnTeamToId = new Map(teams.map((t) => [t.espnId, t.id]));
  const possAcc = new Map(); // teamId → { poss, pass, n }

  // ESPN puts player stats in `value`, team stats in `displayValue` (a string,
  // sometimes with a "%"). Read whichever is present, robustly.
  const readStat = (arr, name) => {
    const s = (arr ?? []).find((x) => x.name === name);
    if (!s) return 0;
    const raw = s.value != null ? s.value : String(s.displayValue ?? "").replace(/[^0-9.\-]/g, "");
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  if (finished.length) {
    console.log(`Aggregating stats from ${finished.length} finished matches…`);
    const summaries = await pool(finished, 6, (m) =>
      getJson(`${BASE}/site/v2/sports/soccer/fifa.world/summary?event=${m.espnEventId}`).catch(() => null),
    );
    for (const sum of summaries) {
      // Per-player stats from the match rosters.
      for (const r of sum?.rosters ?? []) {
        for (const entry of r.roster ?? []) {
          const player = playerByEspnId.get(String(entry.athlete?.id));
          if (!player || !entry.stats) continue;
          player.goals += readStat(entry.stats, "totalGoals");
          player.assists += readStat(entry.stats, "goalAssists");
          player.shots += readStat(entry.stats, "totalShots");
          player.shotsOnTarget += readStat(entry.stats, "shotsOnTarget");
          player.yellowCards += readStat(entry.stats, "yellowCards");
          player.redCards += readStat(entry.stats, "redCards");
          player.appearances += readStat(entry.stats, "appearances");
        }
      }
      // Per-team possession / pass completion from the boxscore.
      for (const t of sum?.boxscore?.teams ?? []) {
        const teamId = espnTeamToId.get(t.team?.id);
        if (!teamId) continue;
        const acc = possAcc.get(teamId) ?? { poss: 0, pass: 0, n: 0 };
        const ap = readStat(t.statistics, "accuratePasses");
        const tp = readStat(t.statistics, "totalPasses");
        acc.poss += readStat(t.statistics, "possessionPct");
        acc.pass += tp > 0 ? (ap / tp) * 100 : 0; // passPct field is unreliable
        acc.n += 1;
        possAcc.set(teamId, acc);
      }
    }
    for (const [teamId, acc] of possAcc) {
      const team = teamById.get(teamId);
      if (acc.n) {
        team.possession = Math.round((acc.poss / acc.n) * 10) / 10;
        team.passCompletion = Math.round((acc.pass / acc.n) * 10) / 10;
      }
    }
  }

  // Clean sheets — derived from finished group/knockout results.
  for (const m of finished) {
    if (m.homeScore == null || m.awayScore == null) continue;
    if (m.awayScore === 0) teamById.get(m.homeTeamId).cleanSheets += 1;
    if (m.homeScore === 0) teamById.get(m.awayTeamId).cleanSheets += 1;
  }

  const meta = {
    tournament: "FIFA World Cup 2026",
    hosts: ["United States", "Canada", "Mexico"],
    startDate: "2026-06-11",
    endDate: "2026-07-19",
    lastUpdated: new Date().toISOString(),
    source: "ESPN (site.api.espn.com)",
    note: "Real squads, groups, and fixtures from ESPN. Match/player stats fill in as the tournament progresses.",
  };

  mkdirSync(DATA_DIR, { recursive: true });
  const write = (f, o) => writeFileSync(join(DATA_DIR, f), JSON.stringify(o, null, 2) + "\n");
  write("meta.json", meta);
  write("teams.json", teams);
  write("players.json", players);
  write("matches.json", matches);
  console.log("Wrote teams/players/matches/meta to src/data/.");
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
