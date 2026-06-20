import { Link, useParams } from "react-router-dom";
import {
  getTeam,
  playersForTeam,
  matchesForTeam,
  standingsForGroup,
  predictionForTeam,
  eloRank,
  TEAMS,
} from "../data";
import { MatchCard } from "../components/MatchCard";
import { FavoriteStar } from "../components/FavoriteStar";
import { StatCard } from "../components/StatCard";
import { RatingBars } from "../components/RatingBars";
import { useJsonLd } from "../seo/jsonLd";
import { teamSchema } from "../seo/schema";
import type { Position } from "../types";

const fmtPct = (n: number) => Math.round(n * 100) + "%";

const POSITION_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];
const POSITION_LABEL: Record<Position, string> = {
  GK: "Goalkeepers",
  DEF: "Defenders",
  MID: "Midfielders",
  FWD: "Forwards",
};

export function TeamDetail() {
  const { teamId = "" } = useParams();
  const exists = TEAMS.some((t) => t.id === teamId);
  const team = getTeam(teamId);
  useJsonLd(exists ? teamSchema(team) : null);

  if (!exists) {
    return (
      <div className="empty">
        <p>Unknown team.</p>
        <Link to="/teams" className="btn">
          ← Back to teams
        </Link>
      </div>
    );
  }

  const squad = playersForTeam(teamId);
  const fixtures = matchesForTeam(teamId).sort(
    (a, b) => +new Date(a.date) - +new Date(b.date),
  );
  const standing = standingsForGroup(team.group).find((t) => t.id === teamId);
  const teamGoals = squad.reduce((s, p) => s + p.goals, 0);
  const pred = predictionForTeam(teamId);
  const rank = eloRank(teamId);

  return (
    <>
      <Link to="/teams" className="back-link">
        ← All teams
      </Link>

      <header className="team-hero">
        <span className="team-hero-flag">{team.flag}</span>
        <div>
          <div className="team-hero-titlerow">
            <h1 className="team-hero-name">{team.name}</h1>
            <FavoriteStar teamId={teamId} className="fav-star-lg" />
          </div>
          <p className="team-hero-meta">
            Group {team.group} · {team.confederation}
            {team.fifaRank > 0 && ` · FIFA rank #${team.fifaRank}`}
            {pred?.elo != null && ` · Elo ${pred.elo}${rank ? ` (#${rank})` : ""}`}
          </p>
        </div>
      </header>

      <section className="stat-grid">
        <StatCard label="Group position" value={standing ? `${standing.rank}${standing.rank <= 2 ? " ▲" : ""}` : "—"} sub={`Group ${team.group}`} />
        <StatCard label="Points" value={team.points} sub={`${team.won}W ${team.drawn}D ${team.lost}L`} />
        <StatCard label="Goals" value={`${team.goalsFor}:${team.goalsAgainst}`} sub="for : against" />
        {pred ? (
          <StatCard label="Title odds" value={fmtPct(pred.champion)} sub={`reach final ${fmtPct(pred.final)}`} />
        ) : (
          <StatCard label="Squad goals" value={teamGoals} sub={`${squad.length} players`} />
        )}
      </section>

      {pred && pred.attack != null && (
        <section className="rating-panel">
          <div className="rating-panel-main">
            <h2 className="rating-panel-title">Strength rating</h2>
            <RatingBars attack={pred.attack} defense={pred.defense} />
          </div>
          <div className="rating-panel-odds">
            <span>
              Win group <strong>{fmtPct(pred.winGroup)}</strong>
            </span>
            <span>
              Reach last 16 <strong>{fmtPct(pred.round16)}</strong>
            </span>
            <span>
              Win it all <strong>{fmtPct(pred.champion)}</strong>
            </span>
            <Link to="/predictions" className="rating-panel-link">
              Full model →
            </Link>
          </div>
        </section>
      )}

      <div className="two-col">
        <section className="section">
          <h2 className="section-title">Squad</h2>
          {POSITION_ORDER.map((pos) => {
            const group = squad
              .filter((p) => p.position === pos)
              .sort((a, b) => a.number - b.number);
            if (group.length === 0) return null;
            return (
              <div key={pos} className="squad-block">
                <h3 className="squad-pos">{POSITION_LABEL[pos]}</h3>
                <table className="squad-table">
                  <thead>
                    <tr>
                      <th className="col-num">#</th>
                      <th className="col-player">Player</th>
                      <th>Age</th>
                      <th>Apps</th>
                      <th>G</th>
                      <th>A</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((p) => (
                      <tr key={p.id}>
                        <td className="col-num">{p.number}</td>
                        <td className="col-player">
                          <Link to={`/players/${p.id}`} className="player-name player-link">
                            {p.name}
                          </Link>
                          <small className="player-club">
                            {[p.height, p.weight].filter(Boolean).join(" · ")}
                          </small>
                        </td>
                        <td>{p.age}</td>
                        <td>{p.appearances}</td>
                        <td>{p.goals || ""}</td>
                        <td>{p.assists || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </section>

        <section className="section">
          <h2 className="section-title">Fixtures</h2>
          <div className="match-grid">
            {fixtures.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
