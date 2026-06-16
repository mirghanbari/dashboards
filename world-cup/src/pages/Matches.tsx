import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MATCHES, groupLetters, useLiveMatches, applyLive } from "../data";
import { MatchCard } from "../components/MatchCard";
import { Bracket } from "../components/Bracket";
import type { Stage } from "../types";

const STAGE_FILTERS: { value: Stage | "all"; label: string }[] = [
  { value: "all", label: "All stages" },
  { value: "group", label: "Group stage" },
  { value: "round32", label: "Round of 32" },
  { value: "round16", label: "Round of 16" },
  { value: "quarter", label: "Quarters" },
  { value: "semi", label: "Semis" },
  { value: "final", label: "Final" },
];

export function Matches() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "bracket" ? "bracket" : "list";
  const setView = (v: "list" | "bracket") =>
    setParams(v === "bracket" ? { view: "bracket" } : {}, { replace: true });
  const [stage, setStage] = useState<Stage | "all">("all");
  const [group, setGroup] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "live" | "finished" | "scheduled">("all");

  // Overlay live score/status updates polled since the page loaded.
  const livePatches = useLiveMatches();
  const allMatches = useMemo(() => applyLive(MATCHES, livePatches), [livePatches]);

  const visible = useMemo(() => {
    return allMatches.filter((m) => {
      if (stage !== "all" && m.stage !== stage) return false;
      if (group !== "all" && m.group !== group) return false;
      if (status !== "all" && m.status !== status) return false;
      return true;
    }).sort((a, b) => +new Date(a.date) - +new Date(b.date));
  }, [allMatches, stage, group, status]);

  // Live matches also float to a pinned block at the top (like the Overview
  // page); they intentionally still appear in their own day section below too.
  const live = useMemo(() => visible.filter((m) => m.status === "live"), [visible]);

  // Today's still-to-come kickoffs get pinned just under the live block (they
  // also remain in their own day section below, like the live cards).
  const todayUpcoming = useMemo(() => {
    const todayKey = new Date().toLocaleDateString();
    return visible.filter(
      (m) => m.status === "scheduled" && new Date(m.date).toLocaleDateString() === todayKey,
    );
  }, [visible]);

  // Group all visible matches by calendar day for readability.
  const byDay = useMemo(() => {
    const map = new Map<string, typeof visible>();
    for (const m of visible) {
      const key = new Date(m.date).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      (map.get(key) ?? map.set(key, []).get(key)!).push(m);
    }
    return [...map.entries()];
  }, [visible]);

  return (
    <>
      <header className="page-head page-head-row">
        <div>
          <h1 className="page-title">Matches</h1>
          <p className="page-sub">
            {view === "list" ? `${visible.length} matches` : "Knockout bracket"}
          </p>
        </div>
        <div className="view-toggle">
          <button
            className={"chip" + (view === "list" ? " is-active" : "")}
            onClick={() => setView("list")}
          >
            List
          </button>
          <button
            className={"chip" + (view === "bracket" ? " is-active" : "")}
            onClick={() => setView("bracket")}
          >
            Bracket
          </button>
        </div>
      </header>

      {view === "bracket" ? (
        <Bracket />
      ) : (
        <MatchList
          stage={stage}
          setStage={setStage}
          group={group}
          setGroup={setGroup}
          status={status}
          setStatus={setStatus}
          live={live}
          todayUpcoming={todayUpcoming}
          byDay={byDay}
        />
      )}
    </>
  );
}

function MatchList({
  stage,
  setStage,
  group,
  setGroup,
  status,
  setStatus,
  live,
  todayUpcoming,
  byDay,
}: {
  stage: Stage | "all";
  setStage: (s: Stage | "all") => void;
  group: string;
  setGroup: (g: string) => void;
  status: "all" | "live" | "finished" | "scheduled";
  setStatus: (s: "all" | "live" | "finished" | "scheduled") => void;
  live: typeof MATCHES;
  todayUpcoming: typeof MATCHES;
  byDay: [string, typeof MATCHES][];
}) {
  return (
    <>
      <div className="filters">
        <div className="chip-row">
          {STAGE_FILTERS.map((s) => (
            <button
              key={s.value}
              className={"chip" + (stage === s.value ? " is-active" : "")}
              onClick={() => setStage(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="filter-selects">
          <label>
            Group
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              disabled={stage !== "all" && stage !== "group"}
            >
              <option value="all">All</option>
              {groupLetters.map((g) => (
                <option key={g} value={g}>
                  Group {g}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              <option value="all">All</option>
              <option value="live">Live</option>
              <option value="finished">Finished</option>
              <option value="scheduled">Upcoming</option>
            </select>
          </label>
        </div>
      </div>

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

      {todayUpcoming.length > 0 && (
        <section className="section">
          <h2 className="section-title">Upcoming today</h2>
          <div className="match-grid">
            {todayUpcoming.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      )}

      {byDay.length === 0 && <p className="empty">No matches match these filters.</p>}

      {byDay.map(([day, dayMatches]) => (
        <section key={day} className="day-group">
          <h2 className="day-title">{day}</h2>
          <div className="match-grid">
            {dayMatches.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
