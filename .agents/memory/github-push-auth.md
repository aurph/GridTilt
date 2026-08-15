---
name: GitHub sync auth
description: Push/pull GridTilt <-> GitHub via the platform connection; never PATs, never credential helpers
---
# GitHub sync: platform connection only

The Replit GitHub connection (OAuth) is healthy and is the auth path. Use the git-remote skill callbacks — `gitPush({})`, `gitPull({})`, `createPullRequest()`. Verified end-to-end 2026-07-27 (real commits pushed).

**Never configure a git credential.helper.** The platform refuses authenticated git ops while one exists (`DANGEROUS_CONFIG` — a helper could read the platform bearer token). The helper configured as an old workaround was itself what kept the Git pane broken.

**Why:** self-inflicted loop — helper → DANGEROUS_CONFIG → pane dead → user minted four 30-day PATs, one per expiry. User explicitly refuses to mint more tokens. Never ask for a GitHub PAT again.

**How to apply:**
- Repo is public: plain `git fetch origin` works unauthenticated for inspecting/merging user branches. Merge locally with the recurring-patch rules, then `gitPush({})`.
- Platform `gitPull` needs upstream set on the branch and a clean worktree — commit machine-written `server/data/*.json` churn first or it fails `DIRTY_WORKTREE`. A failed pull can leave transient state; re-check `git status` / parity before trusting a `MERGE_CONFLICT` error.
- `GITHUB_PERSONAL_ACCESS_TOKEN` secret is legacy backup only, expires 2026-08-26; let it die. One-off authenticated CLI op if ever needed: inline `git -c credential.helper=... <cmd>` — never persisted to config.
- 2026-08-15: `gitPush` callback was NOT registered in the CodeExecution sandbox that session (neither durable nor impure scope; not fixable by skills). Fallback that worked without persisting anything: `git -c credential.helper= push "https://x-access-token:${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/aurph/GridTilt.git" main` with the token sed-scrubbed from output. Try `gitPush({})` first each session; use the fallback only while the secret lives (dies 2026-08-26 — after that, the platform Git pane is the only path if callbacks are absent).
