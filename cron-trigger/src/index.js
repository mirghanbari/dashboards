// Triggers the "Update World Cup data" GitHub Actions workflow via
// workflow_dispatch. GitHub throttles its own `schedule:` cron heavily, so this
// Worker drives the cadence instead (workflow_dispatch is not throttled).
//
// The Worker wakes every minute (free, well under the Workers limit) but only
// *dispatches a run* when warranted:
//   - while a match is in progress  -> every LIVE_EVERY_MIN minutes (default 2)
//   - otherwise (idle)              -> every IDLE_EVERY_MIN minutes (default 30)
// LIVE_EVERY_MIN is 2 (not 1) on purpose: an update-data run takes ~2 min and a
// live match's run already polls internally every 60s for up to ~3h, so a 1/min
// external dispatch just piles up pending runs that get cancelled (concurrency
// is cancel-in-progress:false) and fires a deploy per cancellation. 2 min keeps
// the data just as fresh (the deploy is throttled to 2 min anyway) with far less
// cancelled-run churn.
// "In progress" is decided from the published matches.json: any match flagged
// live, or any match whose kickoff is within [kickoff - PRE_KICKOFF, kickoff +
// MATCH_WINDOW]. Schedule-based detection means we switch to 1/min right at
// kickoff without waiting to notice a committed `live` status.
//
// Required secret:  GH_TOKEN  — fine-grained PAT, repo mirghanbari/dashboards,
//                               permission: Actions Read and write.
// Optional secret:  TRIGGER_KEY — if set, the manual GET endpoint needs ?key=.

const DEFAULTS = {
  OWNER: "mirghanbari",
  REPO: "dashboards",
  WORKFLOW: "update-data.yml",
  REF: "main",
  MATCHES_URL:
    "https://raw.githubusercontent.com/mirghanbari/dashboards/main/world-cup/src/data/matches.json",
  IDLE_EVERY_MIN: "30", // dispatch this often when no match is on
  LIVE_EVERY_MIN: "2", // dispatch this often while a match is in progress
  PRE_KICKOFF_MIN: "5", // start the live cadence this long before kickoff
  MATCH_WINDOW_MIN: "165", // treat as in-progress up to 2h45m after kickoff
};

const cfg = (env, key) => env[key] ?? DEFAULTS[key];

async function dispatch(env) {
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN secret is not set");
  const owner = cfg(env, "OWNER");
  const repo = cfg(env, "REPO");
  const workflow = cfg(env, "WORKFLOW");
  const ref = cfg(env, "REF");

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "wc-data-trigger",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref }),
  });
  if (res.status !== 204) {
    throw new Error(`dispatch failed: ${res.status} ${await res.text()}`);
  }
  return `dispatched ${workflow} on ${owner}/${repo}@${ref}`;
}

// True if a match is live now or within its kickoff window. `now` is ms epoch.
async function isGameOn(env, now) {
  const res = await fetch(cfg(env, "MATCHES_URL"), {
    headers: { "User-Agent": "wc-data-trigger" },
    cf: { cacheTtl: 60 }, // kickoff times are static; a short cache is fine
  });
  if (!res.ok) throw new Error(`matches fetch ${res.status}`);
  const matches = await res.json();

  const pre = Number(cfg(env, "PRE_KICKOFF_MIN")) * 60_000;
  const win = Number(cfg(env, "MATCH_WINDOW_MIN")) * 60_000;
  return matches.some((m) => {
    if (m.status === "live") return true;
    const t = m.date ? Date.parse(m.date) : NaN;
    if (Number.isNaN(t)) return false;
    return now >= t - pre && now <= t + win;
  });
}

// Decide whether to dispatch this tick. Returns { gameOn, dispatch, reason }.
async function decide(env, now) {
  const idle = Number(cfg(env, "IDLE_EVERY_MIN"));
  const liveEvery = Number(cfg(env, "LIVE_EVERY_MIN"));
  let gameOn = false;
  let reason;
  try {
    gameOn = await isGameOn(env, now);
  } catch (err) {
    // If we can't read the schedule, stay quiet (idle cadence) — GitHub's own
    // cron remains a backup — but log it.
    reason = `live-check failed: ${err.message}`;
  }
  const minute = new Date(now).getUTCMinutes();
  const onLiveTick = minute % liveEvery === 0;
  const onIdleTick = minute % idle === 0;
  return {
    gameOn,
    // Even while a match is on we only fire every LIVE_EVERY_MIN minutes — see
    // the header note on why 1/min just churns cancelled runs. Idle ticks (every
    // 30) still fire regardless so an off-window heartbeat always lands.
    dispatch: (gameOn && onLiveTick) || onIdleTick,
    reason:
      reason ??
      (gameOn ? `match in progress (min=${minute})` : `idle (min=${minute})`),
  };
}

export default {
  // Per-minute cron heartbeat (see wrangler.toml).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const now = event.scheduledTime ?? Date.now();
        const d = await decide(env, now);
        if (!d.dispatch) {
          console.log(`skip — ${d.reason}`);
          return;
        }
        try {
          console.log(`${d.reason} → ${await dispatch(env)}`);
        } catch (err) {
          console.error(err.message);
        }
      })(),
    );
  },

  // Manual endpoint. `?dry=1` reports the decision without dispatching;
  // otherwise it forces a dispatch (handy for testing).
  async fetch(request, env) {
    if (env.TRIGGER_KEY) {
      const key = new URL(request.url).searchParams.get("key");
      if (key !== env.TRIGGER_KEY) return new Response("not found\n", { status: 404 });
    }
    const dry = new URL(request.url).searchParams.get("dry");
    const d = await decide(env, Date.now());
    if (dry) {
      return new Response(`gameOn=${d.gameOn} wouldDispatch=${d.dispatch} (${d.reason})\n`);
    }
    try {
      return new Response(`${await dispatch(env)} [${d.reason}]\n`, { status: 200 });
    } catch (err) {
      return new Response(`${err.message}\n`, { status: 502 });
    }
  },
};
