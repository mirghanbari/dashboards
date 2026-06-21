import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  MATCHES,
  getTeam,
  qualificationByGroup,
  thirdPlaceRace,
  useLiveMatches,
  applyLive,
  liveStandings,
} from "../data";
import type { QualStatus, TeamQualification } from "../data";
import type { Match } from "../types";
import { liveClock } from "../clock";

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

/** A group's in-progress games, shown above the table but NOT yet folded into
 *  the standings/verdicts — only a finished result moves the table. */
function LiveGames({ games }: { games: Match[] }) {
  if (games.length === 0) return null;
  return (
    <div className="qual-live">
      {games.map((m) => {
        const home = getTeam(m.homeTeamId);
        const away = getTeam(m.awayTeamId);
        return (
          <Link key={m.id} to={`/matches/${m.id}`} className="qual-live-row">
            <span className="dot-live" aria-hidden />
            <span className="qual-live-score">
              <span className="team-flag">{home.flag}</span>
              {home.code} {m.homeScore ?? 0}–{m.awayScore ?? 0} {away.code}
              <span className="team-flag">{away.flag}</span>
            </span>
            <span className="qual-live-min">{liveClock(m.minute)}</span>
          </Link>
        );
      })}
      <p className="qual-live-note">Live — not yet counted below</p>
    </div>
  );
}

export function Qualification() {
  // Live-reactive: a game that finishes is folded into the standings (and the
  // clinch/elimination math) the moment it ends, no page reload — `liveStandings`
  // adjusts the deploy-time aggregates, `applyLive` overlays match results for
  // head-to-head. Games still in PROGRESS are shown as a banner per group but are
  // deliberately kept out of the verdicts, so no badge flips on a live score that
  // could still change. The full deploy still refreshes everything on its cadence.
  const live = useLiveMatches();
  const groups = useMemo(() => {
    const teams = liveStandings(live);
    const matches = applyLive(MATCHES, live);
    return qualificationByGroup(teams, matches);
  }, [live]);
  const thirds = useMemo(
    () => thirdPlaceRace(liveStandings(live), applyLive(MATCHES, live)),
    [live],
  );

  // In-progress group games, keyed by group letter, for the per-card banner.
  const liveByGroup = useMemo(() => {
    const byGroup = new Map<string, Match[]>();
    for (const m of applyLive(MATCHES, live)) {
      if (m.stage !== "group" || !m.group || m.status !== "live") continue;
      const list = byGroup.get(m.group) ?? [];
      list.push(m);
      byGroup.set(m.group, list);
    }
    return byGroup;
  }, [live]);

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
                {g.matchesLeftPerTeam === 0
                  ? "Group complete"
                  : `${g.matchesLeftPerTeam} game${g.matchesLeftPerTeam > 1 ? "s" : ""} left each`}
              </span>
            </header>
            <LiveGames games={liveByGroup.get(g.group) ?? []} />
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
