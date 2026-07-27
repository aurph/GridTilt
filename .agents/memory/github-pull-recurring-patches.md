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
