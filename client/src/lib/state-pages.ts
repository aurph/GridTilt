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
