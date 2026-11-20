// ─── Power plants for the map ───────────────────────────────────────────────
//
// One source: Form EIA-860M, EIA's monthly inventory of operating generators
// (public domain). scripts/ingest-power-plants.ts reads the release's
// "Operating" sheet, and this module rolls generators up to plants, picks each
// plant's main fuel, applies the size floor and builds server/data/power-plants.json.
// The server reads that file back through validatePlantsFile, so a bad edit
// fails at load instead of drawing a wrong plant.
//
// Nothing here is estimated. Capacity is nameplate MW as EIA lists it; a
// technology this module does not know is filed as Other and reported, never
// guessed into a named fuel.

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Fuel codes shared with the live grid card (EIA's hourly fuel types). */
export const PLANT_FUELS = ["NG", "COL", "NUC", "WND", "SUN", "WAT", "PS", "BAT", "GEO", "BIO", "OIL", "OTH"] as const;
export type PlantFuel = (typeof PLANT_FUELS)[number];

/** EIA-860M "Technology" -> fuel code. Every name in the September 2026 release is listed. */
const TECHNOLOGY_FUEL: Record<string, PlantFuel> = {
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
  Hydrokinetic: "WAT",
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

/** The fuel code for an EIA technology name, or null when the name is not one this module knows. */
export function fuelForTechnology(technology: string): PlantFuel | null {
  return TECHNOLOGY_FUEL[technology.trim()] ?? null;
}

/** One operable generator, as the Operating sheet lists it. */
export interface GeneratorRow {
  plantId: number;
  plantName: string;
  /** The reporting entity (the operator). */
  entity: string;
  state: string;
  /** Balancing authority code; blank when EIA lists none. */
  ba: string;
  technology: string;
  nameplateMw: number;
  lat: number;
  lng: number;
}

export interface ParsedInventory {
  /** The month the inventory describes, YYYY-MM, from the sheet's title. */
  month: string;
  generators: GeneratorRow[];
  skipped: { noCoordinates: number; noCapacity: number };
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const REQUIRED_COLUMNS = [
  "Entity Name",
  "Plant ID",
  "Plant Name",
  "Plant State",
  "Balancing Authority Code",
  "Nameplate Capacity (MW)",
  "Technology",
  "Latitude",
  "Longitude",
] as const;

const EIA_860M_PAGE = "https://www.eia.gov/electricity/data/eia860m/";

/**
 * The current release named on EIA's EIA-860M page: the first file link that
 * is not inside an HTML comment (EIA keeps months it has not published yet
 * commented out above the real rows) and the page's release date.
 */
export function latestReleaseFromPage(html: string): { url: string; month: string; released: string } {
  const visible = html.replace(/<!--[\s\S]*?-->/g, "");
  const link = /href="([^"]*\/([a-z]+)_generator(\d{4})\.xlsx)"/i.exec(visible);
  if (!link) throw new Error(`no generator file link found on ${EIA_860M_PAGE}`);
  const mi = MONTHS.indexOf(link[2].toLowerCase());
  if (mi < 0) throw new Error(`the file link names an unknown month: ${link[1]}`);
  const date = /Release Date:\s*(?:<[^>]+>\s*)*([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/.exec(visible);
  const di = date ? MONTHS.indexOf(date[1].toLowerCase()) : -1;
  if (!date || di < 0) throw new Error(`no release date found on ${EIA_860M_PAGE}`);
  return {
    url: new URL(link[1], EIA_860M_PAGE).toString(),
    month: `${link[3]}-${String(mi + 1).padStart(2, "0")}`,
    released: `${date[3]}-${String(di + 1).padStart(2, "0")}-${date[2].padStart(2, "0")}`,
  };
}

function toNumber(v: string | null | undefined): number {
  if (v === null || v === undefined) return NaN;
  const t = v.replace(/,/g, "").trim();
  return t === "" ? NaN : Number(t);
}

/**
 * The "Operating" sheet of an EIA-860M workbook as generator rows. Columns
 * are found by header name, so a column EIA adds or moves does not shift the
 * data. Rows without a numeric plant id (blank lines, the notes under the
 * table) are not generators and are passed over.
 */
export function parseOperatingSheet(rows: Iterable<(string | null)[]>): ParsedInventory {
  let month: string | null = null;
  let col: Record<string, number> | null = null;
  const generators: GeneratorRow[] = [];
  const skipped = { noCoordinates: 0, noCapacity: 0 };

  // Stepped by hand: the project compiles without downlevelIteration, and the
  // sheet is read as a stream rather than held in memory.
  const it = rows[Symbol.iterator]();
  for (let step = it.next(); !step.done; step = it.next()) {
    const row = step.value;
    if (!col) {
      if (!month) {
        for (const cell of row) {
          const m = cell ? /as of\s+([A-Za-z]+)\s+(\d{4})/.exec(cell) : null;
          const mi = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
          if (m && mi >= 0) month = `${m[2]}-${String(mi + 1).padStart(2, "0")}`;
        }
      }
      const names = row.map((c) => (c ?? "").trim());
      if (names.includes("Plant ID")) {
        if (!month) throw new Error('the sheet has no title of the form "... as of <Month> <Year>" above its header row');
        const missing = REQUIRED_COLUMNS.filter((c) => !names.includes(c));
        if (missing.length > 0) throw new Error(`the Operating sheet is missing column(s): ${missing.join(", ")}`);
        col = Object.fromEntries(names.map((n, i) => [n, i]));
      }
      continue;
    }
    const plantId = toNumber(row[col["Plant ID"]]);
    if (!Number.isInteger(plantId) || plantId <= 0) continue;
    const nameplateMw = toNumber(row[col["Nameplate Capacity (MW)"]]);
    if (!Number.isFinite(nameplateMw) || nameplateMw <= 0) {
      skipped.noCapacity += 1;
      continue;
    }
    const lat = toNumber(row[col["Latitude"]]);
    const lng = toNumber(row[col["Longitude"]]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      skipped.noCoordinates += 1;
      continue;
    }
    const text = (name: string) => (row[col![name]] ?? "").trim();
    generators.push({
      plantId,
      plantName: text("Plant Name"),
      entity: text("Entity Name"),
      state: text("Plant State"),
      ba: text("Balancing Authority Code"),
      technology: text("Technology"),
      nameplateMw,
      lat,
      lng,
    });
  }
  if (!col) throw new Error('the sheet has no header row (no "Plant ID" column), or no title of the form "... as of <Month> <Year>"');
  return { month: month as string, generators, skipped };
}

export interface PowerPlant {
  /** EIA plant id. */
  id: number;
  name: string;
  operator: string;
  /** The fuel with the most nameplate capacity at the plant. */
  fuel: PlantFuel;
  /** Nameplate MW across the plant's operable generators. */
  mw: number;
  state: string;
  /** Balancing authority code, or null where EIA lists none. */
  ba: string | null;
  lat: number;
  lng: number;
}

function largest(weights: Map<string, number>, order?: readonly string[]): string | null {
  let best: string | null = null;
  let bestW = -Infinity;
  const keys = order ? order.filter((k) => weights.has(k)) : Array.from(weights.keys()).sort();
  for (const k of keys) {
    const w = weights.get(k) as number;
    if (w > bestW) {
      best = k;
      bestW = w;
    }
  }
  return best;
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Generators rolled up to plants, largest first. */
export function aggregatePlants(generators: GeneratorRow[]): { plants: PowerPlant[]; unmappedTechnologies: string[] } {
  interface Acc {
    first: GeneratorRow;
    mw: number;
    fuel: Map<string, number>;
    entity: Map<string, number>;
    ba: Map<string, number>;
  }
  const byPlant = new Map<number, Acc>();
  const unmapped = new Set<string>();
  const add = (m: Map<string, number>, k: string, w: number) => m.set(k, (m.get(k) ?? 0) + w);

  for (const g of generators) {
    let acc = byPlant.get(g.plantId);
    if (!acc) {
      acc = { first: g, mw: 0, fuel: new Map(), entity: new Map(), ba: new Map() };
      byPlant.set(g.plantId, acc);
    }
    let fuel = fuelForTechnology(g.technology);
    if (!fuel) {
      unmapped.add(g.technology);
      fuel = "OTH";
    }
    acc.mw += g.nameplateMw;
    add(acc.fuel, fuel, g.nameplateMw);
    add(acc.entity, g.entity, g.nameplateMw);
    if (g.ba) add(acc.ba, g.ba, g.nameplateMw);
  }

  const plants: PowerPlant[] = [];
  byPlant.forEach((acc, id) => {
    plants.push({
      id,
      name: acc.first.plantName,
      operator: largest(acc.entity) ?? "",
      fuel: largest(acc.fuel, PLANT_FUELS) as PlantFuel,
      mw: round(acc.mw, 1),
      state: acc.first.state,
      ba: largest(acc.ba),
      lat: round(acc.first.lat, 4),
      lng: round(acc.first.lng, 4),
    });
  });
  plants.sort((a, b) => b.mw - a.mw || a.id - b.id);
  return { plants, unmappedTechnologies: Array.from(unmapped).sort() };
}

/** Plants at or above the size floor, plus every nuclear plant whatever its size. */
export function selectPlants(plants: PowerPlant[], floorMw: number): PowerPlant[] {
  return plants.filter((p) => p.mw >= floorMw || p.fuel === "NUC");
}

export interface PowerPlantsFile {
  dataset: "power-plants";
  /** The month the inventory describes, YYYY-MM. */
  dataMonth: string;
  /** The day the release was downloaded, YYYY-MM-DD. */
  retrieved: string;
  source: {
    name: string;
    publisher: string;
    /** The file that was read. */
    url: string;
    page: string;
    /** EIA's release date for this month's file, YYYY-MM-DD. */
    released: string;
    license: string;
    licenseUrl: string;
  };
  method: string[];
  floorMw: number;
  counts: {
    generatorsRead: number;
    plantsRead: number;
    plantsKept: number;
    /** Nameplate MW across the plants kept. */
    keptMw: number;
    /** Nameplate MW across every plant read, for the share the kept plants cover. */
    readMw: number;
    byFuel: Partial<Record<PlantFuel, number>>;
    skippedGenerators: { noCoordinates: number; noCapacity: number };
  };
  plants: PowerPlant[];
}

export function buildPlantsFile(input: {
  month: string;
  retrieved: string;
  sourceUrl: string;
  released: string;
  floorMw: number;
  allPlants: PowerPlant[];
  generatorCount: number;
  skipped: { noCoordinates: number; noCapacity: number };
}): PowerPlantsFile {
  const plants = selectPlants(input.allPlants, input.floorMw);
  const byFuel: Partial<Record<PlantFuel, number>> = {};
  for (const fuel of PLANT_FUELS) {
    const n = plants.filter((p) => p.fuel === fuel).length;
    if (n > 0) byFuel[fuel] = n;
  }
  return {
    dataset: "power-plants",
    dataMonth: input.month,
    retrieved: input.retrieved,
    source: {
      name: "Form EIA-860M, Preliminary Monthly Electric Generator Inventory",
      publisher: "U.S. Energy Information Administration",
      url: input.sourceUrl,
      page: "https://www.eia.gov/electricity/data/eia860m/",
      released: input.released,
      license: "Public domain (U.S. government work). EIA asks to be credited as the source, with the release date.",
      licenseUrl: "https://www.eia.gov/about/copyrights_reuse.php",
    },
    method: [
      'Read the "Operating" sheet: every operable generator at plants of 1 MW or more, including standby units and units out of service.',
      "Summed nameplate capacity (MW) across each plant's generators. Capacities are EIA's preliminary estimates for the month.",
      "A plant's fuel is the one with the most nameplate capacity there; its operator and balancing authority are the ones listed for the most capacity.",
      `Kept plants of ${input.floorMw} MW and up, plus every nuclear plant. Puerto Rico is a separate sheet and is not read.`,
      "Coordinates are EIA's, rounded to four decimal places. Nothing is estimated or added by GridTilt.",
    ],
    floorMw: input.floorMw,
    counts: {
      generatorsRead: input.generatorCount,
      plantsRead: input.allPlants.length,
      plantsKept: plants.length,
      keptMw: round(plants.reduce((s, p) => s + p.mw, 0), 1),
      readMw: round(input.allPlants.reduce((s, p) => s + p.mw, 0), 1),
      byFuel,
      skippedGenerators: input.skipped,
    },
    plants,
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The file, checked. Throws with every problem found (the first ten are listed). */
export function validatePlantsFile(raw: unknown): PowerPlantsFile {
  const errors: string[] = [];
  const f = (raw ?? {}) as Partial<PowerPlantsFile>;
  if (f.dataset !== "power-plants") errors.push(`dataset is ${JSON.stringify(f.dataset)}, expected "power-plants"`);
  if (typeof f.dataMonth !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(f.dataMonth)) errors.push(`dataMonth ${JSON.stringify(f.dataMonth)} is not YYYY-MM`);
  if (typeof f.retrieved !== "string" || !DAY.test(f.retrieved)) errors.push(`retrieved ${JSON.stringify(f.retrieved)} is not YYYY-MM-DD`);
  const src = f.source;
  if (!src || typeof src !== "object") errors.push("source is missing");
  else {
    if (typeof src.url !== "string" || !src.url.startsWith("https://")) errors.push(`source.url must be an https address, got ${JSON.stringify(src.url)}`);
    if (typeof src.released !== "string" || !DAY.test(src.released)) errors.push(`source.released ${JSON.stringify(src.released)} is not YYYY-MM-DD`);
    for (const k of ["name", "publisher", "license"] as const) {
      if (typeof src[k] !== "string" || src[k].trim() === "") errors.push(`source.${k} is missing`);
    }
  }
  if (typeof f.floorMw !== "number" || !(f.floorMw > 0)) errors.push("floorMw must be a positive number");
  if (!Array.isArray(f.method) || f.method.length === 0) errors.push("method is missing");
  if (!Array.isArray(f.plants)) errors.push("plants is not an array");
  else {
    const seen = new Set<number>();
    f.plants.forEach((p, i) => {
      const where = `plants[${i}] (${p?.name ?? "unnamed"})`;
      if (!Number.isInteger(p?.id) || p.id <= 0) errors.push(`${where}: id ${JSON.stringify(p?.id)} is not a positive integer`);
      else if (seen.has(p.id)) errors.push(`${where}: duplicate plant id ${p.id}`);
      else seen.add(p.id);
      if (typeof p?.name !== "string" || p.name.trim() === "") errors.push(`${where}: name is missing`);
      if (typeof p?.operator !== "string") errors.push(`${where}: operator is missing`);
      if (!(PLANT_FUELS as readonly string[]).includes(p?.fuel)) errors.push(`${where}: fuel ${JSON.stringify(p?.fuel)} is not one of ${PLANT_FUELS.join(", ")}`);
      if (typeof p?.mw !== "number" || !Number.isFinite(p.mw) || p.mw <= 0) errors.push(`${where}: mw ${JSON.stringify(p?.mw)} is not a positive number`);
      if (typeof p?.state !== "string" || !/^[A-Z]{2}$/.test(p.state)) errors.push(`${where}: state ${JSON.stringify(p?.state)} is not a two-letter code`);
      if (p?.ba !== null && typeof p?.ba !== "string") errors.push(`${where}: ba must be a code or null`);
      // The fifty states and DC: Hawaii's south tip to Alaska's north coast, the Aleutians to Maine.
      if (typeof p?.lat !== "number" || p.lat < 18 || p.lat > 72) errors.push(`${where}: latitude ${JSON.stringify(p?.lat)} is outside the United States`);
      if (typeof p?.lng !== "number" || p.lng < -180 || p.lng > -66) errors.push(`${where}: longitude ${JSON.stringify(p?.lng)} is outside the United States`);
    });
  }
  if (errors.length > 0) {
    throw new Error(`power-plants.json is not valid (${errors.length} problem${errors.length === 1 ? "" : "s"}):\n- ${errors.slice(0, 10).join("\n- ")}`);
  }
  return f as PowerPlantsFile;
}

/** What GET /api/map/plants answers. */
export interface PlantsPayload {
  source: { name: string; publisher: string; url: string; released: string };
  dataMonth: string;
  retrieved: string;
  floorMw: number;
  counts: { plants: number; mw: number; byFuel: Partial<Record<PlantFuel, number>> };
  plants: PowerPlant[];
}

/** The file as the map receives it: plants, their source and data month. The method text stays in the file. */
export function plantsPayload(file: PowerPlantsFile): PlantsPayload {
  return {
    source: { name: file.source.name, publisher: file.source.publisher, url: file.source.page, released: file.source.released },
    dataMonth: file.dataMonth,
    retrieved: file.retrieved,
    floorMw: file.floorMw,
    counts: { plants: file.plants.length, mw: file.counts.keptMw, byFuel: file.counts.byFuel },
    plants: file.plants,
  };
}

let cache: { path: string; mtimeMs: number; file: PowerPlantsFile } | null = null;

/** server/data/power-plants.json, validated; re-read only when the file changes. */
export function loadPowerPlants(dir: string = join(process.cwd(), "server", "data")): PowerPlantsFile {
  const path = join(dir, "power-plants.json");
  const { mtimeMs } = statSync(path);
  if (cache && cache.path === path && cache.mtimeMs === mtimeMs) return cache.file;
  const file = validatePlantsFile(JSON.parse(readFileSync(path, "utf-8")));
  cache = { path, mtimeMs, file };
  return file;
}
