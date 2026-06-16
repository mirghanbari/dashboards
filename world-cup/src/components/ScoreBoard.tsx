import { useNavigate } from "react-router-dom";
import type { Match } from "../types";
import { getTeam } from "../data";
import { stageLabel } from "./MatchCard";

/**
 * ESPN-style horizontal scoreboard strip for the top of the home page.
 * Shows the current (live) game(s) and the remaining games of the day, with
 * any already-finished games of the day trailing — the full day's slate, in a
 * compact scrollable row of tiles. If today has no games, it falls back to the
 * next day that does (so the strip is never empty during the tournament).
 */
export function ScoreBoard({ matches }: { matches: Match[] }) {
  const todayKey = new Date().toLocaleDateString();
  const dayKey = (m: Match) => new Date(m.date).toLocaleDateString();

  let games = matches.filter((m) => dayKey(m) === todayKey);
  let label = "Today";

  // Off-day fallback: show the soonest upcoming day that has games.
  if (games.length === 0) {
    const future = matches
      .filter((m) => +new Date(m.date) >= Date.now())
      .sort((a, b) => +new Date(a.date) - +new Date(b.date));
    if (future.length > 0) {
      const nextKey = dayKey(future[0]);
      games = matches.filter((m) => dayKey(m) === nextKey);
      label = new Date(future[0].date).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
  }

  if (games.length === 0) return null;

  // Current first, then remaining (upcoming), then finished — each by kickoff.
  const rank = (s: Match["status"]) => (s === "live" ? 0 : s === "scheduled" ? 1 : 2);
  const ordered = [...games].sort(
    (a, b) => rank(a.status) - rank(b.status) || +new Date(a.date) - +new Date(b.date),
  );

  return (
    <section className="scoreboard">
      <div className="scoreboard-head">
        <h2 className="scoreboard-title">{label}'s matches</h2>
        <span className="scoreboard-count">{games.length} games</span>
      </div>
      <div className="scoreboard-strip">
        {ordered.map((m) => (
          <ScoreTile key={m.id} match={m} />
        ))}
      </div>
    </section>
  );
}

function ScoreTile({ match }: { match: Match }) {
  const navigate = useNavigate();
  const home = getTeam(match.homeTeamId);
  const away = getTeam(match.awayTeamId);
  const finished = match.status === "finished";
  const homeWin = finished && (match.homeScore ?? 0) > (match.awayScore ?? 0);
  const awayWin = finished && (match.awayScore ?? 0) > (match.homeScore ?? 0);
  const open = () => navigate(`/matches/${match.id}`);

  const time = new Date(match.date).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <article
      className={"score-tile status-" + match.status}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      role="link"
      tabIndex={0}
      aria-label={`${home.name} vs ${away.name}`}
    >
      <div className="score-tile-head">
        <span className="score-tile-stage">{stageLabel(match)}</span>
        {match.status === "live" ? (
          <span className="score-tile-live">
            <span className="dot-live" /> {match.minute}'
          </span>
        ) : finished ? (
          <span className="score-tile-ft">FT</span>
        ) : (
          <span className="score-tile-time">{time}</span>
        )}
      </div>
      <ScoreRow team={home} score={match.homeScore} win={homeWin} dim={awayWin} />
      <ScoreRow team={away} score={match.awayScore} win={awayWin} dim={homeWin} />
    </article>
  );
}

function ScoreRow({
  team,
  score,
  win,
  dim,
}: {
  team: ReturnType<typeof getTeam>;
  score: number | null;
  win: boolean;
  dim: boolean;
}) {
  return (
    <div className={"score-row" + (win ? " is-winner" : "") + (dim ? " is-dim" : "")}>
      <span className="score-flag">{team.flag}</span>
      <span className="score-code">{team.code}</span>
      <span className="score-num">{score ?? "–"}</span>
    </div>
  );
}
