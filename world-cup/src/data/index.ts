import type {
  Team,
  Match,
  Player,
  Meta,
  Standing,
  Stage,
  Predictions,
  TeamPrediction,
  HeadToHead,
  GameOdds,
} from "../types";
import teamsJson from "./teams.json";
import matchesJson from "./matches.json";
import playersJson from "./players.json";
import metaJson from "./meta.json";
import predictionsJson from "./predictions.json";
import headToHeadJson from "./headtohead.json";
import { orderGroupStandings } from "./tiebreakers";

export const TEAMS = teamsJson as Team[];
export const MATCHES = matchesJson as Match[];
export const PLAYERS = playersJson as Player[];
export const META = metaJson as Meta;
export const PREDICTIONS = predictionsJson as Predictions;
export const HEAD_TO_HEAD = headToHeadJson as HeadToHead;

/** Title-odds-ranked predictions (highest champion probability first). */
export function predictionsByOdds(): TeamPrediction[] {
  return [...PREDICTIONS.teams].sort(
    (a, b) => b.champion - a.champion || b.final - a.final,
  );
}

const PREDICTION_BY_TEAM = new Map(
  PREDICTIONS.teams.filter((t) => t.teamId).map((t) => [t.teamId as string, t]),
);

/** The DTAI prediction row (stage odds + strength rating) for one of our teams. */
export function predictionForTeam(teamId: string): TeamPrediction | undefined {
  return PREDICTION_BY_TEAM.get(teamId);
}

/** A team's Elo rank (1 = strongest) among the 48 rated WC teams, or null. */
export function eloRank(teamId: string): number | null {
  const rated = PREDICTIONS.teams
    .filter((t) => t.elo != null)
    .sort((a, b) => (b.elo as number) - (a.elo as number));
  const i = rated.findIndex((t) => t.teamId === teamId);
  return i === -1 ? null : i + 1;
}

export interface TeamRanking {
  team: Team;
  fifaRank: number; // 0 if not yet ingested
  elo: number | null;
  eloRank: number | null; // 1 = strongest among the 48 rated WC teams
}

/**
 * The 48 WC teams with both ranking systems attached: FIFA world ranking (from
 * teams.json, via ingest-fifa-rankings.mjs) and the DTAI Elo rating + its rank
 * within the field. Unsorted — callers order by whichever column they show.
 */
export function teamRankings(): TeamRanking[] {
  const eloSorted = PREDICTIONS.teams
    .filter((t) => t.elo != null)
    .sort((a, b) => (b.elo as number) - (a.elo as number));
  const eloRankByTeam = new Map(eloSorted.map((t, i) => [t.teamId, i + 1]));
  return TEAMS.map((t) => {
    const pred = predictionForTeam(t.id);
    return {
      team: t,
      fifaRank: t.fifaRank,
      elo: pred?.elo ?? null,
      eloRank: eloRankByTeam.get(t.id) ?? null,
    };
  });
}

/** Strength-rated teams, strongest Elo first. */
export function teamsByRating(): TeamPrediction[] {
  return PREDICTIONS.teams
    .filter((t) => t.elo != null)
    .sort((a, b) => (b.elo as number) - (a.elo as number));
}

/**
 * DTAI's single-game win/tie/loss odds for a fixture, from the home team's
 * perspective. Returns null when either team isn't in the matrix (e.g. an
 * undecided knockout slot).
 */
export function gameOdds(homeTeamId: string, awayTeamId: string): GameOdds | null {
  return HEAD_TO_HEAD.matrix[homeTeamId]?.[awayTeamId] ?? null;
}

const TEAM_BY_ID = new Map(TEAMS.map((t) => [t.id, t]));

/** Look up a team by id; returns a safe "TBD" placeholder for unresolved slots. */
export function getTeam(id: string): Team {
  return (
    TEAM_BY_ID.get(id) ?? {
      id: "tbd",
      espnId: "",
      name: "To be decided",
      code: "TBD",
      flag: "🏳️",
      group: "",
      confederation: "UEFA",
      fifaRank: 0,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      possession: 0,
      ppda: 0,
      cleanSheets: 0,
      passCompletion: 0,
      xgFor: 0,
      xgAgainst: 0,
    }
  );
}

export const groupLetters = [...new Set(TEAMS.map((t) => t.group))].sort();

/**
 * Standings for a single group, ordered by the official FIFA 2026 tie-break
 * chain — points, then head-to-head (points → GD → goals among the level
 * teams), then overall GD → overall goals → FIFA ranking.
 */
export function standingsForGroup(group: string): Standing[] {
  return orderGroupStandings(
    TEAMS.filter((t) => t.group === group),
    MATCHES.filter((m) => m.stage === "group" && m.group === group),
  );
}

export function playersForTeam(teamId: string): Player[] {
  return PLAYERS.filter((p) => p.teamId === teamId);
}

export function matchesForTeam(teamId: string): Match[] {
  return MATCHES.filter(
    (m) => m.homeTeamId === teamId || m.awayTeamId === teamId,
  );
}

export const topScorers = (limit = 10): Player[] =>
  [...PLAYERS]
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists)
    .slice(0, limit);

export const topAssists = (limit = 10): Player[] =>
  [...PLAYERS].sort((a, b) => b.assists - a.assists || b.goals - a.goals).slice(0, limit);

export function getPlayer(id: string): Player | undefined {
  return PLAYERS.find((p) => p.id === id);
}

export function getMatch(id: string): Match | undefined {
  return MATCHES.find((m) => m.id === id);
}

const byStrength = (a: Standing, b: Standing) =>
  b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || a.fifaRank - b.fifaRank;

/** The 32 projected qualifiers: 12 winners, 12 runners-up, 8 best third places. */
export function projectedQualifiers(): Standing[] {
  const winners: Standing[] = [];
  const runners: Standing[] = [];
  const thirds: Standing[] = [];
  for (const g of groupLetters) {
    const rows = standingsForGroup(g);
    if (rows[0]) winners.push(rows[0]);
    if (rows[1]) runners.push(rows[1]);
    if (rows[2]) thirds.push(rows[2]);
  }
  const bestThirds = [...thirds].sort(byStrength).slice(0, 8);
  return [...winners, ...runners, ...bestThirds];
}

export interface BracketRound {
  stage: Stage;
  name: string;
  matchups: { home: Standing | null; away: Standing | null }[];
}

/**
 * A projected knockout bracket built from current standings. The Round of 32 is
 * seeded best-vs-worst across the 32 qualifiers; later rounds are placeholders
 * until results decide them. Display-only — not the official 2026 pairing.
 */
export function projectedBracket(): BracketRound[] {
  const seeds = [...projectedQualifiers()].sort(byStrength);
  const r32: BracketRound["matchups"] = [];
  for (let i = 0; i < Math.floor(seeds.length / 2); i++) {
    r32.push({ home: seeds[i] ?? null, away: seeds[seeds.length - 1 - i] ?? null });
  }
  const tbd = (n: number) =>
    Array.from({ length: n }, () => ({ home: null, away: null }));
  return [
    { stage: "round32", name: "Round of 32", matchups: r32 },
    { stage: "round16", name: "Round of 16", matchups: tbd(8) },
    { stage: "quarter", name: "Quarter-finals", matchups: tbd(4) },
    { stage: "semi", name: "Semi-finals", matchups: tbd(2) },
    { stage: "final", name: "Final", matchups: tbd(1) },
  ];
}

/** Total goals scored by every team in a group — for the per-group chart. */
export function goalsByGroup(): { label: string; value: number }[] {
  return groupLetters.map((g) => ({
    label: g,
    value: TEAMS.filter((t) => t.group === g).reduce((s, t) => s + t.goalsFor, 0),
  }));
}

export { useLiveMatches, applyLive } from "./live";
export {
  classifyGroup,
  qualificationByGroup,
  thirdPlaceRace,
  type QualStatus,
  type TeamQualification,
  type GroupQualification,
  type ThirdPlaceRow,
} from "./qualification";
