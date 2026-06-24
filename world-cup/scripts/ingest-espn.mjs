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
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "src", "data");
const BASE = "https://site.api.espn.com/apis";

// Per-request timeout. The live-poll loop in update-data.yml calls this on every
// tick; without a timeout a single hung ESPN connection blocks the whole job
// forever (it never commits, never exits, and holds the workflow's concurrency
// slot for the full 200-min cap — freezing live scores for hours).
const FETCH_TIMEOUT_MS = 15000;

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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
  SUI: "🇨🇭", QAT: "🇶🇦", BRA: "🇧🇷", SCO: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", HAI: "🇭🇹",
  MAR: "🇲🇦", PAR: "🇵🇾", TUR: "🇹🇷", AUS: "🇦🇺", USA: "🇺🇸", ECU: "🇪🇨",
  GER: "🇩🇪", CIV: "🇨🇮", CUW: "🇨🇼", NED: "🇳🇱", SWE: "🇸🇪", JPN: "🇯🇵",
  TUN: "🇹🇳", BEL: "🇧🇪", IRN: "🇮🇷", EGY: "🇪🇬", NZL: "🇳🇿", ESP: "🇪🇸",
  URU: "🇺🇾", KSA: "🇸🇦", CPV: "🇨🇻", NOR: "🇳🇴", FRA: "🇫🇷", SEN: "🇸🇳",
  IRQ: "🇮🇶", ARG: "🇦🇷", AUT: "🇦🇹", ALG: "🇩🇿", JOR: "🇯🇴", COL: "🇨🇴",
  POR: "🇵🇹", UZB: "🇺🇿", COD: "🇨🇩", ENG: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", CRO: "🇭🇷",
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
    goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, passCompletion: 0, passes: 0,
    chancesCreated: 0, tackles: 0, interceptions: 0, clearances: 0,
    xg: 0, xa: 0, xgot: 0, progressivePasses: 0, progressiveCarries: 0,
    finalThirdEntries: 0, lineBreakingPasses: 0, pressSuccess: 0, highTurnovers: 0,
    obv: 0, offBallRuns: 0, xt: 0, vaep: 0, highSpeedRunning: 0,
    sprintCount: 0, spaceCreation: 0, setPieceXg: 0,
  };
}

// Player-level fields owned by FotMob, not ESPN. ESPN rebuilds every player from
// a zeroed base each run, so without this the next ESPN-only tick (e.g. every
// live-poll tick, which runs a full ESPN ingest but only a live-only FotMob pass)
// would wipe these for every already-finished match. Carried forward from the
// prior players.json here, exactly as match.stats xG/duels are; the next full
// FotMob pass refreshes them. Mirror any additions to ingest-fotmob.mjs.
const PLAYER_FOTMOB_FIELDS = [
  "minutes", "xg", "xa", "xgot", "chancesCreated", "finalThirdEntries",
  "tackles", "interceptions", "clearances", "setPieceXg", "passCompletion", "passes",
];

const stat = (entry, name) => {
  const s = entry.stats.find((x) => x.name === name);
  return s ? Number(s.value ?? s.displayValue ?? 0) : 0;
};

async function main() {
  console.log("Fetching standings (groups + records)…");
  const standings = await getJson(`${BASE}/v2/sports/soccer/fifa.world/standings`);

  // FIFA ranking is owned by ingest-fifa-rankings.mjs; ESPN doesn't expose it.
  // Carry forward any previously-committed fifaRank so an ESPN rebuild (incl.
  // the per-minute live loop) doesn't zero it between FIFA refreshes.
  const priorFifaRank = new Map();
  try {
    const prior = JSON.parse(readFileSync(join(DATA_DIR, "teams.json"), "utf8"));
    for (const t of prior) if (t.fifaRank) priorFifaRank.set(t.id, t.fifaRank);
  } catch {
    /* no prior teams.json (first run) */
  }

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
        fifaRank: priorFifaRank.get(id) ?? 0, // ESPN has none; ingest-fifa-rankings.mjs fills it
        played: stat(e, "gamesPlayed"),
        won: stat(e, "wins"),
        drawn: stat(e, "ties"),
        lost: stat(e, "losses"),
        goalsFor: stat(e, "pointsFor"),
        goalsAgainst: stat(e, "pointsAgainst"),
        points: stat(e, "points"),
        possession: 0, ppda: 0, cleanSheets: 0, passCompletion: 0,
        xgFor: 0, xgAgainst: 0, // filled by ingest-fotmob.mjs
      });
    }
  }
  console.log(`  ${teams.length} teams across ${standings.children.length} groups.`);

  console.log("Fetching squads…");
  const players = [];
  const playerByEspnId = new Map(); // ESPN athlete id → player object

  // Prior committed roster, indexed by teamId (for the 404 fallback below) and
  // by player id (to carry FotMob-owned fields forward, see PLAYER_FOTMOB_FIELDS).
  // ESPN occasionally 404s a single team's roster endpoint; rather than abort the
  // whole ingest (and the run), we reuse that team's cached players so the dataset
  // stays complete.
  const priorByTeam = new Map();
  const priorById = new Map();
  try {
    const prior = JSON.parse(readFileSync(join(DATA_DIR, "players.json"), "utf8"));
    for (const p of prior) {
      if (!priorByTeam.has(p.teamId)) priorByTeam.set(p.teamId, []);
      priorByTeam.get(p.teamId).push(p);
      priorById.set(p.id, p);
    }
  } catch {
    /* no prior players.json (first run) — nothing to fall back to */
  }

  // Prior committed matches, indexed by ESPN event id. ESPN rebuilds matches
  // from scratch every run, but xG and duels-won come from FotMob (and from the
  // fast live-only FotMob pass in the live-poll loop). Carry those FotMob-owned
  // match.stats fields forward so an ESPN-only tick doesn't wipe them; the next
  // FotMob pass refreshes them.
  const priorStatsByEvent = new Map();
  try {
    const prior = JSON.parse(readFileSync(join(DATA_DIR, "matches.json"), "utf8"));
    for (const m of prior) {
      if (m.espnEventId && m.stats) priorStatsByEvent.set(m.espnEventId, m.stats);
    }
  } catch {
    /* no prior matches.json (first run) */
  }

  await pool(teams, 6, async (team) => {
    let athletes;
    try {
      const roster = await getJson(
        `${BASE}/site/v2/sports/soccer/fifa.world/teams/${team.espnId}/roster`,
      );
      athletes = roster.athletes ?? [];
    } catch (err) {
      // Reuse the cached squad with stats reset to 0 (the loop below re-derives
      // stats from finished matches, so a zeroed base stays idempotent).
      const cached = priorByTeam.get(team.id) ?? [];
      for (const prev of cached) {
        const player = { ...prev, ...zeroPlayerStats() };
        players.push(player);
        playerByEspnId.set(player.id.slice(team.id.length + 1), player);
      }
      process.stdout.write(`  ${team.code} (cached ${cached.length}, ${err.message})  `);
      return;
    }
    for (const a of athletes) {
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
    process.stdout.write(`  ${team.code} (${athletes.length})  `);
  });
  console.log(`\n  ${players.length} players.`);

  // Carry FotMob-owned player fields forward from the prior commit so an
  // ESPN-only refresh doesn't zero them (see PLAYER_FOTMOB_FIELDS).
  for (const player of players) {
    const prev = priorById.get(player.id);
    if (!prev) continue;
    for (const f of PLAYER_FOTMOB_FIELDS) {
      if (prev[f] != null) player[f] = prev[f];
    }
  }

  console.log("Fetching fixtures…");
  const dates = [];
  for (let d = new Date("2026-06-11"); d <= new Date("2026-07-19"); d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  // ESPN dates are UTC, but a late-evening Americas kickoff lands after midnight
  // UTC (the last Round of 32 game starts 01:30Z = 18:30 the prior evening PT /
  // 21:30 ET). Slicing the UTC date pushes those cross-midnight games into the
  // next round — M088 (last R32) read as R16, M100 (last QF) as a semi. Classify
  // by the US-Eastern calendar date — the schedule's reference day — so each game
  // lands in its real round. Intl handles DST; en-CA yields a YYYY-MM-DD string.
  const easternDay = (iso) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
  const STAGE_BY_DATE = (iso) => {
    const day = easternDay(iso);
    if (day <= "2026-06-27") return "group";
    if (day <= "2026-07-03") return "round32";
    if (day <= "2026-07-07") return "round16";
    if (day <= "2026-07-11") return "quarter";
    if (day <= "2026-07-16") return "semi";
    if (day === "2026-07-18") return "third";
    return "final";
  };
  // The clock token for a live match. At the break ESPN reports STATUS_HALFTIME,
  // which we surface as "HT". Otherwise we keep ESPN's displayClock but strip the
  // apostrophes ("45'+2'" → "45+2") — the old Number() parse dropped injury time
  // entirely (NaN → null), leaving the card showing a bare "'".
  const liveMinute = (st) => {
    if (st?.type?.name === "STATUS_HALFTIME") return "HT";
    const clock = String(st?.displayClock ?? "").replace(/'/g, "").trim();
    return clock || null;
  };
  const mapStatus = (name) =>
    name === "STATUS_SCHEDULED" || name === "STATUS_PRE"
      ? "scheduled"
      : name === "STATUS_IN_PROGRESS" || name === "STATUS_HALFTIME" || name === "STATUS_FIRST_HALF" || name === "STATUS_SECOND_HALF"
        ? "live"
        : "finished";

  // US TV / streaming carriers for a fixture, from ESPN's geoBroadcasts. ESPN
  // uses terse media short names; expand the ambiguous ones for display.
  const BROADCAST_NAMES = { Tele: "Telemundo" };
  const extractBroadcasts = (c) => {
    const seen = new Map();
    for (const g of c.geoBroadcasts ?? []) {
      const raw = g.media?.shortName;
      if (!raw) continue;
      const name = BROADCAST_NAMES[raw] ?? raw;
      const type = g.type?.shortName === "STREAMING" ? "stream" : "tv";
      if (!seen.has(name)) seen.set(name, { name, type });
    }
    return [...seen.values()];
  };

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
      // For an unresolved knockout slot ESPN supplies a placeholder "team" whose
      // displayName is the bracket position ("Group A Winner", "Group A 2nd
      // Place", "Third Place Group A/B/C/D/F", "Round of 16 3 Winner", …). Keep
      // it so the card can show the slot instead of a flat "To be decided".
      const slotLabel = (comp, id) =>
        id === "tbd" ? comp?.team?.displayName || undefined : undefined;
      const homeSlot = slotLabel(home, homeId);
      const awaySlot = slotLabel(away, awayId);
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
        ...(homeSlot ? { homeSlot } : {}),
        ...(awaySlot ? { awaySlot } : {}),
        homeScore: status === "scheduled" ? null : Number(home?.score ?? 0),
        awayScore: status === "scheduled" ? null : Number(away?.score ?? 0),
        status,
        minute: status === "live" ? liveMinute(ev.status) : null,
        broadcasts: extractBroadcasts(c),
      });
    }
  }
  console.log(`  ${matches.length} fixtures.`);

  // ---- Per-match detail + aggregate per-player/per-team stats ---------------
  // Pull the ESPN summary for every live OR finished match. The per-match
  // timeline + team stats (for the match detail page) come from all of them;
  // the season aggregation (player/team running totals) uses finished only, so
  // a live game's partial numbers never pollute the cumulative tallies.
  const detailed = matches.filter(
    (m) =>
      (m.status === "finished" || m.status === "live") &&
      m.espnEventId &&
      m.homeTeamId !== "tbd" &&
      m.awayTeamId !== "tbd",
  );
  const finished = detailed.filter((m) => m.status === "finished");
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

  // Goal + card timeline from the summary's keyEvents (in clock order).
  const buildTimeline = (sum) => {
    const out = [];
    for (const e of sum?.keyEvents ?? []) {
      const text = e.type?.text ?? "";
      const isGoal =
        (e.scoringPlay === true || e.type?.type === "goal") && !/disallow|no goal|cancel/i.test(text);
      const isRed = /red/i.test(text);
      const isYellow = !isRed && /yellow/i.test(text);
      if (!isGoal && !isRed && !isYellow) continue;
      const ev = {
        type: isGoal ? "goal" : isRed ? "red" : "yellow",
        minute: e.clock?.displayValue ?? "",
        teamId: espnTeamToId.get(String(e.team?.id ?? "")) ?? "",
        player: e.participants?.[0]?.athlete?.displayName ?? "",
        text: e.shortText ?? text,
      };
      // Goal method/type, when ESPN tags it. The qualifier lives in the event
      // text (e.g. "… Penalty - Scored" / "… Own Goal" / "Goal - Header" /
      // "Goal - Volley"); the penalty string is inconsistently spelled
      // ("Penalty - Score(d)"), so match on substrings. Plain goals stay
      // undefined (no marker). ESPN sometimes also exposes booleans — prefer
      // those when present.
      if (isGoal) {
        const blob = `${text} ${e.shortText ?? ""}`;
        const goalType =
          e.penaltyKick === true || /penalty/i.test(blob)
            ? "penalty"
            : e.ownGoal === true || /own goal/i.test(blob)
              ? "own"
              : /header/i.test(blob)
                ? "header"
                : /volley/i.test(blob)
                  ? "volley"
                  : undefined;
        if (goalType) ev.goalType = goalType;
      }
      const assist = isGoal ? e.participants?.[1]?.athlete?.displayName : undefined;
      if (assist) ev.assist = assist;
      out.push(ev);
    }
    return out;
  };

  // The curated team-comparison stat set for the match detail page.
  const sideStats = (t) => {
    if (!t) return {};
    const ap = readStat(t.statistics, "accuratePasses");
    const tp = readStat(t.statistics, "totalPasses");
    return {
      possession: readStat(t.statistics, "possessionPct"),
      shots: readStat(t.statistics, "totalShots"),
      shotsOnTarget: readStat(t.statistics, "shotsOnTarget"),
      passAccuracy: tp > 0 ? Math.round((ap / tp) * 1000) / 10 : 0,
      accuratePasses: ap,
      fouls: readStat(t.statistics, "foulsCommitted"),
      corners: readStat(t.statistics, "wonCorners"),
      offsides: readStat(t.statistics, "offsides"),
      saves: readStat(t.statistics, "saves"),
    };
  };

  if (detailed.length) {
    console.log(`Fetching summaries for ${detailed.length} live/finished matches…`);
    const summaries = await pool(detailed, 6, (m) =>
      getJson(`${BASE}/site/v2/sports/soccer/fifa.world/summary?event=${m.espnEventId}`)
        .then((s) => ({ m, s }))
        .catch(() => ({ m, s: null })),
    );
    for (const { m, s: sum } of summaries) {
      if (!sum) continue;

      // Per-match detail (live + finished): timeline + team comparison stats.
      const timeline = buildTimeline(sum);
      if (timeline.length) m.timeline = timeline;
      const boxTeams = sum.boxscore?.teams ?? [];
      const sideFor = (teamId) =>
        boxTeams.find((t) => espnTeamToId.get(String(t.team?.id)) === teamId);
      const home = sideFor(m.homeTeamId);
      const away = sideFor(m.awayTeamId);
      if (home || away) {
        m.stats = { home: sideStats(home), away: sideStats(away) };
        // Preserve FotMob-owned fields (xG, duels won, box touches) from the last
        // commit so an ESPN-only refresh doesn't drop them; FotMob refreshes them
        // next pass.
        const prev = priorStatsByEvent.get(m.espnEventId);
        for (const side of ["home", "away"]) {
          for (const f of ["xg", "duelsWon", "boxTouches"]) {
            if (prev?.[side]?.[f] != null) m.stats[side][f] = prev[side][f];
          }
        }
      }

      // Season aggregation: finished matches only.
      if (m.status !== "finished") continue;
      // Per-player stats from the match rosters.
      for (const r of sum.rosters ?? []) {
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
      for (const t of boxTeams) {
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

  // Defense-in-depth dedup by id. A clean ingest builds players from scratch so
  // this is normally a no-op, but the 404 fallback reuses a cached squad and a
  // git race could leave a duplicated array on disk — never let a duplicate
  // player reach the dataset (it doubles a row in the Golden Boot race / Players
  // list). Keeps the first occurrence.
  const dedupById = (rows, label) => {
    const byId = new Map();
    for (const r of rows) if (!byId.has(r.id)) byId.set(r.id, r);
    if (byId.size !== rows.length) {
      console.warn(`  Dropped ${rows.length - byId.size} duplicate ${label} (by id).`);
    }
    return [...byId.values()];
  };

  mkdirSync(DATA_DIR, { recursive: true });
  const write = (f, o) => writeFileSync(join(DATA_DIR, f), JSON.stringify(o, null, 2) + "\n");
  write("meta.json", meta);
  write("teams.json", dedupById(teams, "teams"));
  write("players.json", dedupById(players, "players"));
  write("matches.json", dedupById(matches, "matches"));
  console.log("Wrote teams/players/matches/meta to src/data/.");
}

main().catch((err) => {
  console.error("Ingestion failed:", err);
  process.exit(1);
});
