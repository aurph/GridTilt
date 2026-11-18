// Refresh server/data/power-plants.json from EIA's current EIA-860M release.
//
//   npx tsx scripts/ingest-power-plants.ts                 (the release named on EIA's page)
//   npx tsx scripts/ingest-power-plants.ts --floor 300     (a different size floor, in MW)
//   npx tsx scripts/ingest-power-plants.ts --file ./september_generator2026.xlsx --released 2026-10-23
//
// What it does: finds the current release on https://www.eia.gov/electricity/data/eia860m/,
// downloads the workbook, reads the "Operating" sheet, rolls generators up to
// plants (server/power-plants.ts), keeps plants at or above the floor plus all
// nuclear, and writes the file. Nothing is estimated. EIA releases a new month
// near the 24th; run this after a release, review the printed report and the
// diff, and open a PR.
//
// No API key is needed: the workbook is a public download.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringifyRows } from "../server/json-rows";
import {
  aggregatePlants,
  buildPlantsFile,
  latestReleaseFromPage,
  parseOperatingSheet,
  selectPlants,
  validatePlantsFile,
} from "../server/power-plants";
import { readSheetRows } from "../server/xlsx-lite";

const PAGE = "https://www.eia.gov/electricity/data/eia860m/";
const DEFAULT_FLOOR_MW = 250;
const UA = "GridTilt data refresh (https://gridtilt.com; public EIA-860M download)";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} answered HTTP ${res.status}`);
  return res;
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const floorMw = Number(arg("floor") ?? DEFAULT_FLOOR_MW);
if (!(floorMw > 0)) throw new Error("--floor must be a positive number of MW");
const out = arg("out") ?? join(process.cwd(), "server", "data", "power-plants.json");

let workbook: Buffer;
let sourceUrl: string;
let released: string;
let expectedMonth: string | null = null;

const localFile = arg("file");
if (localFile) {
  const rel = arg("released");
  const url = arg("url");
  if (!rel || !/^\d{4}-\d{2}-\d{2}$/.test(rel)) throw new Error("--file needs --released YYYY-MM-DD (EIA's release date for that file)");
  workbook = readFileSync(localFile);
  released = rel;
  sourceUrl = url ?? `${PAGE}xls/${localFile.split("/").pop()}`;
  console.log(`Reading ${localFile} (released ${released})`);
} else {
  const release = latestReleaseFromPage(await (await get(PAGE)).text());
  console.log(`Current release on EIA's page: ${release.month}, released ${release.released}\n  ${release.url}`);
  workbook = Buffer.from(await (await get(release.url)).arrayBuffer());
  sourceUrl = release.url;
  released = release.released;
  expectedMonth = release.month;
}

const inventory = parseOperatingSheet(readSheetRows(workbook, "Operating"));
if (expectedMonth && inventory.month !== expectedMonth) {
  throw new Error(`the page names ${expectedMonth} but the workbook's title says ${inventory.month}; not writing anything`);
}
const { plants, unmappedTechnologies } = aggregatePlants(inventory.generators);
const file = buildPlantsFile({
  month: inventory.month,
  retrieved: today,
  sourceUrl,
  released,
  floorMw,
  allPlants: plants,
  generatorCount: inventory.generators.length,
  skipped: inventory.skipped,
});
validatePlantsFile(file);
writeFileSync(out, stringifyRows(file as unknown as Record<string, unknown>, "plants"));

const gw = (mw: number) => `${(mw / 1000).toFixed(1)} GW`;
console.log(`\nEIA-860M ${file.dataMonth} (released ${released}, retrieved ${today})`);
console.log(`  generators read: ${file.counts.generatorsRead.toLocaleString("en-US")}  (left out: ${inventory.skipped.noCoordinates} without coordinates, ${inventory.skipped.noCapacity} without capacity)`);
console.log(`  plants read:     ${file.counts.plantsRead.toLocaleString("en-US")}  (${gw(file.counts.readMw)} nameplate)`);
console.log(`  plants kept:     ${file.counts.plantsKept.toLocaleString("en-US")}  at ${floorMw} MW and up, plus all nuclear (${gw(file.counts.keptMw)}, ${((100 * file.counts.keptMw) / file.counts.readMw).toFixed(0)}% of nameplate)`);
console.log(`  by fuel:         ${Object.entries(file.counts.byFuel).map(([f, n]) => `${f} ${n}`).join(", ")}`);
console.log("  other floors:    " + [100, 150, 200, 250, 300, 400, 500].map((f) => `${f} MW -> ${selectPlants(plants, f).length}`).join(", "));
if (unmappedTechnologies.length > 0) {
  console.log(`  WARNING: technology names this script does not know (filed as Other): ${unmappedTechnologies.join("; ")}`);
  console.log("           add them to TECHNOLOGY_FUEL in server/power-plants.ts and rerun.");
}
const noBa = file.plants.filter((p) => !p.ba).length;
console.log(`  without a balancing authority code: ${noBa}`);
console.log(`  largest: ${file.plants.slice(0, 5).map((p) => `${p.name} (${p.state}, ${p.fuel}, ${Math.round(p.mw).toLocaleString("en-US")} MW)`).join("; ")}`);
console.log(`\nWrote ${out}`);
