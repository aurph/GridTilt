# GridTilt Homepage Redesign — Handoff for a Fresh Claude Code Session

Created: 2026-05-21
Owner: Jack Schwartz / aurph
Branch to create: `redesign/home-swiss`
Estimated scope: one page (`/`) + one route change + one new stylesheet. Do not touch the eight dashboard modules.

---

## 0. Before you start: prerequisites

Confirm these are installed (run `/plugin list` and `ls ~/.claude/skills/`):

| Skill | Source | Triggers in |
|---|---|---|
| `frontend-design` | `/plugin install frontend-design@claude-plugins-official` | Phase D (implementation) |
| `aesthetic-anchors` | `~/.claude/skills/aesthetic-anchors/` (git) | Phase B (anchor lock) |
| `landing-page-design` | `/plugin install landing-page-design@2389-research` | Phase A (Vibe Discovery sanity check) |
| `mckinsey-style-visualization` | `~/.claude/skills/mckinsey-style-visualization/` (git) | Phase D (one chart only) |

If any are missing, install them before continuing. Don't proceed without all four loaded.

---

## 1. What you're building and why

GridTilt is a research dashboard tracking the AI infrastructure buildout — data centers, power, compute, public equities. Live at gridtilt.com. Built solo by Jack (college student, full-stack). Stack: React 18 + TS + Vite + Tailwind + shadcn/ui + Recharts + D3 + React Leaflet, Express 5 backend, Drizzle ORM, Postgres optional. Deployed via Replit.

**The problem with today's homepage:** It currently routes `/` to `TiltOverview.tsx` — a 1,282-line dashboard. That page tries to serve both first-time visitors and returning power users from the same scroll. It can't commit to either job, so it reads as generic AI-slop dark-mode terminal aesthetic with mono fonts and an orange accent. The owner described it as "vibe-coded basic terminal feel." GridTilt's mission is much bigger than that.

**The mission, in the owner's own words:**
> Make the AI infrastructure buildout easier to understand and track for the everyday individual. Be on the side of the people. Eliminate obfuscation.

**Your job:** redesign the front page so it encapsulates that mission. Serious product, warm welcome, clear point of entry, and a forward hook toward "build your own dashboard." Not for hedge fund analysts. Not for day-traders. For the citizen-investor who has heard about data centers on a podcast, watches their utility bill go up, and wants to know if any of this is real money or hype.

---

## 2. The strategic decisions already made (don't relitigate, refine)

These are not yours to overturn unless you have an unusually strong argument. They came from a structured planning pass that already considered the alternatives.

### Audience — primary and secondary, named

- **Primary: the Concerned Citizen-Investor.** Mid-30s to mid-50s. Holds index funds plus a few individual positions (NVDA, MSFT, maybe CEG or VST). Reads WSJ paywall previews. Watches their utility bill. Not a Bloomberg subscriber. Wants to know: *is the AI buildout real money or hype?* and *does this affect my grid and my bill?*
- **Secondary: the Energy-Curious Generalist.** Engineers, grad students, policy-curious readers, journalists. Will trust the site if data is auditable and visuals don't smell like marketing.
- **Explicitly NOT in scope:** hedge fund analysts (have Bloomberg), retail day-traders (want options chains, not theses), grid operators (have ISO portals). Designing for them produces the terminal-vibe trap the brief is trying to escape.

### Aesthetic anchor — Swiss. Commit fully. Do not hybridize.

Per the `aesthetic-anchors` skill: pick one anchor, lock its tokens, hold the line. **Swiss** is the choice.

- **Surface:** `#F7F7F8` (neutral, *not* warm paper, *not* pure white). Light mode on `/` only — the dashboard at `/overview` stays dark.
- **Display family:** one sans. Söhne or Akzidenz-Grotesk if license available; otherwise Inter (already loaded) acting as the responsible fallback. **One family, one job.**
- **Body:** same family. Mixing serif and sans here breaks the anchor.
- **Mono:** JetBrains Mono (already loaded) used *only* for tabular figures in the index strip and chart axes. Not for body copy, not for labels, not for kickers.
- **Accent:** keep `#F07800` (the existing brand orange). Canonical Swiss would call for International Orange `#FF4F00` — `#F07800` deviates ~5% but the owner has equity in it across the rest of the site. Document this as the GridTilt-locked Swiss accent. **One accent.** No teal, no green, no second blue.
- **Structure:** visible 12-col grid as 1px hairlines at section edges. Left-aligned typography. Numerals as composition elements (dateline, section numbers "01 — The Stack", oversized index values).
- **Forbidden tokens:** drop shadows, rounded corners beyond 4px, gradients, dark surfaces on `/`, warm paper backgrounds, serif display, glow effects, animated pulses, the existing `grid-bg` orange-tinted background pattern.

**The unexpected pairing that justifies Swiss:** *FT.com / Economist editorial discipline applied to an AI-infra dashboard.* Every competitor (Bloomberg Terminal, Koyfin, SemiAnalysis, Epoch AI, ARK) defaults to dark-mode mono-font terminal. Swiss is the only choice that visually argues "we are publishing, not trading." That single move encodes the mission ("eliminate obfuscation, side of the people") more cleanly than any copy could.

**Why not Industrial:** lowest reskin cost, yes, but the owner has already lived in Industrial and named it the problem. Doubling down because it's cheap is the wrong trade.

**Why not Organic:** finance-adjacent. Earth tones read as climate-NGO or sustainable-ETF and lose the citizen-investor in 800ms.

### The differentiator — the one memorable move

A **live three-figure index strip in the hero**, set in oversized condensed sans (~140px desktop), hairline-ruled, tabular-figures, ticking once per minute. AI Power Index, Nuclear Policy Index, Grid Stress. Three numbers, real data, no chart-junk. The Economist-front-page move applied to live infrastructure data. Recognizable in a screenshot.

### Route topology — split `/` from `/overview`

Current state: `/` routes to `TiltOverview` (the 1,282-line dashboard). Change to:

- `/` → new `Home.tsx` (marketing landing, public, **no** `AppSidebar`, **no** `NewsTicker`).
- `/overview` → the existing `TiltOverview` (unchanged for this pass).
- All other routes unchanged.

Set a localStorage flag on first dashboard visit; subsequent landings can auto-redirect to `/overview` or surface a small "you've been here — jump to dashboard" link at the top of `/`. Power-user keyboard shortcuts (G+1 through G+8) still work inside the app.

### "Build your own dashboard" — waitlist, not feature claim

The existing 8 modules *are* dashboards but they're curated by the founder, not user-composed. Claiming "build your own" today would be a lie. Section 5 of the new home is a **forward-roadmap teaser with a waitlist signup.** Copy: "Soon — compose your own." No dates. No countdown. Reuse `EmailCapture.tsx` plumbing; add one free-text segmentation field ("What would you put on yours?"). If 6 months pass with no progress, cut the section — don't lie about it.

---

## 3. Information architecture — one scroll, six sections

Single scroll. Marketing surface. No sidebar. No carousels. No parallax. No scroll-jacking.

1. **Masthead + Index Strip (hero).** See §4 for the spec.
2. **The one chart that justifies the site.** US electricity demand 2010–2030, data-center segment broken out, annotations on real events (COVID drop, IRA signing, ChatGPT launch, TMI restart). The dataset already exists at `client/src/pages/TiltOverview.tsx:33-61` — lift it into a `Home`-owned component, restyle to McKinsey/Swiss (white surface, hairline gridlines, single-color data series, insight-led headline). Headline copy: *"Data centers will add ~1,500 TWh to the US grid by 2030. That's the entire UK's annual consumption."* Trigger the `mckinsey-style-visualization` skill here and only here.
3. **What we track — the eight modules, named.** A 4×2 grid of module cards. Each card: section number ("03"), name, one-sentence what-it-tells-you, live preview thumbnail (SVGs already exist at `client/src/assets/previews/`), link into `/overview` or the module's route. No marketing copy on these cards. This is the table of contents.
4. **Live signal section.** Top movers today, sector pulse, next five catalysts — three columns, pulled from existing endpoints (`/api/top-movers`, `/api/sector-pulse`, `/api/catalysts/all`). Proves the site is live without saying the word "live."
5. **Build your own dashboard — roadmap teaser + waitlist.** Short headline ("Soon — compose your own."), three sketched example tiles (drag a power map + a custom ticker watchlist + a catalyst filter into one canvas), an email field with the segmentation question.
6. **The thesis, in 200 words.** Long-form prose. Why GridTilt exists, what the founder believes, signed "Jack Schwartz, founder." **This is the warm welcome the owner asked for.** Inline `EmailCapture` at the bottom.
7. **Footer.** Sources cited (EIA, Yahoo Finance, Utility Dive, DCD, WNN, Power Engineering, NERC, DOE), methodology link, GitHub, contact. Auditable.

Target: 5–7 screens of scroll on desktop.

---

## 4. Hero spec — what's on screen in the first 800ms

Not a chart. Not a marquee. Three numbers and one sentence.

```
GRIDTILT                                      Thursday, 21 May 2026
─────────────────────────────────────────────────────────────────

AI POWER       NUCLEAR POLICY        GRID STRESS
   78               142                   64
   /100            base 100               /100

─────────────────────────────────────────────────────────────────

We track the AI infrastructure buildout so you don't need
a Bloomberg terminal to follow it.

[ Open the dashboard → ]   Read the thesis ↓
```

- All three numbers wired to the existing `/api/kpis` endpoint (already returns `aiPowerIndex`, `npiValue`, `gridStress` — see `TiltOverview.tsx:64-67`).
- Numbers set in oversized condensed sans, ~140px on desktop, `font-variant-numeric: tabular-nums`.
- One 1px hairline above the dateline, one below the sentence. Both span the content column.
- The accent (`#F07800`) used on exactly ONE element on this screen: the primary CTA underline. Nothing else is orange in the viewport.
- **Graceful fallback:** if `/api/kpis` fails, render last cached value with a dateline timestamp. If no cache exists, the hero falls back to headline + CTA only. **Never fabricate. Never show "—" dressed up as data.** This is §2 of the `aesthetic-anchors` skill — content discipline.

What the visitor knows by 800ms: this is a publication that takes itself seriously, three things are being tracked, the numbers are real (they look like the FT's), and there's a button to open the actual product.

---

## 5. Constraints and guardrails

- Stay in **React 18 + TS + Vite + Tailwind + shadcn/ui + Recharts + D3**. Do not add a new framework, animation library, or font loader. Inter and JetBrains Mono are already loaded.
- **Do not touch the 8 dashboard modules.** `TiltOverview`, `TheStack`, `PowerMap`, `SupplyChain`, `CatalystTracker`, `PortfolioOverlay`, `TheTrade` (thesis calculator), and the news ticker stay as-is for this pass. Future work can reskin them.
- **No fabricated data.** Numbers, tickers, and event labels must come from existing data sources (Yahoo Finance via `yahoo-finance2`, EIA endpoints, RSS feeds, in-repo curated lists). If a slot has no real content, leave it empty.
- **No co-authored-by lines in commits.** Owner preference.
- **Feature branch required.** `redesign/home-swiss`. Do not push to `main` until verification (§7) passes.
- **Replit deploy gotcha:** Replit autoscale/reserved-VM deployments do NOT auto-pull from GitHub on push. After merging to main, the owner must manually redeploy via Replit → Deployments → Redeploy. Do not say "shipped" after a push — say "pushed to main; redeploy on Replit to ship." This bit the project before; see `HANDOFF.md` ACTIVE BLOCKER section.
- **CSS isolation:** new tokens live in `client/src/styles/anchor.css`. Do not modify `client/src/index.css` token values — those back the dashboard, which stays dark. The new Home component scopes its own surface and accent via the new stylesheet.
- **Brand color decision:** keep `#F07800`. Document it in `anchor.css` as `--anchor-accent`. Do not silently shift it to International Orange.

---

## 6. The phased work plan — follow this order

Use a Plan subagent for Phases A, B, C. Do not write code until Phase D.

### Phase A — Discovery (Plan subagent, no code)

1. Read `CLAUDE.md`, `replit.md`, `HANDOFF.md`, `README.md`. Re-read the owner's mission paragraph in §1 of this file.
2. Read `client/src/pages/TiltOverview.tsx` (the current `/` page, 1,282 lines).
3. Read `client/src/App.tsx` (route registration).
4. Read `tailwind.config.ts` to know what's available.
5. Read `server/routes.ts` and confirm `/api/kpis`, `/api/top-movers`, `/api/sector-pulse`, `/api/catalysts/all` exist and return the shapes the hero and section 4 need.
6. **Sanity check via `landing-page-design` skill's Vibe Discovery questions.** Answer them in writing:
   - What's one real-world place or object this brand would be? *(Suggested answer: the front page of the Financial Times, or a single broadsheet on a coffee table in a power plant control room.)*
   - What's the ONE emotion someone should feel in the first 3 seconds? *(Suggested answer: "I'm being told the truth by someone who did the work.")*
   - Pick TWO unexpected influences to collide. *(Suggested answer: The Economist + a substation nameplate.)*
   - What should this page NEVER be mistaken for? *(Suggested answer: a SaaS landing page with a purple gradient and a chatbot.)*

If your Vibe Discovery answers materially conflict with §2 (Swiss anchor + citizen-investor audience), stop and surface the conflict to the owner before continuing. Otherwise, confirm and move to Phase B.

### Phase B — Anchor lock + token contract (Plan subagent, no code)

1. **Invoke the `aesthetic-anchors` skill.** Confirm Swiss. State the unexpected pairing one more time, in writing.
2. Write the token contract for `anchor.css`. Variables to define:
   - `--anchor-surface` (`#F7F7F8`)
   - `--anchor-surface-rule` (1px hairline color — try `#E5E5E5`)
   - `--anchor-ink` (body text — try `#111111`)
   - `--anchor-ink-muted` (secondary — try `#5A5A5A`)
   - `--anchor-accent` (`#F07800`)
   - `--anchor-data-series` (single chart color — try `#1F2937` or keep `#1E90FF` from existing palette)
   - `--anchor-radius` (`4px` max)
   - `--anchor-display` (font family stack for the hero numerals)
   - `--anchor-body` (font family stack for prose)
   - `--anchor-mono` (`'JetBrains Mono', monospace` — restricted use)
3. List **forbidden tokens** explicitly in a comment block at the top of the file so future editors can't drift: no shadows, no rounded > 4px, no gradients, no dark surface, no warm paper, no serif display, no second accent.

### Phase C — Section-by-section spec (Plan subagent, no code)

For each of the seven sections (hero + six), write down:
1. Data sources (API endpoints, in-repo static content, copy you'll author).
2. Exact copy (drafted, not "lorem"). The hero sentence is fixed in §4 of this file. Section 6 (the thesis) needs ~200 words drafted by the owner, or stub it with placeholder labeled `[OWNER: draft thesis here]` so it's not mistaken for shipped copy.
3. Layout (grid columns, hairline positions, type sizes at desktop and mobile breakpoints).
4. Components to reuse (`EmailCapture` is the only existing component the home should reuse; do not pull in `AppSidebar`, `NewsTicker`, `WhatsHappening`).
5. Components to build new: `Home.tsx`, `HeroIndexStrip.tsx`, `DemandChartSwiss.tsx`, `ModulesTableOfContents.tsx`, `LiveSignals.tsx`, `BuildYourOwnTeaser.tsx`, `ThesisSection.tsx`, `HomeFooter.tsx`.
6. Route topology change: in `App.tsx`, register `/` → `Home`, move existing `/` → `/overview`. Confirm all internal links that previously went to `/` are updated to `/overview` (search the repo).

Output of Phase C is the **contract** the implementation honors. If Phase D wants to deviate, return to Phase C and update the contract; don't drift silently.

### Phase D — Implementation (write code)

1. Create the branch: `git checkout -b redesign/home-swiss`.
2. Write `client/src/styles/anchor.css` per the Phase B contract. Import it in `main.tsx` *after* `index.css` so its tokens are scoped via a `.anchor-swiss` class on the Home root.
3. Build the components in order: tokens → hero → chart → modules → live signals → build-your-own → thesis → footer.
4. **Invoke the `frontend-design` skill** (Anthropic's anti-AI-slop) when building each section. Hold its discipline: no Inter/Roboto purple gradient AI slop, no twee subcopy ("Ask the grid."), no `//`-prefixed kickers pretending to be code comments, no Unicode-glyph icons (`▣ Dashboard`), no themed UI copy ("Authenticate Session" instead of "Open the dashboard").
5. **Invoke the `mckinsey-style-visualization` skill** for the demand chart in section 2 ONLY. Use: white background, hairline gridlines, single data color with a muted secondary for the data-center subset, insight-led headline, annotations as small inline labels not pop-out call-outs. Drop the existing `<defs>` gradients; Swiss does not gradient.
6. Update `client/src/App.tsx` route registration.
7. Search for and update any internal links pointing to `/` that should now point to `/overview` (`grep -rn 'href="/"' client/src/` and `grep -rn "href={\"/\"}" client/src/`).
8. Run `npm run check` (typecheck) and `npm run build` (production bundle). Both must pass.

### Phase E — Verification (use the `verify` and `code-review` skills)

1. **Use the `verify` skill:** start `npm run dev` (binds to port 5000), open `http://localhost:5000/`, screenshot the hero on desktop (1440×900) and mobile (390×844). Open `http://localhost:5000/overview` and confirm the dashboard still renders identically to before.
2. Capture a before/after pair: rename the existing `docs/screenshots/home_after_return.png`, save the new screenshot beside it as `home_after_return_NEW.png` for the owner to compare. **Do not** delete the original.
3. **Use the `code-review` skill** on the diff. Specifically check for:
   - **Token drift.** No rounded cards >4px on `/`. No `box-shadow` other than `none` on `/`. No gradient backgrounds on `/`. No mono fonts in body text on `/`. No second accent color on `/`.
   - **Content discipline.** No fabricated tickers, no fake percentages, no themed UI copy, no Unicode-glyph icons, no `//` kicker comments. Every string on screen names real information or is authored copy that knows what it is.
   - **Anchor fidelity.** Open `~/.claude/skills/aesthetic-anchors/SKILL.md` §3 (the Swiss anchor) and walk the "Breaks if:" list. If any break appears, the anchor didn't hold — fix it before merging.
4. Push the branch and open a PR on GitHub. **Do not merge to main yet.**

### Phase F — Ship (owner-gated)

1. The owner reviews the PR and the screenshots. They may request changes; do them on the same branch.
2. Once approved, merge to `main`.
3. **Critical:** tell the owner to redeploy via Replit → Deployments → Redeploy. The push alone will NOT deploy. Do not say "shipped" until the owner confirms the redeploy is live.
4. After deploy, verify against production:
   ```bash
   curl -s https://gridtilt.com/ | grep -oE 'src="/assets/[^"]*\.js"'    # bundle hash should change
   curl -s -I https://gridtilt.com/overview                                # 200 OK, dashboard moved successfully
   curl -s https://gridtilt.com/api/kpis | head -c 200                     # hero data source still live
   ```
5. Update `HANDOFF.md` with what shipped. Update `CLAUDE.md` to add a one-line note: "Front page (`/`) is Swiss-anchored marketing; dashboard lives at `/overview`."

---

## 7. Risks and mitigations (don't be blindsided)

1. **Risk: Swiss reads as "corporate financial services" and loses the warmth the owner asked for.**
   Mitigation: warmth comes from the 200-word founder thesis in section 6 and the human one-sentence hero framing ("so you don't need a Bloomberg terminal"). Do not try to make the *visuals* warm — that's where Organic-drift creeps in. Make the *copy* warm and let the visuals stay editorial.

2. **Risk: Dashboard at `/overview` now feels visually inconsistent with the new landing.**
   Mitigation: scope is explicitly landing-only this pass. Ship it. In a follow-up sprint, plan a dashboard reskin pass (probably keeping dark mode for power users; defensible as two surfaces, two contexts).

3. **Risk: Live indices fail to load and the hero looks broken.**
   Mitigation: hero must render gracefully without data. Fallback: last cached value with dateline timestamp. Full API outage: hero collapses to headline + CTA only, no fabricated placeholders.

4. **Risk: "Build your own dashboard" gets promised and never built; trust erodes.**
   Mitigation: copy says "Soon," no dates, no countdown. Waitlist with no implied SLA. If 6 months pass with no progress, cut the section.

5. **Risk: Token drift during implementation — one rounded card or gradient sneaks in and Swiss cracks.**
   Mitigation: write the token contract in `client/src/styles/anchor.css` (Phase B). The `code-review` pass in Phase E enforces it.

6. **Risk: Owner ships before redeploying on Replit (the existing footgun documented in `HANDOFF.md`).**
   Mitigation: the Phase F checklist explicitly says push ≠ shipped. Wait for owner to confirm redeploy.

---

## 8. What NOT to do

- Do not redesign the dashboard at `/overview` in this pass. Out of scope. Touch only `/`.
- Do not introduce a new font, animation library, icon set, or component library. The stack is fixed.
- Do not hybridize anchors. "Swiss with a Brutalist edge" is forbidden per the `aesthetic-anchors` skill — it is a category error. Hold Swiss.
- Do not fabricate data, tickers, percentages, or example dashboards. If you need example content for the build-your-own section sketches, use real tickers and a real chart type ("NVDA price chart + Power Map of Virginia + nuclear catalyst filter") not invented widgets.
- Do not write twee marketing copy. "Ask the grid." is forbidden. "Insights at your fingertips" is forbidden. "Powered by AI for the AI economy" is forbidden. Write like a journalist, not a copywriter.
- Do not use Unicode glyphs as icons (`▣`, `◊`, `▶`). Use Lucide icons (already in deps) or no icons.
- Do not add a chatbot, a Discord widget, a Slack invite, an "ask anything" search box, or a Loom video. None of those belong on this page.
- Do not commit to `main` directly. Branch and PR.
- Do not declare success until the owner confirms a Replit redeploy succeeded.

---

## 9. The kickoff prompt to run after reading this

Paste this into the fresh Claude session (after confirming all four skills are loaded):

> Read `/Users/jackschwartz/gridtilt/HOMEPAGE_HANDOFF.md` in full. Then begin Phase A: spawn a Plan subagent to perform discovery — read the codebase files listed in §6 Phase A, run the Vibe Discovery sanity check from the `landing-page-design` skill, and produce a written discovery report. Do not write any code until Phases A, B, and C are complete and you have a section-by-section contract.

---

## 10. Definition of done

- [ ] Branch `redesign/home-swiss` exists, all work on it.
- [ ] `client/src/pages/Home.tsx` exists and is registered at `/` in `App.tsx`.
- [ ] `client/src/pages/TiltOverview.tsx` now lives at `/overview` and is unchanged in content.
- [ ] `client/src/styles/anchor.css` exists, imported in `main.tsx`, and defines the Swiss tokens.
- [ ] Hero renders three live indices from `/api/kpis` with graceful fallback.
- [ ] Section 2 chart restyled per `mckinsey-style-visualization` (white surface, hairlines, insight headline).
- [ ] Sections 3–6 built per §3 of this file. Section 5 has a waitlist using `EmailCapture`.
- [ ] `npm run check` passes. `npm run build` passes.
- [ ] No token drift per the §5 Phase E checklist (no shadows, no gradients, no second accent on `/`).
- [ ] No fabricated data on the page. Every number cites a source either inline or in the footer.
- [ ] Before/after screenshots saved in repo root.
- [ ] PR opened. Owner approves. Merge to main. **Owner redeploys via Replit.** Production bundle hash changes. `https://gridtilt.com/overview` returns 200.

---

Built with care. The owner calls GridTilt their baby. Treat the codebase that way too.
