/**
 * Shared table sorting rules.
 *
 * Equities already had a sort (stack-transforms.sortTableRows, domain-typed
 * to stock rows). Every other table in the app shipped with fixed headers you
 * could not reorder. Rather than grow a second bespoke sort per page, the two
 * decisions that were being re-made each time live here:
 *
 *   nextSort  - what clicking a header does
 *   compare   - how two cell values order, with blanks always last
 *
 * Pure, so both are tested without a DOM.
 */

export type SortDir = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

/**
 * Clicking the active column flips direction; clicking a new column selects
 * it at that column's natural first direction. Text reads best A->Z, numbers
 * best largest-first, so the caller declares which columns are textual.
 */
export function nextSort<K extends string>(
  current: SortState<K>,
  clicked: K,
  ascFirst: readonly K[] = [],
): SortState<K> {
  if (current.key === clicked) {
    return { key: clicked, dir: current.dir === "asc" ? "desc" : "asc" };
  }
  return { key: clicked, dir: ascFirst.includes(clicked) ? "asc" : "desc" };
}

/**
 * Order two cell values. Null/undefined/NaN sink to the bottom in BOTH
 * directions: a missing number is not a small number, and flipping the sort
 * must not float "no data" to the top of the table.
 */
export function compare(a: unknown, b: unknown, dir: SortDir): number {
  const mul = dir === "asc" ? 1 : -1;
  const aBlank = a === null || a === undefined || (typeof a === "number" && Number.isNaN(a));
  const bBlank = b === null || b === undefined || (typeof b === "number" && Number.isNaN(b));
  if (aBlank && bBlank) return 0;
  if (aBlank) return 1;
  if (bBlank) return -1;
  if (typeof a === "string" || typeof b === "string") {
    return mul * String(a).localeCompare(String(b));
  }
  return mul * (Number(a) - Number(b));
}

/**
 * Sort a copy by a column accessor. `tieBreak` keeps the order stable and
 * meaningful when a column has repeats (every "announced" facility, say)
 * instead of leaving it to engine-dependent input order.
 */
export function sortBy<T>(
  rows: readonly T[],
  accessor: (row: T) => unknown,
  dir: SortDir,
  tieBreak?: (row: T) => string,
): T[] {
  return [...rows].sort((x, y) => {
    const c = compare(accessor(x), accessor(y), dir);
    if (c !== 0) return c;
    return tieBreak ? tieBreak(x).localeCompare(tieBreak(y)) : 0;
  });
}

/** aria-sort value for a header cell. */
export function ariaSort(active: boolean, dir: SortDir): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return dir === "asc" ? "ascending" : "descending";
}
