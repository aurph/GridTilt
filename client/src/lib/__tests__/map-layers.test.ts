/**
 * The map's layers: which draw, how that round-trips in the address bar, and
 * what the overlay says it is counting. Old `?view=` and `?rtos=` links were
 * shared before the layers existed, so they have to land somewhere sensible.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LAYERS,
  MAP_LAYERS,
  layerSummary,
  mapViewQuery,
  parseMapView,
  plantRadius,
  zoomScale,
  toggleLayer,
  trackedHeadline,
  type MapView,
} from "../map-layers";

const view = (v: Partial<MapView> = {}): MapView => ({ layers: [...DEFAULT_LAYERS], stress: false, region: null, ...v });

describe("layers in the address bar", () => {
  it("draws every layer by default", () => {
    assert.deepEqual(MAP_LAYERS, ["campuses", "sites", "clusters", "plants", "regions"]);
    assert.deepEqual(parseMapView(""), view());
    assert.deepEqual(parseMapView("?tab=map&companies=Meta"), view(), "other parameters are not layers");
  });

  it("reads a layer list in its canonical order, dropping unknown names and repeats", () => {
    assert.deepEqual(parseMapView("?layers=plants,campuses,nope,plants").layers, ["campuses", "plants"]);
    assert.deepEqual(parseMapView("layers=regions").layers, ["regions"]);
    assert.deepEqual(parseMapView("?layers=none").layers, []);
    assert.deepEqual(parseMapView("?layers=").layers, []);
  });

  it("reads the stress coloring and a selected region", () => {
    assert.equal(parseMapView("?stress=1").stress, true);
    assert.equal(parseMapView("?stress=0").stress, false);
    assert.equal(parseMapView("?region=ercot").region, "ercot");
    assert.equal(parseMapView("?region=serc").region, "southeast", "a retired region name forwards");
    assert.equal(parseMapView("?region=mars").region, null);
  });

  it("writes nothing for the default view and only what differs otherwise", () => {
    assert.equal(mapViewQuery(view()), "");
    assert.equal(mapViewQuery(view({ layers: ["campuses", "sites"] })), "layers=campuses%2Csites");
    assert.equal(mapViewQuery(view({ layers: [] })), "layers=none");
    assert.equal(mapViewQuery(view({ stress: true, region: "pjm" })), "stress=1&region=pjm");
  });

  it("round-trips", () => {
    for (const v of [view(), view({ layers: ["sites", "regions"], stress: true }), view({ layers: [], region: "west" }), view({ region: "isone" })]) {
      assert.deepEqual(parseMapView(`?${mapViewQuery(v)}`), v);
    }
  });
});

describe("links shared before the layers existed", () => {
  it("map the old views onto the nearest layer set", () => {
    assert.deepEqual(parseMapView("?view=dc"), view(), "DC Locations was the default view");
    assert.deepEqual(parseMapView("?view=clusters"), view({ layers: ["clusters", "regions"] }));
    assert.deepEqual(parseMapView("?view=stress"), view({ stress: true }), "NERC Risk is now a coloring of the regions");
    assert.deepEqual(parseMapView("?view=nonsense"), view());
  });

  it("let an explicit layer list win over an old view", () => {
    assert.deepEqual(parseMapView("?view=clusters&layers=plants").layers, ["plants"]);
  });

  it("turn a single old region filter into a selected region", () => {
    assert.equal(parseMapView("?rtos=PJM").region, "pjm");
    assert.equal(parseMapView("?rtos=SERC").region, "southeast");
    assert.equal(parseMapView("?rtos=WECC").region, "west");
    assert.equal(parseMapView("?rtos=NPCC").region, null, "NPCC is two regions now");
    assert.equal(parseMapView("?rtos=PJM,MISO").region, null, "several at once has no single region");
    assert.equal(parseMapView("?rtos=PJM&region=ercot").region, "ercot", "the new parameter wins");
  });
});

describe("toggling", () => {
  it("adds and removes a layer, keeping the canonical order", () => {
    assert.deepEqual(toggleLayer(["campuses", "plants"], "sites"), ["campuses", "sites", "plants"]);
    assert.deepEqual(toggleLayer(["campuses", "sites"], "campuses"), ["sites"]);
    assert.deepEqual(toggleLayer([], "regions"), ["regions"]);
  });
});

describe("what the overlay says it is counting", () => {
  const counts = { sites: 1191, campuses: 55, clusters: 241, plants: 1321 };

  it("names each visible layer with its count, in the order they are drawn", () => {
    assert.deepEqual(layerSummary(counts, [...DEFAULT_LAYERS]), [
      "1,191 data center sites",
      "55 tracked campuses",
      "241 AI clusters",
      "1,321 power plants",
    ]);
  });

  it("follows the toggles and leaves out a layer that has not loaded", () => {
    assert.deepEqual(layerSummary(counts, ["campuses", "regions"]), ["55 tracked campuses"]);
    assert.deepEqual(layerSummary({ campuses: 55 }, [...DEFAULT_LAYERS]), ["55 tracked campuses"]);
    assert.deepEqual(layerSummary(counts, []), []);
    assert.deepEqual(layerSummary({ sites: 1, campuses: 1, clusters: 1, plants: 1 }, [...DEFAULT_LAYERS]), [
      "1 data center site",
      "1 tracked campus",
      "1 AI cluster",
      "1 power plant",
    ]);
  });

  it("keeps megawatts to campuses of 400 MW and up that are built or building, and never adds sites", () => {
    const campuses = [
      { powerMW: 900, status: "operational" },
      { powerMW: 600, status: "construction" },
      { powerMW: 1500, status: "announced" },
      { powerMW: 300, status: "operational" },
    ];
    assert.deepEqual(trackedHeadline(campuses), { gw: "1.5", count400: 3, countAll: 4, announcedGw: "1.5" });
    assert.deepEqual(trackedHeadline([]), { gw: "0.0", count400: 0, countAll: 0, announcedGw: "0.0" });
  });
});

describe("marker sizes", () => {
  it("grow gently with a plant's megawatts, so plants never swamp data centers", () => {
    assert.ok(Math.abs(plantRadius(250) - 2.35) < 0.01);
    assert.ok(Math.abs(plantRadius(1000) - 3.1) < 0.001);
    assert.ok(plantRadius(6809) < 5.6, "the largest plant in the country stays a small mark");
    assert.equal(plantRadius(-5), 1.6);
    assert.ok(plantRadius(4000) > plantRadius(1000));
  });

  it("scale up in steps as the map zooms in, never down", () => {
    assert.equal(zoomScale(3), 1);
    assert.equal(zoomScale(4.9), 1);
    const steps = [3, 5, 6, 7.5, 9, 12].map(zoomScale);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i] >= steps[i - 1], String(steps));
    assert.ok(zoomScale(12) <= 2.2);
  });
});
