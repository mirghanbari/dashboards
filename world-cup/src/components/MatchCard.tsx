import { Link, useNavigate } from "react-router-dom";
import type { Match } from "../types";
import { getTeam, gameOdds } from "../data";
import { liveClock } from "../clock";

const STAGE_LABEL: Record<string, string> = {
  group: "Group",
  round32: "Round of 32",
  round16: "Round of 16",
  quarter: "Quarter-final",
  semi: "Semi-final",
  third: "Third place",
  final: "Final",
};

export function stageLabel(m: Match): string {
  if (m.stage === "group") return `Group ${m.group}`;
  return STAGE_LABEL[m.stage] ?? m.stage;
}

function TeamLine({
  teamId,
  slot,
  score,
  winner,
}: {
  teamId: string;
  slot?: string;
  score: number | null;
  winner: boolean;
}) {
  const team = getTeam(teamId);
  const isTbd = team.id === "tbd";
  return (
    <div className={"match-team" + (winner ? " is-winner" : "")}>
      <span className="team-id-wrap">
        <span className="team-flag">{team.flag}</span>
        {isTbd ? (
          <span className={"team-name" + (slot ? " is-slot" : "")}>{slot ?? team.name}</span>
        ) : (
          // Only the country name links to the team page; the rest of the card
          // clicks through to the match detail. Stop the bubble so this wins.
          <Link
            to={`/teams/${team.id}`}
            className="team-name"
            onClick={(e) => e.stopPropagation()}
          >
            {team.name}
          </Link>
        )}
        <span className="team-code">{team.code}</span>
      </span>
      <span className="match-score">{score ?? "–"}</span>
    </div>
  );
}

const pct = (n: number) => Math.round(n * 100) + "%";

/** DTAI single-game win/draw/loss forecast, shown for upcoming fixtures. */
function MatchPrediction({ match }: { match: Match }) {
  const odds = gameOdds(match.homeTeamId, match.awayTeamId);
  if (!odds) return null; // undecided knockout slot, or team not in the model
  const home = getTeam(match.homeTeamId);
  const away = getTeam(match.awayTeamId);
  return (
    <div className="match-pred" title="Single-game forecast — DTAI (KU Leuven)">
      <div className="pred-bar">
        <span className="pred-seg pred-win" style={{ width: pct(odds.win) }} />
        <span className="pred-seg pred-tie" style={{ width: pct(odds.tie) }} />
        <span className="pred-seg pred-loss" style={{ width: pct(odds.loss) }} />
      </div>
      <div className="pred-key">
        <span>
          <i className="pred-dot pred-win" />
          {home.code} {pct(odds.win)}
        </span>
        <span>
          <i className="pred-dot pred-tie" />
          Draw {pct(odds.tie)}
        </span>
        <span>
          <i className="pred-dot pred-loss" />
          {away.code} {pct(odds.loss)}
        </span>
      </div>
    </div>
  );
}

/**
 * Field tilt (approx) — each team's share of touches in the opposition box, a
 * territorial-dominance proxy. Shown on live/finished cards once FotMob has data.
 */
function FieldTilt({ match }: { match: Match }) {
  const h = match.stats?.home.boxTouches;
  const a = match.stats?.away.boxTouches;
  if (h == null || a == null || h + a === 0) return null;
  const homeShare = h / (h + a);
  const home = getTeam(match.homeTeamId);
  const away = getTeam(match.awayTeamId);
  return (
    <div className="match-tilt" title="Field tilt (approx) — share of touches in the opposition box">
      <div className="tilt-bar">
        <span className="tilt-seg tilt-home" style={{ width: pct(homeShare) }} />
        <span className="tilt-seg tilt-away" style={{ width: pct(1 - homeShare) }} />
      </div>
      <div className="tilt-key">
        <span>
          {home.code} {pct(homeShare)}
        </span>
        <span className="tilt-label">Field tilt</span>
        <span>
          {pct(1 - homeShare)} {away.code}
        </span>
      </div>
    </div>
  );
}

export function MatchCard({ match }: { match: Match }) {
  const navigate = useNavigate();
  const date = new Date(match.date);
  const dateStr = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const timeStr = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const homeWin =
    match.status === "finished" &&
    match.homeScore !== null &&
    match.awayScore !== null &&
    match.homeScore > match.awayScore;
  const awayWin =
    match.status === "finished" &&
    match.homeScore !== null &&
    match.awayScore !== null &&
    match.awayScore > match.homeScore;

  const open = () => navigate(`/matches/${match.id}`);

  return (
    <article
      className={"match-card status-" + match.status + " is-clickable"}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      role="link"
      tabIndex={0}
      aria-label={`Match details: ${match.homeSlot ?? getTeam(match.homeTeamId).name} vs ${match.awaySlot ?? getTeam(match.awayTeamId).name}`}
    >
      <header className="match-head">
        <span className="match-stage">{stageLabel(match)}</span>
        {match.status === "live" ? (
          <span className="match-live">● LIVE {liveClock(match.minute)}</span>
        ) : match.status === "finished" ? (
          <span className="match-ft">FT</span>
        ) : (
          <span className="match-when">
            {dateStr} · {timeStr}
          </span>
        )}
      </header>
      <div className="match-teams">
        <TeamLine teamId={match.homeTeamId} slot={match.homeSlot} score={match.homeScore} winner={homeWin} />
        <TeamLine teamId={match.awayTeamId} slot={match.awaySlot} score={match.awayScore} winner={awayWin} />
      </div>
      {match.status === "scheduled" && <MatchPrediction match={match} />}
      {match.status !== "scheduled" && <FieldTilt match={match} />}
      {match.status !== "finished" && match.broadcasts && match.broadcasts.length > 0 && (
        <div className="match-bcast" title="US TV / streaming">
          {match.broadcasts.map((b) => (
            <span key={b.name} className={"bcast bcast-" + b.type}>
              {b.type === "stream" ? "▶" : "📺"} {b.name}
            </span>
          ))}
        </div>
      )}
      <footer className="match-foot">
        {match.venue}, {match.city}
      </footer>
    </article>
  );
}
