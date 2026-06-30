import { Link } from "react-router-dom";
import { MATCHES, TEAMS, PLAYERS, META, topScorers, getTeam, goalsByGroup, useLiveMatches, applyLive } from "../data";
import { MatchCard } from "../components/MatchCard";
import { FavoriteTeams } from "../components/FavoriteTeams";
import { ScoreBoard } from "../components/ScoreBoard";
import { StatCard } from "../components/StatCard";
import { BarChart } from "../components/BarChart";

export function Overview() {
  // Overlay live score/status updates polled since the page loaded.
  const matches = applyLive(MATCHES, useLiveMatches());
  const finished = matches.filter((m) => m.status === "finished");
  const live = matches.filter((m) => m.status === "live");
  const todayKey = new Date().toLocaleDateString();
  const upcomingScheduled = matches
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  const todayUpcoming = upcomingScheduled.filter(
    (m) => new Date(m.date).toLocaleDateString() === todayKey,
  );
  // Default to today's remaining games. Once today's slate is fully played
  // (and nothing is live), roll forward to the next match day with its own
  // headline; this reverts to "Upcoming today" automatically once that day
  // becomes today.
  let upcomingMatches = todayUpcoming;
  let upcomingLabel = "Upcoming today";
  if (todayUpcoming.length === 0 && live.length === 0) {
    // Look only at days from tomorrow onward, so a stray past match still
    // flagged "scheduled" can't pull the headline backward.
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextUp = upcomingScheduled.find((m) => new Date(m.date) >= tomorrow);
    if (nextUp) {
      const nextDate = new Date(nextUp.date);
      const nextKey = nextDate.toLocaleDateString();
      upcomingMatches = upcomingScheduled.filter(
        (m) => new Date(m.date).toLocaleDateString() === nextKey,
      );
      upcomingLabel =
        nextKey === tomorrow.toLocaleDateString()
          ? "Upcoming tomorrow"
          : `Upcoming ${nextDate.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}`;
    } else {
      upcomingMatches = [];
    }
  }
  const goals = finished.reduce(
    (sum, m) => sum + (m.homeScore ?? 0) + (m.awayScore ?? 0),
    0,
  );
  const scorers = topScorers(8).filter((p) => p.goals > 0);
  const hasGoals = scorers.length > 0;
  const recent = [...finished]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 4);

  return (
    <>
      <ScoreBoard matches={matches} />

      <section className="hero">
        <p className="hero-kicker">
          {new Date(META.startDate).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            timeZone: "UTC",
          })}{" "}
          –{" "}
          {new Date(META.endDate).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })}
        </p>
        <h1 className="hero-title">{META.tournament}</h1>
        <p className="hero-sub">
          Live games, standings, squads and the players lighting up the
          tournament.
        </p>
        <div className="hero-cta">
          <Link to="/matches" className="btn btn-primary">
            View matches
          </Link>
          <Link to="/players" className="btn">
            Player stats
          </Link>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard label="Matches played" value={finished.length} sub={`${MATCHES.length} total`} to="/matches" />
        <StatCard label="Goals scored" value={goals} sub={finished.length ? `${(goals / finished.length).toFixed(1)} / match` : "—"} to="/stats/goals" />
        <StatCard label="Teams" value={TEAMS.length} sub="12 groups" to="/teams" />
        <StatCard label="Players tracked" value={PLAYERS.length} to="/players" />
      </section>

      <FavoriteTeams matches={matches} />

      {live.length > 0 && (
        <section className="section">
          <h2 className="section-title">
            <span className="dot-live" /> Live now
          </h2>
          <div className="match-grid">
            {live.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {upcomingMatches.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">{upcomingLabel}</h2>
            <Link to="/matches" className="see-all">
              Full schedule →
            </Link>
          </div>
          <div className="match-grid">
            {upcomingMatches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      <div className="two-col">
        <section className="section">
          <h2 className="section-title">Golden Boot race</h2>
          <div className="chart-card">
            {hasGoals ? (
              <BarChart
                data={scorers.slice(0, 6).map((p) => ({
                  label: p.name,
                  value: p.goals,
                  flag: getTeam(p.teamId).flag,
                  hint: getTeam(p.teamId).name,
                }))}
              />
            ) : (
              <p className="statcard-empty">
                The race begins {new Date(META.startDate).toLocaleDateString(undefined, { month: "long", day: "numeric", timeZone: "UTC" })}.
              </p>
            )}
          </div>
        </section>
        <section className="section">
          <h2 className="section-title">Goals by group</h2>
          <div className="chart-card">
            <BarChart data={goalsByGroup().map((d) => ({ label: `Group ${d.label}`, value: d.value }))} />
          </div>
        </section>
      </div>

      <div className="two-col">
        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Top scorers</h2>
            <Link to="/players" className="see-all">
              All players →
            </Link>
          </div>
          {!hasGoals && (
            <p className="statcard-empty">
              No goals yet — top scorers appear once matches kick off.
            </p>
          )}
          {hasGoals && (
            <ol className="scorer-list">
              <li className="scorer-head" aria-hidden="true">
                <span className="scorer-rank" />
                <span className="scorer-flag" />
                <span className="scorer-name">Player</span>
                <span className="scorer-goals">G</span>
                <span className="scorer-assists">A</span>
              </li>
              {scorers.map((p, i) => {
                const team = getTeam(p.teamId);
                return (
                  <li key={p.id} className="scorer-row">
                    <span className="scorer-rank">{i + 1}</span>
                    <span className="scorer-flag">{team.flag}</span>
                    <span className="scorer-name">
                      <Link to={`/players/${p.id}`}>{p.name}</Link>
                      <small>{team.name}</small>
                    </span>
                    <span className="scorer-goals">{p.goals}</span>
                    <span className="scorer-assists">{p.assists}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section className="section">
          <div className="section-head">
            <h2 className="section-title">Latest results</h2>
            <Link to="/matches" className="see-all">
              All matches →
            </Link>
          </div>
          <div className="match-grid">
            {recent.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      </div>

    </>
  );
}
