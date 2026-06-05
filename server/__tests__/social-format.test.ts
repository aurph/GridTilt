// Locks the exact copy the daily poster ships. If a template changes, this
// file changes with it, in the same commit, on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTiltStatusTweet,
  buildTopMoversTweet,
  buildNpiUpdateTweet,
  buildQueueTweet,
  buildCatalystTweet,
  npiHistoryContext,
  effectiveNpiWeights,
  ensureTweetLength,
} from "../social-format";

const within280 = (t: string) => assert.ok(t.length <= 280, `tweet is ${t.length} chars`);

// History fixture: ten trading days climbing to a peak then easing.
const HISTORY = [
  { date: "2025-09-01", npiEquityLegs: 310 },
  { date: "2025-09-02", npiEquityLegs: 322 }, // peak
  { date: "2026-05-26", npiEquityLegs: 262 },
  { date: "2026-05-27", npiEquityLegs: 264 },
  { date: "2026-05-28", npiEquityLegs: 261 },
  { date: "2026-05-29", npiEquityLegs: 259 },
  { date: "2026-06-01", npiEquityLegs: 255 },
  { date: "2026-06-02", npiEquityLegs: 250 },
  { date: "2026-06-03", npiEquityLegs: 248.6 },
];

test("npiHistoryContext finds the week delta and the labeled peak", () => {
  const ctx = npiHistoryContext(HISTORY);
  // last (248.6) minus 5 trading days back (264)
  assert.ok(Math.abs(ctx.weekDelta! - (248.6 - 264)) < 1e-9);
  assert.equal(ctx.peakValue, 322);
  assert.equal(ctx.peakLabel, "sep '25");
});

test("tilt status: no padded columns, insight built from live numbers", () => {
  const t = buildTiltStatusTweet({ aiPowerIndex: 70, gridStress: 67, npiValue: 268.1 }, HISTORY);
  assert.equal(
    t,
    [
      "gridtilt · daily gauges",
      "",
      "ai demand 70 · grid stress 67 · npi 268",
      "",
      "npi sits 168 above its jan 2024 base, 54 below the sep '25 peak, -15 on the week.",
      "",
      "https://gridtilt.com",
    ].join("\n"),
  );
  assert.ok(!/ {2,}/.test(t), "no manual column alignment");
  within280(t);
});

test("tilt status: mentions a gauge only when it is off baseline", () => {
  const hot = buildTiltStatusTweet({ aiPowerIndex: 72, gridStress: 80, npiValue: 268 }, []);
  assert.ok(hot.includes("grid stress gauge running 12 above baseline."));
  const calm = buildTiltStatusTweet({ aiPowerIndex: 72, gridStress: 68, npiValue: 268 }, []);
  assert.ok(
    !calm.includes("above baseline") && !calm.includes("below baseline"),
    "near-baseline gauges stay out of the prose",
  );
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

test("npi update: interpunct row, no padEnd, no subscript glyphs", () => {
  const c = { cegPerf: 2.1, vstPerf: 6.71, ccjPerf: 1.09, nlrPerf: 1.98, uPerf: 0.77, policyPerf: 1.27 };
  const t = buildNpiUpdateTweet(268.1, c);
  assert.ok(t.includes("VST +571% · CEG +110% · NLR +98% · CCJ +9% · uranium -23%"));
  assert.ok(!t.includes("U₃O₈"), "no subscript glyphs");
  assert.ok(!/ {2,}/.test(t), "no manual column alignment");
  // VST dominates the drifted basket, so the honest line ships.
  assert.ok(/vst now carries \d+% of the basket/.test(t));
  assert.ok(!t.includes("spread"), "the meaningless points-spread line is gone");
  within280(t);
});

test("effectiveNpiWeights sums to 1 and ranks VST first on drifted perfs", () => {
  const w = effectiveNpiWeights({ cegPerf: 2.1, vstPerf: 6.71, ccjPerf: 1.09, nlrPerf: 1.98, uPerf: 0.77, policyPerf: 1.27 });
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(Object.entries(w).sort((a, b) => b[1] - a[1])[0][0], "VST");
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
