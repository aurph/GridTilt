// Locks the exact copy the daily poster ships, and the reasons it skips a
// day. If a template changes, this file changes with it, in the same commit,
// on purpose.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBuildoutPost,
  buildGpuObservedPost,
  buildProjectPost,
  buildQueuePost,
  buildChangePost,
  buildTopMoversTweet,
  buildCatalystTweet,
  ensureTweetLength,
  daysBetween,
  shortDate,
  REVIEW_MAX_AGE_DAYS,
  CHANGE_WINDOW_DAYS,
  type BuildoutInput,
  type GpuObservedInput,
  type ProjectInput,
  type ChangeInput,
  type PostResult,
} from "../social-format";

const within280 = (t: string) => assert.ok(t.length <= 280, `post is ${t.length} chars`);
const noPadding = (t: string) => assert.ok(!/ {2,}/.test(t), "no manual column alignment");
const text = (r: PostResult): string => {
  assert.ok(r.ok, `expected a post, got a skip: ${r.ok ? "" : r.skip}`);
  return r.ok ? r.text : "";
};
const skipped = (r: PostResult): string => {
  assert.ok(!r.ok, "expected a skip");
  return r.ok ? "" : r.skip;
};

// ── dates ──────────────────────────────────────────────────────────────────

test("dates print as precisely as the source states them", () => {
  assert.equal(shortDate("2026-09-28"), "Sep 28, 2026");
  assert.equal(shortDate("2026-01"), "Jan 2026");
  assert.equal(shortDate("2026"), "2026");
  assert.equal(shortDate("End of 2025"), "End of 2025", "anything else prints as given");
  assert.equal(daysBetween("2026-09-01", "2026-10-01"), 30);
  assert.equal(daysBetween("2026-10-02", "2026-10-01"), -1);
  assert.equal(daysBetween("2026-13-01", "2026-10-01"), null, "an impossible date has no age");
  assert.equal(daysBetween("2026-02-30", "2026-10-01"), null);
  assert.equal(daysBetween("2026-10-01T09:00", "2026-10-01"), null);
});

// ── Monday: clusters by status ─────────────────────────────────────────────

const BUILDOUT: BuildoutInput = {
  clusterCount: 237,
  operational: { count: 81, plannedMW: 29_400 },
  construction: { count: 108, plannedMW: 62_000 },
  announced: { count: 48, plannedMW: 70_350 },
  asOf: "2026-09-30",
  today: "2026-10-01",
  maxAgeDays: 2,
};

test("buildout: counts and planned power by status, one basis, dated", () => {
  const t = text(buildBuildoutPost(BUILDOUT));
  assert.equal(
    t,
    [
      "GridTilt tracks 237 AI compute clusters: 81 operating, 108 under construction and 48 announced. Their planned power, the full announced build: 29.4 GW, 62 GW and 70.4 GW. Data as of Sep 30, 2026.",
      "",
      "https://gridtilt.com/compute-frontier",
    ].join("\n"),
  );
  assert.ok(!/index|gauge|today/i.test(t), "no index, gauge or 'today' language");
  noPadding(t);
  within280(t);
});

test("buildout: skips a stale or undated list, and a breakdown that does not add up", () => {
  assert.match(skipped(buildBuildoutPost({ ...BUILDOUT, asOf: "2026-09-01" })), /is from 2026-09-01, 30 days ago, past the 2-day limit the freshness registry sets/);
  assert.match(skipped(buildBuildoutPost({ ...BUILDOUT, asOf: null })), /no valid date/);
  assert.match(skipped(buildBuildoutPost({ ...BUILDOUT, asOf: "2026-13-01" })), /no valid date/, "an impossible date is unknown, not fresh");
  assert.match(skipped(buildBuildoutPost({ ...BUILDOUT, asOf: "2026-02-30" })), /no valid date/);
  assert.match(skipped(buildBuildoutPost({ ...BUILDOUT, asOf: "2026-12-01" })), /after today/, "a future date is not current");
  assert.match(skipped(buildBuildoutPost({ ...BUILDOUT, clusterCount: 240 })), /3 of 240 clusters have no recognized status/);
  assert.match(skipped(buildBuildoutPost({ ...BUILDOUT, clusterCount: 0, operational: { count: 0, plannedMW: 0 }, construction: { count: 0, plannedMW: 0 }, announced: { count: 0, plannedMW: 0 } })), /empty/);
});

// ── Tuesday: observed GPU prices ───────────────────────────────────────────

const GPU: GpuObservedInput = {
  observedOn: "2026-09-30",
  today: "2026-10-01",
  maxAgeDays: 2,
  models: [
    { model: "H100", price: 2.87, observations: 3, providers: ["RunPod", "Vast.ai"] },
    { model: "H200", price: 3.94, observations: 3, providers: ["RunPod", "Vast.ai"] },
    { model: "B200", price: 5.98, observations: 3, providers: ["RunPod", "Vast.ai"] },
    { model: "B300", price: 7.42, observations: 2, providers: ["RunPod"] },
  ],
};

test("gpu: observed medians with their date, each naming only its own providers", () => {
  const t = text(buildGpuObservedPost(GPU));
  assert.equal(
    t,
    [
      "On-demand GPU rental prices observed Sep 30, 2026, each the median of the provider prices seen for that model: H100 $2.87, H200 $3.94 and B200 $5.98 (RunPod, Vast.ai); B300 $7.42 (RunPod), per GPU-hour.",
      "",
      "https://gridtilt.com/neocloud-intel",
    ].join("\n"),
  );
  noPadding(t);
  within280(t);
});

test("gpu: a model priced by one provider observation is left out; whole dollars print plain", () => {
  const t = text(
    buildGpuObservedPost({
      ...GPU,
      models: [
        { model: "H100", price: 3, observations: 2, providers: ["RunPod"] },
        { model: "MI300X", price: 2.39, observations: 1, providers: ["RunPod"] },
      ],
    }),
  );
  assert.ok(t.includes("seen for that model: H100 $3 (RunPod), per GPU-hour."));
  assert.ok(!t.includes("MI300X"));
});

test("gpu: skips when nothing current was observed, or H100 lacks two provider observations", () => {
  assert.match(skipped(buildGpuObservedPost({ ...GPU, observedOn: "2026-08-15" })), /from 2026-08-15, 47 days ago, past the 2-day limit for the page to serve it/);
  assert.match(skipped(buildGpuObservedPost({ ...GPU, observedOn: null })), /no live GPU price observation/);
  assert.match(skipped(buildGpuObservedPost({ ...GPU, observedOn: "2026-13-01" })), /no valid date/);
  assert.match(skipped(buildGpuObservedPost({ ...GPU, observedOn: "2026-10-02" })), /after today/);
  assert.match(
    skipped(buildGpuObservedPost({ ...GPU, models: [{ model: "H100", price: 2.87, observations: 1, providers: ["Vast.ai"] }] })),
    /H100 was not priced by at least two provider observations/,
  );
  assert.match(
    skipped(buildGpuObservedPost({ ...GPU, models: [{ model: "H100", price: -1, observations: 3, providers: ["RunPod"] }] })),
    /H100 was not priced/,
    "a negative price is not a price",
  );
});

// ── Wednesday: one project ─────────────────────────────────────────────────

const ABILENE: ProjectInput = {
  name: "Stargate Abilene",
  place: "TX",
  status: "operational",
  plannedMW: 1200,
  plannedBasis: "grid interconnection",
  operating: { mw: 618, asOf: "2026-09-10", source: "Oracle Q1 FY2027 earnings call" },
  reviewed: "2026-09-28",
  listAsOf: "2026-09-01",
  today: "2026-10-07",
  maxListAgeDays: 2,
  url: "https://gridtilt.com/compute-frontier/stargate-abilene",
};

test("project: a reviewed record keeps operating and planned apart", () => {
  const t = text(buildProjectPost(ABILENE));
  assert.equal(
    t,
    [
      "Stargate Abilene, TX: operating. 618 MW delivered as of Sep 10, 2026 (Oracle Q1 FY2027 earnings call). Planned: 1,200 MW grid interconnection, a different basis. Reviewed Sep 28, 2026.",
      "",
      "https://gridtilt.com/compute-frontier/stargate-abilene",
    ].join("\n"),
  );
  assert.ok(!/%/.test(t), "rated over planned is not progress, so no percent");
  within280(t);
});

test("project: an unreviewed record posts only from a fresh list, with the list's date", () => {
  const plain: ProjectInput = { ...ABILENE, name: "Example Campus", place: "Midland, TX", status: "construction", plannedBasis: null, operating: null, reviewed: null, listAsOf: "2026-10-06" };
  assert.equal(
    text(buildProjectPost(plain)),
    ["Example Campus, Midland, TX: under construction. Planned: 1,200 MW. Data as of Oct 6, 2026.", "", ABILENE.url].join("\n"),
  );
  assert.match(
    skipped(buildProjectPost({ ...plain, listAsOf: "2026-09-01" })),
    /this week's project is Example Campus, which has no recent review, and the cluster list is from 2026-09-01, 36 days ago/,
  );
  assert.match(skipped(buildProjectPost({ ...plain, listAsOf: "2026-13-01" })), /no valid date/);
  assert.match(skipped(buildProjectPost({ ...plain, listAsOf: "2026-10-09" })), /after today/);
  // A review dated in the future is not a review; the list rule applies.
  assert.match(skipped(buildProjectPost({ ...ABILENE, reviewed: "2026-10-30" })), /no recent review/);
});

test("project: an old review falls back to the list's date rule", () => {
  const today = "2026-11-15";
  assert.ok(daysBetween(ABILENE.reviewed as string, today) > REVIEW_MAX_AGE_DAYS);
  assert.match(skipped(buildProjectPost({ ...ABILENE, today })), /no recent review/);
});

test("project: unknown status or missing planned power is skipped, never guessed", () => {
  assert.match(skipped(buildProjectPost({ ...ABILENE, status: "rumored" })), /no recognized status/);
  assert.match(skipped(buildProjectPost({ ...ABILENE, plannedMW: null })), /no planned power/);
  assert.match(skipped(buildProjectPost({ ...ABILENE, plannedMW: 0 })), /no planned power/);
});

test("project: names pass through as written, with no markup escaping", () => {
  const t = text(buildProjectPost({ ...ABILENE, name: `AT&T "Edge" Campus`, operating: null }));
  assert.ok(t.startsWith(`AT&T "Edge" Campus, TX: operating. Planned: 1,200 MW grid interconnection. Reviewed Sep 28, 2026.`));
});

// ── Thursday: the national queue ───────────────────────────────────────────

const QUEUE = { edition: "LBNL's Queued Up 2026", editionYear: 2026, gw: 2061, projects: 8244, asOf: "the end of 2025" };

test("queue: LBNL's total with its edition and date, and what a request is not", () => {
  const t = text(buildQueuePost(QUEUE, 2026));
  assert.equal(
    t,
    [
      "LBNL's Queued Up 2026: about 2,061 GW of generation and storage was waiting to connect to the US grid at the end of 2025, across about 8,244 projects. A queue request is not a commitment to build.",
      "",
      "https://gridtilt.com/power-map?tab=queue",
    ].join("\n"),
  );
  within280(t);
});

test("queue: skips a missing total and an edition older than last year's", () => {
  assert.match(skipped(buildQueuePost(null, 2026)), /missing its total/);
  assert.match(skipped(buildQueuePost({ ...QUEUE, gw: 0 }, 2026)), /missing its total/);
  assert.match(skipped(buildQueuePost(QUEUE, 2028)), /edition on file is 2026, too old/);
  assert.ok(text(buildQueuePost({ ...QUEUE, projects: null }, 2027)).includes("at the end of 2025. A queue request"));
});

// ── Friday: one documented change ──────────────────────────────────────────

const CHANGE: ChangeInput = {
  kind: "correction",
  label: "MISO's summer 2026 reserve margin",
  before: "13.4%",
  after: "11.0%, against NERC's 8.1% reference",
  source: "NERC 2025 LTRA",
  sourceDate: "2026-01",
  reviewed: "2026-09-29",
  url: "https://gridtilt.com/overview",
};

test("change: one documented correction with its before, after, source and date", () => {
  const t = text(buildChangePost(CHANGE, "2026-10-02"));
  assert.equal(
    t,
    [
      "Correction, Sep 29, 2026: MISO's summer 2026 reserve margin. Before: 13.4%. Now: 11.0%, against NERC's 8.1% reference. Source: NERC 2025 LTRA, Jan 2026.",
      "",
      "https://gridtilt.com/overview",
    ].join("\n"),
  );
  within280(t);
  assert.ok(text(buildChangePost({ ...CHANGE, kind: "update" }, "2026-10-02")).startsWith("Update, Sep 29, 2026:"));
});

test("change: no change this week means no post, never a stand-in", () => {
  assert.match(skipped(buildChangePost(null, "2026-10-02")), /no documented change/);
  const late = "2026-10-07";
  assert.ok(daysBetween(CHANGE.reviewed, late) > CHANGE_WINDOW_DAYS);
  assert.match(skipped(buildChangePost(CHANGE, late)), /no documented change in the last 7 days; the latest was reviewed 2026-09-29/);
  assert.match(skipped(buildChangePost({ ...CHANGE, reviewed: "2026-10-05" }, "2026-10-02")), /no documented change/, "a future review date is not this week");
  assert.match(skipped(buildChangePost({ ...CHANGE, reviewed: "2026-13-01" }, "2026-10-02")), /not a valid day/);
  // One week: a change reviewed on a Friday is posted that Friday and not the next.
  assert.ok(buildChangePost({ ...CHANGE, reviewed: "2026-10-02" }, "2026-10-02").ok);
  assert.ok(buildChangePost(CHANGE, "2026-10-05").ok, "age 6 is still this week");
  assert.match(skipped(buildChangePost({ ...CHANGE, reviewed: "2026-10-02" }, "2026-10-09")), /no documented change in the last 7 days/);
});

test("an over-long post is skipped with its length, not cut mid-sentence", () => {
  const r = buildChangePost({ ...CHANGE, label: "x".repeat(200) }, "2026-10-02");
  assert.match(skipped(r), /would be \d+ characters, over the 280 limit/);
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
  assert.ok(t.includes("$VST -4.21% (utility)"));
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

test("catalysts: a month window prints as the month, not as its first day", () => {
  const t = buildCatalystTweet([
    { date: "2026-10-01", title: "FERC large-load interconnection rule", label: "Oct 2026" },
    { date: "2026-10-02", title: "MU earnings" },
  ]);
  assert.ok(t.includes("Oct 2026: FERC large-load interconnection rule"));
  assert.ok(!t.includes("Thu, Oct 1"), "no invented day for a month-level date");
  assert.ok(t.includes("Fri, Oct 2: MU earnings"));
  within280(t);
});

test("every builder is deterministic for the same input", () => {
  assert.deepEqual(buildBuildoutPost(BUILDOUT), buildBuildoutPost(BUILDOUT));
  assert.deepEqual(buildGpuObservedPost(GPU), buildGpuObservedPost(GPU));
  assert.deepEqual(buildProjectPost(ABILENE), buildProjectPost(ABILENE));
  assert.deepEqual(buildQueuePost(QUEUE, 2026), buildQueuePost(QUEUE, 2026));
  assert.deepEqual(buildChangePost(CHANGE, "2026-10-02"), buildChangePost(CHANGE, "2026-10-02"));
});
