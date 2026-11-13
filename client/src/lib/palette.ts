/**
 * Quick-open search over what already exists: pages, states, tracked
 * tickers, clusters, and research posts. Pure ranking over static or
 * file-backed lists; the palette never fans out to quote APIs.
 */

export type PaletteCategory = "page" | "state" | "stock" | "cluster" | "research";

export interface PaletteEntry {
  id: string;
  /** Primary text, what the row shows and what ranks highest. */
  label: string;
  /** Secondary text: company name, operator and state, section. */
  hint?: string;
  category: PaletteCategory;
  /** Navigation target: the final route, never a redirect alias. */
  href: string;
  /** Extra matchable text that is not worth showing. */
  keywords?: string;
}

/** Order shown between equal scores: destinations before entities. */
const CATEGORY_RANK: Record<PaletteCategory, number> = {
  page: 0,
  state: 1,
  stock: 2,
  cluster: 3,
  research: 4,
};

export const PAGE_ENTRIES: PaletteEntry[] = [
  { id: "page-states", label: "States", hint: "state pages", category: "page", href: "/states", keywords: "state pages decisions public dates maryland virginia texas" },
  { id: "page-power-map", label: "Power Map", hint: "Grid", category: "page", href: "/grid", keywords: "data centers map facilities campuses grid" },
  { id: "page-queue", label: "Interconnection queue", hint: "Grid", category: "page", href: "/grid?tab=queue", keywords: "backlog interconnection queue lbnl" },
  { id: "page-deals", label: "Power agreements", hint: "Grid", category: "page", href: "/grid?tab=deals", keywords: "deals nuclear ppa agreements" },
  { id: "page-live-grid", label: "Live grid", hint: "Grid", category: "page", href: "/grid?tab=live", keywords: "eia demand hourly fuel mix generation operator" },
  { id: "page-timeline", label: "Timeline", hint: "Grid", category: "page", href: "/grid?tab=timeline", keywords: "events history deals announcements what happened dated" },
  { id: "page-compute", label: "Compute Frontier", hint: "Compute", category: "page", href: "/compute", keywords: "clusters gpu superclusters compute" },
  { id: "page-supply-chain", label: "Supply Chain", hint: "Compute", category: "page", href: "/compute?tab=supply-chain", keywords: "graph flow stages network bottleneck raw materials" },
  { id: "page-gpu", label: "GPU Prices", hint: "Compute", category: "page", href: "/compute?tab=gpu-prices", keywords: "neocloud rental h100 economics" },
  { id: "page-overview", label: "Overview", hint: "Markets", category: "page", href: "/markets", keywords: "dashboard tilt markets" },
  { id: "page-stack", label: "Equities", hint: "Markets", category: "page", href: "/markets?tab=equities", keywords: "stocks tickers heatmap the stack" },
  { id: "page-analyze", label: "Analyze", hint: "Markets", category: "page", href: "/markets?tab=analyze", keywords: "portfolio basket scenario calculator" },
  { id: "page-catalysts", label: "Catalysts", hint: "Markets", category: "page", href: "/markets?tab=catalysts", keywords: "earnings calendar events policy" },
  { id: "page-research", label: "Research", hint: "analysis and the Brief", category: "page", href: "/blog", keywords: "blog articles brief" },
  { id: "page-data-status", label: "Data status", hint: "freshness of each dataset", category: "page", href: "/data-status", keywords: "freshness updated stale last updated sources" },
];

export interface StateLike {
  name: string;
}

export interface StatePageLike {
  slug: string;
  code: string;
}

/** Published state pages only (/api/state-pages); a state with no page offers nothing. */
export function stateEntries(pages: StatePageLike[], states: Record<string, StateLike>): PaletteEntry[] {
  return pages
    .filter((p) => states[p.code])
    .map((p) => ({
      id: `state-${p.code}`,
      label: states[p.code].name,
      hint: "state page",
      category: "state" as const,
      href: `/state/${p.slug}`,
      keywords: p.code,
    }));
}

export interface SupplyNodeLike {
  name: string;
  companies: { ticker: string; name: string }[];
}

/**
 * Tickers from the supply-chain config, first node's name wins on repeats.
 * With `withPage` (the server's /api/stock-tickers), only tickers that have a
 * stock page: the config also lists companies GridTilt does not classify, and
 * a result that opens "not tracked" is a broken promise.
 */
export function stockEntries(nodes: SupplyNodeLike[], withPage?: ReadonlySet<string>): PaletteEntry[] {
  const seen = new Set<string>();
  const out: PaletteEntry[] = [];
  for (const node of nodes) {
    for (const c of node.companies) {
      if (seen.has(c.ticker)) continue;
      if (withPage && !withPage.has(c.ticker)) continue;
      seen.add(c.ticker);
      out.push({
        id: `stock-${c.ticker}`,
        label: c.ticker,
        hint: c.name,
        category: "stock",
        href: `/stock/${c.ticker}`,
        keywords: node.name,
      });
    }
  }
  return out;
}

export interface ClusterLike {
  id: string;
  name: string;
  operator: string;
  location?: { city?: string; state?: string } | null;
}

export function clusterEntries(clusters: ClusterLike[]): PaletteEntry[] {
  return clusters.map((c) => ({
    id: `cluster-${c.id}`,
    label: c.name,
    hint: [c.operator, c.location?.state].filter(Boolean).join(" · "),
    category: "cluster" as const,
    href: `/compute-frontier/${c.id}`,
    keywords: c.location?.city ?? "",
  }));
}

export interface ArticleLike {
  slug: string;
  title: string;
}

export function researchEntries(articles: ArticleLike[]): PaletteEntry[] {
  return articles.map((a) => ({
    id: `research-${a.slug}`,
    label: a.title,
    hint: "Research",
    category: "research" as const,
    href: `/blog/${a.slug}`,
  }));
}

function score(entry: PaletteEntry, q: string): number {
  const label = entry.label.toLowerCase();
  if (label.startsWith(q)) return 4;
  if (label.split(/[\s·/(),-]+/).some((w) => w.startsWith(q))) return 3;
  const rest = `${entry.hint ?? ""} ${entry.keywords ?? ""}`.toLowerCase();
  if (rest.split(/[\s·/(),-]+/).some((w) => w.startsWith(q))) return 2;
  if (label.includes(q) || rest.includes(q)) return 1;
  return 0;
}

/**
 * Rank entries for a query. Empty query returns the pages, so an open
 * palette is a navigator before the first keystroke.
 */
export function rankEntries(entries: PaletteEntry[], query: string, limit = 12): PaletteEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.filter((e) => e.category === "page");
  return entries
    .map((e) => ({ e, s: score(e, q) }))
    .filter((r) => r.s > 0)
    .sort(
      (a, b) =>
        b.s - a.s ||
        CATEGORY_RANK[a.e.category] - CATEGORY_RANK[b.e.category] ||
        a.e.label.localeCompare(b.e.label),
    )
    .slice(0, limit)
    .map((r) => r.e);
}
