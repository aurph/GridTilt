// Site-wide invariant, checked at the source level because there are no DOM tests.
//
// Every surface that reads /api/datacenters must apply the >= 400 MW floor, or it
// reports a different tracked set than the Power map. This has gone wrong on five
// surfaces: the landing caption and its map said 58 where the map said 33,
// Subscribe read 25.1 GW against the Overview gauge's 18.8 GW, and the operator
// and region drill-downs totalled sites the map they link from excludes.
//
// Since 2026-11 the map draws every campus in the registry and keeps the floor
// for megawatts only. A surface that lists every campus must still get its
// megawatts from code that applies the floor; DELEGATES names the one that does
// it through a shared function, and the function is checked too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CLIENT_SRC = join(process.cwd(), "client", "src");

/**
 * Files allowed to read the payload unfiltered, with the reason. The admin editor
 * edits every row, including sub-threshold ones, so filtering would hide records
 * from the only screen that can fix them.
 */
const ALLOWED_UNFILTERED: Record<string, string> = {
  "pages/AdminDatacenters.tsx": "the editor must list every row, including sub-threshold",
};

/**
 * Files that hand every row to a function that applies the floor before it
 * sums megawatts. The region page lists every campus inside a region and says
 * which ones its megawatt figure counts; that figure comes from regionStats.
 */
const DELEGATES: Record<string, { call: RegExp; appliedIn: string }> = {
  "lib/region-data.ts": { call: /regionStats\(/, appliedIn: "lib/grid-regions.ts" },
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === "__tests__") continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

test("every surface reading /api/datacenters applies the tracked floor", () => {
  const offenders: string[] = [];

  for (const file of walk(CLIENT_SRC)) {
    const src = readFileSync(file, "utf8");
    // Only files that actually fetch the payload, not ones that mention it in prose.
    if (!/queryKey:\s*\[\s*["']\/api\/datacenters["']/.test(src)) continue;

    const rel = file.slice(CLIENT_SRC.length + 1).replace(/\\/g, "/");
    if (rel in ALLOWED_UNFILTERED) continue;

    const filters =
      /filterTrackedFacilities/.test(src) ||
      // state pages filter against the same exported constant.
      /MIN_TRACKED_MW/.test(src);
    const delegate = DELEGATES[rel];
    const delegates = delegate ? delegate.call.test(src) && /MIN_TRACKED_MW/.test(readFileSync(join(CLIENT_SRC, delegate.appliedIn), "utf8")) : false;
    if (!filters && !delegates) offenders.push(rel);
  }

  assert.deepEqual(
    offenders,
    [],
    `these read /api/datacenters without the >= 400 MW floor, so they report a different tracked set than the Power map: ${offenders.join(", ")}`,
  );
});

test("the scan actually finds the known consumers", () => {
  // Guards against the walk silently matching nothing and passing vacuously.
  const consumers = walk(CLIENT_SRC).filter((f) =>
    /queryKey:\s*\[\s*["']\/api\/datacenters["']/.test(readFileSync(f, "utf8")),
  );
  assert.ok(
    consumers.length >= 8,
    `expected the known /api/datacenters consumers, found ${consumers.length}`,
  );
});

test("the allowlist stays deliberate", () => {
  // An allowlist without a stated reason is how an exemption becomes permanent.
  for (const [file, reason] of Object.entries(ALLOWED_UNFILTERED)) {
    assert.ok(reason.length > 20, `${file} needs a real reason, got "${reason}"`);
  }
  assert.equal(Object.keys(ALLOWED_UNFILTERED).length, 1, "only the admin editor is exempt");
  assert.deepEqual(Object.keys(DELEGATES), ["lib/region-data.ts"], "one file delegates the floor, to regionStats");
});

test("the function the region data delegates to keeps megawatts to campuses of 400 MW and up", async () => {
  // The guard above only reads source. This runs the function: a 300 MW campus is counted and never summed.
  const { regionStats } = await import("../grid-regions");
  const box = { type: "Polygon", coordinates: [[[-80, 38], [-76, 38], [-76, 41], [-80, 41], [-80, 38]]] };
  const stats = regionStats([{ id: "pjm", geometry: box, bbox: [-80, 38, -76, 41] }], {
    campuses: [
      { lat: 39, lng: -77.5, powerMW: 300, status: "operational" },
      { lat: 39.5, lng: -78, powerMW: 900, status: "operational" },
      { lat: 40, lng: -79, powerMW: 1200, status: "announced" },
    ],
  });
  assert.deepEqual(stats.pjm.campuses, { count: 3, count400: 2, built400: 1, builtMw400: 900 });
});
