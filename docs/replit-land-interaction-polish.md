# Replit prompt: land feat/interaction-polish

Paste the block below into the Replit agent. The reality check is the second
half and is the part that matters; do not skip it because the merge was clean.

---

Merge the branch `feat/interaction-polish` (head `a3dfec0`, 15 commits) into
`main`, then redeploy and verify. It is already pushed to
github.com/aurph/GridTilt.

It touches 27 files, all under `client/src`. No server code, no schema, no
dependency changes: `package.json` and `package-lock.json` are untouched, so
the postMerge `npm install` has nothing new to pull.

## Hard constraints

Each of these has broken production before. Check them after merging, not just
before.

1. Do not commit `.replit`. If anything edits it, `git checkout .replit`.
   `modules` must still contain `nodejs-22`, and the `test` workflow must still
   exist.
2. Do not commit `server/data/*.json`. Those are machine-written at runtime and
   the deployed instance has fresher copies than git. The branch does not touch
   them; if they show up dirty after a run, `git checkout -- server/data`
   before committing anything.
3. `PowerMap` keeps `GEO_URL = "/geo/us-states-10m.json?v=1"`. The jsdelivr CDN
   URL is CSP-blocked in production.
4. Leave `EIA_API_KEY` unset. The retail-rates 503 on My Grid is correct
   behavior, not a bug to stub around. If you "fix" it by inventing numbers you
   have broken the product.
5. No generic JSX type arguments (`<Area<ChartPoint>` style), which crash
   dev-mode Babel. `useState<SortState<K>>` and `useRef<Array<T>>` are type
   positions and are fine.
6. Do not force-push and do not rewrite history on `main`.

## Merge and build

```
git fetch origin
git checkout main && git pull
git merge --no-ff origin/feat/interaction-polish
npx tsc --noEmit        # must be clean
npm test                # must report 344 passing, 0 failing
npm run build           # must succeed
git checkout -- server/data   # drop any runtime writes before pushing
git push origin main
```

If `npm test` reports fewer than 344, something was lost in the merge. Stop and
say so rather than pushing.

Then deploy manually: Replit -> Deployments -> Redeploy. A push to GitHub does
not deploy and autoscale does not auto-pull.

## Reality check, after the redeploy

Do not report success off a green build. Open the deployed site and confirm
each of these. Report what you actually saw, and say plainly if you could not
check something.

**API, first**

- `/api/stack`, `/api/kpis`, `/api/clusters/metrics` all return 200 with real
  payloads.
- `/api/physical/retail-rates` returns 503 with `{configured:false}`. That is
  the correct answer, not a failure.

**The bundle change is the riskiest part of this branch.** Every page is now a
separate lazily loaded chunk, so a broken chunk shows up as one dead route
rather than a build error.

- Load each of these and confirm real content, not a blank panel and not a
  skeleton that never resolves: `/overview`, `/stack`, `/power-map`, `/my-grid`,
  `/compute-frontier`, `/neocloud-intel`, `/analyze`, `/catalysts`, `/blog`,
  `/subscribe`, `/`.
- Click through the sidebar/top nav rather than reloading each URL. Client-side
  navigation is what loads the chunks on demand.
- Open the browser console. There must be no chunk load errors and no
  "Failed to fetch dynamically imported module".
- Confirm the old routes still redirect: `/gpu-economics` ->
  `/neocloud-intel?tab=economics`, `/power-deals` -> `/power-map?tab=deals`,
  `/queue` -> `/power-map?tab=queue`, `/supply-chain` -> `/stack?view=flow`,
  `/trade` and `/portfolio` -> `/analyze`, `/brief` -> `/blog`.

**Interaction**

- `/region/ercot` and `/operator/google`: click a column header. The table must
  reorder, and clicking the same header again must reverse it.
- `/stack?view=table`: same, and confirm the numbers still look right after
  sorting (largest market caps first on the first click).
- `/analyze`: focus a tab and press the left/right arrow keys. Selection should
  move and the URL should pick up `?tab=`.
- Reload `/analyze?tab=scenario` and confirm it opens on that tab.

**Narrow screen**

- Resize to 375px wide. On `/stack?view=flow`, the network/flow switcher must be
  visible and clickable. It used to sit entirely off screen.
- Hover a chart on `/power-map?tab=deals` at 375px. The tooltip must stay on
  screen.

**Honesty states**

These are the reason the branch exists, so confirm at least one.

- With DevTools, block `/api/datacenters` and load `/region/ercot`. It must say
  the registry failed to load and offer a retry. It must NOT say "No facilities
  in the tracked dataset carry this RTO yet", which is the old bug: a failed
  fetch reading as a factual claim about the data.

## If something is wrong

The commits are small and single-purpose on purpose. Revert the offending one
rather than the whole merge, and tell me which one and why. The likely
candidates in order of risk:

- `881cd54 bundle: every route is its own chunk` (largest behavioral change)
- `247239b charts: series honour prefers-reduced-motion` (touches 9 chart files)
- `1e42ab8 fix: the error boundary was a no-op for page-level throws`
  (depends on `aa3470a`; if you drop the boundary, drop both)
