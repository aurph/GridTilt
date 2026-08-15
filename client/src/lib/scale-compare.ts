/**
 * Turning megawatt-hours into something a person can picture.
 *
 * These comparisons exist to answer questions like "is that a lot?" from someone
 * who does not work in power. They are deliberately coarse: the input is a rated
 * annual figure, the divisor is a national average, and the output is a sense of
 * scale rather than a measurement. Rounding is therefore part of the honesty,
 * not a cosmetic choice - printing "730,609 homes" claims a precision that
 * neither the numerator nor the denominator supports.
 */

/**
 * Average annual electricity purchased by one US residential utility customer:
 * 10,791 kWh, or 10.791 MWh. EIA, 2022 (the year EIA states this figure for).
 * https://www.eia.gov/tools/faqs/faq.php?id=97&t=3
 */
export const MWH_PER_US_HOME_YEAR = 10.791;

/**
 * Round to a precision the underlying numbers can actually carry.
 *
 * Large counts lose their trailing digits entirely; small ones keep more, since
 * "about 900" and "about 1,000" are meaningfully different while "about 730,000"
 * and "about 731,000" are not.
 */
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
