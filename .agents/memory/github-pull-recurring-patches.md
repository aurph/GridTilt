---
name: GitHub pull recurring local patches
description: Local patches that upstream keeps clobbering on every pull, and the pull technique
---
User says "pull" = sync workspace from GitHub aurph/GridTilt. Real git works now (July 2026): fetch + merge origin/<branch>, push via credential.helper (see github-push-auth.md) — prefer this over the old contents-API snapshot method, which caused history divergence. On merge conflicts in machine-written runtime JSONs under server/data/, keep local (--ours) when local is newer; skip .replit and scripts/post-merge.sh (local adds test line).
Old stale branches may be obsolete: check main's CLAUDE.md "documented debt" section before merging — security closes and uranium-correlation were already superseded on main.

After EVERY pull re-apply these local patches (upstream lacks them):
1. Strip generic JSX type args in PriceHistoryChart.tsx (see replit-dev-metadata-plugin-generic-jsx.md).
2. /api/sector-pulse in server/routes.ts: upstream averages `changePercent ?? 0`, diluting sector averages with stale tickers. Replace with filter-to-finite then average (mirror /api/supply-chain). Guarded by server/__tests__/sector-pulse-throttle.test.ts — keep that file.

**Why:** both regressions came back verbatim on consecutive pulls (branch a28f9f5, then main f1003ca).

After any pull that touches server code, restart the Start application workflow BEFORE e2e/API checks: Vite HMR reloads only the client, and a stale server makes new /api routes fall through to the SPA catch-all as 200+HTML — which the client surfaces as a bogus JSON-parse/network error.

## My Grid error-state wiring
The user reworks `my-grid.tsx` from their local copy, which predates the error-state fix (fetch failure must render ErrorState + retry, not false "No tracked facilities" / endless skeleton). A pull that touches my-grid.tsx likely clobbers it — re-check `ErrorState` wiring on the facilities and rates queries after every such pull, re-apply if gone (happened 2026-07-27).

## Update 2026-08-06
- Sector-pulse stale-ticker rule is now factored into `server/pulse-math.ts` (`averageLiveChanges`), shared with supply-chain and unit-locked by `pulse-math.test.ts` — it should no longer regress on merges, but verify the import survives.
- Conflict-resolution gotcha: `git checkout --ours server/data/*.json && git add -A` blindly stages NON-data conflicts too (a `.gitignore` conflict shipped with markers once). Always list `UU` files first and resolve non-data conflicts by hand before `add -A`.
