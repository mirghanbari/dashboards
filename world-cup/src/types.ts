// ---------- Core data model for the World Cup dashboard ----------
// These types are the contract between the data layer (JSON files in
// src/data, produced by the seed/fetch scripts) and the React app.

export type Stage =
  | "group"
  | "round32"
  | "round16"
  | "quarter"
  | "semi"
  | "third"
  | "final";

export type MatchStatus = "scheduled" | "live" | "finished";

export type Confederation =
  | "UEFA"
  | "CONMEBOL"
  | "CONCACAF"
  | "CAF"
  | "AFC"
  | "OFC";

export type Position = "GK" | "DEF" | "MID" | "FWD";

export interface Team {
  id: string;
  espnId: string; // ESPN team id (source of truth for fetches)
  name: string;
  code: string; // 3-letter code (ESPN abbreviation)
  flag: string; // emoji
  group: string; // "A".."L"
  confederation: Confederation;
  fifaRank: number;
  // Running group-stage record (from ESPN standings).
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  // Team-level tracking stats (filled in during the tournament; 0 until then).
  possession: number; // avg %
  ppda: number; // passes per defensive action
  cleanSheets: number;
  passCompletion: number; // team avg %
  xgFor: number; // cumulative team xG (sum of own players', from FotMob)
  xgAgainst: number; // cumulative xG conceded (sum of opponents')
}

export interface Match {
  id: string;
  espnEventId?: string; // ESPN event id, for pulling per-match player stats
  stage: Stage;
  group: string | null; // group letter for group-stage games, else null
  matchday: number | null;
  date: string; // ISO 8601
  venue: string;
  city: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  minute: string | null; // live clock token: "23", injury "45+2", or label "HT"
  broadcasts?: Broadcast[]; // US TV / streaming carriers (ESPN geoBroadcasts)
  // Per-match detail, populated for live/finished games (from the ESPN summary).
  timeline?: MatchEvent[]; // goals + cards, in order, with minute & scorer
  stats?: MatchStats; // home/away team comparison stats
}

export interface Broadcast {
  name: string;
  type: "tv" | "stream";
}

// A goal or card on the match timeline. `minute` is the display clock ("9'",
// "90'+2'"); `teamId` is our team id (or "" if unmapped). `assist` is the
// assisting player for goals. `text` is ESPN's short description.
export interface MatchEvent {
  type: "goal" | "yellow" | "red";
  minute: string;
  teamId: string;
  player: string;
  assist?: string;
  text?: string;
  // Goal method, when ESPN tags it (from the event text). Plain open-play
  // goals are left undefined. "own" = own goal (player scored into own net).
  goalType?: "penalty" | "own" | "header" | "volley";
}

// Per-match team stats, one value per side. All optional — a given feed may
// omit some. Possession/passAccuracy are percentages.
export interface MatchTeamStats {
  possession?: number;
  xg?: number; // expected goals (FotMob)
  shots?: number;
  shotsOnTarget?: number;
  passAccuracy?: number;
  accuratePasses?: number; // count of completed passes (ESPN)
  duelsWon?: number; // ground + aerial duels won (FotMob)
  boxTouches?: number; // touches in the opposition box (FotMob) — drives field tilt
  fouls?: number;
  corners?: number;
  offsides?: number;
  saves?: number;
}

export interface MatchStats {
  home: MatchTeamStats;
  away: MatchTeamStats;
}

export interface Player {
  id: string;
  name: string;
  teamId: string;
  position: Position;
  number: number;
  age: number;
  club: string;
  height: string; // e.g. 5' 10"
  weight: string; // e.g. 161 lbs
  // ---- appearances ----
  appearances: number;
  minutes: number;
  yellowCards: number;
  redCards: number;
  // ---- basic stats ----
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passCompletion: number; // %
  passes: number; // total passes attempted (denominator behind passCompletion)
  chancesCreated: number;
  tackles: number;
  interceptions: number;
  clearances: number;
  // ---- advanced stats ----
  xg: number; // expected goals
  xa: number; // expected assists
  xgot: number; // expected goals on target
  progressivePasses: number;
  progressiveCarries: number;
  finalThirdEntries: number;
  lineBreakingPasses: number;
  pressSuccess: number; // %
  highTurnovers: number;
  // ---- elite / tracking stats (require a tracking-data provider) ----
  obv: number; // on-ball value
  offBallRuns: number;
  xt: number; // expected threat
  vaep: number;
  highSpeedRunning: number; // metres run above 25 km/h
  sprintCount: number; // efforts above 30 km/h
  spaceCreation: number;
  setPieceXg: number;
}

// Stat metadata for the Stats page: groups each metric and records where the
// value can actually be sourced (so the UI never implies fake data is real).
export type StatTier = "basic" | "advanced" | "elite";
export type StatSource = "espn" | "fotmob" | "derived" | "fbref" | "model" | "provider";

export interface StatDef {
  key: string; // Player/Team field, or a derived id
  label: string;
  tier: StatTier;
  scope: "player" | "team";
  source: StatSource;
  unit?: string;
  decimals?: number;
  asc?: boolean; // leaderboard ranks ascending (lower is better, e.g. PPDA)
  qualifier?: string; // short note shown on the card, e.g. a min-volume gate
  derive?: (p: Player) => number; // for computed player metrics
  deriveTeam?: (t: Team) => number; // for computed team metrics
}

export interface Meta {
  tournament: string;
  hosts: string[];
  startDate: string;
  endDate: string;
  lastUpdated: string;
  source: string;
  note: string;
}

export interface Standing extends Team {
  goalDiff: number;
  rank: number; // position within the group
  // FIFA fair-play conduct score from group cards (≤ 0; nearer 0 is better).
  // Used as the last tie-break before FIFA ranking.
  conduct: number;
}

// ---------- International Friendlies (proof-of-concept data flow) ----------
// A lighter, self-contained dataset sourced from ESPN's fifa.friendly feed.

export interface FriendlyTeam {
  id: string;
  name: string;
  abbr: string;
  logo: string; // ESPN country crest URL
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface FriendlyPlayer {
  id: string;
  name: string;
  teamId: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}

export type FriendlyEventType = "goal" | "yellow" | "red";

export interface FriendlyEvent {
  type: FriendlyEventType;
  teamId: string;
  player: string;
  minute: string; // e.g. "55'"
}

export interface FriendlyMatchSide {
  id: string;
  name: string;
  abbr: string;
  logo: string;
  score: number | null;
}

export interface FriendlyMatch {
  id: string; // ESPN event id
  date: string;
  status: MatchStatus;
  minute: string | null;
  home: FriendlyMatchSide;
  away: FriendlyMatchSide;
  timeline: FriendlyEvent[]; // goals + cards, with minute, from the scoreboard
  assists: { teamId: string; player: string }[]; // from the boxscore
}

export interface Friendlies {
  lastUpdated: string;
  date: string;
  source: string;
  teams: FriendlyTeam[];
  players: FriendlyPlayer[];
  matches: FriendlyMatch[];
}

// ---------- Tournament predictions (DTAI Sports Analytics Lab) ----------
// Per-team probabilities of reaching each stage, derived from DTAI's 20,000
// Monte-Carlo simulations. All values are fractions in [0, 1]. Produced by
// scripts/ingest-predictions.mjs.
export interface TeamPrediction {
  code: string; // 3-letter FIFA code
  teamId: string | null; // joined to teams.json, or null if unmatched
  name: string;
  flag: string;
  group: string;
  winGroup: number; // finish 1st in the group
  advance: number; // reach the Round of 32 (knockouts)
  round16: number;
  quarter: number;
  semi: number;
  final: number;
  champion: number; // win the tournament
  // Strength ratings that feed the simulation (null if unmatched in ratings.csv).
  elo: number | null; // overall ELO-style rating
  off: number | null; // raw attack rating (higher = better)
  def: number | null; // raw defense rating (NEGATIVE; more negative = better)
  attack: number | null; // attack normalized 0..1 across the 48 WC teams
  defense: number | null; // defensive strength normalized 0..1 (1 = best)
}

export interface Predictions {
  source: string;
  sourceUrl: string;
  blogUrl: string;
  method: string;
  fetchedAt: string;
  teams: TeamPrediction[];
}

// ---------- Head-to-head single-game odds (DTAI) ----------
// matrix[homeTeamId][awayTeamId] = chance of each single-game result, from the
// home team's perspective. Keyed by our team ids. From scripts/ingest-predictions.mjs.
export interface GameOdds {
  win: number; // home team wins
  tie: number;
  loss: number; // away team wins
}

export interface HeadToHead {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  matrix: Record<string, Record<string, GameOdds>>;
}
