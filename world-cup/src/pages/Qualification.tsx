import { Link } from "react-router-dom";
import { getTeam, qualificationByGroup, thirdPlaceRace } from "../data";
import type { QualStatus, TeamQualification } from "../data";

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

function TeamRow({ q }: { q: TeamQualification }) {
  const team = getTeam(q.teamId);
  return (
    <li className={"qrow " + STATUS_CLASS[q.status]}>
      <span className="qrow-main">
        <span className="qrow-dot" aria-hidden />
        <Link to={`/teams/${team.id}`} className="qrow-team">
          <span className="team-flag">{team.flag}</span>
          <span className="qrow-name">{team.name}</span>
        </Link>
        <span className="qrow-status">{STATUS_LABEL[q.status]}</span>
      </span>
      <span className="qrow-scenario">{q.scenario}</span>
    </li>
  );
}

export function Qualification() {
  // Standings (and therefore the scenarios) are deploy-time data, refreshed by
  // the ingest pipeline every couple of minutes — same as the Teams standings.
  const groups = qualificationByGroup();
  const thirds = thirdPlaceRace();

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Road to the Round of 32</h1>
        <p className="page-sub">
          What every team needs to reach the knockouts — every status below is
          mathematically settled from the remaining fixtures, not a projection.
        </p>
      </header>

      <p className="tier-note">
        The top two from each of the 12 groups advance automatically, plus the{" "}
        <strong>8 best third-placed teams</strong> — 32 in all. Each label is{" "}
        <strong>provable on points</strong>: every remaining result is enumerated.
        “Qualified” / “Eliminated” mean mathematically certain; a team{" "}
        <strong>“Out of top 2”</strong> can still sneak in as a best third, and
        anything resting only on goal difference stays{" "}
        <strong>“In contention.”</strong> Group ties break on goal difference →
        goals scored → head-to-head → fair play → FIFA ranking.
      </p>

      <div className="qual-grid">
        {groups.map((g) => (
          <section key={g.group} className="qual-card">
            <header className="qual-card-head">
              <h2 className="qual-card-title">Group {g.group}</h2>
              <span className="qual-card-sub">
                {g.remaining === 0
                  ? "Group complete"
                  : `${g.remaining} match${g.remaining > 1 ? "es" : ""} left`}
              </span>
            </header>
            <ol className="qrow-list">
              {g.teams.map((q) => (
                <TeamRow key={q.teamId} q={q} />
              ))}
            </ol>
          </section>
        ))}
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Third-place race</h2>
        </div>
        <p className="page-sub">
          The eight best third-placed teams join the group winners and runners-up
          in the Round of 32. Live projection of the current third-place table —
          the cutoff line moves as results come in.
        </p>
        <table className="ranking-table third-race">
          <thead>
            <tr>
              <th className="col-pos">#</th>
              <th className="col-team">Team</th>
              <th>Grp</th>
              <th>P</th>
              <th>Pts</th>
              <th>GD</th>
              <th className="col-pts">GF</th>
            </tr>
          </thead>
          <tbody>
            {thirds.map((t, i) => (
              <tr
                key={t.id}
                className={
                  (t.projectedIn ? "third-in" : "third-out") +
                  (i === 7 ? " third-cutline" : "")
                }
              >
                <td className="col-pos">{i + 1}</td>
                <td className="col-team">
                  <Link to={`/teams/${t.id}`} className="team-cell">
                    <span className="team-flag">{t.flag}</span>
                    <span className="team-name">{t.name}</span>
                  </Link>
                </td>
                <td>{t.group}</td>
                <td>{t.played}</td>
                <td>{t.points}</td>
                <td>{t.goalDiff > 0 ? `+${t.goalDiff}` : t.goalDiff}</td>
                <td className="col-pts">{t.goalsFor}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="page-sub third-legend">
          <span className="third-in-key" /> projected to advance ·{" "}
          <span className="third-out-key" /> currently below the cutoff
        </p>
      </section>
    </>
  );
}
