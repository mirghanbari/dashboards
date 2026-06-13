import { Link, useSearchParams } from "react-router-dom";
import {
  VISIBLE_CATALOG,
  SOURCE_META,
  TIERS,
  leaders,
  formatValue,
} from "../stats";
import type { StatDef } from "../types";

function SourceBadge({ source }: { source: StatDef["source"] }) {
  const meta = SOURCE_META[source];
  return (
    <span className={"src-badge src-" + source} title={meta.hint}>
      {meta.label}
    </span>
  );
}

function StatCard({ def }: { def: StatDef }) {
  const rows = leaders(def, 5);
  return (
    <article className="statcard">
      <header className="statcard-head">
        <div>
          <h3 className="statcard-title">{def.label}</h3>
          <span className="statcard-scope">
            {def.scope === "team" ? "Team stat" : "Player stat"}
          </span>
        </div>
        <SourceBadge source={def.source} />
      </header>
      {rows.length === 0 ? (
        <p className="statcard-empty">No data yet — populates once matches are played.</p>
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
    </article>
  );
}

const TIER_VALUES: StatDef["tier"][] = ["basic", "advanced", "elite"];

export function Stats() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tier") as StatDef["tier"] | null;
  const tier: StatDef["tier"] = raw && TIER_VALUES.includes(raw) ? raw : "basic";
  const setTier = (t: StatDef["tier"]) => setParams({ tier: t }, { replace: true });
  const defs = VISIBLE_CATALOG.filter((d) => d.tier === tier);
  const shownSources = new Set(VISIBLE_CATALOG.map((d) => d.source));

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Stats</h1>
        <p className="page-sub">
          {VISIBLE_CATALOG.length} metrics tracked, each linked to its players and teams
        </p>
      </header>

      <div className="chip-row" style={{ marginTop: 16 }}>
        {TIERS.map((t) => (
          <button
            key={t.value}
            className={"chip" + (tier === t.value ? " is-active" : "")}
            onClick={() => setTier(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="source-legend">
        {Object.entries(SOURCE_META)
          .filter(([key]) => shownSources.has(key as StatDef["source"]))
          .map(([key, m]) => (
            <span key={key} className="legend-item">
              <span className={"src-dot src-" + key} />
              {m.label} — {m.hint}
            </span>
          ))}
      </div>

      <div className="statcard-grid">
        {defs.map((d) => (
          <StatCard key={d.key} def={d} />
        ))}
      </div>
    </>
  );
}
