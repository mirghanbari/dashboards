import { FRIENDLIES } from "../data/friendlies";
import { StatCard } from "../components/StatCard";
import type { FriendlyMatch, FriendlyMatchSide } from "../types";

function Side({ side, won }: { side: FriendlyMatchSide; won: boolean }) {
  return (
    <div className={"fr-side" + (won ? " is-winner" : "")}>
      {side.logo ? (
        <img className="fr-logo" src={side.logo} alt="" loading="lazy" />
      ) : (
        <span className="fr-logo fr-logo-blank" />
      )}
      <span className="fr-team-name">{side.name}</span>
      <span className="fr-score">{side.score ?? "–"}</span>
    </div>
  );
}

function MatchCard({ m }: { m: FriendlyMatch }) {
  const date = new Date(m.date);
  const when = date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const homeWin = m.status === "finished" && (m.home.score ?? 0) > (m.away.score ?? 0);
  const awayWin = m.status === "finished" && (m.away.score ?? 0) > (m.home.score ?? 0);

  const goals = m.timeline.filter((e) => e.type === "goal");
  const cards = m.timeline.filter((e) => e.type !== "goal");

  return (
    <article className={"fr-match status-" + m.status}>
      <header className="fr-match-head">
        {m.status === "live" ? (
          <span className="match-live">● LIVE {m.minute}</span>
        ) : m.status === "finished" ? (
          <span className="match-ft">FT</span>
        ) : (
          <span className="match-when">{when}</span>
        )}
      </header>
      <div className="fr-sides">
        <Side side={m.home} won={homeWin} />
        <Side side={m.away} won={awayWin} />
      </div>

      {(goals.length > 0 || m.assists.length > 0 || cards.length > 0) && (
        <div className="fr-events">
          {goals.length > 0 && (
            <div className="fr-event-row">
              <span className="fr-event-ic">⚽</span>
              <span>
                {goals.map((g, i) => (
                  <span key={i} className="fr-chip">
                    {g.player} {g.minute}
                  </span>
                ))}
              </span>
            </div>
          )}
          {m.assists.length > 0 && (
            <div className="fr-event-row">
              <span className="fr-event-ic">🅰️</span>
              <span>
                {m.assists.map((a, i) => (
                  <span key={i} className="fr-chip">
                    {a.player}
                  </span>
                ))}
              </span>
            </div>
          )}
          {cards.length > 0 && (
            <div className="fr-event-row">
              <span className="fr-event-ic">🟨</span>
              <span>
                {cards.map((c, i) => (
                  <span key={i} className="fr-chip">
                    {c.type === "red" ? "🟥 " : ""}
                    {c.player} {c.minute}
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function Friendlies() {
  const { matches, teams, players, lastUpdated, source } = FRIENDLIES;
  const live = matches.filter((m) => m.status === "live").length;
  const finished = matches.filter((m) => m.status === "finished");
  const totalGoals = players.reduce((s, p) => s + p.goals, 0);
  const scorers = players.filter((p) => p.goals > 0 || p.assists > 0).slice(0, 10);
  const sortedMatches = [...matches].sort((a, b) => {
    const rank = (s: string) => (s === "live" ? 0 : s === "finished" ? 1 : 2);
    return rank(a.status) - rank(b.status) || +new Date(a.date) - +new Date(b.date);
  });

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">International Friendlies</h1>
        <p className="page-sub">
          Live from ESPN · updated{" "}
          {new Date(lastUpdated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </header>

      <section className="stat-grid">
        <StatCard label="Matches" value={matches.length} sub={`${finished.length} finished`} />
        <StatCard label="Live now" value={live} />
        <StatCard label="Goals" value={totalGoals} />
        <StatCard label="Teams" value={teams.length} />
      </section>

      <div className="two-col">
        <section className="section">
          <h2 className="section-title">Goals &amp; assists</h2>
          {scorers.length === 0 ? (
            <p className="statcard-empty">No goals yet today — scorers appear as matches play.</p>
          ) : (
            <table className="player-table">
              <thead>
                <tr>
                  <th className="col-player">Player</th>
                  <th>G</th>
                  <th>A</th>
                  <th>🟨</th>
                  <th>🟥</th>
                </tr>
              </thead>
              <tbody>
                {scorers.map((p) => {
                  const team = teams.find((t) => t.id === p.teamId);
                  return (
                    <tr key={p.id}>
                      <td className="col-player">
                        <span className="player-name">{p.name}</span>
                        <small className="player-club">{team?.name}</small>
                      </td>
                      <td className="num-strong">{p.goals}</td>
                      <td>{p.assists}</td>
                      <td>{p.yellowCards || ""}</td>
                      <td>{p.redCards || ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="section">
          <h2 className="section-title">Teams</h2>
          <table className="player-table">
            <thead>
              <tr>
                <th className="col-player">Team</th>
                <th>P</th>
                <th>W</th>
                <th>D</th>
                <th>L</th>
                <th>GF</th>
                <th>GA</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td className="col-player">
                    <span className="team-cell">
                      {t.logo && <img className="fr-logo-sm" src={t.logo} alt="" loading="lazy" />}
                      <span className="player-name">{t.name}</span>
                    </span>
                  </td>
                  <td>{t.played}</td>
                  <td>{t.won}</td>
                  <td>{t.drawn}</td>
                  <td>{t.lost}</td>
                  <td>{t.goalsFor}</td>
                  <td>{t.goalsAgainst}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="section">
        <h2 className="section-title">Matches</h2>
        <p className="page-sub" style={{ marginBottom: 4 }}>Source: {source}</p>
        <div className="match-grid">
          {sortedMatches.map((m) => (
            <MatchCard key={m.id} m={m} />
          ))}
        </div>
      </section>
    </>
  );
}
