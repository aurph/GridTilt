/**
 * Published state pages as links.
 *
 * The only source of truth for which states have a page is the curated
 * registry the server serves at /api/state-pages. Nothing here hardcodes a
 * state: a state appears exactly when the registry publishes it and the
 * client knows its name.
 */

export interface PublishedStatePage {
  slug: string;
  code: string;
  reviewed?: string;
  /** Dated decisions on the page, counted by the server from the registry. */
  decisions?: number;
  /** The earliest public date still ahead, or null when none is listed. */
  nextDate?: { date: string; through?: string; what: string } | null;
}

/** One row of the /states index. */
export interface StateIndexRow extends StatePageLink {
  decisions: number | null;
  nextDate: { date: string; through?: string; what: string } | null;
}

/** The /states rows: exactly the registry's published pages, alphabetical. */
export function stateIndexRows(
  pages: PublishedStatePage[] | undefined | null,
  states: Record<string, StateNameLike>,
): StateIndexRow[] {
  const bySlug = new Map((pages ?? []).map((p) => [p.slug, p]));
  return statePageLinks(pages, states).map((link) => {
    const p = bySlug.get(link.slug);
    return {
      ...link,
      decisions: typeof p?.decisions === "number" ? p.decisions : null,
      nextDate: p?.nextDate ?? null,
    };
  });
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10-30" as "October 30, 2026". Returns the input when it is not a day. */
export function longDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** The oldest review date among the rows: the date the whole index can claim. */
export function oldestReview(rows: { reviewed: string | null }[]): string | null {
  const days = rows.map((r) => r.reviewed).filter((d): d is string => Boolean(d)).sort();
  return days[0] ?? null;
}

export interface StateNameLike {
  name: string;
}

export interface StatePageLink {
  slug: string;
  code: string;
  name: string;
  href: string;
  reviewed: string | null;
}

/** One link per published page, alphabetical by state name. */
export function statePageLinks(
  pages: PublishedStatePage[] | undefined | null,
  states: Record<string, StateNameLike>,
): StatePageLink[] {
  if (!pages) return [];
  return pages
    .filter((p) => p && typeof p.slug === "string" && states[p.code])
    .map((p) => ({
      slug: p.slug,
      code: p.code,
      name: states[p.code].name,
      href: `/state/${p.slug}`,
      reviewed: p.reviewed ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Published-page lookup by postal code, for surfaces that list states by code. */
export function statePagesByCode(
  pages: PublishedStatePage[] | undefined | null,
  states: Record<string, StateNameLike>,
): Record<string, StatePageLink> {
  const out: Record<string, StatePageLink> = {};
  for (const link of statePageLinks(pages, states)) out[link.code] = link;
  return out;
}
