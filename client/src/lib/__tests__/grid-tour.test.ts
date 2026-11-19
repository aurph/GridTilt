/**
 * The "How the grid works" tour: a handful of stops with two short sentences
 * each. A stop states only what the site already sources, so a figure appears
 * in a caption only when the data behind it was handed in; without it the
 * caption still reads, with no number.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GRID_REGIONS, GRID_REGION_IDS } from "../../data/grid-regions";
import { MAP_LAYERS } from "../map-layers";
import { buildTourSteps, tourFacts, type TourFacts } from "../grid-tour";

const FULL: TourFacts = {
  elevated: [
    { id: "pjm", name: "PJM" },
    { id: "ercot", name: "ERCOT" },
    { id: "spp", name: "SPP" },
    { id: "nyiso", name: "NYISO" },
  ],
  nercSource: "NERC 2025 LTRA (2026-01)",
  sites: { count: 1191, version: "v2026.11.02" },
  campuses: 55,
  topSiteRegion: { id: "pjm", name: "PJM", count: 402 },
  queue: { gw: 2061, asOf: "End of 2025 (LBNL Queued Up 2026)" },
};
const BARE: TourFacts = { elevated: [], nercSource: "NERC 2025 LTRA (2026-01)", sites: null, campuses: null, topSiteRegion: null, queue: null };

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter(Boolean).length;

describe("the tour", () => {
  const steps = buildTourSteps(FULL);

  it("is five to seven stops, each with a title, a source and at most two short sentences", () => {
    assert.ok(steps.length >= 5 && steps.length <= 7, String(steps.length));
    assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
    for (const s of steps) {
      assert.ok(s.title.length > 3 && s.title.length <= 34, s.title);
      assert.ok(sentences(s.caption) <= 2, `${s.id}: ${s.caption}`);
      assert.ok(s.caption.length <= 230, `${s.id} is ${s.caption.length} characters`);
      assert.ok(!s.caption.includes("\u2014") && !s.title.includes("\u2014"), `${s.id} has an em dash`);
      assert.ok(s.source.length > 3, s.id);
    }
  });

  it("covers the ideas in order: three grids, market operators, no market, stress, data centers, the queue", () => {
    assert.deepEqual(steps.map((s) => s.id), ["interconnections", "operators", "no-market", "stress", "data-centers", "queue"]);
  });

  it("only points at regions and layers that exist", () => {
    for (const s of steps) {
      for (const id of s.spotlight ?? []) assert.ok((GRID_REGION_IDS as readonly string[]).includes(id), `${s.id}: ${id}`);
      for (const l of s.layers) assert.ok((MAP_LAYERS as readonly string[]).includes(l), `${s.id}: ${l}`);
      assert.ok(s.focus === "all" || (GRID_REGION_IDS as readonly string[]).includes(s.focus), s.id);
      assert.ok(s.layers.includes("regions"), `${s.id} teaches with the regions drawn`);
    }
    assert.deepEqual(steps.find((s) => s.id === "operators")?.spotlight, ["pjm", "ercot", "miso", "spp", "caiso", "nyiso", "isone"]);
    assert.deepEqual(steps.find((s) => s.id === "no-market")?.spotlight, ["southeast", "west"]);
    assert.equal(steps.find((s) => s.id === "stress")?.stress, true);
    assert.ok(steps.filter((s) => s.id !== "stress").every((s) => s.stress === false));
  });

  it("draws the first stop as the three grids: every region is in exactly one, and Texas is ERCOT alone", () => {
    const groups = steps[0].groups;
    assert.ok(groups, "the first stop carries its three grids");
    assert.deepEqual(groups.map((g) => g.label), ["Western", "Eastern", "Texas"]);
    const all = groups.flatMap((g) => g.regions);
    assert.equal(new Set(all).size, all.length, "no region is in two grids");
    assert.deepEqual([...all].sort(), [...GRID_REGION_IDS].sort());
    assert.deepEqual(groups.find((g) => g.label === "Texas")?.regions, ["ercot"]);
    assert.deepEqual(groups.find((g) => g.label === "Western")?.regions, ["caiso", "west"]);
    assert.equal(new Set(groups.map((g) => g.color)).size, 3, "three grids, three colors");
    // Each name is drawn inside the lower 48.
    for (const g of groups) assert.ok(g.at[0] > 25 && g.at[0] < 49 && g.at[1] > -124 && g.at[1] < -67, g.label);
    assert.ok(steps.slice(1).every((s) => !s.groups), "only the first stop regroups the regions");
  });

  it("files every region under the interconnection it belongs to", () => {
    const by = Object.fromEntries(GRID_REGIONS.map((r) => [r.id, r.interconnection]));
    assert.deepEqual(by, {
      pjm: "Eastern",
      ercot: "Texas",
      miso: "Eastern",
      spp: "Eastern",
      caiso: "Western",
      nyiso: "Eastern",
      isone: "Eastern",
      southeast: "Eastern",
      west: "Western",
    });
  });

  it("names what NERC rates elevated, from the table, and where the sites are densest", () => {
    const stress = steps.find((s) => s.id === "stress")!;
    assert.match(stress.caption, /NERC rates PJM, ERCOT, SPP and NYISO elevated for 2026\./);
    assert.deepEqual(stress.spotlight, ["pjm", "ercot", "spp", "nyiso"]);
    assert.equal(stress.source, "NERC 2025 LTRA (2026-01)");
    const dc = steps.find((s) => s.id === "data-centers")!;
    assert.match(dc.caption, /1,191 mapped data center sites and 55 tracked campuses/);
    assert.match(dc.caption, /PJM holds the most sites, 402\./);
    assert.equal(dc.focus, "pjm");
    assert.match(dc.source, /v2026\.11\.02/);
    assert.match(dc.source, /OpenStreetMap contributors/);
    const queue = steps.find((s) => s.id === "queue")!;
    assert.match(queue.caption, /2,061 GW/);
    assert.match(queue.source, /End of 2025/);
  });

  it("states no figure it was not given", () => {
    const bare = buildTourSteps(BARE);
    assert.equal(bare.length, steps.length);
    for (const s of bare) {
      if (s.id === "operators") continue; // "Seven operators" is the count of the site's own region list
      // "lower 48" is a name and 2026 is the year NERC's ratings are for; neither is a figure.
      assert.ok(!/\d/.test(s.caption.replace(/2026|lower 48/g, "")), `${s.id} carries a number with no data behind it: ${s.caption}`);
    }
    assert.match(bare.find((s) => s.id === "stress")!.caption, /NERC rates no region elevated for 2026\./);
    assert.equal(bare.find((s) => s.id === "data-centers")!.focus, "all");
  });
});

describe("tour facts", () => {
  it("reads the elevated regions from the NERC table in the site's region order, leaving out mixed ones", () => {
    const facts = tourFacts({});
    assert.deepEqual(facts.elevated.map((r) => r.id), ["pjm", "ercot", "spp", "nyiso"]);
    assert.match(facts.nercSource, /NERC 2025 LTRA/);
    assert.equal(facts.sites, null);
    assert.equal(facts.topSiteRegion, null);
  });

  it("picks the region with the most mapped sites, and nothing when no sites are loaded", () => {
    const stats = Object.fromEntries(GRID_REGION_IDS.map((id) => [id, { sites: id === "ercot" ? 129 : id === "pjm" ? 402 : 3 }]));
    const facts = tourFacts({ siteCount: 1191, sitesVersion: "v2026.11.02", campusCount: 55, siteCounts: stats as never, queue: { gw: 2061, asOf: "End of 2025" } });
    assert.deepEqual(facts.topSiteRegion, { id: "pjm", name: "PJM", count: 402 });
    assert.deepEqual(facts.sites, { count: 1191, version: "v2026.11.02" });
    assert.equal(facts.campuses, 55);
    assert.deepEqual(facts.queue, { gw: 2061, asOf: "End of 2025" });
  });
});
