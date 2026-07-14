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
  {
    key: "goals", label: "Goals", tier: "basic", scope: "player", source: "espn",
    blurb: "Shots that found the net — the most direct measure of attacking output. It says nothing about the quality of the chances that produced it, so a team's real attacking threat is best read alongside xG.",
  },
  {
    key: "assists", label: "Assists", tier: "basic", scope: "player", source: "espn",
    blurb: "The final pass before a goal. It rewards buildup play as much as finishing, so a player can lead the tournament in assists without scoring themselves — pair it with chances created to see who's really driving an attack.",
  },
  {
    key: "shotsOnTarget", label: "Shots on target", tier: "basic", scope: "player", source: "espn",
    blurb: "Shots that forced a save or went in, as opposed to ones blocked, wide, or never dangerous. A better read on real shooting output than raw shot count — 10 wild efforts aren't more threatening than 3 on frame.",
  },
  {
    key: "shotAccuracy", label: "Shot accuracy", tier: "basic", scope: "player",
    source: "derived", unit: "%", decimals: 1,
    qualifier: `min ${MIN_SHOTS_FOR_ACCURACY} att`,
    blurb: "The share of a player's shots that are on target — shot selection and technique, not just volume. Most meaningful alongside the minimum-attempts gate shown here, which filters out small samples that would otherwise read as a false 100%.",
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
    blurb: "The share of a player's attempted passes that reach a teammate. A high number can mean excellent distribution, or it can mean a conservative game that never risks a difficult ball forward — progressive passes tells those two apart.",
    // Returns 0 below the pass minimum so leaders() (which filters value > 0)
    // drops low-volume passers from the leaderboard; profiles never show this
    // stat raw, so gating here has no other effect.
    derive: (p) =>
      p.passes >= MIN_PASSES_FOR_COMPLETION ? p.passCompletion : 0,
  },
  {
    key: "possession", label: "Possession", tier: "basic", scope: "team", source: "espn", unit: "%", decimals: 1,
    blurb: "The share of match time a team spends on the ball. It measures control of tempo, not control of the game — a team that sits deep and counters can dominate the scoreboard with far less of the ball.",
  },
  {
    key: "chancesCreated", label: "Chances created", tier: "basic", scope: "player", source: "fotmob",
    blurb: "Passes that lead directly to a shot, whether or not that shot goes in. It isolates a player's creative output from a teammate's finishing, so a playmaker's true influence shows even in a low-scoring match.",
  },
  {
    key: "tackles", label: "Tackles", tier: "basic", scope: "player", source: "fotmob",
    blurb: "Attempts to win the ball from an opponent in a physical duel. A high count can mean elite defending, or it can mean a team spends a lot of time chasing the game without the ball — interceptions round out the picture.",
  },
  {
    key: "interceptions", label: "Interceptions", tier: "basic", scope: "player", source: "fotmob",
    blurb: "Opponent passes read and cut out before they reach their target. Unlike a tackle, it needs no physical duel — it rewards positioning and anticipation, the quieter side of defending.",
  },
  {
    key: "clearances", label: "Clearances", tier: "basic", scope: "player", source: "fotmob",
    blurb: "The ball hoofed clear of danger, usually from inside or near the box. It's an unglamorous stat with no attacking value of its own, but it's a direct measure of shots and goals prevented under pressure.",
  },
  {
    key: "cleanSheets", label: "Clean sheets", tier: "basic", scope: "team", source: "espn",
    blurb: "Full matches finished without conceding a goal — the simplest possible defensive result. It says nothing about how close a team came to conceding, which is where clean sheets and xG against can tell different stories.",
  },

  // ---------------- ADVANCED ----------------
  {
    // Adjusted goal difference: blends expected and actual output, 70% xG /
    // 30% goals, so a team isn't judged purely on finishing variance over a
    // short tournament. = 0.7·(xGF − xGA) + 0.3·(GF − GA).
    key: "adjGoalDiff", label: "Adjusted goal difference", tier: "advanced", scope: "team",
    source: "derived", decimals: 1,
    blurb: "Blends actual and expected goal difference (70% xG, 30% real goals) so a single lucky or unlucky match — a stoppage-time screamer, a string of missed sitters — doesn't distort a team's underlying level over a short tournament.",
    deriveTeam: (t) =>
      0.7 * (t.xgFor - t.xgAgainst) + 0.3 * (t.goalsFor - t.goalsAgainst),
  },
  {
    key: "xg", label: "xG (expected goals)", tier: "advanced", scope: "player", source: "fotmob", decimals: 2,
    blurb: "The combined quality of every shot a player takes, based on how often shots from that position and situation go in historically. It shows who should be scoring based on their chances, independent of whether they actually put them away.",
  },
  {
    key: "xa", label: "xA (expected assists)", tier: "advanced", scope: "player", source: "fotmob", decimals: 2,
    blurb: "The combined quality of the chances a player creates for teammates, valued the same way as xG. It credits the pass, not the finish — a creator can lead the tournament in xA even if the players they set up are missing chances.",
  },
  {
    // Expected goal involvement: xG + xA, a single number for a player's total
    // expected attacking output (shots + chances created), same idea as the
    // "G+A" combined stat but on expected values instead of actual outcomes.
    key: "xgi", label: "xGI (expected goal involvement)", tier: "advanced", scope: "player",
    source: "derived", decimals: 2,
    blurb: "Combines a player's own chances (xG) and the ones they create for others (xA) into one number for total expected attacking output — the expected-value equivalent of the classic goals-plus-assists stat.",
    derive: (p) => p.xg + p.xa,
  },
  {
    key: "xgOver", label: "xG overperformance", tier: "advanced", scope: "player",
    source: "derived", decimals: 2,
    blurb: "Goals scored minus xG. A positive number means a player is finishing above what their chances were worth — elite technique, or a hot streak that may not last; a negative number usually means the reverse, or just bad luck.",
    derive: (p) => p.goals - p.xg,
  },
  {
    key: "xgot", label: "xGot (xG on target)", tier: "advanced", scope: "player", source: "fotmob", decimals: 2,
    blurb: "xG recalculated using only the shots that were actually on target, removing the ones a keeper was never asked to save. It isolates how much genuine danger a player's on-target shots carried.",
  },
  {
    // Placement value added: how much better a player's on-target shots end up
    // than the chance was worth (xGOT lifts above xG only via shot placement).
    // Distinct from xgOver (goals − xg): this isolates finishing technique, not luck.
    key: "xgPlacement", label: "Shot placement (xGOT−xG)", tier: "advanced", scope: "player",
    source: "derived", decimals: 2,
    blurb: "How far a player's on-target shots outperform the underlying chance quality (xGOT minus xG) — the part of finishing that's about picking a corner the keeper can't reach, distinct from xG overperformance, which also folds in shots that missed entirely.",
    derive: (p) => p.xgot - p.xg,
  },
  {
    key: "ppda", label: "PPDA (pressing, approx)", tier: "advanced", scope: "team", source: "fotmob", decimals: 1, asc: true,
    blurb: "Passes the opposition is allowed per defensive action — how many times they can pass the ball before a team tackles, intercepts, or fouls. A lower number means a more aggressive, higher-intensity press; a high number can mean a patient, settled defensive block instead.",
  },
  {
    key: "pressSuccess", label: "Press success", tier: "advanced", scope: "player", source: "provider", unit: "%", decimals: 1,
    blurb: "The share of a player's pressing actions that actually win the ball back, rather than just applying pressure. It separates effective pressers from players who chase the ball a lot without winning it.",
  },
  {
    key: "highTurnovers", label: "High turnovers", tier: "advanced", scope: "player", source: "fbref",
    blurb: "Possessions won inside the attacking third of the pitch. Because the opponent is already deep in their own end, these turnovers convert into shots and goals far more often than one won in a team's own half.",
  },
  {
    key: "progressivePasses", label: "Progressive passes", tier: "advanced", scope: "player", source: "fbref",
    blurb: "Passes that move the ball meaningfully closer to the opponent's goal, not just sideways or backward. A better read on buildup contribution than a raw pass count, which treats a 5-yard sideways ball the same as a 40-yard through pass.",
  },
  {
    key: "progressiveCarries", label: "Progressive carries", tier: "advanced", scope: "player", source: "fbref",
    blurb: "Ball carries that significantly advance play upfield. It credits players who move the ball themselves by dribbling or running with it — a different skill from progressive passing, more common among wide players and ball-carrying midfielders.",
  },
  {
    key: "finalThirdEntries", label: "Final-third entries", tier: "advanced", scope: "player", source: "fotmob",
    blurb: "The number of times a player brings the ball into the attacking third, by pass or by carry. A measure of territorial pressure — building the platform for a chance — that happens before a shot or even a key pass is ever recorded.",
  },
  {
    key: "lineBreakingPasses", label: "Line-breaking passes", tier: "advanced", scope: "player", source: "provider",
    blurb: "Passes that go through or beyond a line of opposition defenders, rather than around them. It measures how often a player breaks down a defensive shape outright, as opposed to simply circulating possession in front of it.",
  },

  // ---------------- ELITE / TRACKING ----------------
  {
    key: "obv", label: "OBV (on-ball value)", tier: "elite", scope: "player", source: "provider", decimals: 2,
    blurb: "A single number for how much every pass, carry, shot, and defensive action shifted a team's chances of scoring or conceding, weighted by the situation on the pitch. The most complete on-ball rating available, but it needs event data with a possession-value model behind it.",
  },
  {
    key: "offBallRuns", label: "Off-ball runs", tier: "elite", scope: "player", source: "provider",
    blurb: "Runs a player makes without the ball that open space or drag defenders out of position. Drawn purely from tracking data — a player can rank highly while barely touching the ball, since the value is in the movement itself.",
  },
  {
    key: "xt", label: "xT (expected threat)", tier: "elite", scope: "player", source: "model", decimals: 2,
    blurb: "The expected threat gained by moving the ball into a more dangerous zone of the pitch, valuing every pass and carry along the way to a chance — not just the final ball. It credits buildup play that xA alone misses.",
  },
  {
    key: "vaep", label: "VAEP", tier: "elite", scope: "player", source: "model", decimals: 2,
    blurb: "Values every action in a possession — pass, carry, shot, defensive action — by how much it changed the odds of a goal being scored or conceded soon after. A possession-value model of the entire game, not just the moments that end in a shot.",
  },
  {
    key: "highSpeedRunning", label: "High-speed running", tier: "elite", scope: "player", source: "provider", unit: " m",
    blurb: "Total distance covered above a set speed threshold, from player-tracking data. A pure physical-output number — it says nothing about whether that running was used well, only how much of it there was.",
  },
  {
    key: "sprintCount", label: "Sprint count", tier: "elite", scope: "player", source: "provider",
    blurb: "The number of sprints a player makes in a match. A proxy for explosive effort and match intensity, useful for spotting fatigue over a long tournament or comparing work-rate between players in similar positions.",
  },
  {
    key: "spaceCreation", label: "Space creation", tier: "elite", scope: "player", source: "provider", decimals: 2,
    blurb: "How much open space a player generates for teammates through their own movement, from tracking data. It's the teammate-facing counterpart to off-ball runs — value created for others rather than for the player themselves.",
  },
  {
    key: "setPieceXg", label: "Set-piece xG", tier: "elite", scope: "player", source: "fotmob", decimals: 2,
    blurb: "Expected goals generated specifically from corners and free kicks, separated out from open-play xG. It isolates how dangerous a team or player is from a dead ball — a skill set that doesn't always track with open-play threat.",
  },
];

export const SOURCE_META: Record<StatDef["source"], { label: string; hint: string }> = {
  espn: { label: "ESPN · live", hint: "Pulled live from ESPN's match feed." },
  fotmob: { label: "FotMob", hint: "FotMob public API — xG, xGOT, set-piece xG and per-player advanced stats." },
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
