// Refresh server/data/datacenter-sites.json from PNNL's IM3 Open Source Data
// Center Atlas (built from OpenStreetMap, ODbL 1.0).
//
//   npx tsx scripts/ingest-dc-sites.ts
//   npx tsx scripts/ingest-dc-sites.ts --file ./im3_datacenter_centroids.geojson   (a copy already downloaded)
//
// The atlas version is pinned below (ATLAS). To move to a newer version:
//   1. Open https://doi.org/10.57931/2550666 (it forwards to the latest version) and note
//      the version, publication date and DOI.
//   2. Find the commit in https://github.com/IMMM-SFA/datacenter-atlas that updated
//      static/im3_datacenter_centroids.geojson to that version.
//   3. Update ATLAS, run this script, read the report, review the diff, open a PR.
// The script checks the repository's record of the latest version and warns
// when the pinned one is behind, so a stale pin is visible.
//
// Why the file comes from PNNL's GitHub repository: the dataset's own record
// (MSD-LIVE) lists its files only inside a browser session, so it cannot be
// fetched by a script. The repository is PNNL's public app for the same
// dataset and carries the same version's centroid layer.
//
// What is written is a database derived from OpenStreetMap: it stays under the
// ODbL, with the notice in server/data/datacenter-sites.LICENSE.md.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSitesFile, collapseSites, dropTrackedCampusSites, parseAtlasFeatures, validateSitesFile, type TrackedCampus } from "../server/dc-sites";
import { stringifyRows } from "../server/json-rows";

/** The atlas version this script reads. */
const ATLAS = {
  version: "v2026.11.02",
  published: "2026-11-02",
  doi: "10.57931/17054299",
  /** The commit in PNNL's app repository that carries this version's layers. */
  commit: "fe4d8420f9fdc7b16b82b8461c5e4c39b93d8f1d",
};
const SOURCE_URL = `https://raw.githubusercontent.com/IMMM-SFA/datacenter-atlas/${ATLAS.commit}/static/im3_datacenter_centroids.geojson`;
/** The dataset's first record; its "latest" link always names the newest version. */
const LATEST_RECORD = "https://data.msdlive.org/api/records/65g71-a4731/versions/latest";
const UA = "GridTilt data refresh (https://gridtilt.com; public IM3 atlas download)";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const dataDir = join(process.cwd(), "server", "data");
const out = arg("out") ?? join(dataDir, "datacenter-sites.json");

// Is the pinned version still the newest? A failed check is reported, not fatal.
try {
  const res = await fetch(LATEST_RECORD, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const meta = ((await res.json()) as { metadata?: { version?: string; publication_date?: string } }).metadata ?? {};
  if (meta.version === ATLAS.version) console.log(`Atlas ${ATLAS.version} is the latest version on record (published ${meta.publication_date}).`);
  else console.log(`WARNING: the latest atlas version on record is ${meta.version} (published ${meta.publication_date}); this script is pinned to ${ATLAS.version}. See the header of this file.`);
} catch (e) {
  console.log(`Could not check for a newer atlas version (${e instanceof Error ? e.message : e}); continuing with the pinned ${ATLAS.version}.`);
}

let geojson: unknown;
const localFile = arg("file");
if (localFile) {
  geojson = JSON.parse(readFileSync(localFile, "utf-8"));
  console.log(`Reading ${localFile}`);
} else {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`GET ${SOURCE_URL} answered HTTP ${res.status}`);
  geojson = await res.json();
  console.log(`Downloaded ${SOURCE_URL}`);
}

const { features, skipped } = parseAtlasFeatures(geojson);
const sourceFeatures = features.length + skipped.badGeometry + skipped.outsideUs;
const sites = collapseSites(features);

const tracked = (JSON.parse(readFileSync(join(dataDir, "datacenters.json"), "utf-8")) as TrackedCampus[]).filter(
  (t) => Number.isFinite(t.lat) && Number.isFinite(t.lng),
);
const { kept, dropped } = dropTrackedCampusSites(sites, tracked);

const file = buildSitesFile({
  retrieved: today,
  sourceFeatures,
  skipped,
  sites,
  trackedAtIngest: { campuses: tracked.length, sitesLeftOut: sites.length - kept.length },
  atlas: { version: ATLAS.version, published: ATLAS.published, doi: ATLAS.doi, retrievedFrom: SOURCE_URL },
});
validateSitesFile(file);
writeFileSync(out, stringifyRows(file as unknown as Record<string, unknown>, "sites"));

const kinds = features.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }), {});
const byState = new Map<string, number>();
for (const s of kept) byState.set(s.state, (byState.get(s.state) ?? 0) + 1);
const topStates = Array.from(byState.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
const byOperator = new Map<string, number>();
for (const s of kept) if (s.operator) byOperator.set(s.operator, (byOperator.get(s.operator) ?? 0) + 1);
const topOperators = Array.from(byOperator.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);

console.log(`\nIM3 Open Source Data Center Atlas ${ATLAS.version} (published ${ATLAS.published}, retrieved ${today})`);
console.log(`  atlas features:        ${sourceFeatures.toLocaleString("en-US")}  (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ")}; left out: ${skipped.outsideUs} outside the US, ${skipped.badGeometry} without a point)`);
console.log(`  sites after folding:   ${file.counts.sites.toLocaleString("en-US")}  (${file.counts.lower48.toLocaleString("en-US")} in the lower 48; ${file.counts.withOperator} with an operator, ${file.counts.withName} with a name)`);
console.log(`  part of a tracked campus today: ${sites.length - kept.length} sites across ${dropped.length} of ${tracked.length} tracked campuses`);
for (const d of dropped) console.log(`      ${String(d.campusId).padStart(3)} ${d.campus}: ${d.named} named, ${d.untagged} untagged`);
console.log(`  sites the map would draw today: ${kept.length.toLocaleString("en-US")}  (${kept.filter((s) => s.state !== "AK" && s.state !== "HI").length.toLocaleString("en-US")} in the lower 48)`);
console.log(`  top states:    ${topStates.map(([s, n]) => `${s} ${n}`).join(", ")}`);
console.log(`  top operators: ${topOperators.map(([o, n]) => `${o} ${n}`).join(", ")}`);
console.log(`\nWrote ${out}`);
