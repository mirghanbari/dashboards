// Group-stage qualification engine. Given the current standings and the
// remaining group fixtures, work out — for every team — whether it has
// clinched a Round-of-32 spot, can still finish top two, is out of the top two
// but alive via the best-third-place race, or is mathematically eliminated.
//
// Why this is rigorous: goal margins can swing arbitrarily, so clinching and
// elimination are fundamentally *points* questions. We enumerate every W/D/L
// combination of the remaining group matches (at most 3^6 = 729 per group) and
// classify each team from the points outcomes alone. Cases that hinge purely on
// goal difference are — correctly — reported as still in contention, because a
// GD tie is genuinely undecided. Every label here is therefore mathematically
// provable; we deliberately publish no probabilities.
//
// The 2026 format: top two per group qualify directly, plus the 8 best of the
// 12 third-placed teams. A team that cannot finish top two is only eliminated
// once it also cannot reach the top-8 third-place cut in ANY scenario — see
// `eliminatedFromR32` below.
//
// Tie-breaks (official FIFA 2026 order): overall points → GD → goals for →
// head-to-head (points, GD, goals among the tied teams) → fair play → FIFA
// ranking. Only the points layer feeds the clinch/eliminate math (margins are
// free, so points decide what is provable); the full chain orders the
// third-place race table for display.
import { MATCHES, TEAMS, standingsForGroup } from ".";
import type { Match, Standing } from "../types";

export type QualStatus =
  | "clinched-first" // guaranteed to win the group outright
  | "clinched" // guaranteed to finish top 2 (through to the R32)
  | "alive" // can still finish top 2
  | "out-top2" // cannot finish top 2, but the best-third route is still open
  | "eliminated"; // cannot reach the Round of 32 by any route

export interface TeamQualification {
  teamId: string;
  status: QualStatus;
  scenario: string; // human-readable: what the team needs / has done
}

export interface GroupQualification {
  group: string;
  remaining: number; // remaining matches in the group
  teams: TeamQualification[]; // in current-standings order
}

type Pts = Record<string, number>;
type Outcome = "home" | "draw" | "away";

const THIRDS_ADVANCING = 8;

// Lazy + cached: this module is re-exported from the data barrel, so reading
// TEAMS at module-eval time would hit the circular import before TEAMS is
// initialised. Compute on first call instead.
let groupsCache: string[] | null = null;
function allGroups(): string[] {
  if (!groupsCache) groupsCache = [...new Set(TEAMS.map((t) => t.group))].sort();
  return groupsCache;
}

/** Remaining (not-yet-finished) matches in a group. */
function remainingMatches(group: string): Match[] {
  return MATCHES.filter(
    (m) => m.stage === "group" && m.group === group && m.status !== "finished",
  );
}

/** Every W/D/L combination across a set of matches. */
function combinations(matches: Match[]): Outcome[][] {
  const outcomes: Outcome[] = ["home", "draw", "away"];
  let combos: Outcome[][] = [[]];
  for (let i = 0; i < matches.length; i++) {
    const next: Outcome[][] = [];
    for (const c of combos) for (const o of outcomes) next.push([...c, o]);
    combos = next;
  }
  return combos;
}

/** Apply one outcome combination to the base points, returning final points. */
function pointsFor(base: Pts, matches: Match[], combo: Outcome[]): Pts {
  const pts: Pts = { ...base };
  matches.forEach((m, i) => {
    const o = combo[i];
    if (o === "home") pts[m.homeTeamId] += 3;
    else if (o === "away") pts[m.awayTeamId] += 3;
    else {
      pts[m.homeTeamId] += 1;
      pts[m.awayTeamId] += 1;
    }
  });
  return pts;
}

function teamsAtOrAbove(pts: Pts, id: string): number {
  return Object.keys(pts).filter((k) => k !== id && pts[k] >= pts[id]).length;
}
function teamsStrictlyAbove(pts: Pts, id: string): number {
  return Object.keys(pts).filter((k) => k !== id && pts[k] > pts[id]).length;
}

/** Base (current) group points keyed by team id. */
function basePoints(group: string): Pts {
  return Object.fromEntries(
    TEAMS.filter((t) => t.group === group).map((t) => [t.id, t.points]),
  );
}

// ---- Cross-group third-place feasibility ----------------------------------

// The fewest points a group's third-placed team can finish on, over every
// completion of that group. Memoised — it depends only on the static dataset.
const minThirdCache = new Map<string, number>();
function minThirdPoints(group: string): number {
  const cached = minThirdCache.get(group);
  if (cached !== undefined) return cached;
  const base = basePoints(group);
  const rem = remainingMatches(group);
  let min = Infinity;
  for (const combo of combinations(rem)) {
    const pts = pointsFor(base, rem, combo);
    const third = Object.values(pts).sort((a, b) => b - a)[2];
    if (third < min) min = third;
  }
  minThirdCache.set(group, min);
  return min;
}

// The most points a team can finish on while landing in 3rd (its only route to
// the R32 once it's out of the top two). A team is 3rd in a completion iff
// exactly two teams are strictly above it on points. Returns -1 if it can never
// be better than 4th. Goal margins are free, so points alone decide this.
function maxThirdPoints(id: string, group: string): number {
  const base = basePoints(group);
  const rem = remainingMatches(group);
  let max = -1;
  for (const combo of combinations(rem)) {
    const pts = pointsFor(base, rem, combo);
    if (teamsStrictlyAbove(pts, id) === 2 && pts[id] > max) max = pts[id];
  }
  return max;
}

// Is a team (already out of the top two) also out of the best-third race? It is
// eliminated iff at least 8 other groups are FORCED to produce a third-placed
// team on more points than this team's best possible third-place total — i.e.
// fewer than 4 other groups can be arranged at or below it (where it would win
// the GD tie-break, since it can run up its own margin freely).
function eliminatedFromR32(id: string, group: string): boolean {
  const best = maxThirdPoints(id, group);
  if (best < 0) return true; // can't even finish 3rd
  const groups = allGroups();
  const canBeAtOrBelow = groups.filter(
    (g) => g !== group && minThirdPoints(g) <= best,
  ).length;
  const othersNeeded = groups.length - 1 - THIRDS_ADVANCING + 1; // = 4
  return canBeAtOrBelow < othersNeeded;
}

/**
 * Classify one group: status + scenario text for each of its four teams,
 * ordered by current standings.
 */
export function classifyGroup(group: string): GroupQualification {
  const standings = standingsForGroup(group);
  const rem = remainingMatches(group);
  const base = basePoints(group);
  const combos = combinations(rem);

  const teams = standings.map((t): TeamQualification => {
    const id = t.id;
    let clinchedTop2 = true;
    let clinchedFirst = true;
    let outOfTop2 = true;
    for (const combo of combos) {
      const pts = pointsFor(base, rem, combo);
      const atOrAbove = teamsAtOrAbove(pts, id);
      if (atOrAbove > 1) clinchedTop2 = false;
      if (atOrAbove > 0) clinchedFirst = false;
      if (teamsStrictlyAbove(pts, id) < 2) outOfTop2 = false;
    }

    let status: QualStatus;
    if (clinchedFirst) status = "clinched-first";
    else if (clinchedTop2) status = "clinched";
    else if (!outOfTop2) status = "alive";
    else status = eliminatedFromR32(id, group) ? "eliminated" : "out-top2";

    return { teamId: id, status, scenario: scenarioText(id, status, base, rem) };
  });

  return { group, remaining: rem.length, teams };
}

/** Human-readable summary of what a team has done / still needs. */
function scenarioText(
  id: string,
  status: QualStatus,
  base: Pts,
  rem: Match[],
): string {
  const left = rem.filter((m) => m.homeTeamId === id || m.awayTeamId === id);

  if (status === "clinched-first")
    return left.length === 0 ? "Won the group" : "Top spot secured";
  if (status === "clinched")
    return left.length === 0 ? "Through to the Round of 32" : "Qualified for the Round of 32";
  if (status === "eliminated")
    return left.length === 0 ? "Eliminated" : "Cannot reach the Round of 32";
  if (status === "out-top2")
    return "Can only reach the R32 as a best third-placed team";

  // Alive for the top two. The crisp cases are the final-matchday teams with
  // exactly one game left; otherwise keep it general.
  if (left.length !== 1) return "Still in contention for the top two";

  const tMatch = left[0];
  const opp = tMatch.homeTeamId === id ? tMatch.awayTeamId : tMatch.homeTeamId;
  const others = rem.filter((m) => m !== tMatch);
  const otherCombos = combinations(others);
  // Fix the team's last result (and the opponent's, since it's the same match),
  // then enumerate the remaining matches to test whether top 2 is then certain.
  const guaranteed = (tDelta: number, oppDelta: number): boolean => {
    const b: Pts = { ...base, [id]: base[id] + tDelta, [opp]: base[opp] + oppDelta };
    return otherCombos.every((combo) => teamsAtOrAbove(pointsFor(b, others, combo), id) <= 1);
  };
  const winGuar = guaranteed(3, 0);
  const drawGuar = guaranteed(1, 1);

  if (drawGuar) return "A win or draw guarantees qualification";
  if (winGuar) return "A win guarantees qualification";
  return "Must win and hope other results fall its way";
}

/** All twelve groups classified, in group order. */
export function qualificationByGroup(): GroupQualification[] {
  return allGroups().map((g) => classifyGroup(g));
}

// ---- Third-place race (cross-group) ----------------------------------------
// The eight best third-placed teams across the twelve groups also reach the
// Round of 32. This is a *live projection* of the current third-place table,
// not a clinch proof — the cutoff shifts as results land. Ordered by the
// official cross-group tie-break (points → GD → goals for → FIFA ranking;
// no head-to-head, since the teams are in different groups).
const byStrength = (a: Standing, b: Standing) =>
  b.points - a.points ||
  b.goalDiff - a.goalDiff ||
  b.goalsFor - a.goalsFor ||
  a.fifaRank - b.fifaRank;

export interface ThirdPlaceRow extends Standing {
  projectedIn: boolean; // currently inside the top-8 cutoff
}

export function thirdPlaceRace(): ThirdPlaceRow[] {
  const thirds: Standing[] = [];
  for (const g of allGroups()) {
    const row = standingsForGroup(g)[2];
    if (row) thirds.push(row);
  }
  return thirds
    .sort(byStrength)
    .map((t, i) => ({ ...t, projectedIn: i < THIRDS_ADVANCING }));
}
