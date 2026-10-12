# Dataset freshness monitor

Answers two questions an unattended pipeline cannot answer about itself:
**has a refresh mechanism stopped running, and has anyone re-checked the facts
nobody refreshes automatically?**

A flow on the Jetson dies quietly. The box reboots, n8n is switched off, a PAT
expires. Nothing errors, because nothing is watching. The only symptom is a date
that stops moving, which is how `interconnection-queue.json` reached 77 days
without anyone noticing. A hand-curated file ages the same way with no symptom
at all.

## What it is

- `server/freshness-registry.ts` declares every dataset: where it lives, how to
  read its run stamp (and its data stamp where they differ), how old the run may
  get, what refreshes it, who reviews it and how often, and where its writes land.
  Adding a dataset there is the whole integration.
- `server/data/dataset-reviews.json` (hand-curated) records each completed review:
  dataset, date, outcome (`changed` / `no-change`), scope, evidence. Add an entry
  when a review is done; never to clear an alert.
- `server/freshness.ts` is the pure classifier. No fs, no clock, no env.
- `GET /api/admin/freshness` returns the full report.
- `GET /api/admin/freshness/check` is the deadman: 200 when nothing needs
  attention, 503 with the `attention` list (id, status, detail) when something does.
- `GET /api/admin/freshness/alert-preview` returns the text an alert would carry,
  with what to do for each item. It sends nothing.

All three are admin-gated. Freshness is the floor, not a feature.

## Three dates, never one

- **Job last success** (`jobLastSuccess`): when the mechanism last completed a
  run. A scanner's `lastChecked` says it looked; it does not certify every record
  or change a source's publication date.
- **Data last observed** (`dataLastObserved`): when a value last changed or was seen.
- **Claim last reviewed** (`claimLastReviewed`): when a person last re-checked the
  facts against their sources, from `dataset-reviews.json`.

So the monitor can be green while the site shows an older "as of" date on a
stat. Both are honest; they answer different questions.

## Statuses

| status | meaning | needs attention (503) |
|---|---|---|
| `ok` | run within its cadence; review current, if it has one | no |
| `aging` | run overdue but under 2x cadence (one missed run) | no |
| `stale` | run past 2x cadence: the mechanism has probably stopped | **yes** |
| `no_run_observed` | a cadence is declared but nothing has stamped a run | **yes** |
| `fetch_failed` | a failure is recorded after the last success | **yes** |
| `partial_coverage` | the newest stamp is fresh but some expected series are not | **yes** |
| `review_overdue` | never reviewed, or past its review deadline | **yes** |
| `unknown` | a timestamp the dataset should carry is unreadable, or the file is missing | **yes** |
| `reviewed_no_change` | reviewed in time and nothing changed | no |
| `manual` | hand-curated with no cadence and no review schedule | no |

A dataset can have several issues (`issues`, worst first); its `status` is the
worst. `aging` stays a 200 so a single missed run does not page anyone.

Coverage for the GPU recorder: every model it has ever observed live should keep
appearing. One fresh H100 row does not make a missing H200 series look healthy.
Models never observed live (not every model is listed for rent) are not expected,
and nothing promises daily data for every model.

The data center ingester now moves `lastChecked` only when at least one feed
answered, records `lastCoverage` (feeds answered, items scanned), and records
`lastFailureAt` / `lastFailureReason` when every feed failed.

## Where writes land (read this before scheduling anything)

`writes` in the registry says it:

- `repo`: the mechanism commits (the n8n flows for clusters and curated GPU prices).
- `instance`: the mechanism writes on the running Replit autoscale instance:
  the news scan (`interconnection-queue.json`), the GPU recorder
  (`gpu-price-history.json`), the data center ingester (`datacenters-pending.json`,
  the sidecar) and `/api/kpis` (`index-history.json`). **A redeploy reverts those
  files to the committed copy**, and the report then reads the committed dates. A
  scheduled ping keeps the live site current between deploys; it does not make
  the data durable or put it in the repository.
- `none`: hand-edited only.

## The scheduled jobs (`.github/workflows/data-freshness.yml`)

Reviewed reuse of PR #31: news scan daily, recorder ping on weekdays, deadman twice
a day. Changes from #31:

- **Off until approved.** Scheduled runs do nothing unless the repository variable
  `FRESHNESS_SCHEDULES_ENABLED` is `true`. A manual run always works. Merging the
  file starts nothing.
- **Public logs stay clean.** The repository is public, so are its Actions logs;
  every step prints status codes and dataset ids only, never a response body.
- **No retry on the scan.** It writes; a retry after a timeout could run it twice.
  The recorder pings keep two retries because each recorder writes at most once a day.
- Five-minute job timeouts and one run per job at a time.

The watchdog runs on GitHub, not on the Jetson or Replit: a watchdog hosted on the
box it watches dies with it.

To turn it on: repository secret `GRIDTILT_ADMIN_KEY` (the production
`ADMIN_API_KEY`), then repository variable `FRESHNESS_SCHEDULES_ENABLED=true`. Run
the deadman once by hand first and confirm it fails while datasets need attention:
**verify the alarm fires before trusting the silence.** GitHub suspends schedules
after about 60 days without repository activity; any commit re-arms them.

## Current state (committed data, 2026-10-01)

All nine datasets need attention: clusters, the interconnection queue, curated GPU
prices, the GPU recorder and the data center ingester are stale because their
mechanisms are not running (the n8n flows were built but never mounted; see
`ops/n8n/README.md`), and the hyperscaler capex, inference prices, frontier models
and catalyst calendar have no recorded review. The power agreements' firmness
review (2026-09-28) is recorded. The monitor does not fix staleness; it makes it
loud and says what to do.
