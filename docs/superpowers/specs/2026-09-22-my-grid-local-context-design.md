# My Grid: local context

Design, 2026-09-22. Status: news layer built. Structured bill records
deferred; see Open decisions.

## Problem

My Grid is built on the facility registry, and the registry floor is 400 MW.
Around forty states have no tracked campus. A full-page capture of the live
page for Maryland shows:

| Block | State |
|---|---|
| Map | Real, occupies ~45% of the fold |
| Your grid | Real: PJM, 17.5% reserve margin, 258 GW queue |
| Being built in Maryland | "No tracked facilities in Maryland." |
| What electricity costs in Maryland | "Rate data connects soon." |
| Below that | Nothing. ~1,300px of empty page. |

Two of four cards are empty states and the page has no bottom. "Blank and
bland" is a content-density problem, not a styling one: almost nothing on
the page is specific to the reader's state unless they happen to live beside
a hyperscale campus.

Separately, `EIA_API_KEY` is not set in the Replit deployment.
`gridtilt.com/api/physical/retail-rates` returns `{"configured":false}`, so
the rates card is empty for every state in production today. A secret to
set, not code to write.

## Goal

Give every state, not just the eleven with tracked campuses, something true
and current on this page.

## Non-goals

- Lowering the 400 MW registry floor. The captions promise 400 MW and up and
  the Power Map depends on the same threshold.
- Deriving consumer-facing numbers. Ruled out 2026-09-16, still ruled out.
- Any scheduled job or agent that burns tokens. This is a read-through cache
  on request.

## Why news carries the legislative ask

The request was local news *and* legislature. Grid legislation is reported as
news, so one keyless source covers both. Live feeds on 2026-09-22 returned:

- Maryland: "Baltimore County Council To Vote On Extending Data Center
  Moratorium"
- Texas: "Tarrant lawmaker plans Texas data center transparency legislation"
- Wyoming: "Facing Electricity Shortages, Wyoming Legislators Say Make
  Utilities Compete"
- Vermont: "Vermont regulators finalize 5.5% rate increase for Green Mountain
  Power customers"

Legislature and PUC coverage both land, in the week it happens, in every
state including small ones. What this does not give is structured bill
records: number, sponsor, chamber, status.

## Data source

Google News RSS, one query per state, keyless. Query is the state name, a
set of grid terms, both regulator spellings, and `when:14d`.

Rejected alternatives, recorded so they are not re-litigated:

- **OpenStates API v3** is the right shape and covers all 50 states, but
  needs an API key. Out of scope under keyless-only.
- **OpenStates bulk data** is not a keyless substitute. CSV and JSON sit
  behind a login. The monthly Postgres dump at
  `data.openstates.org/postgres/monthly/` is publicly fetchable but is
  10.0 GB, was last written 2026-08-01, and needs a Postgres instance this
  project does not have.
- **Per-state legislature RSS** exists (Washington, Kansas, Hawaii, West
  Virginia among them) but nowhere near all 50, so it cannot be a backbone.

## Module

`server/state-news.ts`, following `server/physical.ts`: constant URL shape,
in-memory TTL cache, typed honest degradation, never fabricate. It writes
nothing to `server/data/`, so unlike the news scanner a bad match shows one
wrong headline for an hour rather than corrupting a curated file.

Route `/api/state-news/:state` in `routes.ts`. Keyless, so there is no
`configured:false` branch: unknown state is 404, upstream failure is 502, and
an empty list is a legitimate answer that renders as an empty state.

State names are re-declared server-side rather than imported from
`client/src/data/state-grid.ts`, because nothing is shared across that
boundary in this project.

### Two filters, both earned from live data

1. **Relevance.** A headline must carry a grid term. Virginia's feed returned
   "September Releases - Governor of Virginia", a press index with no grid
   content.
2. **Locality.** Reject a headline that names a different state and not this
   one. Vermont's feed returned "...Increasing Utility Bills in Arizona".
   Headlines naming no state are kept, because genuinely local ones often
   read "Baltimore County Council ..." or "City of Torrington ..." and never
   say the state. Headlines that do name the state are ranked first, so in a
   thin state the true local coverage leads.

State matching is longest-name-first with matched spans blanked, so "West
Virginia" is not read as "Virginia". "Washington, D.C." is skipped, since
federal policy headlines would otherwise be filed under Washington state.

## Testing

Node's built-in runner, no DOM tests, no network in tests. 28 new tests. The
fixtures are real titles from live per-state feeds, including every case that
must be dropped.

## Known limitations

- A small state can still surface a soft item. Vermont currently returns a
  celebrity off-grid-home story: it names Vermont and concerns energy, so
  both filters pass it. Tightening further would start dropping real local
  coverage.
- Google News is an aggregator, not a curated feed. The eight curated feeds
  still serve the national ticker and are unchanged.

## Open decisions

1. **Structured bill records.** A free OpenStates key would add bill number,
   sponsor, chamber and status for all 50 states, on the same pattern as
   `EIA_API_KEY`. Keyless-only rules it out today. Worth revisiting now that
   the news layer shows how much of the gap it already closes.
2. **Map size and page order.** The map takes ~45% of the fold and, for a
   state with no tracked facilities, shows mostly empty land. A taste call,
   deferred until there is a screenshot with the news card in place.
3. **"Being built" empty state.** It currently dead-ends at "No tracked
   facilities." The map already computes the nearest tracked facilities in
   neighbouring states; rendering those as a list would turn it into "the
   nearest tracked buildout is X, across the line in Virginia." Not built
   yet.
