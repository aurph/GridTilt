// Weekly digest render: structure, personalization hook, escaping, honest
// omission of missing gauges, date label math.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderWeeklyEmail, weeklyDateLabel, type WeeklyDigestInput } from "../weekly-digest";

const INPUT: WeeklyDigestInput = {
  brief: {
    title: "The Buildout Brief",
    asOf: "2026-07-04",
    summary: "Tracked clusters now total 118 GW planned across 77 operators.",
    sections: [
      { heading: "Compute", points: ["235 clusters tracked.", "Largest: Abilene at 1.2 GW."] },
      { heading: "Grid", points: ["Queue at 2,290 GW; median wait 55 months."] },
    ],
    takeaway: "Power, not chips, is the binding constraint this quarter.",
  },
  movers: [
    { ticker: "NVDA", name: "NVIDIA Corporation", changePercent: -1.39 },
    { ticker: "AAPL", name: "Apple Inc. <script>", changePercent: 4.84 },
  ],
  trackedGW: 18.8,
  constructionGW: 14.6,
  fleetAvg: 4.31,
  fleetAvg1yChange: -14.2,
  tightestRTO: { label: "MISO", marginPct: 13.4 },
  dateLabel: "Week of June 28 - July 4, 2026",
  siteUrl: "https://gridtilt.com",
};

describe("renderWeeklyEmail", () => {
  const html = renderWeeklyEmail(INPUT);

  it("carries the brief summary, sections, and takeaway", () => {
    assert.ok(html.includes("Tracked clusters now total 118 GW"));
    assert.ok(html.includes("Compute"));
    assert.ok(html.includes("Queue at 2,290 GW; median wait 55 months."));
    assert.ok(html.includes("Power, not chips, is the binding constraint this quarter."));
  });

  it("renders the three measured gauges", () => {
    assert.ok(html.includes("18.8 GW"));
    assert.ok(html.includes("+14.6 GW building"));
    assert.ok(html.includes("$4.31/hr"));
    assert.ok(html.includes("-14.2% 1Y"));
    assert.ok(html.includes("13.4%"));
    assert.ok(html.includes("MISO reserve margin"));
  });

  it("keeps the per-recipient personalization hook exactly once", () => {
    assert.equal(html.split("token=PREVIEW").length - 1, 1);
    assert.ok(html.includes("/api/unsubscribe?token=PREVIEW"));
  });

  it("escapes untrusted strings (company names) in the movers table", () => {
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("Apple Inc. &lt;script&gt;"));
  });

  it("signs moves and colors by direction", () => {
    assert.ok(html.includes("+4.84%"));
    assert.ok(html.includes("-1.39%"));
  });

  it("omits missing gauges instead of inventing them", () => {
    const bare = renderWeeklyEmail({ ...INPUT, trackedGW: null, constructionGW: null, fleetAvg: null, fleetAvg1yChange: null, tightestRTO: null, movers: [] });
    assert.ok(!bare.includes("Tracked AI Power"));
    assert.ok(!bare.includes("GPU Fleet Avg"));
    assert.ok(!bare.includes("Top Movers Today"));
    // the brief content still renders
    assert.ok(bare.includes("Tracked clusters now total 118 GW"));
  });

  it("is a complete standalone html document with no external resources", () => {
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(!/src=/.test(html));
    assert.ok(!/link rel/.test(html));
  });
});

describe("weeklyDateLabel", () => {
  it("spans the six days before the end date, Eastern", () => {
    const label = weeklyDateLabel(new Date(Date.UTC(2026, 6, 4, 16, 0, 0))); // Jul 4 noon ET
    assert.equal(label, "Week of June 28 - July 4, 2026");
  });
});
