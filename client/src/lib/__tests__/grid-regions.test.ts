/**
 * The nine grid regions the map teaches: seven market operators and the two
 * parts of the lower 48 with none. These lock the shapes file, the lookup
 * that says which region a point is in, the regions' plain descriptions and
 * the NERC areas each one's stress reading comes from.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { feature } from "topojson-client";
import { GRID_REGIONS, GRID_REGION_IDS, REGIONS_CHECKED, REGION_SLUG_ALIASES, gridRegion, type GridRegionId } from "../../data/grid-regions";
import { NERC_AREAS } from "../../data/nerc-reserve-margins";
import {
  dealRegion,
  pointInGeometry,
  regionAt,
  regionBounds,
  regionIdForSlug,
  regionNercAreas,
  regionRiskLevel,
  regionRiskText,
  regionShapes,
  regionStats,
  type RegionShape,
} from "../grid-regions";

const FILE = join(process.cwd(), "client", "public", "geo", "grid-regions.json");
const topology = JSON.parse(readFileSync(FILE, "utf-8"));
const collection = feature(topology, topology.objects.regions) as unknown as { features: Array<{ id?: string | number; geometry: unknown }> };
const shapes: RegionShape[] = regionShapes(collection);

describe("point in polygon", () => {
  const square = { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] };
  const two = { type: "MultiPolygon", coordinates: [square.coordinates, [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]]] };

  it("is inside the outline and outside its holes", () => {
    assert.equal(pointInGeometry(1, 1, square), true);
    assert.equal(pointInGeometry(5, 5, square), false, "the hole is not inside");
    assert.equal(pointInGeometry(11, 5, square), false);
    assert.equal(pointInGeometry(-1, 5, square), false);
  });

  it("checks every part of a multi-part shape", () => {
    assert.equal(pointInGeometry(25, 25, two), true);
    assert.equal(pointInGeometry(5, 5, two), false);
    assert.equal(pointInGeometry(15, 15, two), false);
  });

  it("answers false for a geometry that is not an area", () => {
    assert.equal(pointInGeometry(0, 0, { type: "Point", coordinates: [0, 0] }), false);
    assert.equal(pointInGeometry(0, 0, null), false);
  });
});

describe("the regions file", () => {
  it("holds exactly the nine regions, in a file small enough to load with the map", () => {
    assert.deepEqual(shapes.map((s) => s.id).sort(), [...GRID_REGION_IDS].sort());
    assert.equal(shapes.length, 9);
    assert.ok(statSync(FILE).size < 150 * 1024, `${statSync(FILE).size} bytes`);
  });

  it("places well-known cities in the operator that runs their grid", () => {
    const CITIES: Array<[string, number, number, GridRegionId]> = [
      ["Ashburn VA", 39.0438, -77.4874, "pjm"],
      ["Columbus OH", 39.9612, -82.9988, "pjm"],
      ["Pittsburgh PA", 40.4406, -79.9959, "pjm"],
      ["Chicago IL (ComEd is PJM, an island inside MISO)", 41.8781, -87.6298, "pjm"],
      ["Dallas TX", 32.7767, -96.797, "ercot"],
      ["Houston TX", 29.7604, -95.3698, "ercot"],
      ["Austin TX", 30.2672, -97.7431, "ercot"],
      ["Minneapolis MN", 44.9778, -93.265, "miso"],
      ["Indianapolis IN", 39.7684, -86.1581, "miso"],
      ["Detroit MI", 42.3314, -83.0458, "miso"],
      ["New Orleans LA", 29.9511, -90.0715, "miso"],
      ["Oklahoma City OK", 35.4676, -97.5164, "spp"],
      ["Omaha NE", 41.2565, -95.9345, "spp"],
      ["Wichita KS", 37.6872, -97.3301, "spp"],
      ["San Francisco CA", 37.7749, -122.4194, "caiso"],
      ["San Diego CA", 32.7157, -117.1611, "caiso"],
      ["New York NY", 40.7128, -74.006, "nyiso"],
      ["Albany NY", 42.6526, -73.7562, "nyiso"],
      ["Boston MA", 42.3601, -71.0589, "isone"],
      ["Hartford CT", 41.7658, -72.6734, "isone"],
      ["Atlanta GA", 33.749, -84.388, "southeast"],
      ["Miami FL", 25.7617, -80.1918, "southeast"],
      ["Charlotte NC", 35.2271, -80.8431, "southeast"],
      ["Nashville TN", 36.1627, -86.7816, "southeast"],
      ["Phoenix AZ", 33.4484, -112.074, "west"],
      ["Seattle WA", 47.6062, -122.3321, "west"],
      ["Denver CO", 39.7392, -104.9903, "west"],
      ["Salt Lake City UT", 40.7608, -111.891, "west"],
      ["Las Vegas NV", 36.1699, -115.1398, "west"],
      ["El Paso TX (on the western grid)", 31.7619, -106.485, "west"],
    ];
    for (const [name, lat, lng, want] of CITIES) assert.equal(regionAt(shapes, lat, lng), want, name);
  });

  it("answers null outside the lower 48", () => {
    assert.equal(regionAt(shapes, 61.2181, -149.9003), null, "Anchorage");
    assert.equal(regionAt(shapes, 21.3069, -157.8583), null, "Honolulu");
    assert.equal(regionAt(shapes, 45.5019, -73.5674), null, "Montreal");
    assert.equal(regionAt(shapes, 30, -60), null, "the Atlantic");
  });

  it("gives each region bounds the map can fly to, inside the lower 48", () => {
    for (const s of shapes) {
      const [[south, west], [north, east]] = regionBounds(s);
      assert.ok(south < north && west < east, s.id);
      assert.ok(south >= 24 && north <= 49.5 && west >= -125 && east <= -66.5, `${s.id}: ${south},${west} to ${north},${east}`);
    }
    const [[, ercotWest], [, ercotEast]] = regionBounds(shapes.find((s) => s.id === "ercot")!);
    assert.ok(ercotWest > -107 && ercotEast < -93, "ERCOT's box is Texas");
  });
});

describe("the regions, as described", () => {
  it("are seven market operators and two areas without one, in a fixed order", () => {
    assert.deepEqual(GRID_REGIONS.map((r) => `${r.id}:${r.name}:${r.kind}`), [
      "pjm:PJM:market",
      "ercot:ERCOT:market",
      "miso:MISO:market",
      "spp:SPP:market",
      "caiso:CAISO:market",
      "nyiso:NYISO:market",
      "isone:ISO-NE:market",
      "southeast:Southeast:no-market",
      "west:West:no-market",
    ]);
    assert.equal(gridRegion("isone").fullName, "ISO New England");
    assert.match(REGIONS_CHECKED, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("say what each is in plain words, with no dated figure that would go stale", () => {
    for (const r of GRID_REGIONS) {
      assert.ok(r.description.length > 60 && r.description.length < 330, `${r.id}: ${r.description.length} characters`);
      assert.ok(!/\d+(\.\d+)?\s?(%|GW|MW|million|percent)/i.test(r.description), `${r.id} carries a figure`);
      assert.ok(!r.description.includes("—"), `${r.id} has an em dash`);
      assert.match(r.about.url, /^https:\/\//, r.id);
      assert.ok(r.states.length > 3, r.id);
    }
    for (const r of GRID_REGIONS.filter((x) => x.kind === "no-market")) {
      assert.match(r.description, /no regional market operator/, r.id);
    }
  });

  it("put each label inside its own region", () => {
    for (const r of GRID_REGIONS) assert.equal(regionAt(shapes, r.labelAt[0], r.labelAt[1]), r.id, r.id);
  });

  it("read the live feed under distinct keys", () => {
    assert.deepEqual(GRID_REGIONS.map((r) => r.liveKey), ["PJM", "ERCOT", "MISO", "SPP", "CAISO", "NYISO", "ISO-NE", "SOUTHEAST", "WEST"]);
  });
});

describe("stress: the NERC areas behind each region", () => {
  it("cover every NERC assessment area exactly once", () => {
    const used = GRID_REGIONS.flatMap((r) => r.nercAreas);
    assert.deepEqual([...used].sort(), Object.keys(NERC_AREAS).sort());
    assert.equal(new Set(used).size, used.length);
  });

  it("give one level where the areas agree and say which differ where they do not", () => {
    assert.equal(regionRiskLevel("pjm"), "Elevated");
    assert.equal(regionRiskLevel("miso"), "Normal");
    assert.equal(regionRiskLevel("caiso"), "Normal");
    assert.equal(regionRiskLevel("southeast"), "Normal");
    assert.equal(regionRiskLevel("west"), "mixed");
    assert.equal(regionRiskText("pjm"), "Elevated");
    assert.equal(regionRiskText("southeast"), "Normal in all 4 areas");
    assert.equal(regionRiskText("west"), "Elevated in WECC-Basin; Normal elsewhere");
    assert.deepEqual(regionNercAreas("isone").map((a) => a.key), ["NPCC-New England"]);
    assert.equal(regionNercAreas("west").length, 4);
  });
});

describe("old addresses and deal rows", () => {
  it("resolve a region page slug, forwarding the retired NERC-style ones", () => {
    assert.equal(regionIdForSlug("pjm"), "pjm");
    assert.equal(regionIdForSlug("isone"), "isone");
    assert.equal(regionIdForSlug("serc"), "southeast");
    assert.equal(regionIdForSlug("wecc"), "west");
    assert.equal(regionIdForSlug("npcc"), null, "NPCC is two operators; it has no single page to forward to");
    assert.equal(regionIdForSlug("nope"), null);
    assert.deepEqual(REGION_SLUG_ALIASES, { serc: "southeast", wecc: "west" });
  });

  it("file a power agreement under a region only when its row names one", () => {
    assert.equal(dealRegion("PJM"), "pjm");
    assert.equal(dealRegion("ERCOT"), "ercot");
    assert.equal(dealRegion("CAISO"), "caiso");
    assert.equal(dealRegion("SERC"), "southeast");
    assert.equal(dealRegion("WECC"), "west");
    assert.equal(dealRegion("Non-ISO West"), "west");
    assert.equal(dealRegion("NYISO"), "nyiso");
    assert.equal(dealRegion("ISO-NE"), "isone");
    for (const vague of ["Multi", "Undisclosed", "TBD", "", null, undefined]) assert.equal(dealRegion(vague), null, String(vague));
  });
});

describe("what is in a region", () => {
  const stats = regionStats(shapes, {
    campuses: [
      { lat: 39.0438, lng: -77.4874, powerMW: 900, status: "operational" },
      { lat: 39.9612, lng: -82.9988, powerMW: 300, status: "construction" },
      { lat: 40.4406, lng: -79.9959, powerMW: 600, status: "announced" },
      { lat: 32.7767, lng: -96.797, powerMW: 1200, status: "construction" },
    ],
    sites: [{ lat: 39.05, lng: -77.48 }, { lat: 39.06, lng: -77.47 }, { lat: 61.2, lng: -149.9 }],
    clusters: [{ lat: 30.2672, lng: -97.7431, plannedPowerMW: 1000 }, { lat: 29.76, lng: -95.37, plannedPowerMW: 0 }],
    plants: [
      { lat: 33.3881, lng: -112.8617, mw: 4209.6, fuel: "NUC" },
      { lat: 33.4, lng: -112.0, mw: 500, fuel: "NG" },
      { lat: 33.5, lng: -112.2, mw: 300, fuel: "NG" },
    ],
  });

  it("counts every campus but sums megawatts only for built or building campuses of 400 MW and up", () => {
    // Same definition as the site's tracked-power gauge, so the regions add up to it.
    assert.deepEqual(stats.pjm.campuses, { count: 3, count400: 2, builtMw400: 900 });
    assert.deepEqual(stats.ercot.campuses, { count: 1, count400: 1, builtMw400: 1200 });
    assert.deepEqual(stats.miso.campuses, { count: 0, count400: 0, builtMw400: 0 });
  });

  it("counts mapped sites, never megawatts, and leaves out a point in no region", () => {
    assert.equal(stats.pjm.sites, 2);
    assert.equal(Object.values(stats).reduce((n, s) => n + s.sites, 0), 2);
    assert.equal("mw" in (stats.pjm as unknown as Record<string, unknown>), false);
  });

  it("sums cluster and plant megawatts by region, plants by fuel", () => {
    assert.deepEqual(stats.ercot.clusters, { count: 2, plannedMw: 1000 });
    assert.deepEqual(stats.west.plants, { count: 3, mw: 5009.6, byFuel: { NUC: 1, NG: 2 } });
    assert.deepEqual(stats.pjm.plants, { count: 0, mw: 0, byFuel: {} });
  });
});
