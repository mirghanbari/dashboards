import { Link } from "react-router-dom";
import type { Match } from "../types";
import { getTeam, standingsForGroup, classifyGroup, predictionForTeam } from "../data";
import type { QualStatus } from "../data";
import { useFavorites } from "../favorites";
import { FavoriteStar } from "./FavoriteStar";
import { MatchCard } from "./MatchCard";

// Mirrors the Qualification page so a starred team reads the same everywhere.
const STATUS_LABEL: Record<QualStatus, string> = {
  "clinched-first": "Group winners",
  clinched: "Qualified",
  alive: "In contention",
  "out-top2": "Out of top 2",
  eliminated: "Eliminated",
};
const STATUS_CLASS: Record<QualStatus, string> = {
  "clinched-first": "q-in",
  clinched: "q-in",
  alive: "q-alive",
  "out-top2": "q-out2",
  eliminated: "q-elim",
};

const pct = (n: number) => Math.round(n * 100) + "%";
const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

function FavoriteCard({ teamId, matches }: { teamId: string; matches: Match[] }) {
  const team = getTeam(teamId);
  if (team.id === "tbd") return null;

  const standing = standingsForGroup(team.group).find((t) => t.id === teamId);
  const qual = classifyGroup(team.group).teams.find((t) => t.teamId === teamId);
  const pred = predictionForTeam(teamId);

  // Lead the "next up" with a live game if one's on, else the next scheduled
  // fixture, else fall back to the most recent result. Reuses MatchCard so the
  // forecast bar / live score come for free and stay consistent with the feed.
  const teamMatches = matches
    .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const live = teamMatches.find((m) => m.status === "live");
  const upcoming = teamMatches.find((m) => m.status === "scheduled");
  const lastFinished = [...teamMatches].reverse().find((m) => m.status === "finished");
  const feature = live ?? upcoming ?? lastFinished;
  const featureLabel = live ? "Live now" : upcoming ? "Next up" : "Latest result";

  return (
    <article className="fav-card">
      <header className="fav-card-head">
        <Link to={`/teams/${team.id}`} className="fav-card-team">
          <span className="fav-card-flag">{team.flag}</span>
          <span className="fav-card-name">{team.name}</span>
        </Link>
        <FavoriteStar teamId={teamId} className="fav-star-lg" />
      </header>

      {standing && (
        <p className="fav-card-meta">
          {ordinal(standing.rank)} in Group {team.group} · {standing.points} pt
          {standing.points === 1 ? "" : "s"} · {standing.won}W {standing.drawn}D{" "}
          {standing.lost}L
        </p>
      )}

      {qual && (
        <div className={"fav-qual " + STATUS_CLASS[qual.status]}>
          <span className="fav-qual-status">{STATUS_LABEL[qual.status]}</span>
          <span className="fav-qual-scenario">{qual.scenario}</span>
        </div>
      )}

      {feature && (
        <div className="fav-card-match">
          <span className="fav-card-match-label">{featureLabel}</span>
          <MatchCard match={feature} />
        </div>
      )}

      {pred && (
        <p className="fav-card-odds">
          <Link to="/predictions">
            Title odds <strong>{pct(pred.champion)}</strong> · reach last 16{" "}
            <strong>{pct(pred.round16)}</strong> →
          </Link>
        </p>
      )}
    </article>
  );
}

/** Personalised panel of the visitor's starred teams. Renders nothing until at
 *  least one team is starred, so it stays invisible for first-time visitors. */
export function FavoriteTeams({ matches }: { matches: Match[] }) {
  const favs = useFavorites();
  if (favs.length === 0) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">★ Your teams</h2>
        <Link to="/teams" className="see-all">
          Manage →
        </Link>
      </div>
      <div className="fav-grid">
        {favs.map((id) => (
          <FavoriteCard key={id} teamId={id} matches={matches} />
        ))}
      </div>
    </section>
  );
}
