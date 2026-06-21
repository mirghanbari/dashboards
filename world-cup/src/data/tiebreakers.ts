// FIFA 2026 group tie-breakers, shared by the standings display and the
// qualification engine. Official order when teams finish level on group points:
//
//   1. Head-to-head points  (only the matches among the tied teams)
//   2. Head-to-head goal difference
//   3. Head-to-head goals scored
//   4. Overall goal difference
//   5. Overall goals scored
//   6. Fair-play / conduct score   — derived from the cards in each match
//      timeline (see `conductScore`); ties that survive it fall through to
//      FIFA ranking (we don't model the final "drawing of lots" step).
//   7. FIFA World Ranking
//
// The crucial property the engine relies on: head-to-head is computed only from
// matches that have a *result*. A match already played has a fixed head-to-head
// outcome — unlike a future goal margin, it cannot be wished away. That is what
// lets us prove a team is eliminated even when points alone leave it "alive".
import type { Match, Team } from "../types";

/** A decided match: points for each side, plus goals when known. The
 *  qualification enumeration deals in win/draw/loss only, so goals are optional
 *  there (head-to-head goal diff/scored simply don't contribute). */
export interface Decided {
  homeId: string;
  awayId: string;
  homePts: number;
  awayPts: number;
  homeGoals?: number;
  awayGoals?: number;
}

/** Turn a finished match into a decided result, or null if it has no score. */
export function decidedFromMatch(m: Match): Decided | null {
  if (m.status !== "finished" || m.homeScore == null || m.awayScore == null)
    return null;
  const h = m.homeScore;
  const a = m.awayScore;
  return {
    homeId: m.homeTeamId,
    awayId: m.awayTeamId,
    homePts: h > a ? 3 : h === a ? 1 : 0,
    awayPts: a > h ? 3 : h === a ? 1 : 0,
    homeGoals: h,
    awayGoals: a,
  };
}

export interface H2H {
  pts: number;
  gd: number;
  gf: number;
}

/** Head-to-head mini-table among `ids`: points (and, when the results carry
 *  goals, goal difference and goals for) earned only in matches where BOTH
 *  teams are in the set. */
export function headToHead(ids: string[], decided: Decided[]): Map<string, H2H> {
  const set = new Set(ids);
  const table = new Map<string, H2H>(
    ids.map((id) => [id, { pts: 0, gd: 0, gf: 0 }]),
  );
  for (const d of decided) {
    if (!set.has(d.homeId) || !set.has(d.awayId)) continue;
    const h = table.get(d.homeId)!;
    const a = table.get(d.awayId)!;
    h.pts += d.homePts;
    a.pts += d.awayPts;
    if (d.homeGoals != null && d.awayGoals != null) {
      h.gd += d.homeGoals - d.awayGoals;
      h.gf += d.homeGoals;
      a.gd += d.awayGoals - d.homeGoals;
      a.gf += d.awayGoals;
    }
  }
  return table;
}

// ---- Fair-play / conduct score --------------------------------------------
// FIFA disciplinary points, applied once per player per match for their worst
// outcome (the buckets are mutually exclusive — a sending-off is not also
// counted as the booking that may precede it):
//   yellow card ......................... −1
//   indirect red (second yellow) ........ −3
//   direct red .......................... −4
//   yellow + direct red (same player) ... −5
// A team's conduct score is the sum across all its group-stage cards (≤ 0;
// nearer zero is the better-behaved team and ranks higher).
const Y = -1;
const INDIRECT_RED = -3;
const DIRECT_RED = -4;
const YELLOW_AND_DIRECT_RED = -5;

interface PlayerCards {
  yellows: number;
  directRed: boolean;
  indirectRed: boolean; // a red explicitly flagged as a second yellow
}

function playerDeduction(c: PlayerCards): number {
  if (c.directRed) return c.yellows >= 1 ? YELLOW_AND_DIRECT_RED : DIRECT_RED;
  if (c.indirectRed || c.yellows >= 2) return INDIRECT_RED;
  if (c.yellows === 1) return Y;
  return 0;
}

/** FIFA fair-play conduct score for one team across the given matches. */
export function conductScore(teamId: string, matches: Match[]): number {
  let total = 0;
  for (const m of matches) {
    if (!m.timeline) continue;
    const byPlayer = new Map<string, PlayerCards>();
    for (const ev of m.timeline) {
      if (ev.teamId !== teamId) continue;
      if (ev.type !== "yellow" && ev.type !== "red") continue;
      const rec =
        byPlayer.get(ev.player) ??
        { yellows: 0, directRed: false, indirectRed: false };
      if (ev.type === "yellow") rec.yellows++;
      else if (/second|2nd|yellow/i.test(ev.text ?? "")) rec.indirectRed = true;
      else rec.directRed = true;
      byPlayer.set(ev.player, rec);
    }
    for (const rec of byPlayer.values()) total += playerDeduction(rec);
  }
  return total;
}

export interface OrderedTeam extends Team {
  goalDiff: number;
  rank: number;
  conduct: number;
}

/**
 * Order a group's teams by the full FIFA tie-break chain. Head-to-head is
 * evaluated within each block of teams level on points (a proper mini-table, so
 * it also resolves three-way ties), then falls through to overall goal
 * difference, overall goals, and finally FIFA ranking.
 */
export function orderGroupStandings(
  teams: Team[],
  groupMatches: Match[],
): OrderedTeam[] {
  const decided = groupMatches
    .map(decidedFromMatch)
    .filter((d): d is Decided => d !== null);

  // Mini-table for each points block, so each team carries its head-to-head
  // record among the teams it's actually level with.
  const byPoints = new Map<number, string[]>();
  for (const t of teams) {
    const bucket = byPoints.get(t.points);
    if (bucket) bucket.push(t.id);
    else byPoints.set(t.points, [t.id]);
  }
  const h2hByTeam = new Map<string, H2H>();
  for (const ids of byPoints.values()) {
    if (ids.length < 2) continue; // no tie to break
    for (const [id, rec] of headToHead(ids, decided)) h2hByTeam.set(id, rec);
  }
  const zero: H2H = { pts: 0, gd: 0, gf: 0 };

  return teams
    .map((t) => ({
      ...t,
      goalDiff: t.goalsFor - t.goalsAgainst,
      rank: 0,
      conduct: conductScore(t.id, groupMatches),
    }))
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const ha = h2hByTeam.get(a.id) ?? zero;
      const hb = h2hByTeam.get(b.id) ?? zero;
      return (
        hb.pts - ha.pts ||
        hb.gd - ha.gd ||
        hb.gf - ha.gf ||
        b.goalDiff - a.goalDiff ||
        b.goalsFor - a.goalsFor ||
        b.conduct - a.conduct ||
        a.fifaRank - b.fifaRank
      );
    })
    .map((t, i) => ({ ...t, rank: i + 1 }));
}
