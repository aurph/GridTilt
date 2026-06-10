// Locks the exact copy the poster ships. If a template changes, this file
// changes with it, in the same commit, on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildNewDealTweet,
  buildPipelineMoveTweet,
  buildBacklogUpdateTweet,
  buildCapexUpdateTweet,
  buildWeeklyDigestTweet,
  buildTopMoversTweet,
  buildQueueTweet,
  buildCatalystTweet,
  ensureTweetLength,
} from "../social-format";

const within280 = (t: string) => assert.ok(t.length <= 280, `tweet is ${t.length} chars`);

test("new deal: names the project, the megawatts, and the new signed total", () => {
  const t = buildNewDealTweet(
    { projectName: "Susquehanna BTM expansion (Talen-AWS)", capacityMW: 1920, sponsor: "Talen Energy", offtaker: "Amazon Web Services (17-year, $18B)" },
    { signedGW: 6.5, signedDeals: 6 },
  );
  assert.ok(t.startsWith("new signed nuclear-for-ai deal:"));
  assert.ok(t.includes("Susquehanna BTM expansion (Talen-AWS): 1,920 MW, Talen Energy, offtaker Amazon Web Services (17-year, $18B)."));
  assert.ok(t.includes("signed total now 6.5 GW across 6 deals."));
  assert.ok(!/ {2,}/.test(t), "no manual column alignment");
  within280(t);
});

test("new deal: no offtaker means no dangling clause", () => {
  const t = buildNewDealTweet(
    { projectName: "Comanche Peak Unit 3 (AP1000)", capacityMW: 1200, sponsor: "Vistra" },
    { signedGW: 7.7, signedDeals: 7 },
  );
  assert.ok(t.includes("Comanche Peak Unit 3 (AP1000): 1,200 MW, Vistra."));
  assert.ok(!t.includes("offtaker"));
});

test("pipeline move: only the buckets that moved are listed", () => {
  const t = buildPipelineMoveTweet(
    { operationalGW: 9.4, constructionGW: 15.6, announcedGW: 5.1 },
    { operationalGW: 9.4, constructionGW: 16.6, announcedGW: 5.1 },
    59,
  );
  assert.ok(t.includes("under construction: 15.6 -> 16.6 GW"));
  assert.ok(!t.includes("operational:"), "unchanged buckets stay out");
  assert.ok(t.includes("registry: 59 sites at 400 MW or more."));
  within280(t);
});

test("backlog update: itemized old -> new lines with units", () => {
  const t = buildBacklogUpdateTweet([
    { label: "queue total", before: 2290, after: 2350, unit: " GW" },
    { label: "median wait", before: 55, after: 58, unit: " mo" },
  ]);
  assert.ok(t.includes("queue total: 2,290 -> 2,350 GW"));
  assert.ok(t.includes("median wait: 55 -> 58 mo"));
  assert.ok(t.includes("source: lbnl queued up + iso filings."));
  within280(t);
});

test("capex update: states the new total and the direction", () => {
  const up = buildCapexUpdateTweet(340, 365);
  assert.ok(up.includes("fy2025 disclosed guides now total $365B, up from $340B."));
  const down = buildCapexUpdateTweet(340, 320);
  assert.ok(down.includes("down from $340B."));
  within280(up);
});

test("digest: carries the week label and per-number deltas", () => {
  const t = buildWeeklyDigestTweet(
    { signedGW: 7.3, constructionGW: 15.6, queueOverallGW: 2290 },
    { signedGW: 6.5, constructionGW: 15.6, queueOverallGW: 2290 },
    "jun 8",
    "NVDA earnings",
  );
  assert.ok(t.startsWith("the buildout, week of jun 8:"));
  assert.ok(t.includes("signed nuclear 7.3 GW (+0.8)"));
  assert.ok(t.includes("dc construction 15.6 GW ·"), "flat numbers carry no delta tag");
  assert.ok(t.includes("biggest move: signed nuclear +0.8 GW on the week."));
  assert.ok(t.includes("next week: NVDA earnings."));
  within280(t);
});

test("digest: a flat week says so plainly and is still dated (never byte-identical)", () => {
  const now = { signedGW: 6.5, constructionGW: 15.6, queueOverallGW: 2290 };
  const a = buildWeeklyDigestTweet(now, now, "jun 8", null);
  const b = buildWeeklyDigestTweet(now, now, "jun 15", null);
  assert.ok(a.includes("no change on the scoreboard this week."));
  assert.notEqual(a, b, "week label keeps consecutive flat digests distinct");
  within280(a);
});

test("digest: first run has no deltas and says why", () => {
  const t = buildWeeklyDigestTweet(
    { signedGW: 6.5, constructionGW: 15.6, queueOverallGW: 2290 },
    null,
    "jun 8",
  );
  assert.ok(t.includes("first digest; week-over-week deltas start next week."));
  assert.ok(!t.includes("(+"), "no delta tags without a prior week");
});

test("top movers: repeated sector reads as a sentence, not a count", () => {
  const t = buildTopMoversTweet([
    { ticker: "SMR", changePercent: 22.27, tag: "nuclear" },
    { ticker: "OKLO", changePercent: 8.81, tag: "nuclear" },
    { ticker: "CTRA", changePercent: 5.97, tag: "nat gas" },
    { ticker: "VST", changePercent: -4.21, tag: "utility" },
  ]);
  assert.ok(t.includes("$SMR +22.27% (nuclear)"));
  assert.ok(t.includes("nuclear repeats at the top, both up."));
  within280(t);
});

test("top movers: mixed day without a repeating sector", () => {
  const t = buildTopMoversTweet([
    { ticker: "A", changePercent: 2, tag: "compute" },
    { ticker: "B", changePercent: -1, tag: "utility" },
    { ticker: "C", changePercent: 1, tag: "mining" },
    { ticker: "D", changePercent: -3, tag: "etf" },
  ]);
  assert.ok(t.includes("2 up, 2 down, no sector repeating."));
});

test("queue: one readable paragraph, fallback stays honest", () => {
  const t = buildQueueTweet({
    queueOverallGW: 2600,
    medianWaitMonths: 35,
    ercotLargeLoadGW: 120,
    ercotLargeLoadDataCenterPct: 85,
    trackedProjects: 48,
    trackedCapacityGW: 61,
  });
  assert.ok(t.includes("~2,600 GW waiting in queues. median wait 35 months."));
  within280(t);
  assert.ok(buildQueueTweet(null).includes("dataset refreshing."));
});

test("catalysts: curated case is preserved (no lowercased acronyms)", () => {
  const t = buildCatalystTweet([
    { date: "2026-06-09", title: "UEC earnings" },
    { date: "2026-06-15", title: "DOE Loan Programs Office disbursements" },
    { date: "2026-06-10", title: "MU earnings", tier1: true },
  ]);
  assert.ok(t.includes("UEC earnings"));
  assert.ok(t.includes("DOE Loan Programs Office disbursements"));
  assert.ok(!t.includes("uec earnings"), "acronyms never lowercased");
  assert.ok(t.includes("the one to watch: MU earnings."));
  within280(t);
});

test("ensureTweetLength keeps the first line and lands under 280", () => {
  const long = ["headline", ...Array(40).fill("a filler line of some length"), "https://gridtilt.com"].join("\n");
  const out = ensureTweetLength(long);
  assert.ok(out.length <= 280);
  assert.ok(out.startsWith("headline"));
});
