Merge the branch `feat/interaction-polish` into `main`, redeploy, and verify it
on the live site. Head is `9a5867c`, 16 commits, already pushed to
github.com/aurph/GridTilt.

It touches only `client/src` and `docs`. No server code, no schema, no
dependency changes: `package.json` and `package-lock.json` are untouched, so the
postMerge `npm install` has nothing new to pull.

## Scope

Merge and verify. Nothing else. Do not refactor, rename, reformat, upgrade a
dependency, or "while I'm here" any file. If you spot a bug that is not a
regression from this branch, write it down and leave it alone. A clean merge I
can reason about is worth more than an improved one I cannot.

## Do not break these

Each has taken production down before. Verify them after the merge, not before.

1. Never commit `.replit`. If tooling edits it, `git checkout .replit`. `modules`
   must still contain `nodejs-22` and the `test` workflow must still exist.
2. Never commit `server/data/*.json`. They are machine-written at runtime and the
   deployed instance holds fresher copies than git. This branch does not touch
   them. Running the app dirties them, so `git checkout -- server/data` before
   any commit.
3. `PowerMap` keeps `GEO_URL = "/geo/us-states-10m.json?v=1"`. The jsdelivr CDN
   URL is CSP-blocked in production.
4. `EIA_API_KEY` stays unset. The 503 on My Grid's retail rates is correct
   behavior. Do not stub, mock, or default a number to make it look healthy.
   Inventing a number is the one failure this product cannot absorb.
5. No generic JSX type arguments (`<Area<ChartPoint>` style) anywhere; they crash
   dev-mode Babel. `useState<SortState<K>>` and `useRef<Array<T>>` are type
   positions and are fine.
6. Never force-push, never rewrite history on `main`.

Confirm the branch stays in its lane before merging. This must print nothing:

```
git fetch origin
git diff origin/main...origin/feat/interaction-polish --name-only | grep -vE '^client/src/|^docs/'
```

## Merge

```
git checkout main && git pull
git merge --no-ff origin/feat/interaction-polish
npx tsc --noEmit
npm test
npm run build
git checkout -- server/data
git push origin main
```

Expected: `tsc` silent, `npm test` reporting **344 passing, 0 failing**, build
succeeding. 344 is this branch's count. If `main` gained tests since, the number
goes up, never down. If it comes back lower, the merge lost something. Stop,
do not push, and tell me what is missing.

Paste the real output of the test and build steps. Do not summarize them as
"passed".

Then deploy: Replit -> Deployments -> Redeploy. A push to GitHub does not deploy
and autoscale does not auto-pull.

## Verify on the deployed site

A green build proves nothing here. The largest change in this branch splits
every route into its own lazily loaded chunk, and a bad chunk fails as one dead
page, not as a build error. Actually load the site.

**API**

- `/api/stack`, `/api/kpis`, `/api/clusters/metrics` return 200 with real
  payloads.
- `/api/physical/retail-rates` returns 503 with `{configured:false}`. That is the
  correct answer.

**Every route, navigated by clicking, not by reloading URLs.** Client-side
navigation is what pulls the chunks on demand, so reloading each URL tests the
wrong thing.

`/overview`, `/stack`, `/power-map`, `/my-grid`, `/compute-frontier`,
`/neocloud-intel`, `/analyze`, `/catalysts`, `/blog`, `/subscribe`, `/`.

Each must reach real content: not a blank panel, not a skeleton that never
resolves. Keep the console open. There must be no chunk load errors and no
"Failed to fetch dynamically imported module".

Confirm the redirects still land: `/gpu-economics` to
`/neocloud-intel?tab=economics`, `/power-deals` to `/power-map?tab=deals`,
`/queue` to `/power-map?tab=queue`, `/supply-chain` to `/stack?view=flow`,
`/trade` and `/portfolio` to `/analyze`, `/brief` to `/blog`.

**Controls**

- `/region/ercot` and `/operator/google`: click a column header. The table
  reorders. Click the same header again. It reverses.
- `/stack?view=table`: same, and sanity-check the values, largest market caps
  first on the first click of that column.
- `/analyze`: focus a tab, press left and right arrows. Selection moves, focus
  follows, the URL picks up `?tab=`.
- Reload `/analyze?tab=scenario`. It opens on that tab.

**375px wide**

- `/stack?view=flow`: the network/flow switcher is visible and clickable. It
  used to sit entirely off screen with no way to scroll to it.
- `/power-map?tab=deals`: hover the chart. The tooltip stays on screen.

**The honesty states, which are the reason this branch exists**

Block `/api/datacenters` in DevTools and load `/region/ercot`. It must say the
facility registry failed to load and offer a retry. It must NOT say "No
facilities in the tracked dataset carry this RTO yet". That sentence was the
bug: a failed request rendering as a factual claim about the data.

Do the same to `/api/stack` on `/sector/compute`. It must not print
"Avg Change +0.00%" over a dead feed.

## If something is wrong

Revert the specific commit, do not patch forward. The commits are small and
single-purpose so that a bad one can be dropped without losing the rest. Tell me
which one and what you saw. Most likely candidates, in order of risk:

- `881cd54 bundle: every route is its own chunk`, the largest behavioral change
- `247239b charts: series honour prefers-reduced-motion`, touches nine chart files
- `1e42ab8 fix: the error boundary was a no-op for page-level throws`, which
  depends on `aa3470a`. If you drop the boundary, drop both, or you reinstate the
  blank-page bug.

Report what you actually observed. If you could not check something, say so
plainly instead of implying it passed.
