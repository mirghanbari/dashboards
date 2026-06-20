import type { StatDef, Player, Team } from "./types";
import { PLAYERS, TEAMS, getTeam } from "./data";

// ---------------------------------------------------------------------------
// The full stat catalog. Every metric the dashboard tracks, tagged with the
// player/team it attaches to and where its value actually comes from:
//   espn     — live now from ESPN's match feed
//   fotmob   — free FotMob public API (xG, xGOT, per-player advanced stats)
//   derived  — computed from other tracked stats (no external source needed)
//   fbref    — Opta event data via the worldfootballR open dataset
//   model    — open model (xT, VAEP), but needs a full event stream as input,
//              and no free feed covers the live 2026 World Cup (see note below)
//   provider — needs a paid tracking-data provider (StatsBomb / SkillCorner / etc.)
// ---------------------------------------------------------------------------
// Volume gate for the efficiency leaderboards (Shot accuracy, Pass completion):
// a player must have attempted at least the tournament-wide AVERAGE before a
// small-sample 100% can top the board. Computing it from live data instead of a
// fixed number keeps the bar relevant — it rises on its own as shot and pass
// volumes climb through the tournament. Averaged over players who've attempted
// any (so the ~1200 who never featured don't drag it to ~0); floor of 1 so a
// pre-tournament empty feed still yields a sane threshold.
// Minimum attempts before an efficiency rate (Shot accuracy, Pass completion)
// earns a spot on its leaderboard — otherwise a 2-for-2 cameo reads a perfect
// 100% and swamps high-volume marksmen. The bar is the tournament-wide AVERAGE
// attempts (recomputed live from the data, so it rises on its own as volumes
// climb through the tournament) times a per-stat factor. Averaged over players
// who've attempted any (so the ~800 who never featured don't drag it to ~0);
// floor of 1 so a pre-tournament empty feed still yields a sane threshold.
// Shots take a 2.5× factor because shooting is low-volume — the raw average is
// only ~2 early on (cameo-heavy), too few attempts for a percentage to mean
// anything, so we require ~2½ matchdays' worth of shots. Passing is high-volume,
// so its plain average (~40) is already a meaningful bar (factor 1).
function avgAttempts(field: keyof Player, factor = 1): number {
  const vals = PLAYERS.map((p) => p[field] as number).filter((v) => v > 0);
  if (!vals.length) return 1;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.max(1, Math.round(mean * factor));
}
export const MIN_SHOTS_FOR_ACCURACY = avgAttempts("shots", 2.5);
export const MIN_PASSES_FOR_COMPLETION = avgAttempts("passes");

export const STAT_CATALOG: StatDef[] = [
  // ---------------- BASIC ----------------
  { key: "goals", label: "Goals", tier: "basic", scope: "player", source: "espn" },
  { key: "assists", label: "Assists", tier: "basic", scope: "player", source: "espn" },
  { key: "shotsOnTarget", label: "Shots on target", tier: "basic", scope: "player", source: "espn" },
  {
    key: "shotAccuracy", label: "Shot accuracy", tier: "basic", scope: "player",
    source: "derived", unit: "%", decimals: 1,
    qualifier: `min ${MIN_SHOTS_FOR_ACCURACY} att`,
    // Real on-target % — but returns 0 below the shot minimum so leaders()
    // (which filters value > 0) drops small-sample players whose 100% isn't yet
    // meaningful.
    derive: (p) =>
      p.shots >= MIN_SHOTS_FOR_ACCURACY ? (p.shotsOnTarget / p.shots) * 100 : 0,
  },
  {
    key: "passCompletion", label: "Pass completion", tier: "basic", scope: "player",
    source: "fotmob", unit: "%", decimals: 1,
    qualifier: `min ${MIN_PASSES_FOR_COMPLETION} att`,
    // Returns 0 below the pass minimum so leaders() (which filters value > 0)
    // drops low-volume passers from the leaderboard; profiles never show this
    // stat raw, so gating here has no other effect.
    derive: (p) =>
      p.passes >= MIN_PASSES_FOR_COMPLETION ? p.passCompletion : 0,
  },
  { key: "possession", label: "Possession", tier: "basic", scope: "team", source: "espn", unit: "%", decimals: 1 },
  { key: "chancesCreated", label: "Chances created", tier: "basic", scope: "player", source: "fotmob" },
  { key: "tackles", label: "Tackles", tier: "basic", scope: "player", source: "fotmob" },
  { key: "interceptions", label: "Interceptions", tier: "basic", scope: "player", source: "fotmob" },
  { key: "clearances", label: "Clearances", tier: "basic", scope: "player", source: "fotmob" },
  { key: "cleanSheets", label: "Clean sheets", tier: "basic", scope: "team", source: "espn" },

  // ---------------- ADVANCED ----------------
  {
    // Adjusted goal difference: blends expected and actual output, 70% xG /
    // 30% goals, so a team isn't judged purely on finishing variance over a
    // short tournament. = 0.7·(xGF − xGA) + 0.3·(GF − GA).
    key: "adjGoalDiff", label: "Adjusted goal difference", tier: "advanced", scope: "team",
    source: "derived", decimals: 1,
    deriveTeam: (t) =>
      0.7 * (t.xgFor - t.xgAgainst) + 0.3 * (t.goalsFor - t.goalsAgainst),
  },
  { key: "xg", label: "xG (expected goals)", tier: "advanced", scope: "player", source: "fotmob", decimals: 2 },
  { key: "xa", label: "xA (expected assists)", tier: "advanced", scope: "player", source: "fotmob", decimals: 2 },
  {
    key: "xgOver", label: "xG overperformance", tier: "advanced", scope: "player",
    source: "derived", decimals: 2,
    derive: (p) => p.goals - p.xg,
  },
  { key: "xgot", label: "xGot (xG on target)", tier: "advanced", scope: "player", source: "fotmob", decimals: 2 },
  {
    // Placement value added: how much better a player's on-target shots end up
    // than the chance was worth (xGOT lifts above xG only via shot placement).
    // Distinct from xgOver (goals − xg): this isolates finishing technique, not luck.
    key: "xgPlacement", label: "Shot placement (xGOT−xG)", tier: "advanced", scope: "player",
    source: "derived", decimals: 2,
    derive: (p) => p.xgot - p.xg,
  },
  { key: "ppda", label: "PPDA (pressing, approx)", tier: "advanced", scope: "team", source: "fotmob", decimals: 1, asc: true },
  { key: "pressSuccess", label: "Press success", tier: "advanced", scope: "player", source: "provider", unit: "%", decimals: 1 },
  { key: "highTurnovers", label: "High turnovers", tier: "advanced", scope: "player", source: "fbref" },
  { key: "progressivePasses", label: "Progressive passes", tier: "advanced", scope: "player", source: "fbref" },
  { key: "progressiveCarries", label: "Progressive carries", tier: "advanced", scope: "player", source: "fbref" },
  { key: "finalThirdEntries", label: "Final-third entries", tier: "advanced", scope: "player", source: "fotmob" },
  { key: "lineBreakingPasses", label: "Line-breaking passes", tier: "advanced", scope: "player", source: "provider" },

  // ---------------- ELITE / TRACKING ----------------
  { key: "obv", label: "OBV (on-ball value)", tier: "elite", scope: "player", source: "provider", decimals: 2 },
  { key: "offBallRuns", label: "Off-ball runs", tier: "elite", scope: "player", source: "provider" },
  { key: "xt", label: "xT (expected threat)", tier: "elite", scope: "player", source: "model", decimals: 2 },
  { key: "vaep", label: "VAEP", tier: "elite", scope: "player", source: "model", decimals: 2 },
  { key: "highSpeedRunning", label: "High-speed running", tier: "elite", scope: "player", source: "provider", unit: " m" },
  { key: "sprintCount", label: "Sprint count", tier: "elite", scope: "player", source: "provider" },
  { key: "spaceCreation", label: "Space creation", tier: "elite", scope: "player", source: "provider", decimals: 2 },
  { key: "setPieceXg", label: "Set-piece xG", tier: "elite", scope: "player", source: "fotmob", decimals: 2 },
];

export const SOURCE_META: Record<StatDef["source"], { label: string; hint: string }> = {
  espn: { label: "ESPN · live", hint: "Pulled live from ESPN's match feed." },
  fotmob: { label: "FotMob · free", hint: "Free FotMob public API — xG, xGOT, set-piece xG and per-player advanced stats." },
  derived: { label: "Derived", hint: "Computed from other tracked stats." },
  fbref: { label: "FBref/Opta", hint: "Opta event data via the worldfootballR open dataset." },
  model: { label: "Open model · needs events", hint: "xT and VAEP use open models, but require a full event stream (every pass and carry). No free feed covers the live 2026 World Cup — FotMob is shots-only and FBref is blocked — so these stay unpopulated." },
  provider: { label: "Tracking provider", hint: "Needs a paid tracking feed (StatsBomb / SkillCorner / Second Spectrum)." },
};

export const TIERS: { value: StatDef["tier"]; label: string }[] = [
  { value: "basic", label: "Basic" },
  { value: "advanced", label: "Advanced" },
  { value: "elite", label: "Elite / cutting-edge" },
];

export function playerValue(p: Player, def: StatDef): number {
  if (def.derive) return def.derive(p);
  return (p[def.key as keyof Player] as number) ?? 0;
}

export function teamValue(t: Team, def: StatDef): number {
  if (def.deriveTeam) return def.deriveTeam(t);
  return (t[def.key as keyof Team] as number) ?? 0;
}

// Sources with no data feed available for the live 2026 World Cup (FBref is
// Cloudflare-blocked; xT/VAEP need a full event stream no free feed provides;
// tracking metrics need a paid provider). Their stat cards are kept in the
// catalog but hidden from the UI until a source materializes. See the project
// "Dead ends" note before trying to wire any of these.
const UNAVAILABLE_SOURCES = new Set<StatDef["source"]>(["fbref", "model", "provider"]);
export const isAvailable = (def: StatDef): boolean => !UNAVAILABLE_SOURCES.has(def.source);
export const VISIBLE_CATALOG = STAT_CATALOG.filter(isAvailable);

export function formatValue(v: number, def: StatDef): string {
  const n = def.decimals ? v.toFixed(def.decimals) : Math.round(v).toString();
  return `${n}${def.unit ?? ""}`;
}

export interface Leader {
  id: string;
  name: string;
  flag: string;
  href: string;
  value: number;
}

/** Top N players or teams for a given stat (descending), nonzero only. */
export function leaders(def: StatDef, n = 5): Leader[] {
  if (def.scope === "team") {
    return TEAMS.map((t) => ({
      id: t.id,
      name: t.name,
      flag: t.flag,
      href: `/teams/${t.id}`,
      value: teamValue(t, def),
    }))
      .filter((r) => r.value > 0)
      .sort((a, b) => (def.asc ? a.value - b.value : b.value - a.value))
      .slice(0, n);
  }
  return PLAYERS.map((p) => {
    const team = getTeam(p.teamId);
    return {
      id: p.id,
      name: p.name,
      flag: team.flag,
      href: `/players/${p.id}`,
      value: playerValue(p, def),
    };
  })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}
