// ---------------------------------------------------------------------------
// ingest-friendlies.mjs — POC data flow for the International Friendlies tab.
//
// Pulls the "International Friendly" games from ESPN (fifa.friendly), builds out
// the teams, and tracks a lighter stat set: goals, goal scorers, assists, and
// yellow/red cards. Writes src/data/friendlies.json.
//
//   node scripts/ingest-friendlies.mjs            # today (UTC)
//   node scripts/ingest-friendlies.mjs 20260326   # a specific date
// ---------------------------------------------------------------------------
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "src", "data");
const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.friendly";

const date = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, "");

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
async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

const mapStatus = (state) => (state === "pre" ? "scheduled" : state === "in" ? "live" : "finished");
// Clean clock token for a live match: "HT" at the break, else ESPN's displayClock
// with the apostrophes stripped ("45'+2'" → "45+2"). The UI re-adds the apostrophe.
const liveMinute = (st) => {
  if (st?.type?.name === "STATUS_HALFTIME") return "HT";
  const clock = String(st?.displayClock ?? "").replace(/'/g, "").trim();
  return clock || null;
};
const logoOf = (team) => team.logo || team.logos?.[0]?.href || "";
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const readStat = (stats, name) => {
  const s = (stats ?? []).find((x) => x.name === name);
  if (!s) return 0;
  const raw = s.value != null ? s.value : String(s.displayValue ?? "").replace(/[^0-9.\-]/g, "");
  return num(raw);
};

async function main() {
  console.log(`Fetching international friendlies for ${date}…`);
  const sb = await getJson(`${BASE}/scoreboard?dates=${date}`);
  const events = sb.events ?? [];
  console.log(`  ${events.length} friendly fixtures.`);

  const teams = new Map(); // id → FriendlyTeam
  const players = new Map(); // espn athlete id → FriendlyPlayer
  const ensureTeam = (t) => {
    if (!teams.has(t.id)) {
      teams.set(t.id, {
        id: t.id, name: t.displayName, abbr: t.abbreviation ?? "", logo: logoOf(t),
        played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0,
      });
    }
    return teams.get(t.id);
  };

  // First pass: build matches, teams, and the goal/card timeline (with minutes).
  const matches = events.map((ev) => {
    const c = ev.competitions[0];
    const home = c.competitors.find((x) => x.homeAway === "home");
    const away = c.competitors.find((x) => x.homeAway === "away");
    ensureTeam(home.team);
    ensureTeam(away.team);
    const status = mapStatus(ev.status?.type?.state);

    const timeline = [];
    for (const dt of c.details ?? []) {
      const text = dt.type?.text ?? "";
      const teamId = String(dt.team?.id ?? "");
      const player = dt.athletesInvolved?.[0]?.displayName ?? "";
      const minute = dt.clock?.displayValue ?? "";
      if (dt.scoringPlay) timeline.push({ type: "goal", teamId, player, minute });
      else if (/red/i.test(text)) timeline.push({ type: "red", teamId, player, minute });
      else if (/yellow/i.test(text)) timeline.push({ type: "yellow", teamId, player, minute });
    }

    const side = (t) => ({
      id: t.team.id, name: t.team.displayName, abbr: t.team.abbreviation ?? "",
      logo: logoOf(t.team), score: status === "scheduled" ? null : num(t.score),
    });

    return {
      id: ev.id,
      date: ev.date,
      status,
      minute: status === "live" ? liveMinute(ev.status) : null,
      home: side(home),
      away: side(away),
      timeline,
      assists: [],
      _summaryNeeded: status !== "scheduled",
    };
  });

  // Team records from finished matches.
  for (const m of matches) {
    if (m.status !== "finished" || m.home.score == null || m.away.score == null) continue;
    const h = teams.get(m.home.id), a = teams.get(m.away.id);
    h.played++; a.played++;
    h.goalsFor += m.home.score; h.goalsAgainst += m.away.score;
    a.goalsFor += m.away.score; a.goalsAgainst += m.home.score;
    if (m.home.score > m.away.score) { h.won++; a.lost++; }
    else if (m.home.score < m.away.score) { a.won++; h.lost++; }
    else { h.drawn++; a.drawn++; }
  }

  // Second pass: per-player goals/assists/cards from each live/finished boxscore.
  const needSummary = matches.filter((m) => m._summaryNeeded);
  console.log(`  Aggregating player stats from ${needSummary.length} matches…`);
  const summaries = await pool(needSummary, 5, (m) =>
    getJson(`${BASE}/summary?event=${m.id}`).then((s) => ({ m, s })).catch(() => ({ m, s: null })),
  );
  for (const { m, s } of summaries) {
    for (const r of s?.rosters ?? []) {
      const teamId = String(r.team?.id ?? "");
      for (const entry of r.roster ?? []) {
        if (!entry.stats) continue;
        const g = readStat(entry.stats, "totalGoals");
        const a = readStat(entry.stats, "goalAssists");
        const yc = readStat(entry.stats, "yellowCards");
        const rc = readStat(entry.stats, "redCards");
        if (g + a + yc + rc === 0) continue;
        const id = String(entry.athlete?.id);
        const name = entry.athlete?.displayName ?? "Unknown";
        const p = players.get(id) ?? { id, name, teamId, goals: 0, assists: 0, yellowCards: 0, redCards: 0 };
        p.goals += g; p.assists += a; p.yellowCards += yc; p.redCards += rc;
        players.set(id, p);
        if (a > 0) m.assists.push({ teamId, player: name });
      }
    }
  }

  for (const m of matches) delete m._summaryNeeded;

  const out = {
    lastUpdated: new Date().toISOString(),
    date,
    source: "ESPN (fifa.friendly)",
    teams: [...teams.values()].sort((x, y) => y.won - x.won || y.goalsFor - x.goalsFor),
    players: [...players.values()].sort((x, y) => y.goals - x.goals || y.assists - x.assists),
    matches,
  };

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, "friendlies.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(
    `Wrote friendlies.json: ${out.matches.length} matches, ${out.teams.length} teams, ${out.players.length} players with stats.`,
  );
}

main().catch((err) => {
  console.error("Friendlies ingestion failed:", err);
  process.exit(1);
});
