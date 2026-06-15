import { Link, useParams } from "react-router-dom";
import { getPlayer, getTeam, playersForTeam, PLAYERS } from "../data";
import { StatCard } from "../components/StatCard";
import { useJsonLd } from "../seo/jsonLd";
import { playerSchema } from "../seo/schema";
import type { Position } from "../types";

const POSITION_LABEL: Record<Position, string> = {
  GK: "Goalkeeper",
  DEF: "Defender",
  MID: "Midfielder",
  FWD: "Forward",
};

export function PlayerDetail() {
  const { playerId = "" } = useParams();
  const player = getPlayer(playerId);
  useJsonLd(player ? playerSchema(player) : null);

  if (!player) {
    return (
      <div className="empty">
        <p>Unknown player.</p>
        <Link to="/players" className="btn">
          ← Back to players
        </Link>
      </div>
    );
  }

  const team = getTeam(player.teamId);
  const minsPerGoal =
    player.goals > 0 ? Math.round(player.minutes / player.goals) : null;

  // Rank within the tournament's scorers (for a bit of context).
  const scorerRank =
    [...PLAYERS].sort((a, b) => b.goals - a.goals).findIndex((p) => p.id === player.id) + 1;

  // Team-mates at the same position, for quick navigation.
  const teammates = playersForTeam(player.teamId)
    .filter((p) => p.position === player.position && p.id !== player.id)
    .sort((a, b) => a.number - b.number);

  return (
    <>
      <Link to="/players" className="back-link">
        ← All players
      </Link>

      <header className="player-hero">
        <span className="player-hero-num">{player.number}</span>
        <div className="player-hero-body">
          <h1 className="player-hero-name">{player.name}</h1>
          <p className="player-hero-meta">
            <Link to={`/teams/${team.id}`} className="player-hero-team">
              {team.flag} {team.name}
            </Link>
            <span className={"pos-badge pos-" + player.position}>
              {POSITION_LABEL[player.position]}
            </span>
            {player.number > 0 && <span>· #{player.number}</span>}
            <span>· Age {player.age}</span>
            {player.height && <span>· {player.height}</span>}
            {player.weight && <span>· {player.weight}</span>}
          </p>
        </div>
      </header>

      <section className="stat-grid">
        <StatCard label="Goals" value={player.goals} sub={player.goals > 0 ? `#${scorerRank} overall` : "—"} />
        <StatCard label="Assists" value={player.assists} />
        <StatCard label="Appearances" value={player.appearances} sub={`${player.minutes} min`} />
        <StatCard
          label="Cards"
          value={`${player.yellowCards}🟨 ${player.redCards}🟥`}
          sub={minsPerGoal ? `${minsPerGoal} min / goal` : undefined}
        />
      </section>

      {teammates.length > 0 && (
        <section className="section">
          <h2 className="section-title">
            Other {team.name} {POSITION_LABEL[player.position].toLowerCase()}s
          </h2>
          <div className="chip-row">
            {teammates.map((p) => (
              <Link key={p.id} to={`/players/${p.id}`} className="chip">
                {p.number} {p.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
