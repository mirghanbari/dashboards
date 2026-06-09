import { Link } from "react-router-dom";
import { groupLetters, standingsForGroup } from "../data";

export function Teams() {
  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Teams &amp; Groups</h1>
        <p className="page-sub">
          Live standings across all 12 groups · top two advance
        </p>
      </header>

      <div className="group-grid">
        {groupLetters.map((g) => {
          const rows = standingsForGroup(g);
          return (
            <section key={g} className="group-card">
              <h2 className="group-title">Group {g}</h2>
              <table className="standings">
                <thead>
                  <tr>
                    <th className="col-pos">#</th>
                    <th className="col-team">Team</th>
                    <th>P</th>
                    <th>W</th>
                    <th>D</th>
                    <th>L</th>
                    <th>GD</th>
                    <th className="col-pts">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id} className={t.rank <= 2 ? "qualifies" : ""}>
                      <td className="col-pos">{t.rank}</td>
                      <td className="col-team">
                        <Link to={`/teams/${t.id}`} className="team-cell">
                          <span className="team-flag">{t.flag}</span>
                          <span className="team-name">{t.name}</span>
                        </Link>
                      </td>
                      <td>{t.played}</td>
                      <td>{t.won}</td>
                      <td>{t.drawn}</td>
                      <td>{t.lost}</td>
                      <td>{t.goalDiff > 0 ? `+${t.goalDiff}` : t.goalDiff}</td>
                      <td className="col-pts">{t.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>
    </>
  );
}
