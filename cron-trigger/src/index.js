// Fires a workflow_dispatch for the "Update World Cup data" GitHub Actions
// workflow. Runs on a 1-minute Cloudflare cron (see wrangler.toml) to work
// around GitHub throttling its `schedule:` cron — workflow_dispatch via the
// REST API is not throttled.
//
// Required secret:  GH_TOKEN  — fine-grained PAT, repo mirghanbari/dashboards,
//                               permission: Actions Read and write.
//   wrangler secret put GH_TOKEN
//
// Optional secret:  TRIGGER_KEY — if set, the manual GET endpoint requires
//                                 ?key=<value>; otherwise GET is open.

const DEFAULTS = {
  OWNER: "mirghanbari",
  REPO: "dashboards",
  WORKFLOW: "update-data.yml",
  REF: "main",
};

async function dispatch(env) {
  if (!env.GH_TOKEN) throw new Error("GH_TOKEN secret is not set");

  const owner = env.OWNER ?? DEFAULTS.OWNER;
  const repo = env.REPO ?? DEFAULTS.REPO;
  const workflow = env.WORKFLOW ?? DEFAULTS.WORKFLOW;
  const ref = env.REF ?? DEFAULTS.REF;

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

  // GitHub returns 204 No Content on a successful dispatch.
  if (res.status !== 204) {
    throw new Error(`dispatch failed: ${res.status} ${await res.text()}`);
  }
  return `dispatched ${workflow} on ${owner}/${repo}@${ref}`;
}

export default {
  // Cloudflare cron trigger — the 1-minute heartbeat.
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      dispatch(env)
        .then((msg) => console.log(msg))
        .catch((err) => console.error(err.message)),
    );
  },

  // Manual trigger for testing: open the Worker's URL in a browser/curl.
  async fetch(request, env) {
    if (env.TRIGGER_KEY) {
      const key = new URL(request.url).searchParams.get("key");
      if (key !== env.TRIGGER_KEY) return new Response("not found\n", { status: 404 });
    }
    try {
      return new Response(`${await dispatch(env)}\n`, { status: 200 });
    } catch (err) {
      return new Response(`${err.message}\n`, { status: 502 });
    }
  },
};
