import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildClusterEvents,
  buildCorrectionEvents,
  buildDealEvents,
  buildEarningsEvents,
  buildModelReleaseEvents,
  buildPriceMilestoneEvents,
  buildResearchEvents,
  buildStateEvents,
  buildTimeline,
  buildTokenPriceEvents,
  clusterMagnitude,
  detectPriceCrossings,
  earningsDateStatus,
  inAppPath,
  isDay,
  sourcedAnnouncement,
  tickersFor,
  type ClusterRecord,
  type DatedDeal,
  type TimelineInputs,
} from "../timeline";

const SRC = "https://example.com/release";

function deal(over: Partial<DatedDeal> = {}): DatedDeal {
  return {
    id: "d1",
    projectName: "Example Nuclear PPA",
    sponsor: "Constellation Energy",
    capacityMW: 835,
    type: "nuclear",
    category: "ppa",
    offtaker: "Microsoft (20-year PPA)",
    sources: [SRC],
    announced: "2024-09-20",
    announcedSource: SRC,
    ...over,
  };
}

function cluster(over: Partial<ClusterRecord> = {}): ClusterRecord {
  return {
    id: "c1",
    name: "Example Campus",
    operator: "Meta",
    gpuCount: 100000,
    ratedPowerMW: 150,
    plannedPowerMW: 300,
    estimated: [],
    sources: [SRC],
    announced: "2024-03-14",
    announcedSource: SRC,
    ...over,
  };
}

// ─── Dates ──────────────────────────────────────────────────────────────────

test("isDay accepts real calendar days only", () => {
  assert.equal(isDay("2024-02-29"), true);
  assert.equal(isDay("2025-02-29"), false);
  assert.equal(isDay("2026-13-01"), false);
  assert.equal(isDay("2026-05"), false);
  assert.equal(isDay("2026"), false);
  assert.equal(isDay("2026-Q1"), false);
  assert.equal(isDay(""), false);
  assert.equal(isDay(null), false);
});

test("an announcement counts only with a day, an https source, and that source cited by the row", () => {
  assert.deepEqual(sourcedAnnouncement(deal()), { date: "2024-09-20", source: SRC });
  assert.equal(sourcedAnnouncement(deal({ announced: "2024-09" })), null);
  assert.equal(sourcedAnnouncement(deal({ announcedSource: "http://example.com/release", sources: ["http://example.com/release"] })), null);
  assert.equal(sourcedAnnouncement(deal({ announcedSource: "https://elsewhere.example/x" })), null);
  assert.equal(sourcedAnnouncement(deal({ announced: undefined })), null);
  // A deal's firmness document is one of its citations.
  assert.deepEqual(
    sourcedAnnouncement(deal({ sources: [], firmnessSource: SRC })),
    { date: "2024-09-20", source: SRC },
  );
});

// ─── Power deals ────────────────────────────────────────────────────────────

test("deal events: template title, MW magnitude, tickers, deep link to the deals tab", () => {
  const [e] = buildDealEvents([deal()]);
  assert.equal(e.id, "power_deal:d1");
  assert.equal(e.date, "2024-09-20");
  assert.equal(e.dateBasis, "announced");
  assert.equal(e.title, "Microsoft announced a power deal with Constellation Energy");
  assert.deepEqual(e.magnitude, { unit: "MW", value: 835 });
  assert.deepEqual(e.relatedTickers, ["MSFT", "CEG"]);
  assert.equal(e.sourceUrl, "/power-map?tab=deals&deal=d1");
  assert.equal(e.sourceLinks[0], SRC);
  assert.equal(e.recordKey, "deal:d1");
});

test("deal events: undisclosed buyer, undisclosed MW, up-to ceilings and load rows", () => {
  const [anon] = buildDealEvents([deal({ offtaker: "Undisclosed hyperscaler", capacityMW: null })]);
  assert.equal(anon.title, "Constellation Energy announced a power deal with an undisclosed buyer");
  assert.equal(anon.magnitude, undefined);
  const [ceiling] = buildDealEvents([deal({ upTo: true })]);
  assert.deepEqual(ceiling.magnitude, { unit: "MW", value: 835, qualifier: "up to" });
  const [load] = buildDealEvents([deal({ category: "load", type: "load" })]);
  assert.equal(load.sourceUrl, "/power-map?tab=queue");
});

test("deal events: rows without a sourced day produce nothing", () => {
  assert.deepEqual(buildDealEvents([deal({ announced: undefined }), deal({ announced: "2025" }), deal({ announcedSource: undefined })]), []);
});

// ─── Clusters ───────────────────────────────────────────────────────────────

test("cluster events link to the cluster page and size by an unestimated figure only", () => {
  const [e] = buildClusterEvents([cluster()]);
  assert.equal(e.title, "Meta announced Example Campus");
  assert.equal(e.sourceUrl, "/compute-frontier/c1");
  assert.deepEqual(e.magnitude, { unit: "GPUs", value: 100000 });
  assert.deepEqual(e.relatedTickers, ["META"]);
  assert.deepEqual(clusterMagnitude(cluster({ estimated: ["gpuCount"] })), { unit: "MW", value: 150, qualifier: "rated" });
  assert.deepEqual(clusterMagnitude(cluster({ estimated: ["gpuCount", "ratedPowerMW"] })), { unit: "MW", value: 300, qualifier: "planned" });
  assert.equal(clusterMagnitude(cluster({ estimated: ["gpuCount", "ratedPowerMW", "plannedPowerMW"] })), undefined);
  const [bare] = buildClusterEvents([cluster({ gpuCount: null, ratedPowerMW: null, plannedPowerMW: null })]);
  assert.equal(bare.magnitude, undefined);
  assert.deepEqual(buildClusterEvents([cluster({ announced: "2024-03" })]), []);
});

// ─── Earnings ───────────────────────────────────────────────────────────────

test("earnings: only confirmed dates become events", () => {
  const events = buildEarningsEvents([
    { ticker: "NVDA", company: "NVIDIA", date: "2026-11-17", dateStatus: "confirmed" },
    { ticker: "MU", company: "Micron", date: "2026-12-23", dateStatus: "estimated" },
    { ticker: "ZZZZ", company: "Not tracked", date: "2026-11-01", dateStatus: "confirmed" },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "NVIDIA (NVDA) reports earnings");
  assert.equal(events[0].sourceUrl, "/stock/NVDA");
  assert.equal(events[0].dateBasis, "scheduled");
});

test("earningsDateStatus: confirmed needs Yahoo's explicit false and a matching calendar day", () => {
  assert.equal(earningsDateStatus("2026-11-17", ["2026-11-17"], false), "confirmed");
  assert.equal(earningsDateStatus("2026-11-17", ["2026-11-17"], true), "estimated");
  assert.equal(earningsDateStatus("2026-11-17", ["2026-11-17"], undefined), "estimated");
  assert.equal(earningsDateStatus("2026-11-16", ["2026-11-17"], false), "estimated");
  assert.equal(earningsDateStatus("2026-11-17", [], false), "estimated");
});

// ─── Price milestones ───────────────────────────────────────────────────────

const pts = (...xs: Array<[string, number]>) => xs.map(([date, price]) => ({ date, price }));

test("crossings: a fall through $3.00 is one event on the first day below", () => {
  assert.deepEqual(detectPriceCrossings(pts(["2026-07-01", 3.2], ["2026-07-02", 3.1], ["2026-07-03", 2.95], ["2026-07-04", 2.9])), [
    { date: "2026-07-03", threshold: 3, direction: "below", price: 2.95 },
  ]);
});

test("crossings: a jump over several thresholds yields one event per threshold, no duplicates", () => {
  const out = detectPriceCrossings(pts(["2026-07-01", 2.1], ["2026-07-02", 3.6]));
  assert.deepEqual(out.map((x) => [x.threshold, x.direction]), [[2.5, "above"], [3, "above"], [3.5, "above"]]);
});

test("crossings: landing exactly on a threshold reaches it; staying there is not a crossing", () => {
  const out = detectPriceCrossings(pts(["2026-07-01", 2.8], ["2026-07-02", 3.0], ["2026-07-03", 3.0], ["2026-07-04", 3.2]));
  assert.deepEqual(out.map((x) => [x.date, x.threshold, x.direction]), [["2026-07-02", 3, "above"]]);
});

test("crossings: no events for movement inside a band, a flat series, or a single point", () => {
  assert.deepEqual(detectPriceCrossings(pts(["2026-07-01", 3.1], ["2026-07-02", 3.4], ["2026-07-03", 3.05])), []);
  assert.deepEqual(detectPriceCrossings(pts(["2026-07-01", 2.0], ["2026-07-02", 2.0])), []);
  assert.deepEqual(detectPriceCrossings(pts(["2026-07-01", 2.0])), []);
});

test("crossings: oscillation alternates direction and sorts unordered input by date", () => {
  const out = detectPriceCrossings(pts(["2026-07-03", 2.9], ["2026-07-01", 2.9], ["2026-07-02", 3.1]));
  assert.deepEqual(out.map((x) => [x.date, x.direction]), [["2026-07-02", "above"], ["2026-07-03", "below"]]);
});

test("crossings: undated and non-positive points are ignored", () => {
  const out = detectPriceCrossings(pts(["2026-07", 1.0], ["2026-07-01", 3.1], ["2026-07-02", 0], ["2026-07-03", 2.9]));
  assert.deepEqual(out.map((x) => [x.date, x.threshold]), [["2026-07-03", 3]]);
});

test("price milestones: nothing at all without permission; live snapshots only with it", () => {
  const history = [
    { date: "2026-07-01", source: "live", prices: { H100: 3.1 } },
    { date: "2026-07-02", source: "curated", prices: { H100: 1.0 } },
    { date: "2026-07-03", source: "live", prices: { H100: 2.9 } },
  ];
  assert.deepEqual(buildPriceMilestoneEvents(history, false), []);
  const events = buildPriceMilestoneEvents(history, true);
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "H100 median rental price fell below $3.00 per GPU-hour");
  assert.deepEqual(events[0].magnitude, { unit: "USD/GPU-hr", value: 3, direction: "below" });
});

// ─── Already-dated datasets ─────────────────────────────────────────────────

test("model releases: lab name, status verb, cited sources; undated or unknown-lab models skipped", () => {
  const events = buildModelReleaseEvents({
    labs: [{ id: "google", name: "Google DeepMind" }],
    sources: [{ id: "s1", url: "https://blog.google/x" }],
    models: [
      { id: "m1", labId: "google", name: "Gemini X", releaseDate: "2026-01-02", releaseStatus: "preview", sourceIds: ["s1"] },
      { id: "m2", labId: "google", name: "Gemini Y", releaseDate: "2026-01", releaseStatus: "general", sourceIds: [] },
      { id: "m3", labId: "nobody", name: "Z", releaseDate: "2026-01-03", releaseStatus: "general", sourceIds: [] },
    ],
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Google DeepMind previewed Gemini X");
  assert.deepEqual(events[0].sourceLinks, ["https://blog.google/x"]);
  assert.deepEqual(events[0].relatedTickers, ["GOOGL"]);
});

test("token prices: trajectory points and dated cuts", () => {
  const events = buildTokenPriceEvents({
    sources: [{ id: "p", url: "https://openai.com/api/pricing" }],
    trajectory: { points: [{ id: "t1", name: "GPT-4", tier: "flagship", date: "2023-03-14", inputPerMTok: 30, sourceId: "p" }] },
    events: [{ id: "cut", date: "2026-07-30", headline: "OpenAI cut Luna 80%.", sourceIds: ["p"] }],
  });
  assert.deepEqual(events.map((e) => e.title), ["OpenAI listed GPT-4 input tokens at $30 per million", "OpenAI cut token prices"]);
  assert.equal(events[1].description, "OpenAI cut Luna 80%.");
});

test("research, state and correction events", () => {
  const [post] = buildResearchEvents([{ slug: "a-post", title: "A Post", date: "2026-03-10" }, { slug: "x", title: "X", date: "" }]);
  assert.equal(post.sourceUrl, "/blog/a-post");
  const state = buildStateEvents({
    states: [{ slug: "maryland", code: "MD", documents: [{ date: "2026-09-14", jurisdiction: "Frederick County", title: "Hold", url: "https://x.gov/eo" }], nextDates: [{ date: "2027-05-11", through: "2027-05-21", what: "Hearings", url: "https://psc.gov/o" }] }],
  });
  assert.deepEqual(state.map((e) => [e.title, e.dateBasis, e.description ?? null]), [["Frederick County: Hold", "issued", null], ["Hearings", "scheduled", "Through 2027-05-21."]]);
  const [fix] = buildCorrectionEvents({
    changes: [{ id: "c1", kind: "correction", reviewed: "2026-09-29", sourceUrl: "https://nerc.com/x", short: { label: "MISO margin", before: "13.4%", after: "11.0%", url: "https://gridtilt.com/overview" } }],
  });
  assert.equal(fix.title, "Correction: MISO margin");
  assert.equal(fix.description, "Was 13.4%. Now 11.0%.");
  assert.equal(fix.sourceUrl, "/overview");
  assert.equal(inAppPath("https://gridtilt.com/analyze?tab=scenario"), "/analyze?tab=scenario");
  assert.equal(inAppPath("https://evil.example/gridtilt.com/x"), null);
});

test("tickersFor matches whole names to tracked tickers only", () => {
  assert.deepEqual(tickersFor("Amazon Web Services (17-year)", "Talen Energy"), ["AMZN", "TLN"]);
  assert.deepEqual(tickersFor("Metallica Holdings"), []);
  assert.deepEqual(tickersFor(null, undefined), []);
});

// ─── Assembly on the real datasets ──────────────────────────────────────────

function realInputs(): TimelineInputs {
  const d = (f: string) => JSON.parse(readFileSync(join(process.cwd(), "server", "data", f), "utf-8"));
  return {
    deals: d("interconnection-queue.json").projects,
    clusters: d("clusters.json").clusters,
    earnings: [],
    gpuHistory: d("gpu-price-history.json"),
    gpuDataPermitted: false,
    frontierModels: d("frontier-models.json"),
    inferencePrices: d("inference-prices.json"),
    articles: JSON.parse(readFileSync(join(process.cwd(), "content", "blog", "articles.json"), "utf-8")),
    statePages: d("state-pages.json"),
    changeLog: d("change-log.json"),
  };
}

test("timeline is deterministic, newest first, with unique ids and real days", () => {
  const a = buildTimeline(realInputs());
  const b = buildTimeline(realInputs());
  assert.deepEqual(a, b);
  assert.ok(a.length > 0);
  assert.equal(new Set(a.map((e) => e.id)).size, a.length);
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].date >= a[i].date, `${a[i - 1].id} before ${a[i].id}`);
  for (const e of a) {
    assert.ok(isDay(e.date), e.id);
    assert.ok(e.sourceUrl.startsWith("/"), e.id);
    for (const u of e.sourceLinks) assert.ok(u.startsWith("https://"), `${e.id}: ${u}`);
  }
  assert.ok(!a.some((e) => e.eventType === "price_milestone"), "no GPU milestones without permission");
});

test("every stored announcement date is a real day cited by its own row", () => {
  const { deals, clusters } = realInputs();
  const rows = [...deals, ...clusters] as Array<Record<string, any>>;
  const dated = rows.filter((r) => "announced" in r || "announcedSource" in r);
  assert.ok(dated.length >= 30);
  for (const r of dated) assert.ok(sourcedAnnouncement(r), `${r.id}: announced must be a day with a cited https announcedSource`);
});
