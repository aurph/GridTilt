// Weekly digest render: structure, personalization hook, escaping, honest
// omission of missing gauges, date label math.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  footerBlockers,
  personalize,
  renderWeeklyEmail,
  renderWeeklyText,
  SIGNED_UP_HOOK,
  UNSUBSCRIBE_HOOK,
  weeklyDateLabel,
  type WeeklyDigestInput,
} from "../weekly-digest";

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
  tightestRTO: { label: "MISO", marginPct: 11.0, referencePct: 8.1 },
  dateLabel: "Week of June 28 - July 4, 2026",
  siteUrl: "https://gridtilt.com",
  asOf: "July 4, 2026",
  figureSources: [
    { figure: "Tracked AI power", source: "GridTilt facility registry", asOf: "July 4, 2026" },
    { figure: "Grid headroom", source: "NERC 2025 Long-Term Reliability Assessment", asOf: "January 2026" },
  ],
  footer: { contactEmail: "gridtilt1@gmail.com", privacyUrl: "https://gridtilt.com/privacy", postalAddress: "PO Box 1, Baltimore, MD 21201" },
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
    assert.ok(html.includes("11.0%"));
    assert.ok(html.includes("MISO reserve margin, NERC reference 8.1%"));
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

describe("issue footer, sources and plain text", () => {
  const html = renderWeeklyEmail(INPUT);
  const text = renderWeeklyText(INPUT);

  it("states each figure's source and date, and the real basis for receiving it", () => {
    assert.ok(html.includes("Sources and dates: Tracked AI power: GridTilt facility registry, July 4, 2026"));
    assert.ok(html.includes("Percent moves as of July 4, 2026."));
    assert.ok(html.includes(`signed up at gridtilt.com on ${SIGNED_UP_HOOK}`));
    assert.ok(html.includes("mailto:gridtilt1@gmail.com"));
    assert.ok(html.includes('href="https://gridtilt.com/privacy"'));
    assert.ok(html.includes("PO Box 1, Baltimore, MD 21201"));
  });

  it("the plain text carries the same figures, sources, hooks and footer", () => {
    for (const piece of ["18.8 GW", "$4.31/hr", "MISO reserve margin 11.0%", "Queue at 2,290 GW", "NVDA NVIDIA Corporation: -1.39%",
      "Sources and dates:", UNSUBSCRIBE_HOOK, SIGNED_UP_HOOK, "Contact: gridtilt1@gmail.com", "Privacy: https://gridtilt.com/privacy", "PO Box 1"]) {
      assert.ok(text.includes(piece), piece);
    }
    assert.equal(text.split(UNSUBSCRIBE_HOOK).length - 1, 1);
    assert.ok(!/<(div|a|table|tr|td|span|br)\b/i.test(text), "no template markup in the text part");
  });

  it("personalizes each hook once, escaping the date in HTML", () => {
    const one = personalize(html, { token: "abc123", signedUpOn: "May 1, 2026" }, true);
    assert.ok(one.includes("/api/unsubscribe?token=abc123"));
    assert.ok(one.includes("signed up at gridtilt.com on May 1, 2026"));
    assert.ok(!one.includes(UNSUBSCRIBE_HOOK) && !one.includes(SIGNED_UP_HOOK));
    const odd = personalize(html, { token: "t", signedUpOn: "<b>x</b>" }, true);
    assert.ok(odd.includes("&lt;b&gt;x&lt;/b&gt;"));
  });

  it("a missing privacy notice or mailing address is shown, never invented, and blocks sending", () => {
    const bare = { ...INPUT, footer: { contactEmail: "gridtilt1@gmail.com", privacyUrl: null, postalAddress: null } };
    const b = renderWeeklyEmail(bare);
    assert.ok(b.includes("privacy notice not published: sending is blocked"));
    assert.ok(b.includes("mailing address not set: sending is blocked"));
    assert.equal(footerBlockers(bare.footer).length, 2);
    assert.deepEqual(footerBlockers(INPUT.footer), []);
  });
});
