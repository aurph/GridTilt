/**
 * GridTilt data tokens - TS mirror of the :root vars in index.css.
 * Chart code (Recharts/d3/SVG props) needs literal values, so this file is
 * the source of truth for anything rendered outside the CSS cascade.
 * Keep in sync with index.css; tokens-sync.test.ts asserts the sync.
 *
 * Editorial system (2026-07): warm paper ground, warm ink, brand orange as
 * the single graphic accent. Surface semantics on paper: base = page
 * ground, raised = plate (lighter), sunken = well (darker), overlay =
 * popover stock.
 */

export const SURFACE = {
  sunken: "#161616",
  base: "#101010",
  raised: "#161616",
  overlay: "#161616",
} as const;

export const BORDER = {
  subtle: "rgba(255, 255, 255, 0.10)",
  strong: "rgba(255, 255, 255, 0.22)",
} as const;

/**
 * primary (#F07800) is GRAPHIC-ONLY on paper (~2.8:1 against the ground):
 * logo mark, active bars, the highlighted series, rules. Orange rendered as
 * TEXT uses secondary (#F58A1F), which passes AA on the paper ground.
 */
export const BRAND = {
  primary: "#F07800",
  secondary: "#F58A1F",
  glow: "rgba(240, 120, 0, 0.14)",
  wash: "rgba(240, 120, 0, 0.07)",
} as const;

export const INK = {
  primary: "#F2F2F0",
  secondary: "#ABABA6",
  muted: "#7E7E79",
  faint: "#5C5C58",
} as const;

/** State colors. Never use these for series identity. */
export const SEMANTIC = {
  positive: "#3FA36A",
  positiveDeep: "#2E8A55",
  negative: "#E05C4B",
  negativeDeep: "#C24F3F",
  warning: "#C99A2E",
  critical: "#D9756A",
  info: "#5A93DE",
} as const;

/**
 * Data-quality treatment: sourced points render solid at full opacity;
 * estimated values keep the series hue at reduced opacity; synthetic fill
 * spans (interpolation between anchors) render dashed at low opacity.
 */
export const DATA_QUALITY = {
  estimateFlag: "#C99A2E",
  estimatedOpacity: 0.55,
  syntheticOpacity: 0.35,
  syntheticDash: "4 3",
} as const;

/**
 * Categorical palette - fixed order. Values are recalibrated for the paper
 * ground in the chart-theme task; assign slots in order, never cycle. The
 * ORDER is the colorblind-safety mechanism: do not reorder or insert.
 * At >4 visible series, direct labels are mandatory (color alone is not
 * enough in scatter/treemap contexts where any two slots can be adjacent).
 */
export const SERIES = [
  "#5A93DE", // 1 blue
  "#BC8626", // 2 amber
  "#34A87E", // 3 teal
  "#8F84E6", // 4 violet
  "#DE5C8E", // 5 magenta
  "#3B9EC4", // 6 cyan
  "#E2652A", // 7 rust
  "#47A981", // 8 green
  "#B372C6", // 9 pink
  "#AD7D1D", // 10 brown
] as const;

/**
 * Stable category -> color mapping. Same category = same color everywhere
 * in the app (Tilt Overview mover tags, The Stack layers, Power Map,
 * Compute Frontier, TheTrade). Categories that never co-occur in one chart
 * may share a slot (solar/power); co-occurring ones never do.
 */
export const CATEGORY_COLORS: Record<string, string> = {
  // Sectors / mover tags
  compute: SERIES[0], // blue
  datacenters: SERIES[2], // teal
  construction: SERIES[9], // brown
  power: SERIES[1], // amber
  utilities: SERIES[8], // pink (grid owns cyan; both appear on The Stack)
  uranium: SERIES[4], // magenta
  // Energy sources (TheTrade + Compute Frontier co-occur: must be distinct)
  nuclear: SERIES[3], // violet - matches existing purple convention
  gas: SERIES[6], // rust
  renewables: SERIES[7], // green
  grid: SERIES[5], // cyan
  solar: SERIES[1], // amber (never co-charts with power)
  wind: SERIES[0], // blue (never co-charts with compute)
  hydro: SERIES[2], // teal
  storage: SERIES[4], // magenta (never co-charts with uranium)
  coal: INK.faint,
};

/**
 * Facility/project status - state, not identity, so it draws on semantic
 * steps. Used by Power Map markers and Compute Frontier status charts.
 */
export const STATUS_COLORS = {
  operational: BRAND.primary,
  construction: "#F5A25A",
  announced: "#BDBAB4",
} as const;

export const CHART_CHROME = {
  axis: "#7E7E79",
  tick: "#ABABA6",
  grid: "rgba(255, 255, 255, 0.08)",
  crosshair: "rgba(255, 255, 255, 0.30)",
  refLine: "rgba(255, 255, 255, 0.18)",
} as const;

export const FONT = {
  mono: 'ui-monospace, "SF Mono", monospace',
  sans: '"Archivo", -apple-system, "Segoe UI", sans-serif',
  serif: '"Archivo", -apple-system, sans-serif',
} as const;
