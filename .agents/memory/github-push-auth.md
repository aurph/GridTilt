---
name: GitHub sync auth
description: Push/pull GridTilt <-> GitHub via the platform connection; never PATs, never credential helpers
---
# GitHub sync: platform connection only

The Replit-managed GitHub connection is the auth path. With the GitHub App integration, ordinary `git fetch origin` and `git push origin main` work through Replit's secure GitHub proxy (verified 2026-10-23), without reading tokens or configuring helpers. Legacy git callbacks may be unavailable.

**Never configure a git credential.helper.** The platform refuses authenticated git ops while one exists (`DANGEROUS_CONFIG` — a helper could read the platform bearer token). The helper configured as an old workaround was itself what kept the Git pane broken.

**Why:** self-inflicted loop — helper → DANGEROUS_CONFIG → pane dead → user minted four 30-day PATs, one per expiry. User explicitly refuses to mint more tokens. Never ask for a GitHub PAT again.

**How to apply:**
- Fetch and merge locally with the recurring-patch rules, then use the existing authenticated origin for `git push origin main`.
- Platform `gitPull` needs upstream set on the branch and a clean worktree — commit machine-written `server/data/*.json` churn first or it fails `DIRTY_WORKTREE`. A failed pull can leave transient state; re-check `git status` / parity before trusting a `MERGE_CONFLICT` error.
- Do not revive the expired legacy PAT workaround. If the managed push fails, report it rather than handling raw tokens.
