---
name: overnight-build
description: Autonomously build a complete GridTilt feature from a one-line idea, end to end, hands-off. Specs it, builds it phase by phase with TDD, verifies green, commits per phase, pushes a branch, and opens a draft PR. Use when Jack says "overnight build X", "build out X", "factory build X", or wants a full feature built unattended.
---

# Overnight Build

You turn a one-line feature idea into a complete, verified, PR-ready GridTilt feature with no further input from Jack. He may be asleep. Do not ask questions. Make reasonable, documented decisions and keep going until everything below is done and green.

The feature idea is whatever Jack passed when invoking this skill. If he passed nothing, ask for the one line, then proceed hands-off from there.

## Step 0: Load the doctrine
Read `docs/BUILD_DOCTRINE.md` in full before doing anything else. Every rule there is binding for this run. The most load-bearing ones: data integrity (every number sourced, estimates labeled), TDD (fix the code not the test), dark aesthetic only, verify green before every commit, declare untested paths honestly, never merge or touch Replit.

## Step 1: Setup
- `git fetch origin && git checkout main && git pull && git checkout -b feat/<slug>` where `<slug>` is derived from the idea.
- Confirm no other session is building in this working tree (doctrine: one build per tree).
- Create `docs/<FEATURE>_BUILD_LOG.md` and write the opening entry (the idea, the plan).

## Step 2: Self-spec (Phase 0)
You chose one-shot mode: you spec the feature yourself, no interactive gate. Think hard here, because there is no human to catch a wrong direction.
- Write `docs/<FEATURE>_SPEC.md`: data model, API endpoints, derived metrics, page layout, integration points, and what is sourced vs estimated.
- Decompose the build into numbered phases. A good GridTilt feature usually has: data layer, tested backend logic, frontend page, nav/route integration, SEO, social composer, content/blog, docs, final verification. Cut phases that do not apply. Do not pad.
- Commit Phase 0.

## Step 3: Build the phases
For each phase, in order:
1. Build it, following the doctrine (TDD: test first for logic modules).
2. Run `npm run check`, `npm test`, `npm run build`. Show real output. All three green.
3. Commit with a clear message naming the phase. No co-authored-by.
4. Append a dated build-log entry: what you did, decisions, sources, caveats, next.

If a step fails, diagnose the root cause and fix the implementation. Never weaken a test or skip verification to move on.

## Step 4: Finish
- Final verification: check + test + build, real output, all green.
- Push the branch.
- Open a DRAFT PR titled after the feature. Body summarizes every phase, lists data sources, and states clearly what is sourced vs estimated and what was NOT tested (e.g. real browser interaction in a headless session). Do not merge.

## Step 5: Retro hook (Piece 2, when it exists)
After the build, if a retro/lessons step exists, run it: mine this build log and the diff for anything ambiguous or any gotcha rediscovered, and propose additions to `docs/BUILD_DOCTRINE.md`. Until Piece 2 is built, just end the build log with a short "lessons for next time" section so the loop has something to harvest later.

## If you finish early
Do not stop. Deepen the feature: more data, comparison/methodology views, more tests, tighter integration. Keep going until the work is genuinely complete.

## Final report
When done and green, post a short summary: branch name, draft PR link, phases completed, and the honest list of what was and was not verified.
