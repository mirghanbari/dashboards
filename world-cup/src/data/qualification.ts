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
//
// Data inputs are passed in (defaulting to the bundled deploy-time TEAMS/MATCHES)
// so the Qualification page can feed *live*-adjusted standings: a game that has
// finished since the last deploy moves the table the moment it ends, with no page
// reload. Games still in progress are deliberately NOT folded into these inputs
// (see `liveStandings` in live.ts) — only settled results drive a verdict, so a
// badge never flips on a score that can still change.
import { MATCHES, TEAMS } from ".";
import {
  headToHead,
  decidedFromMatch,
  orderGroupStandings,
  type Decided,
} from "./tiebreakers";
import type { Match, Standing, Team } from "../types";

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
  // Games each team still has to play (its own remaining fixtures), NOT the
  // group's total remaining fixtures — a 4-team group has 2 fixtures per
  // matchday, so "total fixtures left" reads as twice the rounds to go. We take
  // the max across the four teams so a round with staggered kickoffs (one
  // fixture done, one not) still reports the round as outstanding.
  matchesLeftPerTeam: number;
  teams: TeamQualification[]; // in current-standings order
}

type Pts = Record<string, number>;
type Outcome = "home" | "draw" | "away";
// For two teams level on points and head-to-head, whether the rival is above for
// sure (a locked goal-difference tie), below for sure, or still genuinely open
// (a remaining game can swing the margin either way).
type TieVerdict = "above" | "below" | "open";

const THIRDS_ADVANCING = 8;

// ---- Pure helpers (no data dependency) ------------------------------------

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

/**
 * How many teams finish above `id` in one completion, splitting "for sure" from
 * "possibly". Teams with more points are above either way. Teams level on
 * points are ranked by head-to-head points (fully determined by the results in
 * this completion — no goal margins needed): a level rival with MORE head-to-
 * head points is above for sure; one with EQUAL head-to-head points is a
 * genuine goal-difference tie that margins could swing either way (so it's
 * "possibly" above but not for sure); one with FEWER is below for sure.
 *   - `def`  drives elimination — we only call a team out when it's behind for
 *            sure, so we never over-eliminate on a margin that's still open.
 *   - `poss` drives clinching — a team is only safe when no rival can possibly
 *            pull level-or-ahead, so a free GD tie keeps it honest.
 *
 * `resolveTie(a, b)` settles a level-on-points/level-on-head-to-head pair: when
 * both teams have finished all their games the goal-difference tie is *locked*,
 * so the actual standings order decides it for sure ("above"/"below"); while
 * either still has a game to play it stays "open" (margins free). Defaults to
 * always-open so callers that don't care keep the conservative behaviour.
 */
function aheadCounts(
  pts: Pts,
  decided: Decided[],
  id: string,
  resolveTie: (a: string, b: string) => TieVerdict = () => "open",
): { def: number; poss: number } {
  const p = pts[id];
  const level = Object.keys(pts).filter((k) => pts[k] === p);
  const h2h = level.length > 1 ? headToHead(level, decided) : null;
  const mine = h2h?.get(id)?.pts ?? 0;
  let def = 0;
  let poss = 0;
  for (const k of Object.keys(pts)) {
    if (k === id) continue;
    if (pts[k] > p) {
      def++;
      poss++;
    } else if (pts[k] === p) {
      const theirs = h2h?.get(k)?.pts ?? 0;
      if (theirs > mine) {
        def++;
        poss++;
      } else if (theirs === mine) {
        const verdict = resolveTie(id, k);
        if (verdict === "above") {
          def++;
          poss++;
        } else if (verdict === "open") {
          poss++; // goal-difference tie a remaining game can still swing
        }
        // "below" → the rival is behind for sure; count it neither way.
      }
    }
  }
  return { def, poss };
}

// ---- The engine -----------------------------------------------------------
// All data-dependent logic closes over one (teams, matches) snapshot plus its
// own memo caches, so the same module serves both the static deploy-time data
// and a live-adjusted snapshot without cross-contaminating cached results.

interface Engine {
  groups: string[];
  classifyGroup(group: string): GroupQualification;
  thirdPlaceRace(): ThirdPlaceRow[];
}

function createEngine(teams: Team[], matches: Match[]): Engine {
  const groups = [...new Set(teams.map((t) => t.group))]
    .filter((g) => g)
    .sort();

  /** Every group match (played or not) for a group. */
  const groupMatches = (group: string): Match[] =>
    matches.filter((m) => m.stage === "group" && m.group === group);

  /** Remaining (not-yet-finished) matches in a group. */
  const remainingMatches = (group: string): Match[] =>
    groupMatches(group).filter((m) => m.status !== "finished");

  /** A group's teams, ordered by the full FIFA tie-break chain. */
  const standings = (group: string): Standing[] =>
    orderGroupStandings(
      teams.filter((t) => t.group === group),
      groupMatches(group),
    );

  /** Base (current) group points keyed by team id. */
  const basePoints = (group: string): Pts =>
    Object.fromEntries(
      teams.filter((t) => t.group === group).map((t) => [t.id, t.points]),
    );

  /**
   * A tie resolver for a group: for two teams level on points and head-to-head,
   * if BOTH have finished all their group games their goal difference is locked,
   * so the final standings order (the full FIFA chain) decides who is ahead for
   * certain. While either still has a game to play the margin can swing, so the
   * tie stays open. This is what lets a completed group report a clinched 2nd
   * place and a settled 3rd instead of leaving level rivals "in contention".
   */
  const tieResolver = (group: string): ((a: string, b: string) => TieVerdict) => {
    const order = standings(group);
    const rank: Record<string, number> = {};
    order.forEach((t, i) => (rank[t.id] = i));
    const playing = new Set<string>();
    for (const m of remainingMatches(group)) {
      playing.add(m.homeTeamId);
      playing.add(m.awayTeamId);
    }
    const done = (id: string) => !playing.has(id);
    return (a, b) =>
      done(a) && done(b) ? (rank[b] < rank[a] ? "above" : "below") : "open";
  };

  /**
   * The decided result of every group match for one completion: finished matches
   * keep their real result, the remaining matches take this combo's win/draw/loss
   * (no goals — margins are free, so head-to-head goal diff doesn't contribute).
   */
  const decidedForCombo = (
    group: string,
    rem: Match[],
    combo: Outcome[],
  ): Decided[] => {
    const out: Decided[] = [];
    for (const m of groupMatches(group)) {
      if (m.status === "finished") {
        const d = decidedFromMatch(m);
        if (d) out.push(d);
        continue;
      }
      const o = combo[rem.indexOf(m)];
      out.push({
        homeId: m.homeTeamId,
        awayId: m.awayTeamId,
        homePts: o === "home" ? 3 : o === "draw" ? 1 : 0,
        awayPts: o === "away" ? 3 : o === "draw" ? 1 : 0,
      });
    }
    return out;
  };

  // ---- Cross-group third-place feasibility --------------------------------

  // The fewest points a group's third-placed team can finish on, over every
  // completion of that group. Memoised within this engine snapshot.
  const minThirdCache = new Map<string, number>();
  const minThirdPoints = (group: string): number => {
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
  };

  // The most points a team can finish on while landing in 3rd (its only route to
  // the R32 once it's out of the top two). A team can be 3rd in a completion iff
  // exactly two teams finish above it for sure (head-to-head included); a third
  // rival only level on goal difference can be edged out with a free margin.
  // Returns -1 if it can never be better than 4th — that team is eliminated.
  const maxThirdPoints = (id: string, group: string): number => {
    const base = basePoints(group);
    const rem = remainingMatches(group);
    const resolveTie = tieResolver(group);
    let max = -1;
    for (const combo of combinations(rem)) {
      const pts = pointsFor(base, rem, combo);
      const { def } = aheadCounts(
        pts,
        decidedForCombo(group, rem, combo),
        id,
        resolveTie,
      );
      if (def === 2 && pts[id] > max) max = pts[id];
    }
    return max;
  };

  // Is a team (already out of the top two) also out of the best-third race? It is
  // eliminated iff at least 8 other groups are FORCED to produce a third-placed
  // team on more points than this team's best possible third-place total — i.e.
  // fewer than 4 other groups can be arranged at or below it (where it would win
  // the GD tie-break, since it can run up its own margin freely).
  const eliminatedFromR32 = (id: string, group: string): boolean => {
    const best = maxThirdPoints(id, group);
    if (best < 0) return true; // can't even finish 3rd
    const canBeAtOrBelow = groups.filter(
      (g) => g !== group && minThirdPoints(g) <= best,
    ).length;
    const othersNeeded = groups.length - 1 - THIRDS_ADVANCING + 1; // = 4
    return canBeAtOrBelow < othersNeeded;
  };

  /** Human-readable summary of what a team has done / still needs. */
  const scenarioText = (
    id: string,
    status: QualStatus,
    group: string,
    base: Pts,
    rem: Match[],
  ): string => {
    const left = rem.filter((m) => m.homeTeamId === id || m.awayTeamId === id);

    if (status === "clinched-first")
      return left.length === 0 ? "Won the group" : "Top spot secured";
    if (status === "clinched")
      return left.length === 0
        ? "Through to the Round of 32"
        : "Qualified for the Round of 32";
    if (status === "eliminated")
      return left.length === 0 ? "Eliminated" : "Cannot reach the Round of 32";
    if (status === "out-top2")
      return "Can only reach the R32 as a best third-placed team";

    // Alive for the top two. The crisp cases are the final-matchday teams with
    // exactly one game left; otherwise keep it general.
    if (left.length !== 1) return "Still in contention for the top two";

    const tMatch = left[0];
    const ti = rem.indexOf(tMatch);
    const idIsHome = tMatch.homeTeamId === id;
    const combos = combinations(rem);
    const resolveTie = tieResolver(group);
    // Fix the team's last result, enumerate every other remaining match, and test
    // whether top two is then certain — head-to-head and all (a draw can fall
    // short on a goal-difference tie even when the points look safe).
    const guaranteed = (result: "win" | "draw"): boolean => {
      const wanted: Outcome =
        result === "draw" ? "draw" : idIsHome ? "home" : "away";
      return combos
        .filter((c) => c[ti] === wanted)
        .every(
          (c) =>
            aheadCounts(
              pointsFor(base, rem, c),
              decidedForCombo(group, rem, c),
              id,
              resolveTie,
            ).poss <= 1,
        );
    };
    const winGuar = guaranteed("win");
    const drawGuar = guaranteed("draw");

    if (drawGuar) return "A win or draw guarantees qualification";
    if (winGuar) return "A win guarantees qualification";
    return "Must win and hope other results fall its way";
  };

  /**
   * Classify one group: status + scenario text for each of its four teams,
   * ordered by current standings.
   */
  const classifyGroup = (group: string): GroupQualification => {
    const ordered = standings(group);
    const rem = remainingMatches(group);
    const base = basePoints(group);
    const combos = combinations(rem);
    const resolveTie = tieResolver(group);

    const classified = ordered.map((t): TeamQualification => {
      const id = t.id;
      let clinchedTop2 = true;
      let clinchedFirst = true;
      let outOfTop2 = true;
      for (const combo of combos) {
        const pts = pointsFor(base, rem, combo);
        const { def, poss } = aheadCounts(
          pts,
          decidedForCombo(group, rem, combo),
          id,
          resolveTie,
        );
        if (poss > 1) clinchedTop2 = false;
        if (poss > 0) clinchedFirst = false;
        if (def < 2) outOfTop2 = false;
      }

      let status: QualStatus;
      if (clinchedFirst) status = "clinched-first";
      else if (clinchedTop2) status = "clinched";
      else if (!outOfTop2) status = "alive";
      else status = eliminatedFromR32(id, group) ? "eliminated" : "out-top2";

      return {
        teamId: id,
        status,
        scenario: scenarioText(id, status, group, base, rem),
      };
    });

    // Per-team games left: the most any one team in the group still has to play.
    const matchesLeftPerTeam = ordered.reduce((max, t) => {
      const cnt = rem.filter(
        (m) => m.homeTeamId === t.id || m.awayTeamId === t.id,
      ).length;
      return cnt > max ? cnt : max;
    }, 0);

    return { group, matchesLeftPerTeam, teams: classified };
  };

  // ---- Third-place race (cross-group) -------------------------------------
  // The eight best third-placed teams across the twelve groups also reach the
  // Round of 32. This is a *live projection* of the current third-place table,
  // not a clinch proof — the cutoff shifts as results land. Ordered by the
  // official cross-group tie-break (points → GD → goals for → FIFA ranking;
  // no head-to-head, since the teams are in different groups).
  const thirdPlaceRace = (): ThirdPlaceRow[] => {
    const thirds: Standing[] = [];
    for (const g of groups) {
      const row = standings(g)[2];
      if (row) thirds.push(row);
    }
    return thirds
      .sort(byStrength)
      .map((t, i) => ({ ...t, projectedIn: i < THIRDS_ADVANCING }));
  };

  return { groups, classifyGroup, thirdPlaceRace };
}

const byStrength = (a: Standing, b: Standing) =>
  b.points - a.points ||
  b.goalDiff - a.goalDiff ||
  b.goalsFor - a.goalsFor ||
  a.fifaRank - b.fifaRank;

export interface ThirdPlaceRow extends Standing {
  projectedIn: boolean; // currently inside the top-8 cutoff
}

// ---- Public API -----------------------------------------------------------
// Each call builds a fresh engine over the given snapshot (default = bundled
// deploy-time data). Cheap enough to run per render: ≤729 combos × 12 groups.

/** Classify a single group (default snapshot = bundled deploy-time data). */
export function classifyGroup(
  group: string,
  teams: Team[] = TEAMS,
  matches: Match[] = MATCHES,
): GroupQualification {
  return createEngine(teams, matches).classifyGroup(group);
}

/** All twelve groups classified, in group order. */
export function qualificationByGroup(
  teams: Team[] = TEAMS,
  matches: Match[] = MATCHES,
): GroupQualification[] {
  const engine = createEngine(teams, matches);
  return engine.groups.map((g) => engine.classifyGroup(g));
}

/** The cross-group third-place projection. */
export function thirdPlaceRace(
  teams: Team[] = TEAMS,
  matches: Match[] = MATCHES,
): ThirdPlaceRow[] {
  return createEngine(teams, matches).thirdPlaceRace();
}
