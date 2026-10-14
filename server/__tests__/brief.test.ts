// Locks the Weekly Buildout Brief: a deterministic synthesis of the live module
// metrics into a readable report (and a plaintext rendering for the newsletter /
// social). Pure function from numbers to prose, same discipline as the rest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { composeBrief, renderBriefText, type BriefInput } from "../brief";

const INPUT: BriefInput = {
  asOf: "2026-06-29",
  compute: { clusterCount: 235, plannedGW: 125, operationalGW: 11, operatorCount: 77, topOperator: "Meta", topOperatorSharePct: 18, biggestName: "Meta Hyperion", biggestGW: 5 },
  gpu: { fleetAvg: 4.47, fleetAvg1yChange: -11.1, h100: 2.79, gb200: 13, moverModel: "MI325X", moverChangePct: -38.8, cheapestModel: "A100", cheapestPrice: 1.65 },
  grid: { queueGW: 2290, medianWaitMonths: 55, ercotGW: 230 },
  deals: {
    signedCount: 14,
    signedUndisclosed: 0,
    signedGW: 12.4,
    pendingCount: 6,
    unreviewedCount: 3,
    topSignedBuyer: "Microsoft",
    topSignedBuyerGW: 4.6,
    topSignedType: "nuclear",
    topSignedTypeGW: 7.2,
  },
};

test("brief carries the headline numbers and four sections", () => {
  const b = composeBrief(INPUT);
  assert.equal(b.asOf, "2026-06-29");
  assert.ok(b.title.includes("week of 2026-06-29"));
  assert.ok(b.summary.includes("235") && b.summary.includes("125 GW") && b.summary.includes("77 operators"));
  assert.deepEqual(b.sections.map((s) => s.heading), ["Compute", "GPUs", "Power & grid", "Power agreements"]);
  // every section has at least one point
  for (const s of b.sections) assert.ok(s.points.length >= 1, `${s.heading} has points`);
});

test("section points read from the live numbers", () => {
  const b = composeBrief(INPUT);
  const flat = b.sections.flatMap((s) => s.points).join(" | ");
  assert.ok(flat.includes("Meta leads"));
  assert.ok(flat.includes("Meta Hyperion") && flat.includes("5 GW"));
  assert.ok(/MI325X down 39%|MI325X down 38/.test(flat)); // biggest mover, rounded
  assert.ok(flat.includes("2,290 GW")); // comma-grouped queue
  assert.ok(flat.includes("Microsoft") && flat.includes("4.6 GW"));
});

test("only signed agreements are totalled; the rest are named as not counted", () => {
  const b = composeBrief(INPUT);
  const deals = b.sections.find((s) => s.heading === "Power agreements")!.points.join(" | ");
  assert.ok(b.summary.includes("14 signed power agreements total 12.4 GW"));
  assert.ok(deals.includes("6 more are frameworks, options or letters of intent, not counted as signed"));
  assert.ok(deals.includes("3 listed agreements are not yet reviewed"));
  assert.ok(!/contracted/i.test(renderBriefText(b)), "no all-rows 'contracted' figure");
});

test("a brief with nothing pending or unreviewed says nothing about them", () => {
  const b = composeBrief({ ...INPUT, deals: { ...INPUT.deals, pendingCount: 0, unreviewedCount: 0 } });
  const deals = b.sections.find((s) => s.heading === "Power agreements")!.points.join(" | ");
  assert.ok(!deals.includes("frameworks") && !deals.includes("not yet reviewed"));
});

test("plaintext render has the title, bullets, and a takeaway, no markdown headers", () => {
  const b = composeBrief(INPUT);
  const txt = renderBriefText(b);
  assert.ok(txt.startsWith(b.title));
  assert.ok(txt.includes("Compute") && txt.includes("- ")); // bulleted points
  assert.ok(txt.includes(b.takeaway));
  assert.ok(!txt.includes("#"), "no markdown header glyphs");
});

test("a signed total that leaves out an undisclosed size says how many agreements it covers", () => {
  const b = composeBrief({ ...INPUT, deals: { ...INPUT.deals, signedCount: 33, signedUndisclosed: 1, signedGW: 30.9 } });
  assert.ok(b.summary.includes("33 signed power agreements; the 32 with a disclosed size total 30.9 GW"), b.summary);
  const flat = b.sections.flatMap((s) => s.points).join(" | ");
  assert.ok(flat.includes("33 signed agreements, 30.9 GW across the 32 with a disclosed size."), flat);
});
