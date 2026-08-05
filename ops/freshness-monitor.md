# Dataset freshness monitor

Answers the one question an unattended pipeline cannot answer about itself:
**has a refresh mechanism stopped running?**

A flow on the Jetson dies quietly. The box reboots, n8n is switched off, a PAT
expires. Nothing errors, because nothing is watching. The only symptom is a date
that stops moving, which is how `interconnection-queue.json` reached 77 days
without anyone noticing.

## What it is

- `server/freshness-registry.ts` declares every dataset: where it lives, how to
  read its timestamp, how old it is allowed to get, and what is supposed to
  refresh it. Adding a dataset here is the whole integration.
- `server/freshness.ts` is the pure classifier. No fs, no clock, no env.
- `GET /api/admin/freshness` returns the full report.
- `GET /api/admin/freshness/check` is the deadman: 200 when nothing is stale,
  503 listing offenders when something is.

Both routes are admin-gated. Freshness is the floor, not a feature; a public
"look how current we are" page advertises the bare minimum.

## Statuses

| status | meaning | trips the alarm |
|---|---|---|
| `ok` | within its declared cadence | no |
| `aging` | overdue but under 2x cadence, ie. one missed run | no |
| `stale` | past 2x cadence, the mechanism has probably stopped | **yes** |
| `manual` | hand-curated, no cadence declared | no |
| `unknown` | no readable timestamp in the file | no |

`aging` is deliberately a 200. If a single missed run pages you, the alert stops
meaning anything within a month.

`unknown` deliberately does not alarm either: it marks a gap in instrumentation,
not evidence of failure. `datacenters.json` is the current example, a bare array
with no date field anywhere, so its age cannot be checked at all.

## Wiring the deadman

**The watchdog must not run on the Jetson.** A watchdog hosted on the box it
watches dies with it, which is the exact failure this exists to catch. Use the
same cron-job.org account already firing the daily tweet.

1. New cron job, URL `https://gridtilt.com/api/admin/freshness/check`.
2. Add request header `x-admin-key` with the production `ADMIN_API_KEY`.
3. Schedule daily. Hourly is pointless: every cadence here is measured in days.
4. Enable the job's failure notification. cron-job.org alerts on any non-2xx,
   which is exactly the 503.
5. Save, run once manually, and confirm you get the failure mail while datasets
   are still stale. **Verify the alarm fires before trusting the silence.**

Nothing else to configure. The response body lists each stale dataset with its
mechanism, so the alert tells you which flow to go restart.

## Why the dates can disagree with the site

Two different questions, deliberately two different fields:

- `lastRefreshed` is when a value last **changed**.
- `lastChecked` is when something last **looked**, changed or not.

Staleness follows `lastChecked` where it exists, falling back to `lastRefreshed`.
Otherwise a dataset that is checked daily and correctly unchanged would read as
abandoned, and you could not tell that apart from the scanner never running.

So once the scanner is scheduled, the monitor can be green while the homepage
still shows an older "as of" date on that stat. Both are honest and they answer
different questions. Do not "fix" this by pointing them at the same field.

`POST /api/admin/scan-news-now` stamps `lastChecked` on every run. The n8n
`cluster-refresh` flow achieves the same thing differently: it commits even on a
zero-change pass so only `lastRefreshed` moves.

## Current state

As of the last check, three datasets are stale purely because their flows were
built but never mounted on the Jetson: `clusters`, `interconnection-queue`, and
`gpu-rental-prices`. See `ops/n8n/README.md` for mounting instructions. The
monitor does not fix staleness, it makes staleness loud.
