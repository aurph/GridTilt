/**
 * The site map: four sections, each holding several features as chips.
 *
 * One source for the top bar, the phone menu, the footer, the 404, the search
 * palette and the old-route redirects. A feature's address is its section plus
 * `?tab=<chip>`; the section's first chip is the default and carries no
 * parameter. A feature that has views of its own (Analyze, GPU Prices) keeps
 * them one level down in `?sub=`, so the two never collide.
 *
 * States is the one section whose chips are not listed here: they are the
 * published state pages, read from the registry at /api/state-pages.
 */

export interface SectionChip {
  id: string;
  label: string;
}

export interface Section {
  id: "states" | "grid" | "buildout" | "markets";
  label: string;
  href: string;
  /** The line above the section's content. Names the data, nothing else. */
  statement: string;
  dek: string;
  chips: SectionChip[];
}

/** The query key a section's chip lives in. */
export const CHIP_PARAM = "tab";
/** The query key a feature's own second-level view lives in. */
export const SUB_PARAM = "sub";

export const SECTIONS: Section[] = [
  {
    id: "states",
    label: "States",
    href: "/states",
    statement: "What gets decided and built on each state's power grid.",
    dek: "Dated decisions, the documents behind them, and the next public dates.",
    chips: [],
  },
  {
    id: "grid",
    label: "Grid",
    href: "/grid",
    statement: "Data center campuses, power agreements and the interconnection queue.",
    dek: "Mapped by operator and grid region, with hourly demand and a dated record of what changed.",
    chips: [
      { id: "map", label: "Map" },
      { id: "queue", label: "Queue" },
      { id: "deals", label: "Deals" },
      { id: "live", label: "Live grid" },
      { id: "timeline", label: "Timeline" },
    ],
  },
  {
    id: "buildout",
    label: "Buildout",
    href: "/buildout",
    statement: "Named compute clusters, the supply chain behind them, and GPU rental prices.",
    dek: "Sourced figures, with estimates labeled.",
    chips: [
      { id: "compute", label: "Compute" },
      { id: "supply-chain", label: "Supply Chain" },
      { id: "gpu-prices", label: "GPU Prices" },
    ],
  },
  {
    id: "markets",
    label: "Markets",
    href: "/markets",
    statement: "The public companies behind the buildout.",
    dek: "Prices by sector, dated catalysts, and illustrative baskets and scenarios.",
    chips: [
      { id: "overview", label: "Overview" },
      { id: "equities", label: "Equities" },
      { id: "analyze", label: "Analyze" },
      { id: "catalysts", label: "Catalysts" },
    ],
  },
];

export function sectionById(id: Section["id"]): Section {
  return SECTIONS.find((s) => s.id === id) as Section;
}

/** The address of a chip: the bare section for its default chip. */
export function chipHref(sectionId: Section["id"], chipId?: string, sub?: string): string {
  const s = sectionById(sectionId);
  const params = new URLSearchParams();
  if (chipId && s.chips.length > 0 && chipId !== s.chips[0].id) params.set(CHIP_PARAM, chipId);
  if (sub) params.set(SUB_PARAM, sub);
  const qs = params.toString();
  return `${s.href}${qs ? `?${qs}` : ""}`;
}

function paramsOf(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

/** The chip a search string names for a section, or its default. */
export function chipFromSearch(section: Section, search: string): string {
  const t = paramsOf(search).get(CHIP_PARAM);
  return section.chips.some((c) => c.id === t) ? (t as string) : section.chips[0]?.id ?? "";
}

/**
 * Which section an address belongs to, for the top bar's active mark.
 * Entity pages light up the section they are reached from.
 */
export function sectionForPath(pathname: string): Section["id"] | null {
  if (pathname === "/states" || pathname.startsWith("/state/")) return "states";
  if (pathname === "/grid" || pathname.startsWith("/region/") || pathname.startsWith("/operator/")) return "grid";
  if (pathname === "/buildout" || pathname.startsWith("/compute-frontier")) return "buildout";
  if (pathname === "/markets" || pathname.startsWith("/stock/") || pathname.startsWith("/sector/")) return "markets";
  return null;
}

/**
 * Every address that used to be a page or an alias, and where it lives now.
 *
 * `tabToChip`: the old page had tabs that are now chips of the section.
 * `tabToSub`: the old page had tabs that are now the feature's own views.
 * `sub`: the alias named one view of a feature.
 */
interface LegacyRoute {
  section: Section["id"] | null;
  /** For a route that leaves the section model (the Brief). */
  to?: string;
  chip?: string;
  sub?: string;
  tabToChip?: Record<string, string>;
  tabToSub?: string[];
}

export const LEGACY_ROUTES: Record<string, LegacyRoute> = {
  "/overview": { section: "markets", chip: "overview" },
  "/stack": { section: "markets", chip: "equities" },
  "/analyze": { section: "markets", chip: "analyze", tabToSub: ["portfolio", "scenario"] },
  "/trade": { section: "markets", chip: "analyze", sub: "scenario" },
  "/portfolio": { section: "markets", chip: "analyze", sub: "portfolio" },
  "/catalysts": { section: "markets", chip: "catalysts" },
  "/power-map": { section: "grid", chip: "map", tabToChip: { map: "map", queue: "queue", deals: "deals" } },
  "/power-deals": { section: "grid", chip: "deals" },
  "/queue": { section: "grid", chip: "queue" },
  "/my-grid": { section: "grid", chip: "map" },
  "/timeline": { section: "grid", chip: "timeline" },
  "/compute-frontier": { section: "buildout", chip: "compute" },
  "/supply-chain": { section: "buildout", chip: "supply-chain" },
  "/neocloud-intel": { section: "buildout", chip: "gpu-prices", tabToSub: ["prices", "economics", "frontier"] },
  "/gpu-economics": { section: "buildout", chip: "gpu-prices", sub: "economics" },
  "/brief": { section: null, to: "/blog" },
};

/**
 * The new address for an old one, or null when the path is not an old route.
 * Every other query parameter rides along (a map view, a deal id, a timeline
 * record, a campaign tag); an old alias's own target wins over a stray `tab`.
 */
export function legacyRedirect(pathname: string, search = ""): string | null {
  const route = LEGACY_ROUTES[pathname];
  if (!route) return null;
  const incoming = paramsOf(search);
  if (!route.section) {
    const qs = incoming.toString();
    return `${route.to}${qs ? `?${qs}` : ""}`;
  }
  const section = sectionById(route.section);
  const oldTab = incoming.get(CHIP_PARAM);
  incoming.delete(CHIP_PARAM);
  incoming.delete(SUB_PARAM);

  let chip = route.chip as string;
  let sub = route.sub ?? null;
  // A fixed alias (/queue, /trade) has already said where it goes.
  const fixedAlias = route.sub !== undefined || (!route.tabToChip && !route.tabToSub);
  if (!fixedAlias && oldTab) {
    if (route.tabToChip?.[oldTab]) chip = route.tabToChip[oldTab];
    else if (route.tabToSub?.includes(oldTab)) sub = oldTab;
  }

  const out = new URLSearchParams();
  if (chip !== section.chips[0].id) out.set(CHIP_PARAM, chip);
  if (sub) out.set(SUB_PARAM, sub);
  incoming.forEach((v, k) => {
    if (!out.has(k)) out.set(k, v);
  });
  const qs = out.toString();
  return `${section.href}${qs ? `?${qs}` : ""}`;
}

/**
 * A feature's own query string with the section's chip and view kept in
 * front. Features that rewrite the address bar (Timeline filters, a basket's
 * tickers) call this so they do not drop the chip they are sitting in.
 */
export function withSectionParams(currentSearch: string, featureQuery: string): string {
  const current = paramsOf(currentSearch);
  const out = new URLSearchParams();
  for (const key of [CHIP_PARAM, SUB_PARAM]) {
    const v = current.get(key);
    if (v) out.set(key, v);
  }
  paramsOf(featureQuery).forEach((v, k) => {
    if (!out.has(k)) out.set(k, v);
  });
  const qs = out.toString();
  return qs ? `?${qs}` : "";
}

// ── Chip overflow ("+N more") ────────────────────────────────────────────────

/**
 * How many chips fit on one row. `widths` are the chips' measured widths in
 * order; when not all fit, room is kept for the "+N more" chip. At least one
 * chip always shows.
 */
export function fitCount(widths: number[], available: number, moreWidth: number, gap: number): number {
  if (widths.length === 0) return 0;
  const total = widths.reduce((a, w) => a + w, 0) + gap * (widths.length - 1);
  if (total <= available) return widths.length;
  let used = 0;
  let n = 0;
  for (const w of widths) {
    const next = used + (n > 0 ? gap : 0) + w;
    if (next + gap + moreWidth > available) break;
    used = next;
    n += 1;
  }
  return Math.max(1, n);
}

/**
 * Split chips into the row and the overflow list. The active chip is always
 * on the row: when it would fall into the overflow it takes the last slot.
 */
export function splitChips<T extends { id: string }>(
  chips: T[],
  activeId: string,
  visibleCount: number,
): { visible: T[]; overflow: T[] } {
  const n = Math.max(1, Math.min(visibleCount, chips.length));
  if (n >= chips.length) return { visible: chips, overflow: [] };
  const activeIndex = chips.findIndex((c) => c.id === activeId);
  if (activeIndex < n) return { visible: chips.slice(0, n), overflow: chips.slice(n) };
  const visible = [...chips.slice(0, n - 1), chips[activeIndex]];
  const overflow = chips.filter((c) => !visible.includes(c));
  return { visible, overflow };
}
