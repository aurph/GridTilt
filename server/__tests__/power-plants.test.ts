// Power plants on the map come from one EIA release (Form EIA-860M), rolled
// up from generators to plants. These lock the roll-up, the fuel mapping the
// map colors by, and the committed file's shape, so a plant never appears with
// an invented fuel, size or place.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLANT_FUELS,
  aggregatePlants,
  buildPlantsFile,
  fuelForTechnology,
  latestReleaseFromPage,
  parseOperatingSheet,
  plantsPayload,
  selectPlants,
  validatePlantsFile,
  type GeneratorRow,
} from "../power-plants";

const HEADER = [
  "Entity ID", "Entity Name", "Plant ID", "Plant Name", "Google Map", "Bing Map", "Plant State", "County",
  "Balancing Authority Code", "Sector", "Generator ID", "Unit Code", "Nameplate Capacity (MW)", "Net Summer Capacity (MW)",
  "Net Winter Capacity (MW)", "Technology", "Energy Source Code", "Prime Mover Code", "Operating Month", "Operating Year",
  "Planned Retirement Month", "Planned Retirement Year", "Status", "Latitude", "Longitude",
];

function sheetRow(v: Partial<Record<string, string>>): (string | null)[] {
  return HEADER.map((h) => v[h] ?? null);
}

const SHEET: (string | null)[][] = [
  ["Inventory of Operating Generators as of September 2026"],
  [],
  HEADER,
  sheetRow({ "Entity Name": "Luminant Generation Company LLC", "Plant ID": "6145", "Plant Name": "Comanche Peak", "Plant State": "TX", "Balancing Authority Code": "ERCO", "Nameplate Capacity (MW)": "1215", Technology: "Nuclear", Status: "(OP) Operating", Latitude: "32.298365", Longitude: "-97.785523" }),
  sheetRow({ "Entity Name": "Luminant Generation Company LLC", "Plant ID": "6145", "Plant Name": "Comanche Peak", "Plant State": "TX", "Balancing Authority Code": "ERCO", "Nameplate Capacity (MW)": "1,215.0", Technology: "Nuclear", Status: "(OP) Operating", Latitude: "32.298365", Longitude: "-97.785523" }),
  sheetRow({ "Entity Name": "Tiny Solar LLC", "Plant ID": "70001", "Plant Name": "Tiny Solar", "Plant State": "NC", "Balancing Authority Code": " ", "Nameplate Capacity (MW)": "5", Technology: "Solar Photovoltaic", Status: "(OP) Operating", Latitude: "35.5", Longitude: "-80.1" }),
  sheetRow({ "Entity Name": "Tiny Solar LLC", "Plant ID": "70001", "Plant Name": "Tiny Solar", "Plant State": "NC", "Nameplate Capacity (MW)": "2.5", Technology: "Batteries", Status: "(SB) Standby/Backup: available for service but not normally used", Latitude: "35.5", Longitude: "-80.1" }),
  sheetRow({ "Entity Name": "No Place Power", "Plant ID": "70002", "Plant Name": "No Place", "Plant State": "OH", "Nameplate Capacity (MW)": "300", Technology: "Conventional Steam Coal", Status: "(OP) Operating", Latitude: " ", Longitude: "" }),
  sheetRow({ "Entity Name": "Blank Capacity Co", "Plant ID": "70003", "Plant Name": "Blank", "Plant State": "OH", "Nameplate Capacity (MW)": " ", Technology: "Conventional Steam Coal", Status: "(OP) Operating", Latitude: "40", Longitude: "-83" }),
  [],
  ["NOTES:\nCapacity from facilities with a total generator nameplate capacity less than 1 MW are excluded from this report."],
];

describe("fuel mapping", () => {
  // Every technology name in the September 2026 Operating sheet.
  const EXPECTED: Record<string, string> = {
    "Natural Gas Fired Combined Cycle": "NG",
    "Natural Gas Fired Combustion Turbine": "NG",
    "Natural Gas Steam Turbine": "NG",
    "Natural Gas Internal Combustion Engine": "NG",
    "Other Natural Gas": "NG",
    "Natural Gas with Compressed Air Storage": "NG",
    "Conventional Steam Coal": "COL",
    "Coal Integrated Gasification Combined Cycle": "COL",
    Nuclear: "NUC",
    "Onshore Wind Turbine": "WND",
    "Offshore Wind Turbine": "WND",
    "Solar Photovoltaic": "SUN",
    "Solar Thermal with Energy Storage": "SUN",
    "Solar Thermal without Energy Storage": "SUN",
    "Conventional Hydroelectric": "WAT",
    "Hydroelectric Pumped Storage": "PS",
    Batteries: "BAT",
    Flywheels: "BAT",
    Geothermal: "GEO",
    "Wood/Wood Waste Biomass": "BIO",
    "Landfill Gas": "BIO",
    "Municipal Solid Waste": "BIO",
    "Other Waste Biomass": "BIO",
    "Petroleum Liquids": "OIL",
    "Petroleum Coke": "OIL",
    "Other Gases": "OTH",
    "All Other": "OTH",
  };

  it("files every EIA-860M technology under the fuel code the live grid card colors by", () => {
    for (const [tech, fuel] of Object.entries(EXPECTED)) assert.equal(fuelForTechnology(tech), fuel, tech);
    assert.equal(fuelForTechnology("  Nuclear "), "NUC", "whitespace around the name is ignored");
    for (const fuel of Object.values(EXPECTED)) assert.ok((PLANT_FUELS as readonly string[]).includes(fuel), fuel);
  });

  it("does not guess a fuel for a technology it has never seen", () => {
    assert.equal(fuelForTechnology("Fusion Tokamak"), null);
    assert.equal(fuelForTechnology(""), null);
  });
});

describe("reading the Operating sheet", () => {
  const parsed = parseOperatingSheet(SHEET);

  it("takes the data month from the sheet's own title", () => {
    assert.equal(parsed.month, "2026-09");
  });

  it("finds columns by header name and reads numbers with thousands separators", () => {
    assert.equal(parsed.generators.length, 4);
    const [a, b] = parsed.generators;
    assert.deepEqual(a, {
      plantId: 6145,
      plantName: "Comanche Peak",
      entity: "Luminant Generation Company LLC",
      state: "TX",
      ba: "ERCO",
      technology: "Nuclear",
      nameplateMw: 1215,
      lat: 32.298365,
      lng: -97.785523,
    });
    assert.equal(b.nameplateMw, 1215);
    assert.equal(parsed.generators[2].ba, "", "a blank balancing authority stays blank");
  });

  it("counts what it leaves out: no coordinates, no capacity, and the notes under the table", () => {
    assert.deepEqual(parsed.skipped, { noCoordinates: 1, noCapacity: 1 });
  });

  it("fails loudly when the sheet is not the Operating inventory", () => {
    assert.throws(() => parseOperatingSheet([["Something else"], HEADER]), /as of <Month> <Year>/);
    assert.throws(() => parseOperatingSheet([SHEET[0], ["Plant ID", "Plant Name"]]), /missing column/i);
  });
});

describe("finding the current release on EIA's page", () => {
  // The shape of eia.gov/electricity/data/eia860m/ on 2026-11-18: months not yet
  // published sit in an HTML comment above the real rows.
  const PAGE = `
    <span class="label">Release Date:</span> <span class="date">October 23, 2026</span>
    <span class="label">Next Release Date:</span> <span class="date">November 24, 2026</span>
    <table>
      <!--<tr><td>December 2026</td><td><a href="/electricity/data/eia860m/xls/december_generator2026.xlsx">XLS</a></td></tr>
      <tr><td>October 2026</td><td><a href="/electricity/data/eia860m/xls/october_generator2026.xlsx">XLS</a></td></tr>-->
      <tr><td>September 2026</td><td><a href="/electricity/data/eia860m/xls/september_generator2026.xlsx">XLS</a></td></tr>
      <tr><td>August 2026</td><td><a href="/electricity/data/eia860m/archive/xls/august_generator2026.xlsx">XLS</a></td></tr>
    </table>`;

  it("takes the first published file, not a month still commented out, and the release date beside it", () => {
    assert.deepEqual(latestReleaseFromPage(PAGE), {
      url: "https://www.eia.gov/electricity/data/eia860m/xls/september_generator2026.xlsx",
      month: "2026-09",
      released: "2026-10-23",
    });
  });

  it("says so when the page has no file link or no release date", () => {
    assert.throws(() => latestReleaseFromPage("<html>maintenance</html>"), /no generator file link/i);
    assert.throws(() => latestReleaseFromPage('<a href="/electricity/data/eia860m/xls/september_generator2026.xlsx">x</a>'), /release date/i);
  });
});

describe("rolling generators up to plants", () => {
  const gen = (v: Partial<GeneratorRow>): GeneratorRow => ({
    plantId: 1, plantName: "Plant One", entity: "Owner A", state: "PA", ba: "PJM", technology: "Natural Gas Fired Combined Cycle",
    nameplateMw: 100, lat: 40.123456, lng: -75.654321, ...v,
  });

  it("sums nameplate, takes the fuel with the most capacity, and keeps one place per plant", () => {
    const { plants, unmappedTechnologies } = aggregatePlants([
      gen({ nameplateMw: 400.04 }),
      gen({ nameplateMw: 300, technology: "Natural Gas Fired Combustion Turbine" }),
      gen({ nameplateMw: 650, technology: "Conventional Steam Coal" }),
      gen({ plantId: 2, plantName: "Plant Two", entity: "Owner B", state: "TX", ba: "", technology: "Onshore Wind Turbine", nameplateMw: 250.55, lat: 32, lng: -100 }),
    ]);
    assert.deepEqual(unmappedTechnologies, []);
    assert.deepEqual(plants, [
      // 700 MW of gas across two technologies outweighs 650 MW of coal.
      { id: 1, name: "Plant One", operator: "Owner A", fuel: "NG", mw: 1350, state: "PA", ba: "PJM", lat: 40.1235, lng: -75.6543 },
      { id: 2, name: "Plant Two", operator: "Owner B", fuel: "WND", mw: 250.6, state: "TX", ba: null, lat: 32, lng: -100 },
    ]);
  });

  it("names the operator and balancing authority that carry the most capacity", () => {
    const { plants } = aggregatePlants([
      gen({ entity: "Minor Partner", ba: "MISO", nameplateMw: 10 }),
      gen({ entity: "Major Owner", ba: "PJM", nameplateMw: 500 }),
    ]);
    assert.equal(plants[0].operator, "Major Owner");
    assert.equal(plants[0].ba, "PJM");
  });

  it("reports an unknown technology and files it as Other, never as a named fuel", () => {
    const { plants, unmappedTechnologies } = aggregatePlants([gen({ technology: "Fusion Tokamak", nameplateMw: 900 })]);
    assert.deepEqual(unmappedTechnologies, ["Fusion Tokamak"]);
    assert.equal(plants[0].fuel, "OTH");
  });

  it("orders plants largest first, then by EIA plant id, so the file is stable", () => {
    const { plants } = aggregatePlants([gen({ plantId: 9, nameplateMw: 100 }), gen({ plantId: 3, nameplateMw: 100 }), gen({ plantId: 5, nameplateMw: 900 })]);
    assert.deepEqual(plants.map((p) => p.id), [5, 3, 9]);
  });

  it("keeps plants at or above the floor, and every nuclear plant whatever its size", () => {
    const { plants } = aggregatePlants([
      gen({ plantId: 1, nameplateMw: 250 }),
      gen({ plantId: 2, nameplateMw: 249.9 }),
      gen({ plantId: 3, nameplateMw: 60, technology: "Nuclear" }),
    ]);
    assert.deepEqual(selectPlants(plants, 250).map((p) => p.id), [1, 3]);
  });
});

describe("the plants file", () => {
  const { plants } = aggregatePlants(parseOperatingSheet(SHEET).generators);
  const file = buildPlantsFile({
    month: "2026-09",
    retrieved: "2026-11-18",
    sourceUrl: "https://www.eia.gov/electricity/data/eia860m/xls/september_generator2026.xlsx",
    released: "2026-10-23",
    floorMw: 250,
    allPlants: plants,
    generatorCount: 4,
    skipped: { noCoordinates: 1, noCapacity: 1 },
  });

  it("states its source, license, release, data month and method", () => {
    assert.equal(file.dataset, "power-plants");
    assert.equal(file.dataMonth, "2026-09");
    assert.equal(file.retrieved, "2026-11-18");
    assert.equal(file.source.name, "Form EIA-860M, Preliminary Monthly Electric Generator Inventory");
    assert.equal(file.source.publisher, "U.S. Energy Information Administration");
    assert.match(file.source.license, /public domain/i);
    assert.equal(file.source.released, "2026-10-23");
    assert.ok(file.method.length >= 3);
    assert.equal(file.floorMw, 250);
  });

  it("counts what it read and what it kept, by fuel", () => {
    assert.equal(file.counts.generatorsRead, 4);
    assert.equal(file.counts.plantsRead, 2);
    assert.equal(file.counts.plantsKept, 1);
    assert.deepEqual(file.counts.byFuel, { NUC: 1 });
    assert.equal(file.counts.keptMw, 2430);
    assert.deepEqual(file.plants.map((p) => p.name), ["Comanche Peak"]);
  });

  it("validates, and says what is wrong with a file that does not", () => {
    assert.equal(validatePlantsFile(JSON.parse(JSON.stringify(file))).plants.length, 1);
    const bad = JSON.parse(JSON.stringify(file));
    bad.plants[0].fuel = "MAGIC";
    bad.plants.push({ ...bad.plants[0], fuel: "NUC", lat: 95 });
    assert.throws(() => validatePlantsFile(bad), /fuel.*MAGIC[\s\S]*duplicate|duplicate[\s\S]*MAGIC|latitude/i);
    assert.throws(() => validatePlantsFile({ ...file, dataMonth: "September" }), /dataMonth/);
    assert.throws(() => validatePlantsFile({ ...file, source: { ...file.source, url: "http://insecure" } }), /https/);
  });
});

describe("what the map is sent", () => {
  it("is the plants with their source, data month and counts, without the method text", () => {
    const { plants } = aggregatePlants(parseOperatingSheet(SHEET).generators);
    const file = buildPlantsFile({
      month: "2026-09",
      retrieved: "2026-11-18",
      sourceUrl: "https://www.eia.gov/electricity/data/eia860m/xls/september_generator2026.xlsx",
      released: "2026-10-23",
      floorMw: 250,
      allPlants: plants,
      generatorCount: 4,
      skipped: { noCoordinates: 1, noCapacity: 1 },
    });
    const payload = plantsPayload(file);
    assert.deepEqual(payload.source, {
      name: "Form EIA-860M, Preliminary Monthly Electric Generator Inventory",
      publisher: "U.S. Energy Information Administration",
      url: "https://www.eia.gov/electricity/data/eia860m/",
      released: "2026-10-23",
    });
    assert.equal(payload.dataMonth, "2026-09");
    assert.equal(payload.floorMw, 250);
    assert.deepEqual(payload.counts, { plants: 1, mw: 2430, byFuel: { NUC: 1 } });
    assert.deepEqual(payload.plants.map((p) => p.name), ["Comanche Peak"]);
    assert.equal("method" in payload, false);
  });
});

describe("the committed power plants file", () => {
  const raw = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "power-plants.json"), "utf-8"));
  const file = validatePlantsFile(raw);

  it("is one EIA-860M month with a count in the range the map can draw smoothly", () => {
    assert.match(file.dataMonth, /^20\d\d-(0[1-9]|1[0-2])$/);
    assert.ok(file.plants.length >= 800 && file.plants.length <= 1500, `${file.plants.length} plants`);
    assert.equal(file.counts.plantsKept, file.plants.length);
    assert.ok(file.counts.plantsRead > file.plants.length);
  });

  it("keeps only plants at or above its floor, plus nuclear, each in a US state", () => {
    for (const p of file.plants) {
      assert.ok(p.mw >= file.floorMw || p.fuel === "NUC", `${p.name} ${p.mw} MW`);
      assert.match(p.state, /^[A-Z]{2}$/);
    }
    const nuclear = file.plants.filter((p) => p.fuel === "NUC").length;
    assert.ok(nuclear >= 50 && nuclear <= 60, `${nuclear} nuclear plants`);
  });

  it("sums to the totals it declares", () => {
    const byFuel: Record<string, number> = {};
    for (const p of file.plants) byFuel[p.fuel] = (byFuel[p.fuel] ?? 0) + 1;
    assert.deepEqual(file.counts.byFuel, byFuel);
    const mw = file.plants.reduce((s, p) => s + p.mw, 0);
    assert.ok(Math.abs(mw - file.counts.keptMw) < 1, `${mw} vs ${file.counts.keptMw}`);
  });
});
