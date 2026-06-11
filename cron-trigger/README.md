# wc-data-trigger

A tiny Cloudflare Worker that fires the **Update World Cup data** GitHub Actions
workflow every minute via `workflow_dispatch`.

## Why

GitHub throttles its own `schedule:` cron — for this repo, scheduled runs landed
roughly **every 3–4 hours** instead of the requested cadence. `workflow_dispatch`
through the REST API is **not** throttled, so this Worker drives a reliable
1-minute trigger. The workflow's `concurrency` guard plus its in-job 60s
live-poll loop handle the rest, so the only job here is to make sure a run
starts promptly near a kickoff.

## One-time setup

1. **Create a GitHub token** (fine-grained PAT):
   - GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate
   - **Repository access:** Only select repositories → `dashboards`
   - **Permissions:** Repository → **Actions: Read and write**
   - Set an expiration (e.g. just past the tournament).

2. **Install deps & log in:**
   ```bash
   cd cron-trigger
   npm install
   npx wrangler login
   ```

3. **Store the token as an encrypted Worker secret** (never committed):
   ```bash
   npx wrangler secret put GH_TOKEN
   # paste the PAT when prompted
   ```
   Optional: protect the manual test endpoint with a key:
   ```bash
   npx wrangler secret put TRIGGER_KEY   # then GET requires ?key=<value>
   ```

4. **Deploy:**
   ```bash
   npm run deploy
   ```

## Verify

- **Manual fire:** open the Worker URL printed by deploy (add `?key=...` if you
  set `TRIGGER_KEY`). Expect `dispatched update-data.yml on mirghanbari/dashboards@main`.
- **Confirm a run started:**
  ```bash
  gh run list --workflow "Update World Cup data" --event workflow_dispatch --limit 3
  ```
- **Watch cron logs:** `npm run tail` (or Cloudflare dashboard → Workers → this
  Worker → Logs / Triggers).

## Config

Non-secret settings live in `wrangler.toml` under `[vars]` (`OWNER`, `REPO`,
`WORKFLOW`, `REF`). Change cadence via the `crons` array (`* * * * *` = every
minute; Cloudflare's minimum interval is 1 minute).

## Cost

Cloudflare Workers free tier covers this easily (1 request/min). GitHub Actions
is free on this public repo, so frequent dispatches cost nothing.
