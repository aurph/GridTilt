# n8n automations

Importable n8n workflows for the Jetson homelab. These run on the self-hosted
n8n instance, not inside the app.

> **Nothing here runs until you mount it.** If a flow is never imported, or the
> Jetson is off, the data silently stops moving. `ops/freshness-monitor.md` is
> the watchdog that makes that failure loud; it deliberately runs off-Jetson,
> because a watchdog on the box it watches dies with it.

The model-API research flows that used to live here (weekly GPU reprice, daily
cluster refresh) were retired on 2026-10-27. Both datasets are refreshed by hand
now: a research pass against primary pages, an adversarial check of every
number, then a PR. The freshness registry (`server/freshness-registry.ts`)
records that cadence.

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

The recorder itself (RunPod and Vast.ai sweep) is paused until both providers
give written permission (`GPU_LIVE_SWEEP_ENABLED`). While it is paused this
backup has nothing new to copy; it stays correct to mount, it just commits an
unchanged file.

### One-time setup for history backup

1. Deploy the code containing `GET /api/admin/gpu-history` to Replit manually.
   A Git push does not deploy GridTilt.
2. Import `gpu-history-backup.json` into the Jetson n8n instance.
3. Create an HTTP Header Auth credential named `GridTilt Admin Key`: Name
   `x-admin-key`, Value the same production `ADMIN_API_KEY` configured on Replit.
   Map it on *Fetch raw GPU history*.
4. Create an HTTP Header Auth credential named `GitHub PAT`: Name
   `Authorization`, Value `Bearer <PAT>`. Map it on *GitHub get history file*
   and *Commit history to main*. The token needs Contents read/write access to
   `aurph/GridTilt`.
5. Run *Manual trigger* once. Confirm that the resulting commit contains only
   `server/data/gpu-price-history.json`, then activate the workflow. Importing the
   JSON does not activate it.

The backup limits redeploy loss to at most the days since the last successful
weekly run. It does not create observations. With `DATABASE_URL` set, the same
file is also mirrored in Postgres at boot (`server/durable-docs.ts`), which is
the primary durability path; this flow is the off-platform copy.

## Notes
- Push != shipped. After a commit, redeploy on Replit to put it live.
- A history-backup commit is durable storage, not a deploy. It becomes the recorder
  baseline the next time Replit is manually redeployed.
- Repo/branch (`aurph/GridTilt`, `main`) are hard-coded in the GitHub node URLs.
