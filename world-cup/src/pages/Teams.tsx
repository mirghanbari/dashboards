import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { groupLetters, standingsForGroup, teamRankings, classifyGroup } from "../data";
import type { QualStatus } from "../data";
import { FavoriteStar } from "../components/FavoriteStar";

// A couple of full names overflow the narrow group-standings column; show a
// compact label (the FIFA code) there instead. Falls back to the full name.
const STANDINGS_LABEL: Record<string, string> = { bih: "BIH" };

// A compact qualification badge for the standings rows. Only the fully decided
// states (clinched a R32 spot / mathematically eliminated) get a chip; "in
// contention" and "out of top 2 but alive via the third-place race" stay
// unlabelled to keep the table clean. Full per-team scenarios live on the
// Qualification page.
function QualBadge({ status }: { status: QualStatus }) {
  if (status === "clinched-first")
    return <span className="qbadge qbadge-in" title="Won the group">✓ 1st</span>;
  if (status === "clinched")
    return <span className="qbadge qbadge-in" title="Qualified for the Round of 32">✓ R32</span>;
  if (status === "eliminated")
    return <span className="qbadge qbadge-out" title="Eliminated — cannot reach the Round of 32">out</span>;
  return null;
}

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
      <header className="page-head page-head-row">
        <div>
          <h1 className="page-title">Teams &amp; Groups</h1>
          <p className="page-sub">
            Live standings across all 12 groups · top two advance
          </p>
        </div>
        <Link to="/qualification" className="chip">
          Road to Round of 32 →
        </Link>
      </header>

      <div className="group-grid">
        {groupLetters.map((g) => {
          const rows = standingsForGroup(g);
          const status = new Map(
            classifyGroup(g).teams.map((t) => [t.teamId, t.status]),
          );
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
                  {rows.map((t) => {
                    const qstatus = status.get(t.id) ?? "alive";
                    // A qualification badge adds ~50px to the team cell, which
                    // is enough to push the table past the card edge even for a
                    // medium-length name (Germany ✓ 1st, Colombia ✓ R32). On any
                    // badged row show the compact 3-letter code so the badge +
                    // Pts always stay inside the card; un-badged rows keep the
                    // full name.
                    const decided =
                      qstatus === "clinched" ||
                      qstatus === "clinched-first" ||
                      qstatus === "eliminated";
                    const label =
                      STANDINGS_LABEL[t.id] ?? (decided ? t.code : t.name);
                    return (
                    <tr key={t.id} className={t.rank <= 2 ? "qualifies" : ""}>
                      <td className="col-pos">{t.rank}</td>
                      <td className="col-team">
                        <FavoriteStar teamId={t.id} className="fav-star-sm" />
                        <Link to={`/teams/${t.id}`} className="team-cell">
                          <span className="team-flag">{t.flag}</span>
                          <span className="team-name">{label}</span>
                          <QualBadge status={qstatus} />
                        </Link>
                      </td>
                      <td>{t.played}</td>
                      <td>{t.won}</td>
                      <td>{t.drawn}</td>
                      <td>{t.lost}</td>
                      <td>{t.goalDiff > 0 ? `+${t.goalDiff}` : t.goalDiff}</td>
                      <td className="col-pts">{t.points}</td>
                    </tr>
                    );
                  })}
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
