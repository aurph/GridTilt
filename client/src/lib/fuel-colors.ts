/**
 * One color per fuel, for the live fuel mix and for power plants on the map,
 * so the two read as one language. Codes are EIA's hourly fuel types.
 */
import { CATEGORY_COLORS, INK } from "./tokens";

export const FUEL_COLOR: Record<string, string> = {
  NG: CATEGORY_COLORS.gas,
  COL: CATEGORY_COLORS.coal,
  NUC: CATEGORY_COLORS.nuclear,
  WND: CATEGORY_COLORS.wind,
  SUN: CATEGORY_COLORS.solar,
  SNB: CATEGORY_COLORS.solar,
  WAT: CATEGORY_COLORS.hydro,
  BAT: CATEGORY_COLORS.storage,
  PS: CATEGORY_COLORS.storage,
  UES: CATEGORY_COLORS.storage,
  GEO: CATEGORY_COLORS.renewables,
  BIO: CATEGORY_COLORS.renewables,
};

/** Petroleum, "other" and anything unlisted take the muted ink. */
export const fuelColor = (code: string): string => FUEL_COLOR[code] ?? INK.muted;

/** Plain names for the fuel codes power plants carry (server/power-plants.ts PLANT_FUELS). */
export const PLANT_FUEL_LABEL: Record<string, string> = {
  NG: "Natural gas",
  COL: "Coal",
  NUC: "Nuclear",
  WND: "Wind",
  SUN: "Solar",
  WAT: "Hydro",
  PS: "Pumped storage",
  BAT: "Battery storage",
  GEO: "Geothermal",
  BIO: "Biomass",
  OIL: "Petroleum",
  OTH: "Other",
};

/** The fuels as the legend groups them: one swatch per color. */
export const PLANT_FUEL_GROUPS: Array<{ codes: string[]; label: string }> = [
  { codes: ["NUC"], label: "Nuclear" },
  { codes: ["NG"], label: "Natural gas" },
  { codes: ["COL"], label: "Coal" },
  { codes: ["WND"], label: "Wind" },
  { codes: ["SUN"], label: "Solar" },
  { codes: ["WAT"], label: "Hydro" },
  { codes: ["PS", "BAT"], label: "Storage" },
  { codes: ["GEO", "BIO"], label: "Geothermal, biomass" },
  { codes: ["OIL", "OTH"], label: "Petroleum, other" },
];
