/**
 * GridTilt chart theme (Lake 1) - one theme object consumed by every chart.
 * Recharts charts spread the prop bundles; d3/SVG/visx charts read the raw
 * values. No chart should hardcode an axis color, tick size, or tooltip
 * style after this file exists.
 */
import type { CSSProperties } from "react";
import { utcMonth, utcYear } from "d3-time";
import { BORDER, BRAND, CHART_CHROME, FONT, INK, SURFACE } from "./tokens";

/**
 * Editorial chart grammar: charts sit directly on the paper ground (no chart
 * boxes), solid hairline grid, sans labels, direct end-of-line labels over
 * legend boxes wherever the layout allows. One highlighted series per chart
 * (HIGHLIGHT); everything contextual reads in warm gray (CONTEXT).
 */
export const chartTheme = {
  axis: {
    stroke: CHART_CHROME.axis,
    tickFill: CHART_CHROME.tick,
    fontSize: 11,
    fontFamily: FONT.sans,
  },
  grid: {
    stroke: CHART_CHROME.grid,
    strokeDasharray: "0",
  },
  crosshair: {
    stroke: CHART_CHROME.crosshair,
    strokeWidth: 1,
    strokeDasharray: "3 3",
  },
  refLine: {
    stroke: CHART_CHROME.refLine,
    strokeDasharray: "4 4",
  },
  tooltip: {
    background: SURFACE.overlay,
    border: BORDER.strong,
    labelColor: INK.secondary,
    valueColor: INK.primary,
    fontSize: 12,
    fontFamily: FONT.sans,
    radius: 2,
  },
  label: {
    fontSize: 12,
    fontFamily: FONT.sans,
    fill: INK.secondary,
  },
  line: {
    strokeWidth: 2,
    dot: false,
    activeDotRadius: 3,
  },
} as const;

/**
 * The one highlighted series per chart: brand orange. Never a categorical
 * slot; if two series need emphasis the chart is over-asked - split it.
 */
export const HIGHLIGHT = BRAND.primary;

/** De-emphasized context series (other lines behind the highlight). */
export const CONTEXT = INK.faint;

/** Spread into Recharts <XAxis>/<YAxis>: {...axisProps} */
export const axisProps = {
  stroke: chartTheme.axis.stroke,
  tick: {
    fontSize: chartTheme.axis.fontSize,
    fill: chartTheme.axis.tickFill,
    fontFamily: chartTheme.axis.fontFamily,
  },
  tickLine: false as const,
  axisLine: { stroke: chartTheme.axis.stroke },
};

/** Spread into Recharts <CartesianGrid>: {...gridProps} */
export const gridProps = {
  stroke: chartTheme.grid.stroke,
  strokeDasharray: chartTheme.grid.strokeDasharray,
  vertical: false as const,
};

/** Pass to Recharts <Tooltip contentStyle={tooltipContentStyle} ...> */
export const tooltipContentStyle: CSSProperties = {
  background: chartTheme.tooltip.background,
  border: `1px solid ${chartTheme.tooltip.border}`,
  borderRadius: chartTheme.tooltip.radius,
  fontSize: chartTheme.tooltip.fontSize,
  fontFamily: chartTheme.tooltip.fontFamily,
  padding: "8px 10px",
};

export const tooltipLabelStyle: CSSProperties = {
  color: chartTheme.tooltip.labelColor,
  fontSize: chartTheme.tooltip.fontSize,
  fontFamily: chartTheme.tooltip.fontFamily,
  marginBottom: 4,
};

export const tooltipItemStyle: CSSProperties = {
  color: chartTheme.tooltip.valueColor,
  fontSize: chartTheme.tooltip.fontSize,
  fontFamily: chartTheme.tooltip.fontFamily,
  padding: 0,
};

/** Pass to Recharts <Tooltip cursor={tooltipCursor}> for the crosshair */
export const tooltipCursor = {
  stroke: chartTheme.crosshair.stroke,
  strokeWidth: chartTheme.crosshair.strokeWidth,
  strokeDasharray: chartTheme.crosshair.strokeDasharray,
};

/**
 * Clean month/quarter boundary ticks for a true time axis, densifying as the
 * range shortens. Returns UTC Dates; feed `+d` values to Recharts `ticks` or
 * map over them in an SVG chart.
 */
export function timeTicks(x0: number, x1: number, width: number): Date[] {
  const spanDays = (x1 - x0) / 86_400_000;
  const targetCount = Math.max(3, Math.min(10, Math.floor(width / 90)));
  let interval;
  if (spanDays > 900) {
    const months = Math.ceil(spanDays / 30 / targetCount / 3) * 3;
    interval = utcMonth.every(Math.max(3, months)) ?? utcYear.every(1);
  } else if (spanDays > 240) {
    interval = utcMonth.every(Math.max(1, Math.round(spanDays / 30 / targetCount)));
  } else {
    interval = utcMonth.every(1);
  }
  return (interval ?? utcMonth.every(1))!.range(new Date(x0), new Date(x1 + 1));
}
