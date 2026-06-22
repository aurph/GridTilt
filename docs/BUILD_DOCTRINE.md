# GridTilt Build Doctrine

Standing rules for any autonomous build in this repo. The `overnight-build` skill reads this file at the start of every run. This is the substrate: edit this file to change how every future build behaves.

This file is prose, on purpose. The retro loop (Piece 2) writes lessons here, never into the skill's mechanics. Treat each rule as hard-won. Do not delete a rule without a reason.

## Mission and audience
GridTilt makes the AI-infrastructure buildout (compute, datacenters, power, transmission, public companies) easier to track and understand. Eliminate obfuscation. Be on the side of citizen-investors, not hedge funds. Every feature serves that.

## Data integrity (the core ethos)
- Every number must be sourced. Put real source URLs in the data.
- Label every estimate as "est." and cite the basis. No fabricated precision.
- Do not invent derivations or methodology. If unsure, mark it estimated.
- README and docs must describe what is sourced vs estimated, truthfully.

## Engineering rules
- TDD. Pure logic modules with unit tests, mirroring `server/indices.ts`, `server/clusters.ts`, and `server/social-format.ts` (pure functions, thin route wrappers).
- Fix the code, not the test. When a test catches a bug (e.g. float rounding like `toFixed(2)` turning 1,315,000 into "1.31M"), fix the implementation. Never weaken a test to make it pass.
- Match the existing dark design. No light mode. bg #0B0B0A, ink #F2F1ED, accent #F07800 used sparingly. JetBrains Mono for wordmarks, Inter for body. Reuse shadcn/ui components in `client/src/components/ui/`.
- Keyboard nav pattern is G+1..G+8; follow it when adding routes.

## Verification (evidence before claims)
- Before every commit, run and show real output for: `npm run check`, `npm test`, `npm run build`. All three green.
- Declare untested paths honestly. A headless session verifies compile + bundle, NOT real browser interaction or touch. Say so explicitly in the build log and PR. Do not claim a UI "works" when you only built it.

## Branch and git hygiene
- Work on a fresh feature branch off the latest `main` (`git fetch && git checkout main && git pull && git checkout -b feat/<slug>`).
- Commit after each phase with a clear message. No co-authored-by lines.
- Push the branch and open a DRAFT PR at the end. Do NOT merge.
- Merging to main is Jack's call. The skill does not merge.
- Never touch Replit / never redeploy. A push is not a ship.
- One build per working tree at a time. Do not run a build in a working dir another session is editing (this causes false failures and races on dist/).

## macOS local-dev gotchas
- Do not edit or commit the `reusePort` line in `server/index.ts` (Linux/Replit only; throws ENOTSUP on macOS).
- You do not need `npm run dev`; check/test/build are sufficient for verification.
- If a local run is ever needed: `UNSUB_TOKEN_SECRET=dev-x PORT=5050 npm run dev` (port 5000 is taken by macOS AirPlay).

## Build log
- Maintain `docs/<FEATURE>_BUILD_LOG.md`. Append a dated entry after every phase: what you did, decisions made, sources used, what is next, and any caveat. This is the first thing Jack reads. Make it readable.

## Voice
- Plain, non-marketing. No em dashes. No hype. This applies to blog posts, PR bodies, and the build log.
