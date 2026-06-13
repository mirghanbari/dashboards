import { useState } from "react";
import { Link } from "react-router-dom";
import { PREDICTIONS, predictionsByOdds, teamsByRating } from "../data";
import { RatingBars } from "../components/RatingBars";
import type { TeamPrediction } from "../types";

// Probability → label. Clamp the extremes so a 0.4% slice doesn't read "0%"
// and a near-certain advance reads "100%".
function pct(n: number): string {
  if (n >= 0.995) return "100%";
  if (n > 0 && n < 0.005) return "<1%";
  return Math.round(n * 100) + "%";
}

const STAGES: { key: keyof TeamPrediction; label: string; short: string }[] = [
  { key: "winGroup", label: "Win group", short: "Win grp" },
  { key: "advance", label: "Reach Round of 32", short: "R32" },
  { key: "round16", label: "Reach Round of 16", short: "R16" },
  { key: "quarter", label: "Reach Quarter-finals", short: "QF" },
  { key: "semi", label: "Reach Semi-finals", short: "SF" },
  { key: "final", label: "Reach Final", short: "Final" },
  { key: "champion", label: "Win the tournament", short: "Champion" },
];

/** A probability cell, shaded by likelihood (subtle green heat). */
function ProbCell({ value, strong }: { value: number; strong?: boolean }) {
  return (
    <td
      className={"prob-cell" + (strong ? " prob-strong" : "")}
      style={{ ["--p" as string]: value }}
    >
      {pct(value)}
    </td>
  );
}

type SortKey = keyof TeamPrediction;
type SortDir = "asc" | "desc";

export function Predictions() {
  const [sortKey, setSortKey] = useState<SortKey>("champion");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Click a header to sort by it. Same column → flip direction; a new column
  // starts descending for the numeric odds (most likely first) and ascending
  // for the text columns (A→Z).
  function sortBy(key: SortKey, numeric: boolean) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(numeric ? "desc" : "asc");
    }
  }

  // Small ▲/▼ caret on the active column.
  function Caret({ for: key }: { for: SortKey }) {
    if (key !== sortKey) return null;
    return <span className="sort-caret">{sortDir === "asc" ? "▲" : "▼"}</span>;
  }

  const ranked = predictionsByOdds();
  const updated = new Date(PREDICTIONS.fetchedAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const asOf = new Date(PREDICTIONS.fetchedAt).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });

  // Title race: the dozen most likely champions, as bars.
  const race = ranked.slice(0, 12);
  const raceMax = Math.max(...race.map((t) => t.champion), 0.01);

  // Strength model behind the odds: the ten highest-rated teams.
  const rated = teamsByRating().slice(0, 10);

  // Full table, re-sorted by the chosen column + direction. Strings compare
  // alphabetically, numbers numerically; champion odds break any tie.
  const dir = sortDir === "asc" ? 1 : -1;
  const table = [...PREDICTIONS.teams].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    let cmp =
      typeof av === "string" && typeof bv === "string"
        ? av.localeCompare(bv)
        : (av as number) - (bv as number);
    if (cmp !== 0) return cmp * dir;
    return b.champion - a.champion;
  });

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Predictions</h1>
        <p className="page-sub">
          Title odds from {PREDICTIONS.method.toLowerCase()} · updated {updated}
        </p>
      </header>

      <section className="section">
        <h2 className="section-title">
          Title race — who wins the World Cup?
          <span className="as-of" title="These odds re-run after each game, so they drift from any one-off published snapshot.">
            as of {asOf}
          </span>
        </h2>
        <div className="bar-chart pred-race">
          {race.map((t) => (
            <div className="bar-row" key={t.code}>
              <span className="bar-label" title={t.name}>
                <span className="bar-flag">{t.flag}</span>
                {t.teamId ? (
                  <Link to={`/teams/${t.teamId}`} className="pred-team-link">
                    {t.name}
                  </Link>
                ) : (
                  t.name
                )}
              </span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${(t.champion / raceMax) * 100}%` }}
                />
              </div>
              <span className="bar-value">{pct(t.champion)}</span>
            </div>
          ))}
        </div>
      </section>

      {rated.length > 0 && (
        <section className="section">
          <h2 className="section-title">Strength model — behind the odds</h2>
          <p className="page-sub" style={{ marginBottom: 12 }}>
            The simulation is driven by each team's attack &amp; defense rating.
            Bars are relative to the strongest of the 48 teams.
          </p>
          <div className="rating-grid">
            {rated.map((t, i) => (
              <div className="rating-card" key={t.code}>
                <div className="rating-card-head">
                  <span className="rating-rank">{i + 1}</span>
                  <span className="bar-flag">{t.flag}</span>
                  {t.teamId ? (
                    <Link to={`/teams/${t.teamId}`} className="rating-name">
                      {t.name}
                    </Link>
                  ) : (
                    <span className="rating-name">{t.name}</span>
                  )}
                  <span className="rating-elo">{t.elo}</span>
                </div>
                <RatingBars attack={t.attack} defense={t.defense} compact />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="section-title">Every team, every stage</h2>
        <div className="chip-row" style={{ marginBottom: 12 }}>
          <span className="pred-sort-label">Rank by:</span>
          {STAGES.map((s) => (
            <button
              key={s.key as string}
              className={"chip" + (sortKey === s.key ? " is-active" : "")}
              onClick={() => sortBy(s.key, true)}
            >
              {s.short}
            </button>
          ))}
        </div>

        <div className="pred-table-wrap">
          <table className="player-table pred-table">
            <thead>
              <tr>
                <th
                  className={
                    "col-player pred-th" +
                    (sortKey === "name" ? " is-sorted" : "")
                  }
                  onClick={() => sortBy("name", false)}
                  title="Sort by team name"
                >
                  Team
                  <Caret for="name" />
                </th>
                <th
                  className={
                    "pred-th" + (sortKey === "group" ? " is-sorted" : "")
                  }
                  onClick={() => sortBy("group", false)}
                  title="Sort by group"
                >
                  Grp
                  <Caret for="group" />
                </th>
                {STAGES.map((s) => (
                  <th
                    key={s.key as string}
                    title={s.label}
                    className={
                      "pred-th" + (sortKey === s.key ? " is-sorted" : "")
                    }
                    onClick={() => sortBy(s.key, true)}
                  >
                    {s.short}
                    <Caret for={s.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map((t) => (
                <tr key={t.code}>
                  <td className="col-player">
                    <span className="team-cell">
                      <span className="bar-flag">{t.flag}</span>
                      {t.teamId ? (
                        <Link to={`/teams/${t.teamId}`} className="player-name">
                          {t.name}
                        </Link>
                      ) : (
                        <span className="player-name">{t.name}</span>
                      )}
                    </span>
                  </td>
                  <td className="pred-group">{t.group}</td>
                  <ProbCell value={t.winGroup} strong={sortKey === "winGroup"} />
                  <ProbCell value={t.advance} strong={sortKey === "advance"} />
                  <ProbCell value={t.round16} strong={sortKey === "round16"} />
                  <ProbCell value={t.quarter} strong={sortKey === "quarter"} />
                  <ProbCell value={t.semi} strong={sortKey === "semi"} />
                  <ProbCell value={t.final} strong={sortKey === "final"} />
                  <ProbCell value={t.champion} strong={sortKey === "champion"} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="pred-credit">
        Predictions by the{" "}
        <a href={PREDICTIONS.sourceUrl} target="_blank" rel="noreferrer">
          {PREDICTIONS.source}
        </a>
        . Read their write-up:{" "}
        <a href={PREDICTIONS.blogUrl} target="_blank" rel="noreferrer">
          “Predicting the 2026 World Cup: can anyone stop Spain?”
        </a>{" "}
        The model re-runs after every match; this page refreshes on the same
        schedule as the rest of the dashboard.
      </p>
    </>
  );
}
