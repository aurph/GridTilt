/**
 * Megawatt-hours expressed as a household comparison.
 *
 * A rated annual figure over a national average supports a sense of scale, not a
 * measurement, so results are rounded. "730,609 homes" would claim precision
 * neither the numerator nor the denominator has.
 */

/**
 * Average annual electricity purchased by one US residential utility customer:
 * 10,791 kWh, or 10.791 MWh. EIA, 2022 (the year EIA states this figure for).
 * https://www.eia.gov/tools/faqs/faq.php?id=97&t=3
 */
export const MWH_PER_US_HOME_YEAR = 10.791;

/** Round coarser as magnitude grows: 730,609 -> 730,000, 417 -> 420. */
export function roundToScale(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 100_000) return Math.round(n / 10_000) * 10_000;
  if (n >= 10_000) return Math.round(n / 1_000) * 1_000;
  if (n >= 1_000) return Math.round(n / 100) * 100;
  return Math.round(n / 10) * 10;
}

/**
 * How many US homes' annual electricity a facility's annual output compares to.
 * Returns null when the input is missing or not a usable number, so the caller
 * omits the comparison rather than printing a fabricated zero.
 */
export function homesEquivalent(annualMWh: number | null | undefined): number | null {
  if (typeof annualMWh !== "number" || !Number.isFinite(annualMWh) || annualMWh <= 0) {
    return null;
  }
  return roundToScale(annualMWh / MWH_PER_US_HOME_YEAR);
}
