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
  /** Navigation target. State entries also persist the state choice. */
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
  { id: "page-overview", label: "Overview", category: "page", href: "/overview", keywords: "dashboard tilt home" },
  { id: "page-stack", label: "Equities", hint: "The Stack", category: "page", href: "/stack", keywords: "stocks tickers heatmap supply" },
  { id: "page-power-map", label: "Power Map", hint: "facilities on the grid", category: "page", href: "/power-map", keywords: "data centers map facilities" },
  { id: "page-my-grid", label: "My Grid", hint: "your state", category: "page", href: "/my-grid", keywords: "state operator rates" },
  { id: "page-compute", label: "Compute Frontier", hint: "supercluster tracker", category: "page", href: "/compute-frontier", keywords: "clusters gpu superclusters" },
  { id: "page-gpu", label: "GPU Prices", hint: "rental index", category: "page", href: "/neocloud-intel", keywords: "neocloud rental h100 economics" },
  { id: "page-analyze", label: "Analyze", hint: "portfolio and scenarios", category: "page", href: "/analyze", keywords: "portfolio scenario calculator" },
  { id: "page-catalysts", label: "Catalysts", hint: "earnings and policy", category: "page", href: "/catalysts", keywords: "earnings calendar events" },
  { id: "page-research", label: "Research", hint: "analysis and the Brief", category: "page", href: "/blog", keywords: "blog articles brief" },
  { id: "page-queue", label: "Backlog", hint: "interconnection queue", category: "page", href: "/queue", keywords: "interconnection queue lbnl" },
  { id: "page-deals", label: "AI Power Deals", category: "page", href: "/power-deals", keywords: "nuclear ppa deals" },
  { id: "page-supply-chain", label: "Supply Chain", hint: "force graph", category: "page", href: "/supply-chain", keywords: "graph flow stages" },
];

export interface StateLike {
  name: string;
}

export function stateEntries(states: Record<string, StateLike>): PaletteEntry[] {
  return Object.entries(states).map(([code, s]) => ({
    id: `state-${code}`,
    label: s.name,
    hint: "My Grid",
    category: "state" as const,
    href: "/my-grid",
    keywords: code,
  }));
}

export interface SupplyNodeLike {
  name: string;
  companies: { ticker: string; name: string }[];
}

/** Tickers from the supply-chain config, first node's name wins on repeats. */
export function stockEntries(nodes: SupplyNodeLike[]): PaletteEntry[] {
  const seen = new Set<string>();
  const out: PaletteEntry[] = [];
  for (const node of nodes) {
    for (const c of node.companies) {
      if (seen.has(c.ticker)) continue;
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
  if (!q) return entries.filter((e) => e.category === "page").slice(0, limit);
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
