import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  MATCHES,
  PREDICTIONS,
  getTeam,
  predictionForTeam,
  qualificationByGroup,
  thirdPlaceRace,
  thirdPlaceVerdicts,
  useLiveMatches,
  applyLive,
  liveStandings,
} from "../data";
import type {
  QualStatus,
  TeamQualification,
  ThirdVerdict,
} from "../data";
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

const NUM_WORD = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
];
const numWord = (n: number) => NUM_WORD[n] ?? String(n);

/** A model probability as a percentage, keeping tiny-but-alive odds visible. */
function fmtProb(n: number): string {
  if (n <= 0) return "0%";
  if (n < 0.01) return "<1%";
  if (n >= 0.995 && n < 1) return ">99%";
  return Math.round(n * 100) + "%";
}

/** "J" → "Group J"; ["J","K","L"] → "Groups J, K and L". */
function groupList(letters: string[]): string {
  if (letters.length === 0) return "";
  const label = letters.length === 1 ? "Group" : "Groups";
  if (letters.length === 1) return `${label} ${letters[0]}`;
  const head = letters.slice(0, -1).join(", ");
  return `${label} ${head} and ${letters[letters.length - 1]}`;
}

/** The condition a bubble third still needs the outstanding groups to meet. */
function bubbleNote(v: ThirdVerdict, remaining: string[]): string {
  const n = remaining.length;
  const where = groupList(remaining);
  if (v.needBelow >= n)
    return `Needs all ${numWord(n)} of the still-to-finish thirds (${where}) to come in at or below it.`;
  return `Needs at least ${numWord(v.needBelow)} of the ${numWord(n)} still-to-finish thirds (${where}) to come in at or below it.`;
}

/** A still-playing team's situation — its group hasn't finished, so its own
 *  result decides it before the cross-group cut even applies. The team's group
 *  scenario (what it needs for the top two) is spelled out as the exact result,
 *  with the fallback being the best-third route. */
function provisionalNote(v: ThirdVerdict, scenario: string): string {
  const lead =
    v.gamesLeft === 1
      ? `Third in Group ${v.group}, final game to play`
      : `Third in Group ${v.group}, ${numWord(v.gamesLeft)} group games to play`;

  if (/win or draw/i.test(scenario))
    return `${lead} — a win or draw lifts it into the top two; only a defeat drops it into the best-third race.`;
  if (/win guarantees/i.test(scenario))
    return `${lead} — a win lifts it into the top two; a draw or defeat leaves it chasing a best-third place.`;
  if (/must win/i.test(scenario))
    return `${lead} — it must win, and hope other results fall its way, to take the top two; otherwise it is chasing a best-third place.`;
  // No crisp single-result case (e.g. already out of the top two): keep it general.
  return `${lead} — its own result still decides whether it climbs into the top two or chases a best-third place.`;
}

function ThirdNameList({ ids }: { ids: string[] }) {
  return (
    <>
      {ids.map((id, i) => {
        const t = getTeam(id);
        return (
          <span key={id} className="tn-team">
            {i > 0 && <span className="tn-sep">, </span>}
            <span className="team-flag">{t.flag}</span>
            {t.name}
          </span>
        );
      })}
    </>
  );
}

/** Note above the third-place table: clinch / bubble / out for every settled
 *  third, plus what the bubble teams need. Auto-updates as the last groups end. */
function ThirdPlaceNote({
  verdicts,
  remainingGroups,
  scenarioById,
}: {
  verdicts: ThirdVerdict[];
  remainingGroups: string[];
  scenarioById: Map<string, string>;
}) {
  // "Through"/"Out" are settled verdicts (the team's own group is finished).
  // The bubble holds every team still in the race: the settled thirds with an
  // exact condition AND the provisional thirds of the groups still being played.
  const through = verdicts
    .filter((v) => v.groupComplete && v.status === "through")
    .sort((a, b) => a.maxAbove - b.maxAbove);
  const out = verdicts.filter((v) => v.groupComplete && v.status === "out");
  // Order the bubble by the model's advance odds, most-likely first, so the
  // settled and still-playing teams interleave by how close each is.
  const advance = (v: ThirdVerdict) =>
    predictionForTeam(v.teamId)?.advance ?? -1;
  const bubble = verdicts
    .filter((v) => v.status === "bubble")
    .sort((a, b) => advance(b) - advance(a));

  return (
    <div className="third-note">
      <p className="third-note-lead">
        Twelve groups, but only the <strong>eight best third-placed teams</strong>{" "}
        join the runners-up in the Round of 32.{" "}
        {remainingGroups.length > 0 ? (
          <>
            With {groupList(remainingGroups)} still to finish, here is who has
            secured one, who is out, and who is on the bubble — the settled
            thirds with an exact condition, the teams still playing with live
            odds.
          </>
        ) : (
          <>Every group is in, so the eight best thirds are now locked.</>
        )}
      </p>

      {through.length > 0 && (
        <div className="tn-row tn-through">
          <span className="tn-tag">Through</span>
          <span className="tn-body">
            <ThirdNameList ids={through.map((v) => v.teamId)} /> — already
            guaranteed a top-eight third place.
          </span>
        </div>
      )}

      {bubble.length > 0 && (
        <div className="tn-row tn-bubble">
          <span className="tn-tag">On the bubble</span>
          <div className="tn-bubble-body">
            <ul className="tn-bubble-list">
              {bubble.map((v) => {
                const t = getTeam(v.teamId);
                const pred = predictionForTeam(v.teamId);
                return (
                  <li key={v.teamId}>
                    <span className="tn-team">
                      <span className="team-flag">{t.flag}</span>
                      {t.name}
                    </span>
                    {!v.groupComplete && (
                      <span className="tn-playing">still playing</span>
                    )}
                    {pred && (
                      <span className="tn-prob" title="Model probability of reaching the Round of 32">
                        {fmtProb(pred.advance)}
                        <span className="tn-prob-sub"> to advance</span>
                      </span>
                    )}{" "}
                    <span className="tn-cond">
                      {v.groupComplete
                        ? bubbleNote(v, remainingGroups)
                        : provisionalNote(v, scenarioById.get(v.teamId) ?? "")}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="tn-prob-src">
              Advance % is a model estimate —{" "}
              <Link to="/predictions">{PREDICTIONS.source}</Link>, updated after
              each game. Conditions for the finished groups are mathematically
              exact; teams still playing can yet move on their own results.
            </p>
          </div>
        </div>
      )}

      {out.length > 0 && (
        <div className="tn-row tn-out">
          <span className="tn-tag">Out</span>
          <span className="tn-body">
            <ThirdNameList ids={out.map((v) => v.teamId)} /> — cannot reach the
            top-eight thirds.
          </span>
        </div>
      )}

      {remainingGroups.length > 0 && (
        <p className="third-note-foot">
          {groupList(remainingGroups)} finish today — the live third-place order
          below shifts as their results land.
        </p>
      )}
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
  const thirdVerdicts = useMemo(
    () => thirdPlaceVerdicts(liveStandings(live), applyLive(MATCHES, live)),
    [live],
  );
  // teamId → its own group scenario ("A win guarantees…", etc.), so a still-playing
  // third's note can spell out the exact result it needs for the top two.
  const scenarioById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups)
      for (const t of g.teams) m.set(t.teamId, t.scenario);
    return m;
  }, [groups]);

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
        <ThirdPlaceNote
          verdicts={thirdVerdicts.verdicts}
          remainingGroups={thirdVerdicts.remainingGroups}
          scenarioById={scenarioById}
        />
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
