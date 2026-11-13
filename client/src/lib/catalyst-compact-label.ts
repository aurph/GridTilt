/**
 * Short form of a catalyst date label for narrow date columns (the landing
 * preview, the Overview sidebar, the Catalysts upcoming list).
 *
 * The server writes "around Nov 2026" or "around Nov 15, 2026" for an
 * estimated date and "Nov 2026" for a month window. In a 40-60 px column the
 * long form wrapped to three lines. The compact form keeps the estimate
 * visible as "est." and drops the year when it is the current year:
 *   "around Nov 2026"     -> "Nov est."       (current year)
 *   "around Nov 15, 2026" -> "Nov 15 est."
 *   "around Mar 2027"     -> "Mar '27 est."
 *   "Dec 2026"            -> "Dec 2026"       (unchanged: not an estimate)
 */
export function compactCatalystLabel(label: string, now: Date = new Date()): string {
  const m = /^around (\w{3})(?: (\d{1,2}))?,? (\d{4})$/.exec(label.trim());
  if (!m) return label;
  const [, mon, day, year] = m;
  const yearPart = Number(year) === now.getFullYear() ? "" : ` '${year.slice(2)}`;
  return `${mon}${day ? ` ${day}` : ""}${yearPart} est.`;
}
