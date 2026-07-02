/**
 * GridTilt data tokens (Lake 1) - TS mirror of the :root vars in index.css.
 * Chart code (Recharts/d3/SVG props) needs literal values, so this file is
 * the source of truth for anything rendered outside the CSS cascade.
 * Keep in sync with index.css; Lake 8 adds a test asserting the sync.
 */

export const SURFACE = {
  sunken: "#0A0A08",
  base: "#0E0E0C",
  raised: "#1A1917",
  overlay: "#26241F",
} as const;

export const BORDER = {
  subtle: "rgba(255, 255, 255, 0.06)",
  strong: "rgba(255, 255, 255, 0.14)",
} as const;

export const BRAND = {
  primary: "#F07800",
  secondary: "#F0A500",
  glow: "rgba(240, 120, 0, 0.12)",
  wash: "rgba(240, 120, 0, 0.05)",
} as const;

export const INK = {
  primary: "#F2F1ED",
  secondary: "#B0AEA6",
  muted: "#7A7871",
  faint: "#55534E",
} as const;

/** State colors. Never use these for series identity. */
export const SEMANTIC = {
  positive: "#4ade80",
  positiveDeep: "#22c55e",
  negative: "#f87171",
  negativeDeep: "#ef4444",
  warning: "#eab308",
  critical: "#dc2626",
  info: "#4dabf7",
} as const;

/**
 * Data-quality treatment: sourced points render solid at full opacity;
 * estimated values keep the series hue at reduced opacity; synthetic fill
 * spans (interpolation between anchors) render dashed at low opacity.
 */
export const DATA_QUALITY = {
  estimateFlag: "#d4a843",
  estimatedOpacity: 0.55,
  syntheticOpacity: 0.35,
  syntheticDash: "4 3",
} as const;

/**
 * Categorical palette - fixed order, CVD-validated on both dark surfaces
 * (min adjacent deltaE 13.9 under protanopia/deuteranopia, all slots >= 3:1
 * contrast). Assign slots in order, never cycle. The ORDER is the
 * colorblind-safety mechanism: do not reorder or insert.
 * At >4 visible series, direct labels are mandatory (color alone is not
 * enough in scatter/treemap contexts where any two slots can be adjacent).
 */
export const SERIES = [
  "#3987e5", // 1 blue
  "#c98500", // 2 amber
  "#199e70", // 3 teal
  "#9085e9", // 4 violet
  "#d55181", // 5 magenta
  "#1f9fb5", // 6 cyan
  "#d95926", // 7 rust
  "#3d9e3d", // 8 green
  "#bd6bce", // 9 pink
  "#b07d3f", // 10 brown
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
  operational: SEMANTIC.positiveDeep,
  construction: SEMANTIC.warning,
  announced: INK.muted,
} as const;

export const CHART_CHROME = {
  axis: "#55534E",
  tick: "#7A7871",
  grid: "rgba(255, 255, 255, 0.05)",
  crosshair: "rgba(255, 255, 255, 0.25)",
  refLine: "rgba(255, 255, 255, 0.18)",
} as const;

export const FONT = {
  mono: '"JetBrains Mono", monospace',
  sans: "Inter, sans-serif",
} as const;
