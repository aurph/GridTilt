// Share cards and post inputs come from the same rows the linked page shows.
// Fixed fixtures pin the rules; the shipped files pin the three share
// variants (a state, a project's operating and target figures, a correction).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  basisWords,
  buildoutCard,
  buildoutInputFrom,
  changeCard,
  changeInputFrom,
  displayName,
  displayPlace,
  gpuCard,
  gpuObservedInputFrom,
  latestChange,
  projectCandidates,
  projectCard,
  projectInputFrom,
  queueCard,
  queueInputFrom,
  stateCard,
  weekIndex,
  weeklyProject,
  type ClusterRecord,
  type ClusterRoot,
} from "../social-data";
import { buildProjectPost } from "../social-format";
import { computeClusterMetrics, type ClusterLite } from "../clusters";
import type { Snapshot } from "../gpu-history";
import { formatAsOf } from "../og-card";
import type { ChangeRecord } from "../change-log";
import { areaForState as clientAreaForState, cushion as clientCushion } from "../../client/src/lib/reserve-margins";

const data = (file: string) => JSON.parse(readFileSync(join(process.cwd(), "server", "data", file), "utf-8"));

const cluster = (over: Partial<ClusterRecord>): ClusterRecord => ({
  id: "example",
  name: "Example Campus (Operator)",
  operator: "Operator",
  status: "construction",
  gridRegion: "ERCOT",
  gpuCount: null,
  ratedPowerMW: 0,
  plannedPowerMW: 1000,
  linkedDeal: null,
  location: { city: "Midland", state: "TX", lat: 32, lng: -102 },
  estimated: ["plannedPowerMW"],
  sources: ["https://example.com/a"],
  ...over,
});

describe("cluster posts and cards", () => {
  it("names and places read cleanly, without repeating the city", () => {
    assert.equal(displayName(cluster({})), "Example Campus");
    assert.equal(displayPlace(cluster({})), "Midland, TX");
    assert.equal(displayPlace(cluster({ name: "Midland Campus" })), "TX");
    assert.equal(displayPlace(cluster({ location: {} })), "");
    assert.equal(basisWords("facility (grid interconnection)"), "grid interconnection");
    assert.equal(basisWords("not stated"), null);
    assert.equal(basisWords(undefined), null);
  });

  it("rotates the weekly project through named 500 MW clusters in id order, the same for post and card", () => {
    const list = [cluster({ id: "b" }), cluster({ id: "a" }), cluster({ id: "small", plannedPowerMW: 499 }), cluster({ id: "c" })];
    assert.deepEqual(projectCandidates(list).map((c) => c.id), ["a", "b", "c"]);
    const wed = "2026-10-07";
    const next = "2026-10-14";
    assert.equal(weekIndex(next) - weekIndex(wed), 1);
    assert.notEqual(weeklyProject(list, wed)?.id, weeklyProject(list, next)?.id);
    assert.equal(weeklyProject(list, wed)?.id, weeklyProject([...list].reverse(), wed)?.id, "file order does not matter");
    assert.equal(weeklyProject([], wed), null);
  });

  it("the buildout card and post count the same buckets the Compute Frontier page charts", () => {
    const root = data("clusters.json") as ClusterRoot;
    const m = computeClusterMetrics((root.clusters ?? []) as ClusterLite[]);
    const input = buildoutInputFrom(root, "2026-10-01", 2);
    assert.equal(input.operational.count + input.construction.count + input.announced.count, m.clusterCount);
    const card = buildoutCard(root);
    assert.equal(card.asOf, formatAsOf(root.lastRefreshed), "dated by the list, never today");
    assert.ok(card.asOf);
    for (const b of m.byStatus) {
      const label = `${b.count} ${b.status === "operational" ? "operating" : b.status === "construction" ? "building" : "announced"}`;
      assert.ok(card.stats.some((s) => s.label === label), label);
    }
  });

  it("Stargate Abilene's card and post state Oracle's delivered figure and the planned interconnection apart", () => {
    const root = data("clusters.json") as ClusterRoot;
    const c = (root.clusters ?? []).find((x) => x.id === "stargate-abilene") as ClusterRecord;
    const card = projectCard(c, root);
    // The record page prints the same two numbers under the same labels.
    assert.deepEqual(card.stats, [
      { label: "Rated power", value: `${c.ratedPowerMW.toLocaleString("en-US")} MW` },
      { label: "Planned power", value: `${c.plannedPowerMW.toLocaleString("en-US")} MW` },
    ]);
    assert.equal(card.asOf, "28 SEP 2026", "the review date, not today");
    assert.match(card.subtitle, /Rated: 618 MW delivered, 75% of total capacity \(Oracle Q1 FY2027 earnings call, Sep 10, 2026\)\. Planned: 1\.2 GW grid interconnection across 8 buildings\. Different bases\./);
    assert.match(card.source, /^Reviewed record · Oracle Q1 FY2027 earnings call; Crusoe$/);
    assert.equal(card.visual.kind, "map");

    const r = buildProjectPost(projectInputFrom(c, root.lastRefreshed ?? null, "2026-10-07", 2));
    assert.ok(r.ok);
    if (r.ok) {
      assert.ok(r.text.includes("618 MW delivered as of Sep 10, 2026 (Oracle Q1 FY2027 earnings call)"));
      assert.ok(r.text.includes("Planned: 1,200 MW grid interconnection, a different basis."));
      assert.ok(r.text.endsWith("https://gridtilt.com/compute-frontier/stargate-abilene"));
    }
  });

  it("an unreviewed project's card flags estimates and dates itself by the list", () => {
    const root: ClusterRoot = { lastRefreshed: "2026-09-01", clusters: [cluster({})] };
    const card = projectCard(root.clusters![0], root);
    assert.deepEqual(card.stats, [
      { label: "Rated power", value: "—" },
      { label: "Planned power", value: "1,000 MW est." },
    ]);
    assert.equal(card.asOf, "1 SEP 2026");
    assert.match(card.source, /^1 source on the record/);
  });
});

describe("GPU card and post", () => {
  const snap = (date: string): Snapshot => ({
    date,
    source: "live",
    prices: { H100: 2.87, H200: 3.94, MI300X: 2.39 },
    meta: {
      H100: { low: 2.69, high: 3.29, n: 3, sources: ["runpod-secure", "runpod-community", "vast"] },
      H200: { low: 3.59, high: 4.59, n: 3, sources: ["runpod-secure", "vast"] },
      MI300X: { low: 2.39, high: 2.39, n: 1, sources: ["runpod-secure"] },
    },
  });
  const curated = { lastRefreshed: "2026-06-27", models: [{ model: "H100", currentUsdPerHr: 2.79 }, { model: "GB200", currentUsdPerHr: 13 }] };

  it("uses the newest live snapshot and names providers once", () => {
    const input = gpuObservedInputFrom([snap("2026-09-29"), snap("2026-09-30"), { date: "2026-10-01", prices: { H100: 9 }, source: "curated" }], "2026-10-01", 2);
    assert.equal(input.observedOn, "2026-09-30", "curated rows are never observations");
    assert.deepEqual(input.models[0], { model: "H100", price: 2.87, listings: 3, providers: ["RunPod", "Vast.ai"] });
    assert.equal(input.models.some((m) => m.model === "MI300X"), false, "only the posted models");
  });

  it("serves the live card while the page would, and the curated card otherwise, never mixed", () => {
    const live = gpuCard([snap("2026-09-30")], curated, "2026-10-01", 2);
    assert.equal(live.asOf, "30 SEP 2026");
    assert.deepEqual(live.stats, [
      { label: "H100", value: "$2.87" },
      { label: "H200", value: "$3.94" },
    ]);
    assert.ok(!live.stats.some((s) => s.label === "GB200"), "no curated model on the live card");

    const stale = gpuCard([snap("2026-08-15")], curated, "2026-10-01", 2);
    assert.equal(stale.asOf, "27 JUN 2026", "the curated list's own date");
    assert.deepEqual(stale.stats, [{ label: "H100", value: "$2.79 est." }]);
    assert.match(stale.subtitle, /No live observation is recent enough/);
  });
});

describe("queue card and post", () => {
  it("reads LBNL's edition and date from the headline, and nothing else", () => {
    const h = { queueOverallGW: 2061, queueOverallProjects: 8244, queueOverallAsOf: "End of 2025 (LBNL Queued Up 2026)" };
    assert.deepEqual(queueInputFrom(h), { edition: "LBNL's Queued Up 2026", editionYear: 2026, gw: 2061, projects: 8244, asOf: "the end of 2025" });
    assert.equal(queueInputFrom({ ...h, queueOverallAsOf: "2025" }), null);
    assert.equal(queueInputFrom(null), null);
    const card = queueCard(h);
    assert.equal(card.asOf, "END OF 2025");
    assert.deepEqual(card.stats, [
      { label: "Waiting to connect", value: "2,061 GW" },
      { label: "Projects", value: "8,244" },
    ]);
    const blank = queueCard({ ...h, queueOverallAsOf: "soon" });
    assert.equal(blank.asOf, null);
    assert.deepEqual(blank.stats, []);
  });

  it("matches the shipped headline the queue page prints", () => {
    const h = data("interconnection-queue.json").headline;
    const q = queueInputFrom(h);
    assert.ok(q, "the shipped headline parses");
    assert.equal(q!.gw, h.queueOverallGW);
    assert.equal(q!.projects, h.queueOverallProjects);
  });
});

describe("change card and post", () => {
  const changes = data("change-log.json").changes as ChangeRecord[];

  it("takes the newest change with a short form, never a no-change record", () => {
    const checked: ChangeRecord = { ...changes[0], id: "2026-10-01-checked", kind: "checked-no-change", before: undefined, after: undefined, checked: "x", reviewed: "2026-10-01" };
    assert.equal(latestChange([checked, ...changes])?.id, "2026-09-29-nerc-reserve-margins");
    assert.equal(latestChange([]), null);
    assert.equal(changeInputFrom(null), null);
  });

  it("each shipped correction card shows its before, after, review date and source", () => {
    for (const c of changes) {
      const card = changeCard(c);
      assert.ok(card, c.id);
      assert.deepEqual(card!.stats, [
        { label: "Before", value: c.short!.before },
        { label: "Now", value: c.short!.after },
      ]);
      assert.ok(card!.asOf && /\d{1,2} [A-Z]{3} \d{4}/.test(card!.asOf), c.id);
      assert.ok(card!.source.startsWith(c.source), c.id);
    }
    const abilene = changeCard(changes.find((c) => c.id === "2026-09-28-stargate-abilene-rated-power")!)!;
    assert.equal(abilene.title, "Stargate Abilene's delivered power");
    assert.equal(abilene.asOf, "28 SEP 2026");
  });
});

describe("state card", () => {
  it("says what My Grid says for Maryland", () => {
    const card = stateCard("MD")!;
    const area = clientAreaForState("MD")!;
    assert.equal(card.title, "Maryland's grid");
    assert.deepEqual(card.stats, [
      { label: `Reserve margin, ${area.season}`, value: `${area.margin.toFixed(1)}%` },
      { label: "NERC reference", value: `${area.reference}%` },
      { label: "Versus reference", value: `+${clientCushion(area).toFixed(1)} pts` },
    ]);
    assert.equal(card.subtitle, "PJM Interconnection. NERC area PJM: elevated risk. Later years: High from 2029.");
    assert.equal(card.asOf, "JAN 2026");
    assert.match(card.source, /NERC 2025 Long-Term Reliability Assessment/);
  });

  it("carries My Grid's notes where a state spans areas, and says so where no area applies", () => {
    assert.match(stateCard("KY")!.subtitle, /About two-thirds of Kentucky's land is in PJM/);
    assert.match(stateCard("IL")!.subtitle, /Figures shown are PJM\./);
    const ak = stateCard("AK")!;
    assert.deepEqual(ak.stats, []);
    assert.match(ak.subtitle, /No NERC assessment area covers Alaska's grid\./);
    assert.equal(stateCard("ZZ"), null);
    assert.equal(stateCard("md"), null, "codes are uppercase; the route normalizes them");
  });

  it("prints the cushion with its sign", () => {
    // No shipped area is below its reference, so only the plus sign is exercised here.
    for (const code of ["MD", "TX", "MI", "NY", "CA"]) {
      const v = stateCard(code)!.stats[2]?.value ?? "";
      assert.match(v, /^[+-]\d+\.\d pts$/, code);
    }
  });
});
