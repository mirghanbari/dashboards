import { Link } from "react-router-dom";
import type { Match } from "../types";
import { getTeam } from "../data";

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

function TeamLine({ teamId, score, winner }: { teamId: string; score: number | null; winner: boolean }) {
  const team = getTeam(teamId);
  const isTbd = team.id === "tbd";
  const inner = (
    <>
      <span className="team-flag">{team.flag}</span>
      <span className="team-name">{team.name}</span>
      <span className="team-code">{team.code}</span>
    </>
  );
  return (
    <div className={"match-team" + (winner ? " is-winner" : "")}>
      {isTbd ? (
        <span className="team-id-wrap">{inner}</span>
      ) : (
        <Link to={`/teams/${team.id}`} className="team-id-wrap">
          {inner}
        </Link>
      )}
      <span className="match-score">{score ?? "–"}</span>
    </div>
  );
}

export function MatchCard({ match }: { match: Match }) {
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

  return (
    <article className={"match-card status-" + match.status}>
      <header className="match-head">
        <span className="match-stage">{stageLabel(match)}</span>
        {match.status === "live" ? (
          <span className="match-live">● LIVE {match.minute}'</span>
        ) : match.status === "finished" ? (
          <span className="match-ft">FT</span>
        ) : (
          <span className="match-when">
            {dateStr} · {timeStr}
          </span>
        )}
      </header>
      <div className="match-teams">
        <TeamLine teamId={match.homeTeamId} score={match.homeScore} winner={homeWin} />
        <TeamLine teamId={match.awayTeamId} score={match.awayScore} winner={awayWin} />
      </div>
      <footer className="match-foot">
        {match.venue}, {match.city}
      </footer>
    </article>
  );
}
