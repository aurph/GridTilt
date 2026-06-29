// Locks the exact copy the daily poster ships. If a template changes, this
// file changes with it, in the same commit, on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBuildoutTweet,
  buildGpuRentalTweet,
  buildClusterSpotlightTweet,
  buildGridBacklogTweet,
  buildPowerMixTweet,
  buildTopMoversTweet,
  buildCatalystTweet,
  ensureTweetLength,
} from "../social-format";

const within280 = (t: string) => assert.ok(t.length <= 280, `tweet is ${t.length} chars`);
const noPadding = (t: string) => assert.ok(!/ {2,}/.test(t), "no manual column alignment");

// ── Daily rotation ─────────────────────────────────────────────────────────

test("buildout: real counts, whole GW, full url, no gauges", () => {
  const t = buildBuildoutTweet({ clusterCount: 235, plannedGW: 125, operationalGW: 11, operatorCount: 77 });
  assert.equal(
    t,
    [
      "the AI buildout, tracked: 235 named US compute clusters, 125 GW of planned power across 77 operators. 11 GW already live.",
      "",
      "https://gridtilt.com/compute-frontier",
    ].join("\n"),
  );
  assert.ok(!/index|gauge/i.test(t), "no index/gauge language");
  noPadding(t);
  within280(t);
});

test("gpu rental: prices format cleanly, mover phrased by direction", () => {
  const down = buildGpuRentalTweet({ h100: 2.79, h200: 3.85, gb200: 13, moverModel: "A100", moverChangePct: -27.3 });
  assert.ok(down.includes("H100 ~$2.79, H200 ~$3.85, GB200 ~$13/GPU-hr"));
  assert.ok(down.includes("A100 down 27% over the past year."));
  assert.ok(down.includes("https://gridtilt.com/neocloud-intel"));
  within280(down);

  const up = buildGpuRentalTweet({ h100: 2.79, h200: 3.85, gb200: 13, moverModel: "GB200", moverChangePct: 21 });
  assert.ok(up.includes("GB200 up 21% over the past year."));
});

test("cluster spotlight: name, location, energy, count", () => {
  const t = buildClusterSpotlightTweet({
    name: "Meta Hyperion",
    plannedGW: 5,
    location: "Richland Parish, LA",
    energy: "gas + grid",
    clusterCount: 235,
  });
  assert.equal(
    t,
    [
      "Meta Hyperion, Richland Parish, LA: 5 GW of compute planned, powered by gas + grid. one of 235 AI clusters we track.",
      "",
      "https://gridtilt.com/compute-frontier",
    ].join("\n"),
  );
  within280(t);
  // fractional GW keeps one decimal; missing location/energy degrade cleanly
  const frac = buildClusterSpotlightTweet({ name: "Stargate Abilene", plannedGW: 1.2, location: "", energy: "", clusterCount: 235 });
  assert.ok(frac.includes("Stargate Abilene: 1.2 GW of compute planned. one of 235"));
});

test("grid backlog: comma-grouped GW, rounded pct, honest fallback", () => {
  const t = buildGridBacklogTweet({ queueOverallGW: 2290, medianWaitMonths: 55, ercotLargeLoadGW: 230, ercotLargeLoadDataCenterPct: 72.9 });
  assert.ok(t.includes("~2,290 GW waiting in US interconnection queues, ~55-month median wait"));
  assert.ok(t.includes("ERCOT's large-load queue alone is 230 GW, 73% data centers."));
  within280(t);
  assert.ok(buildGridBacklogTweet(null).includes("dataset refreshing."));
});

test("power mix: top two sources, deal clause drops when zero", () => {
  const t = buildPowerMixTweet({ topSource: "grid", topGW: 71, nextSource: "on-site gas", nextGW: 33, linkedDealCount: 3 });
  assert.ok(t.includes("grid leads at 71 GW of planned compute, then on-site gas at 33 GW."));
  assert.ok(t.includes("3 nuclear-for-AI deals tracked."));
  within280(t);
  const noDeals = buildPowerMixTweet({ topSource: "grid", topGW: 71, nextSource: "on-site gas", nextGW: 33, linkedDealCount: 0 });
  assert.ok(!noDeals.includes("nuclear-for-AI deals"));
});

// ── On-demand templates (manual dry-run) ───────────────────────────────────

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

test("catalysts: curated case is preserved (no lowercased acronyms)", () => {
  const t = buildCatalystTweet([
    { date: "2026-06-09", title: "UEC earnings" },
    { date: "2026-06-15", title: "DOE Loan Programs Office disbursements" },
    { date: "2026-06-10", title: "MU earnings", tier1: true },
  ]);
  assert.ok(t.includes("UEC earnings"));
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
