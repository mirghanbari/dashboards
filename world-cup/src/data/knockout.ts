import type { Match, MatchStatus, Stage, Team } from "../types";
import { getTeam } from "./index";

// A single team's side of a knockout match: either a resolved team (with its
// score + whether it won) or an unresolved slot showing its bracket-position
// label ("Round of 32 7 Winner", "Third Place Group A/B/C/D/F", …).
export interface BracketSlot {
  team: Team | null;
  slotLabel: string | null;
  score: number | null;
  /** Penalty-shootout score, when the game finished level and went to kicks. */
  pens: number | null;
  isWinner: boolean;
}

export interface BracketMatch {
  id: string;
  stage: Stage;
  status: MatchStatus;
  date: string;
  home: BracketSlot;
  away: BracketSlot;
  /** Vertical order within the round (bracket-tree order, not schedule order). */
  pos: number;
}

export interface KnockoutRound {
  stage: Stage;
  name: string;
  matches: BracketMatch[];
}

export interface Knockout {
  rounds: KnockoutRound[];
  thirdPlace: BracketMatch | null;
}

const ROUNDS: { stage: Stage; name: string }[] = [
  { stage: "round32", name: "Round of 32" },
  { stage: "round16", name: "Round of 16" },
  { stage: "quarter", name: "Quarter-finals" },
  { stage: "semi", name: "Semi-finals" },
  { stage: "final", name: "Final" },
];

const isReal = (id: string | null | undefined): id is string =>
  !!id && id !== "tbd";

const bySchedule = (a: Match, b: Match) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1;

/** The 1-based ordinal in a slot label, e.g. "Round of 32 7 Winner" → 7. */
function slotOrdinal(label?: string): number | null {
  if (!label) return null;
  const m = label.match(/(\d+)\s*Winner\b/i);
  return m ? Number(m[1]) : null;
}

/**
 * Build the live knockout bracket from the schedule. Winners flow forward
 * automatically (ESPN assigns the real team into the next round's slot, or —
 * for a game that finished level and went to penalties — we read the winner off
 * whichever side turns up in a later round). Every column is ordered by the
 * bracket tree (walked down from the final) so connector lines never cross,
 * regardless of the raw fixture order.
 */
export function knockoutBracket(matches: Match[]): Knockout {
  // Schedule-ordered matches per stage — slot ordinals index into this order.
  const stageMatches = new Map<Stage, Match[]>();
  for (const { stage } of ROUNDS) {
    stageMatches.set(stage, matches.filter((m) => m.stage === stage).sort(bySchedule));
  }

  // Teams that appear in each round-index or later — a team level on the score
  // that shows up in a later round is the one that advanced (won on penalties).
  const teamsFromIndex: Set<string>[] = ROUNDS.map(() => new Set<string>());
  for (let i = ROUNDS.length - 1; i >= 0; i--) {
    if (i < ROUNDS.length - 1) {
      for (const t of teamsFromIndex[i + 1]) teamsFromIndex[i].add(t);
    }
    for (const m of stageMatches.get(ROUNDS[i].stage)!) {
      if (isReal(m.homeTeamId)) teamsFromIndex[i].add(m.homeTeamId);
      if (isReal(m.awayTeamId)) teamsFromIndex[i].add(m.awayTeamId);
    }
  }

  const winnerOf = (m: Match, stageIdx: number): string | null => {
    if (m.status !== "finished") return null;
    const { homeTeamId: h, awayTeamId: a, homeScore: hs, awayScore: as_ } = m;
    if (hs != null && as_ != null && hs !== as_) return hs > as_ ? h : a;
    // Level after extra time: the shootout result decides it directly.
    if (m.shootout && m.shootout.homeScore !== m.shootout.awayScore)
      return m.shootout.homeScore > m.shootout.awayScore ? h : a;
    // No shootout data (yet): the survivor plays on next round.
    const later = teamsFromIndex[stageIdx + 1];
    if (later) {
      if (isReal(h) && later.has(h)) return h;
      if (isReal(a) && later.has(a)) return a;
    }
    return null;
  };

  // Winner → its match, per round, so a filled next-round team can be traced
  // back to the game it came out of (used to link connectors when ESPN has
  // already dropped the slot label).
  const winnerToMatch = ROUNDS.map((_, i) => {
    const map = new Map<string, Match>();
    for (const m of stageMatches.get(ROUNDS[i].stage)!) {
      const w = winnerOf(m, i);
      if (w) map.set(w, m);
    }
    return map;
  });

  // The two previous-round matches feeding a given match (home feeder on top).
  const feedersOf = (m: Match, stageIdx: number): [Match | null, Match | null] => {
    if (stageIdx === 0) return [null, null];
    const prev = stageMatches.get(ROUNDS[stageIdx - 1].stage)!;
    const resolve = (teamId: string, slot?: string): Match | null => {
      if (isReal(teamId)) {
        const via = winnerToMatch[stageIdx - 1].get(teamId);
        if (via) return via;
      }
      const ord = slotOrdinal(slot);
      return ord && prev[ord - 1] ? prev[ord - 1] : null;
    };
    return [resolve(m.homeTeamId, m.homeSlot), resolve(m.awayTeamId, m.awaySlot)];
  };

  // Walk the tree from the final so R32 leaves land in bracket order.
  const pos = new Map<string, number>();
  const stageIdxById = new Map<string, number>();
  for (let i = 0; i < ROUNDS.length; i++)
    for (const m of stageMatches.get(ROUNDS[i].stage)!) stageIdxById.set(m.id, i);

  let leaf = 0;
  const assign = (m: Match): number => {
    if (pos.has(m.id)) return pos.get(m.id)!;
    const idx = stageIdxById.get(m.id)!;
    const [fh, fa] = feedersOf(m, idx);
    let p: number;
    if (!fh && !fa) {
      p = leaf++; // R32 leaf
    } else {
      const ph = fh ? assign(fh) : leaf++;
      const pa = fa ? assign(fa) : leaf++;
      p = (ph + pa) / 2;
    }
    pos.set(m.id, p);
    return p;
  };
  const finalMatch = stageMatches.get("final")![0];
  if (finalMatch) assign(finalMatch);
  // Any match not reached from the final (shouldn't happen) falls back to order.
  for (let i = 0; i < ROUNDS.length; i++)
    for (const m of stageMatches.get(ROUNDS[i].stage)!) if (!pos.has(m.id)) assign(m);

  const slotFor = (teamId: string, score: number | null, pens: number | null, slot: string | undefined, won: string | null): BracketSlot =>
    isReal(teamId)
      ? { team: getTeam(teamId), slotLabel: null, score, pens, isWinner: won === teamId }
      : { team: null, slotLabel: slot ?? "To be decided", score: null, pens: null, isWinner: false };

  const toBracket = (m: Match, stageIdx: number): BracketMatch => {
    const won = winnerOf(m, stageIdx);
    return {
      id: m.id,
      stage: m.stage,
      status: m.status,
      date: m.date,
      home: slotFor(m.homeTeamId, m.homeScore, m.shootout?.homeScore ?? null, m.homeSlot, won),
      away: slotFor(m.awayTeamId, m.awayScore, m.shootout?.awayScore ?? null, m.awaySlot, won),
      pos: pos.get(m.id) ?? 0,
    };
  };

  const rounds: KnockoutRound[] = ROUNDS.map(({ stage, name }, i) => ({
    stage,
    name,
    matches: stageMatches.get(stage)!.map((m) => toBracket(m, i)).sort((a, b) => a.pos - b.pos),
  }));

  const thirdRaw = matches.find((m) => m.stage === "third") ?? null;
  const thirdPlace = thirdRaw ? toBracket(thirdRaw, ROUNDS.length - 1) : null;

  return { rounds, thirdPlace };
}
