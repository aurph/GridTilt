// Locks the Weekly Buildout Brief: a deterministic synthesis of the live module
// metrics into a readable report (and a plaintext rendering for the newsletter /
// social). Pure function from numbers to prose, same discipline as the rest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, briefDate, buildBriefRecord, composeBrief, datasetLabel, recordSections, renderBriefText, type BriefInput, type BriefRecordSource } from "../brief";

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
  assert.equal(b.title, "The Buildout Brief, June 29, 2026");
  assert.doesNotMatch(b.title, /week of/i);
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

// ── The record: what changed since the previous issue ───────────────────────

const SOURCE: BriefRecordSource = {
  asOf: "2026-11-17",
  since: "2026-10-27",
  changes: [
    {
      kind: "update",
      entity: "clusters/coreweave-ellendale",
      field: "Rated power and status",
      before: "70 MW rated",
      after: "250 MW fully operational",
      source: "CoreWeave Q3 2026 results",
      sourceDate: "2026-10-28",
      reviewed: "2026-10-30",
    },
    {
      kind: "correction",
      entity: "interconnection-queue/ferc-large-load",
      field: "Date RTO responses are due",
      before: "mid-August 2026",
      after: "November 16, 2026",
      source: "FERC notice of extension",
      sourceDate: "2026-10",
      reviewed: "2026-10-30",
      short: { label: "FERC large-load response date", before: "mid-August", after: "November 16" },
    },
    // On the previous issue's day: already reported, not repeated.
    { kind: "update", entity: "gpu-prices/curated", field: "Curated prices", before: "June pass", after: "October pass", source: "Listings", sourceDate: "2026-10", reviewed: "2026-10-27" },
  ],
  states: [
    {
      name: "Maryland",
      documents: [
        { date: "2026-11-05", title: "PSC opens the Piedmont line case", source: "Maryland PSC, Case No. 9773" },
        { kind: "status", date: "2026-11-06", title: "County zoning map", source: "Frederick County" },
        { date: "2026-09-14", title: "An earlier order", source: "Maryland PSC" },
      ],
      nextDates: [
        { date: "2027-03-06", what: "PSC public comment hearings on the Piedmont line begin" },
        { date: "2026-11-01", what: "A date already past" },
      ],
    },
  ],
  agreements: [],
  catalysts: [],
};

test("an issue built from two change-log entries and one state row renders those sections and no empty headings", () => {
  const record = buildBriefRecord(SOURCE);
  assert.equal(record.changes.length, 2, "the entry on the previous issue's day is not repeated");
  const brief = composeBrief({ ...INPUT, asOf: "2026-11-17", record });
  assert.deepEqual(
    brief.sections.map((s) => s.heading),
    ["What changed", "Maryland", "Compute", "GPUs", "Power & grid", "Power agreements"],
  );
  for (const s of brief.sections) assert.ok(s.points.length > 0, `${s.heading} has rows`);

  const changed = brief.sections[0].points;
  assert.deepEqual(changed, [
    "Compute clusters: Rated power and status. Was: 70 MW rated. Now: 250 MW fully operational. Source: CoreWeave Q3 2026 results, October 28, 2026.",
    "Interconnection queue: FERC large-load response date. Was: mid-August. Now: November 16. Source: FERC notice of extension, October 2026.",
  ]);
  assert.deepEqual(brief.sections[1].points, [
    "Decided November 5, 2026: PSC opens the Piedmont line case. Source: Maryland PSC, Case No. 9773.",
    "Next public date, March 6, 2027: PSC public comment hearings on the Piedmont line begin.",
  ]);

  const text = renderBriefText(brief);
  assert.ok(text.startsWith("The Buildout Brief, November 17, 2026"));
  assert.doesNotMatch(text, /week of|today's read/i);
  assert.doesNotMatch(text, /\u2014/, "no em dash");
  assert.doesNotMatch(text, /\n(Agreements|Next public dates)\n/, "no heading without rows");
});

test("a record with nothing in it adds no sections", () => {
  const record = buildBriefRecord({ ...SOURCE, changes: [], states: [] });
  assert.deepEqual(recordSections(record), []);
  const brief = composeBrief({ ...INPUT, record });
  assert.deepEqual(brief.sections.map((s) => s.heading), ["Compute", "GPUs", "Power & grid", "Power agreements"]);
});

test("agreements are new when announced since the last issue, else reviewed, each with its firmness", () => {
  const record = buildBriefRecord({
    ...SOURCE,
    changes: [],
    states: [],
    agreements: [
      { name: "NiSource supply for Microsoft", firmness: "signed", capacityMW: 1100, announced: "2026-11-03", reviewed: "2026-11-04" },
      { name: "Cheyenne fuel cell", firmness: "unreviewed", capacityMW: null, announced: "2026-10-14", reviewed: "2026-11-10" },
      { name: "An older row", firmness: "signed", capacityMW: 500, announced: "2025-03-01", reviewed: "2026-09-28" },
      { name: "Announced after the issue day", firmness: "framework", capacityMW: 200, announced: "2026-11-18", reviewed: null },
    ],
  });
  assert.deepEqual(recordSections(record), [
    {
      heading: "Agreements",
      points: [
        "Reviewed November 10, 2026: Cheyenne fuel cell. Classified not yet reviewed, capacity not disclosed.",
        "New: NiSource supply for Microsoft. Signed, 1,100 MW, announced November 3, 2026.",
      ],
    },
  ]);
});

test("next public dates cover the issue day through 14 days after, states and the calendar together", () => {
  const record = buildBriefRecord({
    ...SOURCE,
    changes: [],
    states: [
      {
        name: "Texas",
        documents: [],
        nextDates: [
          { date: "2026-11-24", through: "2026-11-25", what: "PUC open meeting" },
          { date: "2026-12-10", what: "ERCOT files its report" },
        ],
      },
    ],
    catalysts: [
      { date: "2026-11-19", title: "FERC November open meeting", status: null },
      { date: "2026-11-16", title: "Yesterday's deadline", status: null },
      { date: "2026-11-20", title: "Already done", status: "completed" },
      { date: "2026-11", title: "A month, not a day", status: null },
      { date: "2026-12-02", title: "Past the window", status: null },
    ],
  });
  assert.equal(addDays("2026-11-17", 14), "2026-12-01");
  const dates = recordSections(record).find((s) => s.heading === "Next public dates")!;
  assert.deepEqual(dates.points, [
    "November 19, 2026, Catalyst calendar: FERC November open meeting.",
    "November 24, 2026 to November 25, 2026, Texas: PUC open meeting.",
  ]);
  // The state's own section still lists every date ahead, in order.
  const texas = recordSections(record).find((s) => s.heading === "Texas")!;
  assert.equal(texas.points.length, 2);
});

test("a no-change check is reported as a check, with no before or after", () => {
  const record = buildBriefRecord({
    ...SOURCE,
    states: [],
    changes: [
      { kind: "checked-no-change", entity: "grid/reserve-margins", field: "Summer reserve margins", checked: "NERC 2025 LTRA", source: "NERC", sourceDate: "2026-01", reviewed: "2026-11-10" },
    ],
  });
  assert.deepEqual(recordSections(record)[0].points, ["Grid: Summer reserve margins. Checked, no change (NERC, January 2026)."]);
});

test("dates and dataset names read the way the issue prints them", () => {
  assert.equal(briefDate("2026-11-17"), "November 17, 2026");
  assert.equal(briefDate("2026-10"), "October 2026");
  assert.equal(briefDate("2026"), "2026");
  assert.equal(datasetLabel("gpu-prices/MI325X"), "GPU prices");
  assert.equal(datasetLabel("something-new/x"), "something-new");
});

test("a source that already carries its date is not dated twice, and the short source name is preferred", () => {
  const record = buildBriefRecord({
    ...SOURCE,
    states: [],
    changes: [
      { kind: "update", entity: "clusters/x", field: "Rated power", before: "70 MW", after: "250 MW", source: "Applied Digital press release, October 2, 2026", sourceDate: "2026-10-02", reviewed: "2026-10-30" },
      {
        kind: "update",
        entity: "gpu-prices/H100",
        field: "Representative on-demand rental price",
        before: "long before",
        after: "long after",
        source: "Provider pricing pages and aggregator trackers (getdeploying.com, Silicon Data, aimultiple)",
        sourceDate: "2026-10-27",
        reviewed: "2026-10-30",
        short: { label: "H100 on-demand rental", before: "$2.79", after: "$3.20", source: "Provider pricing pages" },
      },
    ],
  });
  assert.deepEqual(recordSections(record)[0].points, [
    "Compute clusters: Rated power. Was: 70 MW. Now: 250 MW. Source: Applied Digital press release, October 2, 2026.",
    "GPU prices: H100 on-demand rental. Was: $2.79. Now: $3.20. Source: Provider pricing pages, October 27, 2026.",
  ]);
});

test("one unreviewed agreement is singular", () => {
  const b = composeBrief({ ...INPUT, deals: { ...INPUT.deals, unreviewedCount: 1 } });
  const deals = b.sections.find((s) => s.heading === "Power agreements")!.points.join(" | ");
  assert.ok(deals.includes("1 listed agreement is not yet reviewed and is not counted."), deals);
});
