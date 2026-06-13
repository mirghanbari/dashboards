import { Link, useParams } from "react-router-dom";
import { STAT_CATALOG, SOURCE_META, leaders, formatValue } from "../stats";

/** Full ranking for a single stat, reached from a Stats card (/stats/<key>). */
export function StatDetail() {
  const { statKey = "" } = useParams();
  const def = STAT_CATALOG.find((d) => d.key === statKey);

  if (!def) {
    return (
      <div className="empty">
        <p>Unknown stat.</p>
        <Link to="/stats" className="btn">
          ← Back to stats
        </Link>
      </div>
    );
  }

  const rows = leaders(def, Infinity); // every qualifying player/team, ranked
  const meta = SOURCE_META[def.source];

  return (
    <>
      <Link to="/stats" className="back-link">
        ← All stats
      </Link>

      <header className="page-head">
        <h1 className="page-title">{def.label}</h1>
        <p className="page-sub">
          {def.scope === "team" ? "Team" : "Player"} ranking · {rows.length} ranked
          {def.asc ? " · lower is better" : ""}
        </p>
        <span className={"src-badge src-" + def.source} title={meta.hint}>
          {meta.label}
        </span>
      </header>

      <div className="statcard rank-card">
        {rows.length === 0 ? (
          <p className="statcard-empty">
            No data yet — populates once matches are played.
          </p>
        ) : (
          <ol className="statcard-leaders">
            {rows.map((r, i) => (
              <li key={r.id}>
                <span className="lead-rank">{i + 1}</span>
                <span className="lead-flag">{r.flag}</span>
                <Link to={r.href} className="lead-name">
                  {r.name}
                </Link>
                <span className="lead-value">{formatValue(r.value, def)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
