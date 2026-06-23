import { Link, useParams } from "react-router-dom";
import { getMatch, getTeam, gameOdds, useLiveMatches } from "../data";
import { stageLabel } from "../components/MatchCard";
import { useJsonLd } from "../seo/jsonLd";
import { matchSchema } from "../seo/schema";
import { liveClock } from "../clock";
import type { Match, MatchEvent, MatchTeamStats } from "../types";

const EVENT_ICON: Record<MatchEvent["type"], string> = {
  goal: "⚽",
  yellow: "🟨",
  red: "🟥",
};

// Short label shown next to a goal scorer when ESPN tagged its method.
const GOAL_TYPE_LABEL: Record<NonNullable<MatchEvent["goalType"]>, string> = {
  penalty: "pen",
  own: "OG",
  header: "header",
  volley: "volley",
};

// The team-comparison stats to show, in display order. `suffix` for percentages,
// `decimals` for fractional values (xG). `asShare` renders the value as each
// side's % of the pair (the underlying raw counts drive the split) — used for
// field tilt, an approximate territorial-dominance share of opposition-box touches.
const STAT_ROWS: {
  key: keyof MatchTeamStats;
  label: string;
  suffix?: string;
  decimals?: number;
  asShare?: boolean;
}[] = [
  { key: "xg", label: "Expected goals (xG)", decimals: 2 },
  { key: "possession", label: "Possession", suffix: "%" },
  { key: "boxTouches", label: "Field tilt (approx)", asShare: true },
  { key: "shots", label: "Shots" },
  { key: "shotsOnTarget", label: "Shots on target" },
  { key: "passAccuracy", label: "Pass accuracy", suffix: "%" },
  { key: "accuratePasses", label: "Accurate passes" },
  { key: "duelsWon", label: "Duels won" },
  { key: "corners", label: "Corners" },
  { key: "offsides", label: "Offsides" },
  { key: "fouls", label: "Fouls" },
  { key: "saves", label: "Saves" },
];

const pct = (n: number) => Math.round(n * 100) + "%";

function TeamColumn({ teamId, slot }: { teamId: string; slot?: string }) {
  const team = getTeam(teamId);
  const isTbd = team.id === "tbd";
  const inner = (
    <>
      <span className="md-team-flag">{team.flag}</span>
      <span className={"md-team-name" + (isTbd && slot ? " is-slot" : "")}>
        {isTbd ? slot ?? team.name : team.name}
      </span>
    </>
  );
  return isTbd ? (
    <span className="md-team">{inner}</span>
  ) : (
    <Link to={`/teams/${team.id}`} className="md-team">
      {inner}
    </Link>
  );
}

function Timeline({ match }: { match: Match }) {
  const events = match.timeline ?? [];
  if (!events.length) return null;
  return (
    <section className="section">
      <h2 className="section-title">Goals &amp; cards</h2>
      <ul className="md-timeline">
        {events.map((e, i) => {
          const side = e.teamId === match.awayTeamId ? "away" : "home";
          const team = getTeam(e.teamId);
          return (
            <li key={i} className={"md-event md-event-" + side}>
              <span className="md-event-min">{e.minute}</span>
              <span className="md-event-body">
                <span className="md-event-icon">{EVENT_ICON[e.type]}</span>
                <span className="md-event-text">
                  <span className="md-event-player">
                    {e.player || team.name}
                    {e.goalType && (
                      <small className="md-event-goaltype">({GOAL_TYPE_LABEL[e.goalType]})</small>
                    )}
                  </span>
                  {e.assist && <small className="md-event-assist">assist: {e.assist}</small>}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatBars({ match }: { match: Match }) {
  const stats = match.stats;
  if (!stats) return null;
  const rows = STAT_ROWS.map((r) => ({
    ...r,
    home: stats.home[r.key] ?? 0,
    away: stats.away[r.key] ?? 0,
  })).filter((r) => r.home + r.away > 0);
  if (!rows.length) return null;
  return (
    <section className="section">
      <h2 className="section-title">Match stats</h2>
      <div className="md-stats">
        {rows.map((r) => {
          const total = r.home + r.away;
          const homeShare = total > 0 ? r.home / total : 0.5;
          const fmt = (n: number) => (r.decimals != null ? n.toFixed(r.decimals) : n);
          // Field tilt shows each side's % of the pair, not the raw touch counts.
          const homeVal = r.asShare ? Math.round(homeShare * 100) + "%" : `${fmt(r.home)}${r.suffix ?? ""}`;
          const awayVal = r.asShare ? Math.round((1 - homeShare) * 100) + "%" : `${fmt(r.away)}${r.suffix ?? ""}`;
          return (
            <div key={r.key} className="md-stat">
              <div className="md-stat-row">
                <span className="md-stat-val">{homeVal}</span>
                <span className="md-stat-label">{r.label}</span>
                <span className="md-stat-val">{awayVal}</span>
              </div>
              <div className="md-stat-bar">
                <span className="md-stat-seg md-stat-home" style={{ width: pct(homeShare) }} />
                <span className="md-stat-seg md-stat-away" style={{ width: pct(1 - homeShare) }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Forecast({ match }: { match: Match }) {
  const odds = gameOdds(match.homeTeamId, match.awayTeamId);
  if (!odds) return null;
  const home = getTeam(match.homeTeamId);
  const away = getTeam(match.awayTeamId);
  return (
    <section className="section">
      <h2 className="section-title">Forecast</h2>
      <p className="page-sub">Single-game model — DTAI (KU Leuven)</p>
      <div className="md-stats">
        <div className="md-stat">
          <div className="md-stat-row">
            <span className="md-stat-val">{pct(odds.win)}</span>
            <span className="md-stat-label">
              {home.code} win · Draw {pct(odds.tie)} · {away.code} win
            </span>
            <span className="md-stat-val">{pct(odds.loss)}</span>
          </div>
          <div className="pred-bar">
            <span className="pred-seg pred-win" style={{ width: pct(odds.win) }} />
            <span className="pred-seg pred-tie" style={{ width: pct(odds.tie) }} />
            <span className="pred-seg pred-loss" style={{ width: pct(odds.loss) }} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function MatchDetail() {
  const { matchId = "" } = useParams();
  const base = getMatch(matchId);
  // Overlay live updates polled since load — score/status/minute, plus a live
  // match's fresh timeline + stats — so the page updates in place (no reload).
  const livePatch = useLiveMatches().get(matchId);
  const match = base && livePatch ? { ...base, ...livePatch } : base;
  useJsonLd(match ? matchSchema(match) : null);

  if (!match) {
    return (
      <div className="empty">
        <p>Unknown match.</p>
        <Link to="/matches" className="btn">
          ← Back to matches
        </Link>
      </div>
    );
  }

  const date = new Date(match.date);
  const when =
    date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) +
    " · " +
    date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const status =
    match.status === "live" ? (
      <span className="md-status md-live">● LIVE {liveClock(match.minute)}</span>
    ) : match.status === "finished" ? (
      <span className="md-status md-ft">Full time</span>
    ) : (
      <span className="md-status">{when}</span>
    );

  const showScore = match.status !== "scheduled";

  return (
    <>
      <Link to="/matches" className="back-link">
        ← All matches
      </Link>

      <header className="md-hero">
        <div className="md-hero-meta">
          <span className="match-stage">{stageLabel(match)}</span>
          {status}
        </div>
        <div className="md-scoreline">
          <TeamColumn teamId={match.homeTeamId} slot={match.homeSlot} />
          <div className="md-score">
            {showScore ? (
              <>
                <span>{match.homeScore ?? "–"}</span>
                <span className="md-score-dash">–</span>
                <span>{match.awayScore ?? "–"}</span>
              </>
            ) : (
              <span className="md-vs">vs</span>
            )}
          </div>
          <TeamColumn teamId={match.awayTeamId} slot={match.awaySlot} />
        </div>
        <p className="md-venue">
          {match.venue}
          {match.city && `, ${match.city}`}
        </p>
        {match.broadcasts && match.broadcasts.length > 0 && (
          <div className="match-bcast" title="US TV / streaming">
            {match.broadcasts.map((b) => (
              <span key={b.name} className={"bcast bcast-" + b.type}>
                {b.type === "stream" ? "▶" : "📺"} {b.name}
              </span>
            ))}
          </div>
        )}
      </header>

      <Timeline match={match} />
      <StatBars match={match} />
      {match.status === "scheduled" && <Forecast match={match} />}

      {match.status !== "scheduled" && !match.timeline && !match.stats && (
        <p className="empty">No detailed stats available for this match yet.</p>
      )}
    </>
  );
}
