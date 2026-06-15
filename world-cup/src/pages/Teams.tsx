import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { groupLetters, standingsForGroup, teamRankings } from "../data";

// A couple of full names overflow the narrow group-standings column; show a
// compact label (the FIFA code) there instead. Falls back to the full name.
const STANDINGS_LABEL: Record<string, string> = { bih: "BIH" };

type RankSort = "fifa" | "elo";

function WorldRankings() {
  const [sort, setSort] = useState<RankSort>("fifa");
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    const all = teamRankings();
    return all.sort((a, b) =>
      sort === "fifa"
        ? (a.fifaRank || Infinity) - (b.fifaRank || Infinity)
        : (a.eloRank ?? Infinity) - (b.eloRank ?? Infinity),
    );
  }, [sort]);

  const TOP_N = 10;
  const visible = showAll ? rows : rows.slice(0, TOP_N);
  const hasFifa = rows.some((r) => r.fifaRank > 0);

  return (
    <section className="section">
      <div className="rankings-head">
        <h2 className="section-title">World rankings</h2>
        <div className="rankings-toggle" role="tablist" aria-label="Sort rankings by">
          <button
            type="button"
            role="tab"
            aria-selected={sort === "fifa"}
            className={"rankings-tab" + (sort === "fifa" ? " is-active" : "")}
            onClick={() => setSort("fifa")}
          >
            FIFA
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sort === "elo"}
            className={"rankings-tab" + (sort === "elo" ? " is-active" : "")}
            onClick={() => setSort("elo")}
          >
            Elo
          </button>
        </div>
      </div>
      <p className="page-sub">
        Official FIFA/Coca-Cola World Ranking vs. the DTAI (KU Leuven) Elo model that feeds the title odds.
      </p>
      <table className="ranking-table">
        <thead>
          <tr>
            <th className="col-pos">FIFA</th>
            <th className="col-team">Team</th>
            <th className="col-num">Elo #</th>
            <th className="col-pts">Rating</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.team.id}>
              <td className="col-pos">{r.fifaRank > 0 ? r.fifaRank : "—"}</td>
              <td className="col-team">
                <Link to={`/teams/${r.team.id}`} className="team-cell">
                  <span className="team-flag">{r.team.flag}</span>
                  <span className="team-name">{r.team.name}</span>
                </Link>
              </td>
              <td className="col-num">{r.eloRank ?? "—"}</td>
              <td className="col-pts">{r.elo != null ? Math.round(r.elo) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > TOP_N && (
        <button
          type="button"
          className="rankings-more"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? "Show top 10" : `Show all ${rows.length} →`}
        </button>
      )}
      {!hasFifa && (
        <p className="page-sub">FIFA ranking populates on the next data refresh.</p>
      )}
    </section>
  );
}

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
                          <span className="team-name">
                            {STANDINGS_LABEL[t.id] ?? t.name}
                          </span>
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

      <WorldRankings />
    </>
  );
}
