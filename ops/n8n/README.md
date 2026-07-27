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

## cluster-refresh.json

Daily refresh for the Compute Frontier cluster registry:

`Daily trigger` (06:30) -> fetch current `server/data/clusters.json` and
`server/data/interconnection-queue.json` from GitHub -> Claude (Sonnet 4.6)
with web search researches what changed (status transitions, power figure
updates, new named superclusters, new operators, disclosed GPU counts) and
returns a PATCH of changed and new rows only, never the full 235-row file ->
**hard validation** applies the patch -> commit straight to `main` with subject
`data: daily cluster refresh` -> ntfy notification.

The validation node aborts the run with NO commit, and fires a separate abort
ntfy alert, if any of these fail:
- a changed row does not carry at least one `https://` source
- a changed row does not carry an explicit `estimated[]` array (estimates and
  forward targets must be flagged; `[]` means fully sourced)
- any operational cluster would have 0 rated MW
- any `linkedDeal` id does not resolve against `interconnection-queue.json`
- the total cluster count would shrink (it may only grow or stay equal; rows
  can never be deleted, renamed, or re-id'd through the patch)
- total planned MW swings more than 15% in a single day
- a status moves backward (only announced -> construction -> operational)
- more than 30 rows change in one day (churn that big is never real news)
- per-row sanity: status outside the three known values, power outside
  0-15000 MW, gpuCount outside 1-5,000,000, malformed new rows

On a clean pass with zero changes it still commits: only `lastRefreshed`
moves, which is the "checked today" signal `/api/clusters/metrics` serves.
Unchanged rows are byte-identical in the output, so git diffs stay minimal.

## Mounting on the Jetson n8n

How to put cluster-refresh.json on the homelab instance. Nothing runs until
you do this by hand.

Credentials needed (both already exist if the GPU reprice is mounted):
1. `Anthropic x-api-key` (HTTP Header Auth): Name `x-api-key`, Value = the
   Anthropic API key. Map it on *Claude research (web search)*.
2. `GitHub PAT` (HTTP Header Auth): Name `Authorization`, Value
   `Bearer <PAT>`. The token needs Contents read/write on `aurph/GridTilt`.
   Map it on *GitHub get clusters file*, *GitHub get deals file*, and
   *Commit to main*.

Steps:
1. Import `cluster-refresh.json` into the Jetson n8n. Importing does not
   activate it.
2. Map the two credentials as above (4 nodes total).
3. Subscribe to the ntfy topic `gridtilt-cluster-refresh` on your phone.
   Both the success summary and the abort alert use this one topic; change
   it on the *Notify* and *Notify abort* nodes if you want something else.
4. Run it once manually. Confirm the commit touches only
   `server/data/clusters.json` and the subject line is exactly
   `data: daily cluster refresh`.
5. Activate the workflow.

Schedule: daily at 06:30 in the n8n instance timezone. That sits after the
05:00 GPU recorder ping and the Monday 06:00 GPU reprice, so the two commit
flows never race (different files anyway, but no reason to overlap).

Kill switch: toggle the workflow off in n8n. That is the whole mechanism;
there is no env flag. Off means no research, no commit, no alerts. Revoking
the GitHub PAT is the harder stop that also freezes the GPU workflows.

If the run aborts you get a high-priority ntfy alert with the exact gate rule
that tripped, and clusters.json on main is untouched. Fix by hand or wait for
the next day's run.

## Notes
- Push != shipped. After a commit, redeploy on Replit to put it live.
- A history-backup commit is durable storage, not a deploy. It becomes the recorder
  baseline the next time Replit is manually redeployed.
- For a full-fidelity refresh (20-agent research + adversarial verify), use the
  on-demand Claude Code path instead; n8n is the steady weekly heartbeat.
- Source of truth for this file is the builder at the bottom of the Neocloud Intel
  build log; regenerate rather than hand-editing the node JSON.
