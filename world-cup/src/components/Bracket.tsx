import { Link } from "react-router-dom";
import { projectedBracket } from "../data";
import type { Standing } from "../types";

function Slot({ team }: { team: Standing | null }) {
  if (!team) {
    return (
      <div className="bracket-slot is-tbd">
        <span className="team-flag">🏳️</span>
        <span className="team-name">TBD</span>
      </div>
    );
  }
  return (
    <Link to={`/teams/${team.id}`} className="bracket-slot">
      <span className="team-flag">{team.flag}</span>
      <span className="team-name">{team.name}</span>
      <span className="bracket-seed">{team.group}{team.rank}</span>
    </Link>
  );
}

export function Bracket() {
  const rounds = projectedBracket();
  return (
    <>
      <p className="bracket-note">
        Projected bracket from current standings · Round of 32 seeded best-vs-worst.
        Later rounds resolve as results come in.
      </p>
      <div className="bracket">
        {rounds.map((round) => (
          <div className="bracket-round" key={round.stage}>
            <h3 className="bracket-round-title">{round.name}</h3>
            <div className="bracket-matchups">
              {round.matchups.map((m, i) => (
                <div className="bracket-match" key={i}>
                  <Slot team={m.home} />
                  <Slot team={m.away} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
