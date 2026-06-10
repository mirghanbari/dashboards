import { useEffect, useMemo, useState } from "react";
import { groupLetters, getTeam, standingsForGroup } from "../data";
import { THIRDS_ADVANCING, SCORING } from "../config";
import {
  type Picks,
  type RemoteEntry,
  defaultPicks,
  thirdCandidates,
  scoreEntry,
  isLocked,
  loadPicks,
  savePicks,
  loadName,
  saveName,
  entryId,
  clearLocalEntry,
  fetchEntries,
  submitEntry,
} from "../bracket";
import { GroupSorter } from "../components/GroupSorter";

type Step = "step1" | "step2" | "submit";
type View = "picks" | "leaderboard";

// Guard against stale localStorage picks (e.g., groups changed): each group must
// contain exactly its current four teams, else fall back to the default order.
function validate(picks: Picks | null): Picks {
  if (!picks?.groups) return defaultPicks();
  for (const g of groupLetters) {
    const current = new Set(standingsForGroup(g).map((t) => t.id));
    const got = picks.groups[g] ?? [];
    if (got.length !== current.size || got.some((id) => !current.has(id))) {
      return defaultPicks();
    }
  }
  return { groups: picks.groups, thirds: (picks.thirds ?? []).slice(0, THIRDS_ADVANCING) };
}

export function Bracket() {
  const [view, setView] = useState<View>("picks");
  const [step, setStep] = useState<Step>("step1");
  const [picks, setPicks] = useState<Picks>(() => validate(loadPicks()));
  const locked = isLocked();

  useEffect(() => savePicks(picks), [picks]);

  const update = (next: Picks) => setPicks(next);
  const setGroup = (g: string, order: string[]) =>
    update({ ...picks, groups: { ...picks.groups, [g]: order } });
  const resetGroup = (g: string) =>
    setGroup(g, standingsForGroup(g).map((t) => t.id));
  const resetAll = () => update(defaultPicks());
  const newEntry = () => {
    const ok = window.confirm(
      "Start a fresh bracket in this browser? Your current picks here are cleared so you can submit another entry. Anything you've already submitted stays on the leaderboard.",
    );
    if (!ok) return;
    clearLocalEntry();
    setPicks(defaultPicks());
    setStep("step1");
  };

  const candidates = thirdCandidates(picks);
  const toggleThird = (id: string) => {
    const has = picks.thirds.includes(id);
    if (has) update({ ...picks, thirds: picks.thirds.filter((x) => x !== id) });
    else if (picks.thirds.length < THIRDS_ADVANCING)
      update({ ...picks, thirds: [...picks.thirds, id] });
  };

  return (
    <>
      <header className="page-head page-head-row">
        <div>
          <h1 className="page-title">Bracket Challenge</h1>
          <p className="page-sub">
            Predict every group's order &amp; the 3rd-place teams that advance
          </p>
        </div>
        <div className="view-toggle">
          {view === "picks" && !locked && (
            <button className="chip" onClick={newEntry} title="Start another bracket from scratch">
              + New entry
            </button>
          )}
          <button className={"chip" + (view === "picks" ? " is-active" : "")} onClick={() => setView("picks")}>
            Make picks
          </button>
          <button className={"chip" + (view === "leaderboard" ? " is-active" : "")} onClick={() => setView("leaderboard")}>
            Leaderboard
          </button>
        </div>
      </header>

      {locked && (
        <p className="tier-note">
          🔒 Picks are locked — the tournament has kicked off. You can still view your
          entry and the live leaderboard.
        </p>
      )}

      {view === "leaderboard" ? (
        <Leaderboard />
      ) : (
        <>
          {step === "step1" && <InviteBox />}
          <Steps step={step} />
          {step === "step1" && (
            <Step1
              picks={picks}
              setGroup={setGroup}
              resetGroup={resetGroup}
              resetAll={resetAll}
              locked={locked}
              onNext={() => setStep("step2")}
            />
          )}
          {step === "step2" && (
            <Step2
              candidates={candidates}
              selected={picks.thirds}
              toggle={toggleThird}
              locked={locked}
              onBack={() => setStep("step1")}
              onNext={() => setStep("submit")}
              autoPick={() =>
                update({ ...picks, thirds: bestThirds(picks).slice(0, THIRDS_ADVANCING) })
              }
            />
          )}
          {step === "submit" && (
            <SubmitStep picks={picks} locked={locked} onBack={() => setStep("step2")} onDone={() => setView("leaderboard")} />
          )}
        </>
      )}
    </>
  );
}

// Seed Step 2 with the strongest of the predicted 3rd-place teams.
function bestThirds(picks: Picks): string[] {
  return thirdCandidates(picks)
    .map((id) => getTeam(id))
    .sort((a, b) => a.fifaRank - b.fifaRank)
    .map((t) => t.id);
}

function InviteBox() {
  const url = typeof window !== "undefined" ? window.location.href : "";
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  };
  return (
    <div className="invite-box">
      <div className="invite-text">
        <strong>Invite your pool</strong> — share this page and the password. Everyone
        enters from their own device, before the first kickoff.
        <div className="invite-row">
          <code className="invite-link">{url}</code>
          <button className="chip" onClick={() => copy(url)}>
            {copied ? "Copied ✓" : "Copy link"}
          </button>
        </div>
        <div className="invite-pw">
          Pool password: <code>kabob</code>
        </div>
      </div>
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const items: [Step, string][] = [
    ["step1", "1 · Order groups"],
    ["step2", "2 · Pick 3rd-place"],
    ["submit", "3 · Submit"],
  ];
  const idx = items.findIndex(([s]) => s === step);
  return (
    <div className="bc-steps">
      {items.map(([s, label], i) => (
        <span key={s} className={"bc-step" + (i === idx ? " is-active" : i < idx ? " is-done" : "")}>
          {label}
        </span>
      ))}
    </div>
  );
}

function Step1({
  picks, setGroup, resetGroup, resetAll, locked, onNext,
}: {
  picks: Picks;
  setGroup: (g: string, order: string[]) => void;
  resetGroup: (g: string) => void;
  resetAll: () => void;
  locked: boolean;
  onNext: () => void;
}) {
  return (
    <>
      <p className="bc-hint">
        Drag teams into your predicted finishing order. Top two (green) advance; the
        3rd-place team (amber) becomes a candidate for Step 2.
      </p>
      <div className="gs-grid">
        {groupLetters.map((g) => (
          <GroupSorter
            key={g}
            group={g}
            order={picks.groups[g]}
            onChange={(order) => setGroup(g, order)}
            onReset={() => resetGroup(g)}
            disabled={locked}
          />
        ))}
      </div>
      <div className="bc-actions">
        {!locked && (
          <button className="btn" onClick={resetAll}>
            Reset all to standings
          </button>
        )}
        <button className="btn btn-primary" onClick={onNext}>
          Continue with this order →
        </button>
      </div>
    </>
  );
}

function Step2({
  candidates, selected, toggle, locked, onBack, onNext, autoPick,
}: {
  candidates: string[];
  selected: string[];
  toggle: (id: string) => void;
  locked: boolean;
  onBack: () => void;
  onNext: () => void;
  autoPick: () => void;
}) {
  return (
    <>
      <p className="bc-hint">
        Choose <strong>{THIRDS_ADVANCING}</strong> of your 12 third-place teams to advance to
        the knockout round. Selected: <strong>{selected.length}/{THIRDS_ADVANCING}</strong>
      </p>
      <div className="third-grid">
        {candidates.map((id) => {
          const team = getTeam(id);
          const on = selected.includes(id);
          const full = selected.length >= THIRDS_ADVANCING;
          return (
            <button
              key={id}
              className={"third-card" + (on ? " is-on" : "")}
              disabled={locked || (!on && full)}
              onClick={() => toggle(id)}
            >
              <span className="third-check">{on ? "✓" : ""}</span>
              <span className="team-flag">{team.flag}</span>
              <span className="third-name">{team.name}</span>
              <small className="third-group">Group {team.group}</small>
            </button>
          );
        })}
      </div>
      <div className="bc-actions">
        <button className="btn" onClick={onBack}>← Back</button>
        {!locked && (
          <button className="btn" onClick={autoPick}>
            Auto-pick best {THIRDS_ADVANCING}
          </button>
        )}
        <button className="btn btn-primary" disabled={selected.length !== THIRDS_ADVANCING} onClick={onNext}>
          Review &amp; submit →
        </button>
      </div>
    </>
  );
}

function SubmitStep({
  picks, locked, onBack, onDone,
}: {
  picks: Picks;
  locked: boolean;
  onBack: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(loadName());
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async () => {
    setStatus("sending");
    setError("");
    saveName(name.trim());
    const res = await submitEntry(name.trim(), password, picks);
    if (res.ok) {
      setStatus("ok");
    } else {
      setStatus("error");
      setError(res.error ?? "Submission failed.");
    }
  };

  if (status === "ok") {
    return (
      <div className="bc-done">
        <h2>✅ Entry submitted!</h2>
        <p>Your bracket is in the pool as <strong>{name}</strong>. It scores live as results come in.</p>
        <button className="btn btn-primary" onClick={onDone}>View leaderboard →</button>
      </div>
    );
  }

  return (
    <>
      <p className="bc-hint">Review your picks, then submit to the pool.</p>
      <ReviewSummary picks={picks} />
      <div className="bc-submit">
        <label>
          Your name
          <input className="search" value={name} maxLength={40} placeholder="e.g. MJ"
            onChange={(e) => setName(e.target.value)} disabled={locked} />
        </label>
        <label>
          Pool password
          <input className="search" type="password" value={password} placeholder="required to submit"
            onChange={(e) => setPassword(e.target.value)} disabled={locked} />
        </label>
        <div className="bc-actions">
          <button className="btn" onClick={onBack}>← Back</button>
          <button
            className="btn btn-primary"
            disabled={locked || status === "sending" || !name.trim() || !password}
            onClick={submit}
          >
            {status === "sending" ? "Submitting…" : "Submit entry"}
          </button>
        </div>
        {status === "error" && <p className="bc-error">{error}</p>}
      </div>
    </>
  );
}

function ReviewSummary({ picks }: { picks: Picks }) {
  return (
    <div className="gs-grid">
      {groupLetters.map((g) => (
        <div className="gs-card" key={g}>
          <h3 className="gs-title">Group {g}</h3>
          <ol className="review-list">
            {picks.groups[g].map((id, i) => {
              const t = getTeam(id);
              const tier = i < 2 ? "adv" : i === 2 ? "third" : "out";
              const backed = i === 2 && picks.thirds.includes(id);
              return (
                <li key={id} className={"review-row tier-" + tier}>
                  <span className="gs-pos">{i + 1}</span>
                  <span className="gs-flag">{t.flag}</span>
                  <span className="gs-name">{t.name}</span>
                  {backed && <span className="review-adv">advances</span>}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

function Leaderboard() {
  const [entries, setEntries] = useState<RemoteEntry[] | null>(null);
  const [err, setErr] = useState("");
  const myId = entryId();

  const load = () => {
    setErr("");
    fetchEntries()
      .then(setEntries)
      .catch(() => setErr("Couldn't load the leaderboard."));
  };
  useEffect(load, []);

  const ranked = useMemo(() => {
    if (!entries) return [];
    return entries
      .map((e) => ({ ...e, score: scoreEntry(e.picks) }))
      .sort((a, b) => b.score.total - a.score.total || a.name.localeCompare(b.name));
  }, [entries]);

  const anyResults = useMemo(
    () => groupLetters.some((g) => standingsForGroup(g).some((t) => t.played > 0)),
    [],
  );

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Leaderboard</h2>
        <button className="chip" onClick={load}>↻ Refresh</button>
      </div>
      <p className="bc-hint">
        Scoring: {SCORING.position.join("/")} pts for a correct 1st/2nd/3rd/4th ·{" "}
        {SCORING.perfectGroup} perfect-group bonus · {SCORING.correctThird} pts per correct
        3rd-place advance. Everyone starts at 0; scores update live as each match finishes.
        {!anyResults && " No matches have finished yet."}
      </p>

      {err && <p className="bc-error">{err}</p>}
      {!entries && !err && <p className="statcard-empty">Loading…</p>}
      {entries && entries.length === 0 && (
        <p className="statcard-empty">No entries yet — be the first to submit a bracket.</p>
      )}

      {ranked.length > 0 && (
        <table className="player-table">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-player">Entry</th>
              <th>Pos pts</th>
              <th>Perfect ×10</th>
              <th>3rd</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((e, i) => (
              <tr key={e.entryId} className={e.entryId === myId ? "is-me" : ""}>
                <td className="col-rank">{i + 1}</td>
                <td className="col-player">
                  <span className="player-name">{e.name}</span>
                  {e.entryId === myId && <small className="player-club">you</small>}
                </td>
                <td>{e.score.positionPoints}</td>
                <td>{e.score.perfectGroups || ""}</td>
                <td>{e.score.thirdsCorrect}/{THIRDS_ADVANCING}</td>
                <td className="num-strong">{e.score.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
