// Live-score polling. The full dataset is bundled at build time, so a loaded
// tab is frozen at the last deploy. This hook polls the slim public/live.json
// (emitted by scripts/gen-live.mjs) and returns score/status/minute patches so
// the live-match cards update in place — no page reload.
//
// Cadence: the data only changes at deploy cadence (~2 min, see update-data.yml
// DEPLOY_INTERVAL), so polling faster than ~60s gains nothing. We poll 60s while
// a match is live or about to kick off, drop to a 5-min heartbeat otherwise (to
// catch a kickoff), pause while the tab is hidden, and refresh on refocus.
import { useEffect, useRef, useState } from "react";
import { MATCHES } from ".";
import type { Match } from "../types";

/**
 * The fields live.json carries. Every entry has the slim card fields; live and
 * recently-finished matches also carry `timeline`/`stats` for the detail page.
 */
export type LiveMatch = Pick<
  Match,
  "id" | "status" | "homeScore" | "awayScore" | "minute" | "timeline" | "stats"
>;

const LIVE_URL = `${import.meta.env.BASE_URL}live.json`;
const POLL_MS = 60_000; // a match is live or near kickoff
const IDLE_MS = 5 * 60_000; // nothing live — slow heartbeat to catch a kickoff
const PREKICK_MS = 15 * 60_000; // start polling this long before kickoff
const POSTKICK_MS = 3 * 60 * 60_000; // keep polling this long after kickoff

/**
 * Are we near any football right now? Cheap check from the static kickoff times
 * plus whatever live statuses we last fetched, so the page isn't polling all day.
 */
function activeWindow(live: Map<string, LiveMatch>, now: number): boolean {
  for (const m of MATCHES) {
    const status = live.get(m.id)?.status ?? m.status;
    if (status === "live") return true;
    if (status === "scheduled") {
      const kickoff = new Date(m.date).getTime();
      if (now >= kickoff - PREKICK_MS && now <= kickoff + POSTKICK_MS) return true;
    }
  }
  return false;
}

/** Live score/status/minute patches keyed by match id (empty until first poll). */
export function useLiveMatches(): Map<string, LiveMatch> {
  const [live, setLive] = useState<Map<string, LiveMatch>>(() => new Map());
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function fetchLive() {
      try {
        const res = await fetch(`${LIVE_URL}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) return;
        const data: unknown = await res.json();
        if (cancelled || !Array.isArray(data)) return;
        setLive(new Map((data as LiveMatch[]).map((m) => [m.id, m])));
      } catch {
        /* offline / transient — keep the last known data, retry next tick */
      }
    }

    function schedule() {
      if (cancelled) return;
      const delay = activeWindow(liveRef.current, Date.now()) ? POLL_MS : IDLE_MS;
      timer = setTimeout(async () => {
        if (!document.hidden && activeWindow(liveRef.current, Date.now())) {
          await fetchLive();
        }
        schedule();
      }, delay);
    }

    // Page may have loaded mid-match — prime immediately if we're near football.
    if (activeWindow(liveRef.current, Date.now())) fetchLive();
    schedule();

    // Refresh the moment the tab regains focus (it may have been hidden a while).
    const onVisible = () => {
      if (!document.hidden && activeWindow(liveRef.current, Date.now())) fetchLive();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return live;
}

/** Overlay live patches onto the bundled matches (returns the same array if none). */
export function applyLive(matches: Match[], live: Map<string, LiveMatch>): Match[] {
  if (live.size === 0) return matches;
  return matches.map((m) => {
    const patch = live.get(m.id);
    return patch ? { ...m, ...patch } : m;
  });
}
