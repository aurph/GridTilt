/**
 * Monthly residential price series (EIA via /api/physical/retail-rates).
 * The series can skip a month (the server drops null or out-of-range rows),
 * so "a year earlier" is found by month, never by counting points back.
 */

/** "2026-07" minus 12 months -> "2025-07". */
export function monthsBefore(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** The point exactly 12 months before the latest, or null when that month is missing. */
export function yearAgoPoint<T extends { month: string }>(series: T[]): T | null {
  const latest = series[series.length - 1];
  if (!latest) return null;
  const target = monthsBefore(latest.month, 12);
  return series.find((p) => p.month === target) ?? null;
}

/** Percent change from the same month a year earlier, or null when either month is missing. */
export function yearOnYearChange(series: Array<{ month: string; centsPerKwh: number }>): number | null {
  const latest = series[series.length - 1];
  const before = yearAgoPoint(series);
  if (!latest || !before || !(before.centsPerKwh > 0)) return null;
  return ((latest.centsPerKwh - before.centsPerKwh) / before.centsPerKwh) * 100;
}
