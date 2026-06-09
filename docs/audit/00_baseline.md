# Phase 0 — Baseline Report

> Captured 2026-06-09 on `main` @ `dbbf7ac` (last commit "Ingester pickup", 2026-06-04). Working tree was pristine apart from an untracked `.github/`. Everything below was actually run/observed, not assumed.

## Repo state

- Branches: `main` (default), `redesign/home-swiss` (stale — see findings), and this `audit/phase-0-1`.
- Untracked: `.github/workflows/ci.yml` — a complete, working CI pipeline (checkout, Node 20, `npm ci`, check, test, build, `npm audit --omit=dev`) that **was never committed**, so it has never run on GitHub.
- Toolchain in this environment: Node v26.0.0, npm 11.12.1, macOS 15.6.1. (Note: the repo targets Node 20; it runs on 26 locally but that is not the deploy target.)

## Quality gates — all green

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run check` (`tsc`) | **Pass**, 0 errors. (tsconfig excludes `**/*.test.ts`, so test files are never typechecked.) |
| Tests | `npm test` (`node --test`) | **31/31 pass** across 5 server-only files (`indices`, `social-format`, `datacenter-ingester`, `physical`, `supply-chain-throttle`). No client/component/e2e tests exist. |
| Build | `npm run build` | **Pass** in ~19s. Bundle warning emitted (see below). |
| Index backtest | `npm run backtest:indices` | **Pass** — reproduces the series deterministically from public prices + FRED. |

## Bundle analysis (production client build)

```
dist/public/assets/index-DJewIaCg.js     1,205.13 kB │ gzip: 343.46 kB   ← single oversized entry chunk
dist/public/assets/index-C4CEv7ch.css       96.06 kB │ gzip:  21.64 kB
dist/public/assets/TiltOverview-*.js         63.67 kB │ gzip:  16.69 kB   (lazy)
dist/public/assets/Home-*.js                 19.58 kB │ gzip:   6.30 kB   (lazy)
dist/public/assets/power-map-*.js            14.11 kB │ gzip:   5.23 kB   (split via dynamic topojson import)
Server bundle  dist/index.cjs               ~1.1 MB
```

The 1.2 MB entry chunk is the headline performance problem: only `Home` and `TiltOverview` are `React.lazy`; every other page (and therefore D3, Leaflet, and Recharts) is statically imported in `App.tsx` and lands in the entry chunk that even a marketing-only visitor to `/` must download. Vite prints the "chunks larger than 500 kB" warning. Details in findings (PERF-1).

## Index backtest output (correlation summary)

```
AI Demand vs physical electricity output (lead 0/1/2/3):  -0.21 / -0.13 / -0.01 / -0.16   n=88
Grid Stress:                                              -0.15 /  0.04 /  0.09 /  0.11   n=52
NPI redundancy (daily-return r vs equity legs):  VST r=0.95, CEG r=0.88, NLR r=0.72, CCJ r=0.61
NPI vs Grid Stress signal: r=0.96
```

This reproduces the published conclusion: the gauges carry **no physical-grid signal** and are correctly labeled market-sentiment gauges. The three-way agreement between the README "Index methodology" section, `server/indices.ts`, and `docs/INDEX_VALIDATION.md` is **exact** — this is the strongest part of the codebase and must be preserved. (Re-running the backtest regenerates `index-history.json` and `INDEX_VALIDATION.md` with newer dates; those regenerated files were reverted to keep the audit tree clean.)

## Local endpoint baseline

Booted locally with placeholder `UNSUB_TOKEN_SECRET` / `ADMIN_API_KEY`. All key endpoints return 200 with sensible shapes:

| Endpoint | Result |
|---|---|
| `GET /api/kpis` | 200 — `aiPowerIndex 70.7`, `npiValue 252.5`, `gridStress 67.5`, `source:"live"` |
| `GET /api/index-history` | 200 — 611 daily rows, latest `2026-06-09` |
| `GET /api/queue` | 200 — 60 projects, `lastRefreshed 2026-05-20`, `trackedCapacityGW 38.7` |
| `GET /api/earnings-calendar` | 200 — 77 items, soonest first |
| `GET /api/datacenters` | 200 — 58 sites |
| `GET /api/stack?timeframe=1D` | 200 in ~3.7s — 100 tickers across 13 layers, 4 stale, `correlationCoeff 0.818` |
| `GET /api/supply-chain` | 200 — 5 stages, 5/84 stale, tightest "Transmission" |
| `GET /api/catalysts/all` | 200 — 85 merged items |

Auth + abuse probes:
- `GET /api/admin/subscribers` → **401** with no key, **401** with wrong key, **200** with correct key. Admin gate works.
- `GET /api/newsletter/preview` → **200 with no key** (leaks subscriber count). ⚠️ finding SEC-1.
- `POST /api/social/generate` → **200 with no key** (drives Yahoo fetches, leaks pre-publish copy). ⚠️ finding SEC-2.
- `GET /api/stack?timeframe=ZZZ` → 200 in ~3.8s — an arbitrary timeframe string is a **cache miss that triggers a full ~200-call Yahoo fetch**, bypassing the 10-min cache. ⚠️ finding SEC-3.
- Dev `Permissions-Policy` header: **absent**, despite SECURITY.md claiming it. ⚠️ finding DOC-2.

## Production parity — the "ACTIVE BLOCKER" is resolved

The May 21 deploy blocker recorded in HANDOFF.md is **stale, not active**. Live probes of gridtilt.com show production is on a build from ~June 4 with all the post-blocker features:
- `/` serves the marketing home (the `/` → `/overview` route split shipped).
- `manifest.json` `start_url` is `/overview`.
- `/api/index-history` returns `generated: 2026-06-04` with the full series.
- `/api/queue` returns the same 60 projects / `2026-05-20` as local.
- `/api/kpis` returns live values.
- Production security headers are present and slightly tighter than SECURITY.md documents (CSP `script-src 'self'`, no Twitter origins).

One probe (`/api/physical/electricity-output`) failed to respond in a single attempt — most likely a transient upstream FRED timeout rather than a missing endpoint, since it shipped in the same June 3–4 batch as `/api/index-history` which is live. Worth one re-check before relying on it.

**Conclusion:** main is deployed; no production-parity work is blocking new development. Safe to build on top.

## Docs-vs-reality, top line

The index-methodology documentation is exemplary. Almost everything else has drifted. The single worst lie, repeated in three docs, is a **persistence layer that does not exist**: README/CLAUDE.md/HOMEPAGE_HANDOFF.md describe Drizzle ORM, optional Postgres, `server/storage.ts` with an `IStorage` interface, and a `shared/` directory. Verified absent: `shared/` and `server/storage.ts` do not exist, `package.json` has **0** drizzle/pg references, and there are **0** `DATABASE_URL` references in the code. Full reconciliation is in `01_findings.md` (DOC-1).
