---
name: GitHub pull recurring local patches
description: Local patches that upstream keeps clobbering on every pull, and the pull technique
---
User says "pull" = sync workspace from GitHub aurph/GridTilt via contents API (git ops sandbox-blocked; repo public, unauthenticated fetch works). Compare git blob sha1 vs local to find diffs; skip .replit, scripts/post-merge.sh (local adds test line), and machine-written runtime JSONs in server/data/ when local is newer.

After EVERY pull re-apply these local patches (upstream lacks them):
1. Strip generic JSX type args in PriceHistoryChart.tsx (see replit-dev-metadata-plugin-generic-jsx.md).
2. /api/sector-pulse in server/routes.ts: upstream averages `changePercent ?? 0`, diluting sector averages with stale tickers. Replace with filter-to-finite then average (mirror /api/supply-chain). Guarded by server/__tests__/sector-pulse-throttle.test.ts — keep that file.

**Why:** both regressions came back verbatim on consecutive pulls (branch a28f9f5, then main f1003ca).
