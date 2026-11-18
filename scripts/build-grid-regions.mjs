// Build client/public/geo/grid-regions.json: the nine grid regions the map
// teaches, as one small TopoJSON.
//
//   node scripts/build-grid-regions.mjs                     (downloads the operator layer)
//   node scripts/build-grid-regions.mjs --file iso.geojson  (a copy already downloaded)
//   node scripts/build-grid-regions.mjs --preview out.svg   (also writes a picture to check by eye)
//
// Seven market operators come from the federal "Independent System Operators"
// layer (HIFLD; compiled by Oak Ridge National Laboratory from FERC Form 714,
// EIA-860, EIA-861 and Census boundaries; source date 2020-06-24). The copy
// read here is the one Pacific Northwest National Laboratory serves publicly.
// The two regions with no market operator are what is left of the lower 48:
// the West outside CAISO, and the Southeast.
//
// What the script does, in order (mapshaper, run through npx; nothing is
// added to package.json):
//   1. Drop each operator's small detached pieces (under 3,000 km2), so a
//      cooperative's pocket inside another operator does not speckle the map.
//   2. Clip the operators to the lower 48's land, as drawn by the state file
//      the map already uses, so coasts and borders line up.
//   3. Where two operators' footprints overlap, the smaller operator keeps the
//      overlap (its territory sits inside the larger one's blanket). Small gaps
//      and holes are filled.
//   4. What is left of the eleven western states, plus the far west tip of
//      Texas, is "west". What is left of the other states is "southeast".
//   5. Simplify, and write one TopoJSON whose features carry `id`.
//
// The lines are approximate, and say so on the site: operator footprints
// follow utility service territories and interleave at the edges, and the
// source predates SPP's 2026 western expansion.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SOURCE_URL =
  "https://services8.arcgis.com/Rl9BjEMrBgxxeBfh/arcgis/rest/services/Independent_System_Operator/FeatureServer/0/query?where=1%3D1&outFields=NAME&outSR=4326&geometryPrecision=3&f=geojson";
const STATES = resolve("client/public/geo/us-states-10m.json");
const OUT = resolve("client/public/geo/grid-regions.json");
const MAPSHAPER = "mapshaper@0.6.102";

const OPERATOR_IDS = {
  "MIDCONTINENT INDEPENDENT TRANSMISSION SYSTEM OPERATOR, INC..": "miso",
  "SOUTHWEST POWER POOL": "spp",
  "PJM INTERCONNECTION, LLC": "pjm",
  "ELECTRIC RELIABILITY COUNCIL OF TEXAS, INC.": "ercot",
  "CALIFORNIA INDEPENDENT SYSTEM OPERATOR": "caiso",
  "ISO NEW ENGLAND INC.": "isone",
  "NEW YORK INDEPENDENT SYSTEM OPERATOR": "nyiso",
};
/** FIPS codes of the eleven states of the Western Interconnection's US footprint. */
const WEST_FIPS = ["53", "41", "06", "32", "16", "49", "04", "30", "56", "08", "35"];
/** Not in the lower 48: Alaska, Hawaii and the territories. */
const NOT_LOWER_48 = ["02", "15", "60", "66", "69", "72", "78"];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function mapshaper(args, cwd) {
  const r = spawnSync("npx", ["-y", MAPSHAPER, ...args], { encoding: "utf-8", cwd, maxBuffer: 1 << 28 });
  const out = `${r.stdout}${r.stderr}`
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("npm warn"))
    .join("\n");
  if (r.status !== 0) throw new Error(`mapshaper failed:\n${out}`);
  return out;
}

const work = mkdtempSync(join(tmpdir(), "grid-regions-"));
const isoFile = join(work, "iso.geojson");
const local = arg("file");
if (local) {
  writeFileSync(isoFile, readFileSync(resolve(local)));
  console.log(`Reading ${local}`);
} else {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "GridTilt data refresh (https://gridtilt.com; public HIFLD operator layer)" } });
  if (!res.ok) throw new Error(`GET operator layer answered HTTP ${res.status}`);
  writeFileSync(isoFile, Buffer.from(await res.arrayBuffer()));
  console.log(`Downloaded the operator layer (${(statSync(isoFile).size / 1e6).toFixed(1)} MB)`);
}
const names = JSON.parse(readFileSync(isoFile, "utf-8")).features.map((f) => f.properties.NAME);
const unknown = names.filter((n) => !OPERATOR_IDS[n]);
if (unknown.length > 0 || names.length !== 7) {
  throw new Error(`expected the seven operators, got ${names.length}${unknown.length ? `; unknown: ${unknown.join("; ")}` : ""}`);
}

const idExpr = `id=${JSON.stringify(OPERATOR_IDS)}[NAME]`;
const list = (codes) => JSON.stringify(codes);

// Steps 1 to 3: operators as a clean partition of the land they cover.
console.log(
  mapshaper(
    [
      "-i", isoFile, "name=iso",
      "-each", idExpr,
      "-filter-fields", "id",
      "-simplify", "weighted", "4%", "keep-shapes",
      "-explode",
      "-filter", "this.area > 3000e6",
      "-dissolve", "id",
      // Repair before clipping: the source rings self-intersect in places, and
      // a clip on an unrepaired ring can drop the whole polygon (PJM's did).
      "-clean", "overlap-rule=min-area", "gap-fill-area=6000km2",
      "-i", STATES, "id-field=fips",
      "-filter", `${list(NOT_LOWER_48)}.indexOf(fips) < 0`, "target=states",
      "-dissolve", "target=states", "name=land", "+",
      "-clip", "source=land", "target=iso",
      "-clean", "overlap-rule=min-area", "gap-fill-area=6000km2", "target=iso",
      "-o", "target=iso", join(work, "operators.geojson"),
      "-o", "target=land", join(work, "land.geojson"),
      "-filter", `${list(WEST_FIPS)}.indexOf(fips) >= 0`, "target=states", "+", "name=weststates",
      "-dissolve", "target=weststates",
      "-o", "target=weststates", join(work, "westland.geojson"),
    ],
    work,
  ),
);

// Step 4: what the operators leave of the land, split west and east.
console.log(
  mapshaper(
    [
      "-i", join(work, "land.geojson"), "name=rest",
      "-erase", `source=${join(work, "operators.geojson")}`,
      "-explode",
      "-filter", "this.area > 1500e6",
      "-i", join(work, "westland.geojson"), "name=westland",
      "-clip", "source=westland", "target=rest", "+", "name=westpart",
      "-erase", "source=westland", "target=rest", "+", "name=eastpart",
      "-explode", "target=eastpart",
      // The far west tip of Texas (El Paso) is on the western grid.
      "-each", "id = this.centroidX < -104 ? 'west' : 'southeast'", "target=eastpart",
      // East of there, a leftover piece is the Southeast only when it is big
      // (the Southeast proper, and the cooperative territory in Missouri). A
      // small leftover between two operators is a drawing gap, not a region:
      // it is dropped here and filled from its neighbours in the last step.
      "-filter", "id == 'west' || this.area > 20000e6", "target=eastpart",
      "-each", "id = 'west'", "target=westpart",
      "-merge-layers", "target=westpart,eastpart", "name=nomarket", "force",
      "-dissolve", "id",
      "-o", "target=nomarket", join(work, "nomarket.geojson"),
    ],
    work,
  ),
);

// Step 5: one layer, shared borders, simplified.
const preview = arg("preview");
const COLORS = `{miso:'#5A93DE',spp:'#BC8626',pjm:'#34A87E',ercot:'#8F84E6',caiso:'#DE5C8E',isone:'#3B9EC4',nyiso:'#E2652A',west:'#47A981',southeast:'#B372C6'}`;
console.log(
  mapshaper(
    [
      "-i", join(work, "operators.geojson"), join(work, "nomarket.geojson"), "combine-files",
      "-merge-layers", "force", "name=regions",
      "-clean", "overlap-rule=min-area", "gap-fill-area=25000km2",
      "-dissolve", "id",
      "-simplify", "weighted", "30%", "keep-shapes",
      "-clean",
      "-each", "console.log(id.padEnd(10), String(Math.round(this.area / 1e6)).padStart(9), 'km2')",
      "-o", OUT, "format=topojson", "quantization=20000", "id-field=id",
      ...(preview
        ? ["-style", `fill=${COLORS}[id]`, "opacity=0.6", "stroke=#111", "stroke-width=0.5", "-proj", "albersusa", "-o", resolve(preview), "width=1400"]
        : []),
    ],
    work,
  ),
);

const topo = JSON.parse(readFileSync(OUT, "utf-8"));
const ids = topo.objects.regions.geometries.map((g) => g.id).sort();
console.log(`\nWrote ${OUT}: ${(statSync(OUT).size / 1024).toFixed(0)} KB, regions: ${ids.join(", ")}`);
const expected = ["caiso", "ercot", "isone", "miso", "nyiso", "pjm", "southeast", "spp", "west"];
if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error(`expected regions ${expected.join(", ")}`);
