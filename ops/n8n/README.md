# n8n automations

Importable n8n workflows that keep GridTilt data fresh from the Jetson homelab.
These run on the self-hosted n8n instance, not inside the app.

## gpu-price-refresh.json

Two independent flows in one workflow file:

### 1. Weekly GPU price refresh (Neocloud Intel)
`Weekly trigger` (Mon 06:00) -> fetch current `server/data/gpu-rental-prices.json`
from GitHub -> Claude (Sonnet 4.6) with web search re-prices all models from live
neocloud/marketplace sources -> **hard validation** -> commit straight to `main`
-> ntfy notification.

The validation node aborts the run with NO commit if any of these fail:
- the model set changes (must stay the same models)
- `low <= currentUsdPerHr <= high`
- any source is not `https://`
- the `currentUsdPerHr` est. flag is missing
- a model's `historyAnchors` shrink (history must only grow)
- any single price moves more than 60% vs last week (blocked for manual review)

This is the integrity gate that makes unattended commit-to-main safe.

### 2. Daily recorder ping
`Daily trigger` (05:00) -> GET `https://gridtilt.com/api/gpu-prices/metrics`.
That endpoint appends one snapshot per Eastern day, so the trend chart accrues a
real daily series even on days with no organic traffic.

## One-time setup in n8n
1. HTTP Header Auth credential `Anthropic x-api-key`: Name `x-api-key`, Value = Anthropic API key. Map on *Claude refresh*.
2. HTTP Header Auth credential `GitHub PAT`: Name `Authorization`, Value `Bearer <PAT>`. Map on both GitHub nodes.
3. Set the ntfy topic on *Notify* (default `gridtilt-gpu-refresh`).
4. Activate the workflow.

Repo/branch (`aurph/GridTilt`, `main`) are hard-coded in the GitHub node URLs.

## gpu-history-backup.json

Weekly durability backup for the live recorder:

`Weekly trigger` (Sun 04:30 ET) -> authenticated GET
`https://gridtilt.com/api/admin/gpu-history` -> validate every snapshot, price,
spread, source list, and sample count -> fetch the current file SHA from GitHub
-> replace `server/data/gpu-price-history.json` on `main` -> ntfy notification.

This endpoint is intentionally raw. The merged metrics series omits snapshot-level
source and metadata, so it cannot reconstruct the history file without losing
provenance. The workflow aborts before GitHub if the response is empty, malformed,
contains duplicate dates, or contains invalid price or metadata values.

### One-time setup for history backup

1. Deploy the code containing `GET /api/admin/gpu-history` to Replit manually.
   A Git push does not deploy GridTilt.
2. Import `gpu-history-backup.json` into the Jetson n8n instance.
3. Create an HTTP Header Auth credential named `GridTilt Admin Key`: Name
   `x-admin-key`, Value the same production `ADMIN_API_KEY` configured on Replit.
   Map it on *Fetch raw GPU history*.
4. Map the existing `GitHub PAT` credential on *GitHub get history file* and
   *Commit history to main*. The token needs Contents read/write access to
   `aurph/GridTilt`.
5. Run *Manual trigger* once. Confirm that the resulting commit contains only
   `server/data/gpu-price-history.json`, then activate the workflow. Importing the
   JSON does not activate it.

The backup limits redeploy loss to at most the days since the last successful
weekly run. It does not create observations and it does not repair the separate
05:00 daily recorder ping. Restarting or repairing the Jetson n8n instance remains
an owner action required for both schedules to run.

## Notes
- Push != shipped. After a commit, redeploy on Replit to put it live.
- A history-backup commit is durable storage, not a deploy. It becomes the recorder
  baseline the next time Replit is manually redeployed.
- For a full-fidelity refresh (20-agent research + adversarial verify), use the
  on-demand Claude Code path instead; n8n is the steady weekly heartbeat.
- Source of truth for this file is the builder at the bottom of the Neocloud Intel
  build log; regenerate rather than hand-editing the node JSON.
