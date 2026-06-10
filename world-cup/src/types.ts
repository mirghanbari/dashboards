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
  minute: number | null; // current minute when live
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
  derive?: (p: Player) => number; // for computed metrics
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
