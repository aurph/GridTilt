// Mapped data center sites: small, location-only dots from PNNL's IM3 Open
// Source Data Center Atlas (built from OpenStreetMap, ODbL). These lock the
// rules that turn the atlas's features into sites: one dot per site, never a
// second dot for a campus GridTilt already tracks, and no megawatts, operator
// or status that the source does not carry.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSitesFile,
  collapseSites,
  dropTrackedCampusSites,
  haversineKm,
  namesCompany,
  parseAtlasFeatures,
  sitesPayload,
  validateSitesFile,
  type AtlasFeature,
  type DcSite,
  type TrackedCampus,
} from "../dc-sites";

const feat = (v: Partial<AtlasFeature>): AtlasFeature => ({
  lat: 39.0, lng: -77.5, name: null, operator: null, state: "VA", kind: "building", sqft: 100_000, ...v,
});
/** Degrees of latitude for a distance in metres (close enough for fixtures). */
const m = (metres: number) => metres / 111_195;

describe("reading the atlas", () => {
  const geojson = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [-77.0291491, 38.9028879] }, properties: { state_abb: "DC", operator: " CoreSite ", name: "CoreSite DC1", sqft: null, type: "point" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [-99.78, 32.5] }, properties: { state_abb: "TX", operator: null, name: "", sqft: 104544, type: "building" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [-99.78, 32.5] }, properties: { state_abb: "TX", operator: "nan", name: "None", sqft: "104544", type: "campus" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [2.35, 48.85] }, properties: { state_abb: "FR", operator: "x", name: "Paris", type: "point" } },
      { type: "Feature", geometry: { type: "Point", coordinates: [-66.1, 18.4] }, properties: { state_abb: "PR", operator: "x", name: "San Juan", type: "point" } },
      { type: "Feature", geometry: null, properties: { state_abb: "TX", type: "point" } },
      { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: { state_abb: "TX", type: "building" } },
    ],
  };
  const { features, skipped } = parseAtlasFeatures(geojson);

  it("keeps a point's place, trims its text and treats blank or placeholder text as absent", () => {
    assert.deepEqual(features, [
      { lat: 38.9028879, lng: -77.0291491, name: "CoreSite DC1", operator: "CoreSite", state: "DC", kind: "point", sqft: null },
      { lat: 32.5, lng: -99.78, name: null, operator: null, state: "TX", kind: "building", sqft: 104544 },
      { lat: 32.5, lng: -99.78, name: null, operator: null, state: "TX", kind: "campus", sqft: 104544 },
    ]);
  });

  it("drops what is not a point in a US state or DC, and counts it", () => {
    assert.deepEqual(skipped, { badGeometry: 2, outsideUs: 2 });
  });

  it("refuses something that is not a feature collection", () => {
    assert.throws(() => parseAtlasFeatures({ type: "Topology" }), /FeatureCollection/);
  });
});

describe("distance", () => {
  it("measures a degree of latitude as about 111 km and two points in Loudoun County as about 6.6 km", () => {
    assert.ok(Math.abs(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111.2) < 0.2);
    const d = haversineKm({ lat: 39.0438, lng: -77.4874 }, { lat: 39.0062, lng: -77.4286 });
    assert.ok(d > 6 && d < 7, String(d));
  });
});

describe("one dot per site", () => {
  it("folds features of the same operator or the same name within 200 m into one site", () => {
    const sites = collapseSites([
      feat({ operator: "Equinix", name: "DC1", lat: 39.0 }),
      feat({ operator: "Equinix", name: "DC2", lat: 39.0 + m(150) }),
      feat({ operator: null, name: "DC2", lat: 39.0 + m(250) }),
    ]);
    assert.equal(sites.length, 1);
    assert.equal(sites[0].n, 3);
    assert.equal(sites[0].operator, "Equinix");
    assert.equal(sites[0].name, "DC2", "the name most features carry");
    assert.equal(sites[0].lat, Number((39.0 + m(400) / 3).toFixed(5)), "the site sits at the mean of its features");
  });

  it("keeps different operators apart, however close, and the same operator apart beyond 200 m", () => {
    const sites = collapseSites([
      feat({ operator: "Equinix", lat: 39.0 }),
      feat({ operator: "Digital Realty", lat: 39.0 + m(40) }),
      feat({ operator: "Equinix", lat: 39.0 + m(260) }),
    ]);
    assert.equal(sites.length, 3);
    assert.ok(sites.every((s) => s.n === undefined), "a single feature carries no count");
  });

  it("compares operators and names without case, spacing or punctuation", () => {
    const sites = collapseSites([
      feat({ operator: "Digital Realty" }),
      feat({ operator: "digital-realty", lat: 39.0 + m(100) }),
    ]);
    assert.equal(sites.length, 1);
  });

  it("folds untagged neighbours together but never uses one to bridge two operators", () => {
    const sites = collapseSites([
      feat({ operator: "Equinix", lat: 39.0 }),
      feat({ lat: 39.0 + m(120) }),
      feat({ lat: 39.0 + m(240) }),
      feat({ operator: "CyrusOne", lat: 39.0 + m(360) }),
    ]);
    assert.deepEqual(
      sites.map((s) => [s.operator ?? null, s.n ?? 1]).sort(),
      [["CyrusOne", 1], ["Equinix", 1], [null, 2]].sort(),
    );
  });

  it("treats a campus outline and the untagged or same-operator buildings inside it as one site", () => {
    // A 1,000,000 m2 campus has an equivalent radius of about 564 m.
    const campus = feat({ kind: "campus", operator: "Meta", name: "Prineville Data Center", sqft: 10_763_910, lat: 44.29 });
    const sites = collapseSites([
      campus,
      feat({ lat: 44.29 + m(300), state: "OR" }),
      feat({ operator: "Meta", lat: 44.29 + m(450), state: "OR" }),
      feat({ operator: "Apple", lat: 44.29 + m(350), state: "OR" }),
      feat({ lat: 44.29 + m(900), state: "OR" }),
    ]);
    assert.deepEqual(
      sites.map((s) => [s.operator ?? null, s.n ?? 1]).sort(),
      [["Apple", 1], ["Meta", 3], [null, 1]].sort(),
    );
    assert.equal(sites.find((s) => s.operator === "Meta")?.name, "Prineville Data Center");
  });

  it("gives every site a stable id from its place, and distinct ids to two sites at one place", () => {
    const sites = collapseSites([
      feat({ operator: "Equinix", lat: 38.9028879, lng: -77.0291491 }),
      feat({ operator: "CoreSite", lat: 38.9028879, lng: -77.0291491 }),
    ]);
    assert.deepEqual(sites.map((s) => s.id).sort(), ["s38.90289_-77.02915", "s38.90289_-77.02915-2"]);
    assert.deepEqual(collapseSites([feat({ operator: "Equinix", lat: 38.9028879, lng: -77.0291491 })])[0], {
      id: "s38.90289_-77.02915",
      lat: 38.90289,
      lng: -77.02915,
      state: "VA",
      operator: "Equinix",
    });
  });

  it("returns the same sites in the same order whatever order the features arrive in", () => {
    const fs = [
      feat({ operator: "A", lat: 40.1 }),
      feat({ operator: "B", lat: 41.2, lng: -80 }),
      feat({ lat: 35.5, lng: -100 }),
      feat({ operator: "A", lat: 40.1 + m(50) }),
    ];
    assert.deepEqual(collapseSites(fs), collapseSites([...fs].reverse()));
  });
});

describe("a tracked campus never shows twice", () => {
  const campus = (v: Partial<TrackedCampus>): TrackedCampus => ({
    id: 1, name: "Meta Prineville OR Campus", company: "Meta", lat: 44.301, lng: -120.8347, status: "operational", ...v,
  });
  const site = (v: Partial<DcSite>): DcSite => ({ id: `s${v.lat}_${v.lng}`, lat: 44.29, lng: -120.88, state: "OR", ...v });

  it("matches a company by whole word, in the operator or the name", () => {
    assert.ok(namesCompany("Meta", "Meta Platforms", null));
    assert.ok(namesCompany("Meta", null, "Facebook Prineville"));
    assert.ok(!namesCompany("Meta", "Metadata Hosting", "MetaCenter"), "a word that merely starts with the name is not the company");
    assert.ok(namesCompany("Amazon", "Amazon Web Services", null));
    assert.ok(namesCompany("Amazon", null, "AWS IAD-77"));
    assert.ok(namesCompany("xAI", "xAI", null));
    assert.ok(namesCompany("OpenAI", "Crusoe", "Stargate Abilene"));
    assert.ok(!namesCompany("Google", "Equinix", "DC2"));
    assert.ok(!namesCompany("Some New Co", null, null));
    assert.ok(namesCompany("Some New Co", "some new co", null), "an unlisted company matches on its own name");
  });

  it("matches the host's buildings when the tracked campus is capacity inside a host's campus", () => {
    // "Amazon QTS Atlanta" is Amazon capacity in QTS's Atlanta campus.
    assert.ok(namesCompany("Amazon", "Quality Technology Services", "QTS Atlanta Data Center 1", "Amazon QTS Atlanta"));
    assert.ok(!namesCompany("Amazon", "Quality Technology Services", "QTS Atlanta Data Center 1", "AWS Ashburn HQ Complex"));
    assert.ok(!namesCompany("Amazon", "Quality Technology Services", "QTS Atlanta Data Center 1"));
  });

  it("leaves out a site of the same company within 10 km, keeps it beyond, and keeps other companies", () => {
    const sites = [
      site({ operator: "Meta", lat: 44.29, lng: -120.887 }),
      site({ operator: "Apple", lat: 44.292, lng: -120.9 }),
      site({ operator: "Meta", lat: 44.45, lng: -120.83 }),
    ];
    const { kept, dropped } = dropTrackedCampusSites(sites, [campus({})]);
    assert.deepEqual(kept.map((s) => s.operator), ["Apple", "Meta"]);
    assert.deepEqual(dropped, [{ campusId: 1, campus: "Meta Prineville OR Campus", named: 1, untagged: 0 }]);
  });

  it("leaves out untagged sites within 6 km of a built campus only when no other company is that close", () => {
    const untagged = [site({ lat: 32.5, lng: -99.785 }), site({ lat: 32.51, lng: -99.79 })];
    const abilene = campus({ id: 18, name: "Stargate Abilene", company: "OpenAI", lat: 32.5029, lng: -99.7834, status: "construction" });
    assert.equal(dropTrackedCampusSites(untagged, [abilene]).kept.length, 0);
    assert.deepEqual(dropTrackedCampusSites(untagged, [abilene]).dropped, [{ campusId: 18, campus: "Stargate Abilene", named: 0, untagged: 2 }]);

    // A colocation building in the same radius means the untagged ones could be anyone's.
    const withNeighbour = [...untagged, site({ operator: "Equinix", lat: 32.49, lng: -99.77 })];
    assert.equal(dropTrackedCampusSites(withNeighbour, [abilene]).kept.length, 3);

    // 7 km away is beyond the untagged radius.
    assert.equal(dropTrackedCampusSites([site({ lat: 32.566, lng: -99.7834 })], [abilene]).kept.length, 1);
  });

  it("never drops untagged sites for a campus that is only announced", () => {
    const announced = campus({ id: 23, name: "Google Clarksville TN", company: "Google", lat: 36.5298, lng: -87.3595, status: "announced" });
    assert.equal(dropTrackedCampusSites([site({ lat: 36.53, lng: -87.36 })], [announced]).kept.length, 1);
    assert.equal(dropTrackedCampusSites([site({ operator: "Google", lat: 36.53, lng: -87.36 })], [announced]).kept.length, 0);
  });

  it("counts a site once, for the nearest campus that claims it", () => {
    const near = campus({ id: 29, name: "Amazon Sterling VA Campus", company: "Amazon", lat: 38.97, lng: -77.39 });
    const far = campus({ id: 11, name: "AWS Ashburn HQ Complex", company: "Amazon", lat: 39.09, lng: -77.52 });
    const { kept, dropped } = dropTrackedCampusSites([site({ operator: "Amazon Web Services", lat: 38.99, lng: -77.41 })], [far, near]);
    assert.equal(kept.length, 0);
    assert.deepEqual(dropped, [{ campusId: 29, campus: "Amazon Sterling VA Campus", named: 1, untagged: 0 }]);
  });
});

describe("the sites file", () => {
  const sites = collapseSites([feat({ operator: "Equinix", name: "DC1" }), feat({ lat: 21.3, lng: -157.9, state: "HI" })]);
  const file = buildSitesFile({
    retrieved: "2026-11-18",
    sourceFeatures: 3,
    skipped: { badGeometry: 0, outsideUs: 1 },
    sites,
    trackedAtIngest: { campuses: 55, sitesLeftOut: 0 },
    atlas: {
      version: "v2026.11.02",
      published: "2026-11-02",
      doi: "10.57931/17054299",
      retrievedFrom: "https://raw.githubusercontent.com/IMMM-SFA/datacenter-atlas/fe4d8420/static/im3_datacenter_centroids.geojson",
    },
  });

  it("names the atlas, its version, DOI and license, and credits OpenStreetMap", () => {
    assert.equal(file.dataset, "datacenter-sites");
    assert.equal(file.source.name, "IM3 Open Source Data Center Atlas");
    assert.equal(file.source.publisher, "Pacific Northwest National Laboratory");
    assert.equal(file.source.version, "v2026.11.02");
    assert.equal(file.source.url, "https://doi.org/10.57931/17054299");
    assert.match(file.license.name, /ODbL/);
    assert.equal(file.license.url, "https://opendatacommons.org/licenses/odbl/1-0/");
    assert.match(file.attribution, /OpenStreetMap contributors/);
    assert.match(file.attribution, /IM3 Open Source Data Center Atlas v2026\.11\.02/);
  });

  it("says in its method that a site is a location only", () => {
    assert.ok(file.method.some((line) => /location only/i.test(line)));
    assert.ok(file.method.every((line) => !line.includes("\u2014")), "no em dashes");
  });

  it("counts sites, the lower 48, and how many carry an operator or a name", () => {
    assert.deepEqual(file.counts, {
      sourceFeatures: 3,
      outsideUs: 1,
      badGeometry: 0,
      sites: 2,
      lower48: 1,
      withOperator: 1,
      withName: 1,
      trackedAtIngest: { campuses: 55, sitesLeftOut: 0 },
    });
  });

  it("validates, and says what is wrong with a file that does not", () => {
    assert.equal(validateSitesFile(JSON.parse(JSON.stringify(file))).sites.length, 2);
    const bad = JSON.parse(JSON.stringify(file));
    bad.sites.push({ ...bad.sites[0] });
    bad.sites.push({ id: "x", lat: 10, lng: 10, state: "VA", mw: 400 });
    assert.throws(() => validateSitesFile(bad), /duplicate[\s\S]*outside the United States[\s\S]*mw|mw[\s\S]*duplicate/i);
    assert.throws(() => validateSitesFile({ ...file, license: { name: "CC0", url: "https://x" } }), /ODbL/);
    assert.throws(() => validateSitesFile({ ...file, attribution: "PNNL" }), /OpenStreetMap/);
  });
});

describe("what the map is sent", () => {
  const sites = collapseSites([
    feat({ operator: "Meta", lat: 44.29, lng: -120.887, state: "OR" }),
    feat({ operator: "Equinix", name: "DC1" }),
  ]);
  const file = buildSitesFile({
    retrieved: "2026-11-18",
    sourceFeatures: 2,
    skipped: { badGeometry: 0, outsideUs: 0 },
    sites,
    trackedAtIngest: { campuses: 0, sitesLeftOut: 0 },
    atlas: { version: "v2026.11.02", published: "2026-11-02", doi: "10.57931/17054299", retrievedFrom: "https://example.org/x.geojson" },
  });
  const prineville: TrackedCampus = { id: 37, name: "Meta Prineville OR Campus", company: "Meta", lat: 44.301, lng: -120.8347, status: "operational" };

  it("leaves out sites that are a tracked campus today, and says how many", () => {
    const payload = sitesPayload(file, [prineville]);
    assert.deepEqual(payload.sites.map((s) => s.operator), ["Equinix"]);
    assert.deepEqual(payload.counts, { sites: 1, leftOutAsTracked: 1, trackedCampuses: 1 });
    assert.equal(sitesPayload(file, []).sites.length, 2, "with nothing tracked, every site is sent");
  });

  it("carries the credit, the license and the source with its version and date, but not the method text", () => {
    const payload = sitesPayload(file, []);
    assert.match(payload.attribution, /OpenStreetMap contributors/);
    assert.equal(payload.license.url, "https://opendatacommons.org/licenses/odbl/1-0/");
    assert.deepEqual(payload.source, {
      name: "IM3 Open Source Data Center Atlas",
      publisher: "Pacific Northwest National Laboratory",
      version: "v2026.11.02",
      published: "2026-11-02",
      url: "https://doi.org/10.57931/17054299",
    });
    assert.equal(payload.retrieved, "2026-11-18");
    assert.equal("method" in payload, false);
  });
});

describe("the committed data center sites file", () => {
  const read = (name: string) => JSON.parse(readFileSync(join(process.cwd(), "server", "data", name), "utf-8"));
  const file = validateSitesFile(read("datacenter-sites.json"));

  it("carries well over a thousand sites in the lower 48, each a location with no size", () => {
    assert.ok(file.counts.lower48 > 1000, `${file.counts.lower48} sites in the lower 48`);
    assert.equal(file.counts.sites, file.sites.length);
    for (const s of file.sites) {
      assert.deepEqual(Object.keys(s).filter((k) => !["id", "lat", "lng", "state", "name", "operator", "n"].includes(k)), [], s.id);
    }
  });

  it("is one dot per site: collapsing it again changes nothing", () => {
    const again = collapseSites(file.sites.map((s) => ({ lat: s.lat, lng: s.lng, name: s.name ?? null, operator: s.operator ?? null, state: s.state, kind: "building" as const, sqft: null })));
    assert.equal(again.length, file.sites.length);
  });

  it("ships beside its license notice", () => {
    const notice = readFileSync(join(process.cwd(), "server", "data", "datacenter-sites.LICENSE.md"), "utf-8");
    assert.match(notice, /Open Database License/);
    assert.match(notice, /OpenStreetMap contributors/);
    assert.match(notice, /10\.57931\/17054299/);
  });
});
