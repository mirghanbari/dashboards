import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MATCHES, groupLetters, useLiveMatches, applyLive } from "../data";
import { MatchCard } from "../components/MatchCard";
import { Bracket } from "../components/Bracket";
import type { Stage } from "../types";

const isToday = (m: (typeof MATCHES)[number]) =>
  new Date(m.date).toLocaleDateString() === new Date().toLocaleDateString();

// Group a date-sorted match list into [dayLabel, matches] entries, preserving
// the incoming order (ascending) so callers can reverse for newest-first.
function groupByDay(list: typeof MATCHES): [string, typeof MATCHES][] {
  const map = new Map<string, typeof MATCHES>();
  for (const m of list) {
    const key = new Date(m.date).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    (map.get(key) ?? map.set(key, []).get(key)!).push(m);
  }
  return [...map.entries()];
}

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

  // Split into upcoming fixtures and finished results, each grouped by calendar
  // day. Fixtures lead the page in chronological order so "what's next" is right
  // under the fold; results sit below, newest-first, as a collapsible archive
  // instead of forcing a scroll past every played day. Today's full slate stays
  // under Fixtures — including games already played — so the active day reads as
  // one snapshot (live + done + still to come), and Results is purely the past.
  const fixtureDays = useMemo(
    () => groupByDay(visible.filter((m) => m.status !== "finished" || isToday(m))),
    [visible],
  );
  const resultDays = useMemo(
    () => groupByDay(visible.filter((m) => m.status === "finished" && !isToday(m))).reverse(),
    [visible],
  );

  // "Results" CTA jumps to the results archive; if we're on the bracket view we
  // first switch back to the list, then scroll once it has rendered.
  const pendingResultsScroll = useRef(false);
  const scrollToResults = () =>
    document.getElementById("results-section")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  useEffect(() => {
    if (view === "list" && pendingResultsScroll.current) {
      pendingResultsScroll.current = false;
      scrollToResults();
    }
  }, [view]);
  const goToResults = () => {
    if (view === "list") scrollToResults();
    else {
      pendingResultsScroll.current = true;
      setView("list");
    }
  };

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
          <button className="chip" onClick={goToResults}>
            Results
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
          fixtureDays={fixtureDays}
          resultDays={resultDays}
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
  fixtureDays,
  resultDays,
}: {
  stage: Stage | "all";
  setStage: (s: Stage | "all") => void;
  group: string;
  setGroup: (g: string) => void;
  status: "all" | "live" | "finished" | "scheduled";
  setStatus: (s: "all" | "live" | "finished" | "scheduled") => void;
  live: typeof MATCHES;
  todayUpcoming: typeof MATCHES;
  fixtureDays: [string, typeof MATCHES][];
  resultDays: [string, typeof MATCHES][];
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

      {fixtureDays.length === 0 && resultDays.length === 0 && (
        <p className="empty">No matches match these filters.</p>
      )}

      {fixtureDays.length > 0 && (
        <section className="section">
          <h2 className="section-title">Fixtures</h2>
          {fixtureDays.map(([day, dayMatches]) => (
            <DayGroup key={day} day={day} matches={dayMatches} defaultOpen />
          ))}
        </section>
      )}

      {resultDays.length > 0 && (
        <section className="section" id="results-section">
          <h2 className="section-title">Results</h2>
          {resultDays.map(([day, dayMatches], i) => (
            <DayGroup
              key={day}
              day={day}
              matches={dayMatches}
              collapsible
              // Keep the most recent results day open (and everything when the
              // user has explicitly filtered to finished games); collapse the
              // rest so the archive doesn't bury the fixtures above it.
              defaultOpen={i === 0 || status === "finished"}
            />
          ))}
        </section>
      )}
    </>
  );
}

function DayGroup({
  day,
  matches,
  defaultOpen = false,
  collapsible = false,
}: {
  day: string;
  matches: typeof MATCHES;
  defaultOpen?: boolean;
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!collapsible) {
    return (
      <div className="day-group">
        <h3 className="day-title">{day}</h3>
        <div className="match-grid">
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="day-group">
      <button
        className="day-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={"day-caret" + (open ? " is-open" : "")} aria-hidden="true">
          ▸
        </span>
        <span className="day-title">{day}</span>
        <span className="day-count">{matches.length}</span>
      </button>
      {open && (
        <div className="match-grid">
          {matches.map((m) => (
            <MatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </div>
  );
}
