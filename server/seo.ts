import type { Request } from "express";
import { readFileSync } from "fs";
import { join } from "path";
import { COMPANY_DATABASE, knownTicker } from "./company-registry";
import { loadStatePage, stateDescription, stateTitle } from "./state-page";

export interface PageMeta {
  title: string;
  description: string;
  /** Null for a page that must not claim a canonical address (a 404, an admin page). */
  canonical: string | null;
  ogImage: string;
  ogType: string;
  jsonLd: object[];
  /** HTTP status for the HTML response; 200 when absent. */
  status?: number;
  /** robots meta and X-Robots-Tag; "index, follow" when absent. */
  robots?: string;
}

/**
 * Client routes that only forward somewhere else (client/src/App.tsx). The
 * server answers them with one 301 to the final address, so a crawler never
 * indexes an alias or follows two hops.
 */
export const ALIAS_REDIRECTS: Record<string, string> = {
  "/gpu-economics": "/neocloud-intel?tab=economics",
  "/power-deals": "/power-map?tab=deals",
  "/brief": "/blog",
  "/supply-chain": "/stack?view=flow",
  "/trade": "/analyze?tab=scenario",
  "/portfolio": "/analyze?tab=portfolio",
  "/queue": "/power-map?tab=queue",
};

/** Admin screens: served, never indexed. */
const ADMIN_PAGES = new Set(["/admin/datacenters", "/admin/social"]);

/**
 * An address that names nothing GridTilt has: a real 404, not the home page's
 * metadata on a 200 (which search engines read as a duplicate home page).
 */
export function notFoundMeta(): PageMeta {
  return {
    title: "Not found | GridTilt",
    description: "There is no page at this address on GridTilt.",
    canonical: null,
    ogImage: `${BASE_URL}/api/og?page=home`,
    ogType: "website",
    jsonLd: [],
    status: 404,
    robots: "noindex",
  };
}

const BASE_URL = "https://gridtilt.com";

const STATIC_PAGES: Record<string, { title: string; description: string; slug: string }> = {
  "/": {
    title: "GridTilt: Power projects, grid conditions, electricity costs",
    description: "GridTilt shows what is being built on your power grid, who is behind it, and what is known about the cost. Choose your state, or explore projects, power agreements and the companies behind them.",
    slug: "",
  },
  "/overview": {
    title: "Tilt Overview | GridTilt",
    description: "US electricity use, grid conditions, power agreements, market movers and upcoming events for the AI power buildout.",
    slug: "overview",
  },
  "/stack": {
    title: "AI Power Stocks by Sector | GridTilt",
    description: "Live prices for public companies across nuclear, uranium, construction, utilities, data centers, and power hardware.",
    slug: "stack",
  },
  "/power-map": {
    title: "AI Data Center Map: Projects by Grid Region | GridTilt",
    description: "Tracked AI data center campuses of 400 MW and up, mapped by operator, grid region and capacity, with power agreements and the interconnection queue.",
    slug: "power-map",
  },
  "/my-grid": {
    title: "My Grid: Your State's Grid Operator, Projects and Rates | GridTilt",
    description: "Pick a state to see its grid operator, its NERC reliability area and reserve margin, tracked data center projects, the regional interconnection queue, and residential electricity rates from EIA.",
    slug: "my-grid",
  },
  "/catalysts": {
    title: "AI Power Earnings Calendar and Catalyst Events \u2014 GridTilt",
    description: "Upcoming earnings dates, regulatory decisions, and policy events for AI infrastructure stocks. Auto-updated catalyst calendar.",
    slug: "catalysts",
  },
  "/blog": {
    title: "Research | GridTilt",
    description: "Research on data center power demand, nuclear energy, grid constraints, and the companies behind the buildout.",
    slug: "blog",
  },
  "/compute-frontier": {
    title: "Compute Frontier \u00b7 AI Supercluster Tracker \u00b7 GridTilt",
    description: "Named US AI training and inference superclusters by GPUs, chip type, rated and planned power, grid region, and energy source, tied to the nuclear-for-AI deals that feed them. Sourced figures vs labeled estimates.",
    slug: "compute-frontier",
  },
  "/compute-frontier/methodology": {
    title: "Compute Frontier Methodology \u00b7 How the Supercluster Data Is Built \u00b7 GridTilt",
    description: "How GridTilt builds the AI supercluster registry: what is sourced, what is labeled an estimate, the GPU disclosure rule, and exactly how each headline number is computed.",
    slug: "compute-frontier/methodology",
  },
  "/compute-frontier/compare": {
    title: "Compare AI Superclusters \u00b7 Compute Frontier \u00b7 GridTilt",
    description: "Put two or three named AI superclusters side by side: GPUs, chips, rated and planned power, grid region, energy source, and linked nuclear deals.",
    slug: "compute-frontier/compare",
  },
  "/analyze": {
    title: "Analyze - Illustrative Baskets and Buildout Scenarios | GridTilt",
    description: "Compare the editorial sector classifications of a basket of tickers, and model buildout scenarios across demand growth, generation mix, and grid variables.",
    slug: "analyze",
  },
  "/neocloud-intel": {
    title: "Neocloud Intel \u00b7 GPU Rental Price Index \u00b7 GridTilt",
    description: "On-demand GPU rental prices ($/GPU/hr) for H100, H200, GB200, B200, B300, MI300X and more, blended across the major neoclouds and marketplaces. Sourced blended estimates with marketplace ranges and 1W/1M/YTD/1Y changes.",
    slug: "neocloud-intel",
  },
  "/subscribe": {
    title: "The Brief: Power Projects and Grid Changes | GridTilt",
    description: "New power projects, grid conditions and the companies behind them, by email.",
    slug: "subscribe",
  },
};

const SECTOR_SLUGS: Record<string, { name: string; description: string }> = {
  "nuclear-power": { name: "Nuclear Power", description: "Nuclear power generators tied to the AI infrastructure buildout: live prices, GridTilt's sector classification and sector context." },
  "uranium": { name: "Uranium & Fuel Cycle", description: "Uranium miners and nuclear fuel cycle companies: live prices, GridTilt's sector classification and sector context." },
  "compute": { name: "Compute", description: "GPU, semiconductor and cloud compute companies behind AI infrastructure: live prices and sector context." },
  "power-hardware": { name: "Power Hardware", description: "Electrical equipment and power hardware suppliers to AI data centers: live prices and sector context." },
  "utilities": { name: "Utilities", description: "Regulated and merchant utilities serving AI data center power demand: live prices and sector context." },
  "data-center-reits": { name: "Data Center REITs", description: "Data center REITs hosting AI compute infrastructure: live prices and sector context." },
  "construction-epc": { name: "Construction & EPC", description: "Construction and engineering firms building data center and grid infrastructure: live prices and sector context." },
  "etf-benchmarks": { name: "ETF Benchmarks", description: "Funds that benchmark the AI power infrastructure sectors: live prices and sector context." },
  "raw-materials-mining": { name: "Raw Materials & Mining", description: "Copper, steel and rare earth producers behind the physical buildout: live prices and sector context." },
  "natural-gas": { name: "Natural Gas", description: "Natural gas producers and exporters supplying power generation for data centers: live prices and sector context." },
  "renewable-generation": { name: "Renewable Generation", description: "Solar and wind suppliers and developers signing power agreements with large buyers: live prices and sector context." },
  "transmission-grid-hardware": { name: "Transmission & Grid Hardware", description: "Wire, cable and grid equipment makers connecting new load to the grid: live prices and sector context." },
  "crypto-ai-hosting": { name: "Crypto & AI Hosting", description: "Bitcoin miners and hosts converting power capacity to AI compute: live prices and sector context." },
};

const REGION_SLUGS: Record<string, { name: string; description: string }> = {
  "pjm": { name: "PJM", description: "AI data center facilities in the PJM Interconnection grid region covering the Mid-Atlantic and Midwest." },
  "ercot": { name: "ERCOT", description: "AI data center facilities in the ERCOT grid region covering Texas." },
  "miso": { name: "MISO", description: "AI data center facilities in the MISO grid region covering the central United States." },
  "wecc": { name: "WECC", description: "AI data center facilities in the WECC grid region covering the western United States." },
  "serc": { name: "SERC", description: "AI data center facilities in the SERC grid region covering the southeastern United States." },
  "spp": { name: "SPP", description: "AI data center facilities in the SPP grid region covering the south-central United States." },
  "npcc": { name: "NPCC", description: "AI data center facilities in the NPCC grid region covering the northeastern United States." },
};

const OPERATOR_SLUGS: Record<string, string> = {
  "google": "Google",
  "amazon": "Amazon",
  "meta": "Meta",
  "microsoft": "Microsoft",
  "oracle": "Oracle",
  "coreweave": "CoreWeave",
  "xai": "xAI",
  "openai": "OpenAI",
};

function websiteJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "GridTilt",
    "url": BASE_URL,
    "description": "Power projects, grid conditions and electricity costs for the AI buildout",
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${BASE_URL}/stock/{search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

function organizationJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "GridTilt",
    "url": BASE_URL,
    "logo": `${BASE_URL}/favicon-logo.png`,
    "sameAs": ["https://x.com/gridtilt"],
    "founder": {
      "@type": "Person",
      "name": "Jack Schwartz",
    },
  };
}

function datasetJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "name": "AI Data Center Locations: United States",
    "description": "Tracked AI data center campuses of 400 MW and up, mapped by operator, grid region, capacity, and status",
    "url": `${BASE_URL}/power-map`,
    "creator": { "@type": "Organization", "name": "GridTilt" },
    "temporalCoverage": "2024/..",
    "spatialCoverage": "United States",
    "variableMeasured": ["capacity_mw", "grid_region", "operator", "status"],
  };
}

function loadClustersForSeo(): any[] {
  try {
    const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "clusters.json"), "utf-8"));
    return root.clusters ?? [];
  } catch {
    return [];
  }
}

function clusterDatasetJsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "name": "Compute Frontier: AI Superclusters",
    "description": "Named US AI training and inference superclusters by GPUs, chip type, rated and planned power, grid region, energy source, and linked nuclear-for-AI deals.",
    "url": `${BASE_URL}/compute-frontier`,
    "creator": { "@type": "Organization", "name": "GridTilt" },
    "temporalCoverage": "2024/..",
    "spatialCoverage": "United States",
    "variableMeasured": ["gpu_count", "rated_power_mw", "planned_power_mw", "chip_type", "grid_region", "operator", "status", "energy_source"],
  };
}

function faqJsonLd(faqs: Array<{ question: string; answer: string }>): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((faq) => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer,
      },
    })),
  };
}

function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": item.name,
      "item": item.url,
    })),
  };
}

// Structured data read by search and answer engines. It carried the claims the
// pages had dropped: 288 TWh and 6.4% for data centers (LBNL: 192 TWh, 4.7%),
// 60 transformers a year (DOE: about 343), a stale facility count, and three
// answers describing the retired indices as current features.
const TRADE_FAQS = [
  { question: "How much electricity do US data centers use?", answer: "Lawrence Berkeley National Laboratory estimates US data centers used 192 TWh in 2024, 4.7% of US electricity (2025 Update, June 2026). Its range for 2030 is 521 to 843 TWh." },
  { question: "Is the scenario calculator a forecast?", answer: "No. It does the arithmetic for assumptions you set, such as new capacity, cost per MW, power mix, computing load growth and PUE, and shows published figures beside the result." },
  { question: "What does the GridTilt scenario calculator model?", answer: "Facility capex, large power transformer needs, the nuclear share of new supply and US data-center electricity use in 2030, under conservative (35 GW), base (50 GW) and aggressive (75 GW) presets you can change." },
  { question: "How many large power transformers does the US build?", answer: "The Department of Energy estimated US capacity at about 343 large power transformers (100 MVA and up) a year, from 2019 data, when 137 were built in the US and 617 imported (Electric Grid Supply Chain Review, February 2022)." },
];

const HOME_FAQS = [
  { question: "What is GridTilt?", answer: "GridTilt shows what is being built on the US power grid for AI, who is behind it, and what is known about the cost: data center projects, power agreements, grid conditions, electricity prices and the public companies involved, with sources." },
  { question: "What does My Grid show?", answer: "Pick a state to see its grid operator, its NERC assessment area and reserve margin, tracked data center projects of 400 MW and up, and residential electricity prices where available." },
  { question: "Where do GridTilt's numbers come from?", answer: "EIA, NERC, Lawrence Berkeley National Laboratory, company filings and announcements, public GPU rental listings, and Yahoo Finance for stock prices. Each page links the sources for its data." },
  { question: "How often does the data change?", answer: "Stock prices update through the trading day. Project, agreement and grid data change when their sources publish new figures." },
];

/** True when an og:image name belongs to a sector, region or operator page seo.ts publishes. */
export function ogNameKnown(kind: "sector" | "region" | "operator", name: string): boolean {
  if (kind === "sector") return Object.values(SECTOR_SLUGS).some((s) => s.name === name);
  if (kind === "region") return Object.values(REGION_SLUGS).some((r) => r.name === name);
  return Object.values(OPERATOR_SLUGS).some((n) => n === name);
}

export function getPageMeta(pathname: string): PageMeta {
  // Reached only where the server's 301 did not run (the dev server's own
  // routing); describe the destination, never a separate page.
  const alias = ALIAS_REDIRECTS[pathname];
  if (alias) return getPageMeta(alias.split("?")[0]);

  if (ADMIN_PAGES.has(pathname)) {
    return {
      title: "Admin | GridTilt",
      description: "GridTilt administration.",
      canonical: null,
      ogImage: `${BASE_URL}/api/og?page=home`,
      ogType: "website",
      jsonLd: [],
      robots: "noindex, nofollow",
    };
  }

  const staticPage = STATIC_PAGES[pathname];
  if (staticPage) {
    const jsonLd: object[] = [];

    if (pathname === "/") {
      jsonLd.push(websiteJsonLd(), organizationJsonLd(), faqJsonLd(HOME_FAQS));
    } else if (pathname === "/power-map") {
      jsonLd.push(datasetJsonLd(), breadcrumbJsonLd([
        { name: "GridTilt", url: BASE_URL },
        { name: "Power Map", url: `${BASE_URL}/power-map` },
      ]));
    } else if (pathname === "/compute-frontier") {
      jsonLd.push(clusterDatasetJsonLd(), breadcrumbJsonLd([
        { name: "GridTilt", url: BASE_URL },
        { name: "Compute Frontier", url: `${BASE_URL}/compute-frontier` },
      ]));
    } else if (pathname === "/compute-frontier/methodology") {
      jsonLd.push(breadcrumbJsonLd([
        { name: "GridTilt", url: BASE_URL },
        { name: "Compute Frontier", url: `${BASE_URL}/compute-frontier` },
        { name: "Methodology", url: `${BASE_URL}/compute-frontier/methodology` },
      ]));
    } else if (pathname === "/compute-frontier/compare") {
      jsonLd.push(breadcrumbJsonLd([
        { name: "GridTilt", url: BASE_URL },
        { name: "Compute Frontier", url: `${BASE_URL}/compute-frontier` },
        { name: "Compare", url: `${BASE_URL}/compute-frontier/compare` },
      ]));
    } else if (pathname === "/analyze") {
      jsonLd.push(faqJsonLd(TRADE_FAQS), breadcrumbJsonLd([
        { name: "GridTilt", url: BASE_URL },
        { name: "Analyze", url: `${BASE_URL}/analyze` },
      ]));
    } else if (pathname === "/stack") {
      jsonLd.push(breadcrumbJsonLd([
        { name: "GridTilt", url: BASE_URL },
        { name: "Equities", url: `${BASE_URL}/stack` },
      ]));
    } else if (pathname === "/catalysts") {
      jsonLd.push(breadcrumbJsonLd([
        { name: "GridTilt", url: BASE_URL },
        { name: "Catalyst Tracker", url: `${BASE_URL}/catalysts` },
      ]));
    } else if (pathname === "/blog") {
      jsonLd.push(breadcrumbJsonLd([
        { name: "GridTilt", url: BASE_URL },
        { name: "Analysis", url: `${BASE_URL}/blog` },
      ]));
    }

    return {
      title: staticPage.title,
      description: staticPage.description,
      canonical: `${BASE_URL}/${staticPage.slug}`,
      ogImage: `${BASE_URL}/api/og?page=${staticPage.slug || "home"}`,
      ogType: "website",
      jsonLd,
    };
  }

  const stockMatch = pathname.match(/^\/stock\/([A-Z.]+)$/i);
  if (stockMatch) {
    const ticker = stockMatch[1].toUpperCase();
    // The same registry the stock API answers from: no entry, no page.
    if (!knownTicker(ticker)) return notFoundMeta();
    const company = (COMPANY_DATABASE as Record<string, { name: string; primarySegment: string }>)[ticker];
    const isFund = company.primarySegment === "ETF" || /\bETF\b/.test(company.name);
    return {
      title: `${ticker}: ${company.name}, AI power sector classification | GridTilt`,
      description: `${company.name} (${ticker}) on GridTilt: live price, editorial sector classification and sector context.`,
      canonical: `${BASE_URL}/stock/${ticker}`,
      ogImage: `${BASE_URL}/api/og?ticker=${ticker}`,
      ogType: "website",
      jsonLd: [
        {
          // A page about the company (or fund), not a product GridTilt offers.
          "@context": "https://schema.org",
          "@type": "WebPage",
          "name": `${ticker}: ${company.name}`,
          "url": `${BASE_URL}/stock/${ticker}`,
          "about": isFund
            ? { "@type": "Thing", "name": company.name, "identifier": ticker }
            : { "@type": "Corporation", "name": company.name, "tickerSymbol": ticker },
        },
        breadcrumbJsonLd([
          { name: "GridTilt", url: BASE_URL },
          { name: "Equities", url: `${BASE_URL}/stack` },
          { name: ticker, url: `${BASE_URL}/stock/${ticker}` },
        ]),
      ],
    };
  }

  const sectorMatch = pathname.match(/^\/sector\/([a-z-]+)$/);
  if (sectorMatch) {
    const slug = sectorMatch[1];
    const sector = SECTOR_SLUGS[slug];
    if (sector) {
      return {
        title: `${sector.name} Stocks for AI Power Infrastructure | GridTilt`,
        description: sector.description,
        canonical: `${BASE_URL}/sector/${slug}`,
        ogImage: `${BASE_URL}/api/og?page=sector&name=${encodeURIComponent(sector.name)}`,
        ogType: "website",
        jsonLd: [breadcrumbJsonLd([
          { name: "GridTilt", url: BASE_URL },
          { name: "Equities", url: `${BASE_URL}/stack` },
          { name: sector.name, url: `${BASE_URL}/sector/${slug}` },
        ])],
      };
    }
    return notFoundMeta();
  }

  const regionMatch = pathname.match(/^\/region\/([a-z]+)$/);
  if (regionMatch) {
    const slug = regionMatch[1];
    const region = REGION_SLUGS[slug];
    if (region) {
      return {
        title: `${region.name} Grid Region: AI Data Center Locations | GridTilt`,
        description: region.description,
        canonical: `${BASE_URL}/region/${slug}`,
        ogImage: `${BASE_URL}/api/og?page=region&name=${encodeURIComponent(region.name)}`,
        ogType: "website",
        jsonLd: [breadcrumbJsonLd([
          { name: "GridTilt", url: BASE_URL },
          { name: "Power Map", url: `${BASE_URL}/power-map` },
          { name: region.name, url: `${BASE_URL}/region/${slug}` },
        ])],
      };
    }
    return notFoundMeta();
  }

  const operatorMatch = pathname.match(/^\/operator\/([a-z]+)$/);
  if (operatorMatch) {
    const slug = operatorMatch[1];
    const name = OPERATOR_SLUGS[slug];
    if (name) {
      return {
        title: `${name} AI Data Centers: Locations and Capacity | GridTilt`,
        description: `${name} AI data center facilities tracked on GridTilt. Map, capacity data, and grid analysis.`,
        canonical: `${BASE_URL}/operator/${slug}`,
        ogImage: `${BASE_URL}/api/og?page=operator&name=${encodeURIComponent(name)}`,
        ogType: "website",
        jsonLd: [breadcrumbJsonLd([
          { name: "GridTilt", url: BASE_URL },
          { name: "Power Map", url: `${BASE_URL}/power-map` },
          { name: name, url: `${BASE_URL}/operator/${slug}` },
        ])],
      };
    }
    return notFoundMeta();
  }

  const blogMatch = pathname.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blogMatch) {
    const slug = blogMatch[1];
    let article: any = null;
    try {
      const blogPath = join(process.cwd(), "content", "blog", "articles.json");
      const articles = JSON.parse(readFileSync(blogPath, "utf-8"));
      article = articles.find((a: any) => a.slug === slug) ?? null;
    } catch {}
    // No article, no page: a title made up from the slug was a soft 404.
    if (!article) return notFoundMeta();
    const articleTitle: string = article.title;
    const articleDescription: string = article.description;
    const articleDate: string = article.date ?? "";
    const articleKeywords: string[] = article.keywords || [];

    const jsonLd: object[] = [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": articleTitle,
        "description": articleDescription,
        "url": `${BASE_URL}/blog/${slug}`,
        "author": { "@type": "Person", "name": "Jack Schwartz" },
        "publisher": { "@type": "Organization", "name": "GridTilt", "url": BASE_URL },
        ...(articleDate ? { "datePublished": articleDate } : {}),
        ...(articleKeywords.length > 0 ? { "keywords": articleKeywords.join(", ") } : {}),
      },
      breadcrumbJsonLd([
        { name: "GridTilt", url: BASE_URL },
        { name: "Analysis", url: `${BASE_URL}/blog` },
        { name: articleTitle, url: `${BASE_URL}/blog/${slug}` },
      ]),
    ];

    return {
      title: `${articleTitle} | GridTilt`,
      description: articleDescription,
      canonical: `${BASE_URL}/blog/${slug}`,
      ogImage: `${BASE_URL}/api/og?page=blog&name=${encodeURIComponent(articleTitle)}`,
      ogType: "article",
      jsonLd,
    };
  }

  const clusterMatch = pathname.match(/^\/compute-frontier\/([a-z0-9-]+)$/);
  if (clusterMatch) {
    const slug = clusterMatch[1];
    const cluster = loadClustersForSeo().find((c: any) => c.id === slug);
    if (cluster) {
      const loc = `${cluster.location?.city}, ${cluster.location?.state}`;
      // The status in words, so a planned site is never described as running.
      const statusWords: Record<string, string> = { operational: "operating", construction: "under construction", planned: "planned", announced: "announced" };
      const status = statusWords[cluster.status] ?? String(cluster.status ?? "status not recorded");
      const planned = Number(cluster.plannedPowerMW);
      const desc = [
        `${cluster.name}: ${cluster.operator}, ${status}`,
        Number.isFinite(planned) && planned > 0 ? `${planned.toLocaleString("en-US")} MW planned in ${cluster.gridRegion} (${loc})` : `in ${cluster.gridRegion} (${loc})`,
        cluster.chipType ? `Chips: ${cluster.chipType}` : null,
      ]
        .filter(Boolean)
        .join(". ")
        .concat(".")
        .slice(0, 300);
      return {
        title: `${cluster.name} · AI Supercluster · GridTilt`,
        description: desc,
        canonical: `${BASE_URL}/compute-frontier/${slug}`,
        ogImage: `${BASE_URL}/api/og?page=compute-frontier&name=${encodeURIComponent(cluster.name)}`,
        ogType: "website",
        jsonLd: [
          {
            "@context": "https://schema.org",
            "@type": "Place",
            "name": cluster.name,
            "description": desc,
            "url": `${BASE_URL}/compute-frontier/${slug}`,
            "address": {
              "@type": "PostalAddress",
              "addressLocality": cluster.location?.city,
              "addressRegion": cluster.location?.state,
              "addressCountry": "US",
            },
            "geo": {
              "@type": "GeoCoordinates",
              "latitude": cluster.location?.lat,
              "longitude": cluster.location?.lng,
            },
          },
          breadcrumbJsonLd([
            { name: "GridTilt", url: BASE_URL },
            { name: "Compute Frontier", url: `${BASE_URL}/compute-frontier` },
            { name: cluster.name, url: `${BASE_URL}/compute-frontier/${slug}` },
          ]),
        ],
      };
    }
    return notFoundMeta();
  }

  // State pages: only the published ones (server/data/state-pages.json).
  // /my-grid?state=XX stays the tool, with /my-grid as its canonical.
  const stateMatch = pathname.match(/^\/state\/([a-z][a-z-]{1,40})$/);
  if (stateMatch) {
    const page = loadStatePage(stateMatch[1]);
    if (!page) return notFoundMeta();
    return {
      title: stateTitle(page),
      description: stateDescription(page),
      canonical: page.canonical,
      ogImage: `${BASE_URL}/api/og?template=state_fact&state=${page.code}`,
      ogType: "website",
      jsonLd: [breadcrumbJsonLd([
        { name: "GridTilt", url: BASE_URL },
        { name: "My Grid", url: `${BASE_URL}/my-grid` },
        { name: page.name, url: page.canonical },
      ])],
    };
  }

  // Nothing above matched: no page lives here.
  return notFoundMeta();
}

export function injectMetaTags(html: string, meta: PageMeta): string {
  const metaTags = `
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    ${meta.canonical ? `<link rel="canonical" href="${meta.canonical}" />` : ""}
    <meta name="robots" content="${escapeHtml(meta.robots ?? "index, follow")}" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:image" content="${meta.ogImage}" />
    ${meta.canonical ? `<meta property="og:url" content="${meta.canonical}" />` : ""}
    <meta property="og:type" content="${meta.ogType}" />
    <meta property="og:site_name" content="GridTilt" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:site" content="@gridtilt" />
    <meta name="twitter:creator" content="@gridtilt" />
    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />
    <meta name="twitter:description" content="${escapeHtml(meta.description)}" />
    <meta name="twitter:image" content="${meta.ogImage}" />
    ${meta.jsonLd.map((ld) => `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")}</script>`).join("\n    ")}`;

  html = html.replace(/<title>[^<]*<\/title>/, "");
  html = html.replace(/<meta name="description"[^>]*\/?>/, "");
  html = html.replace(/<meta name="robots"[^>]*\/?>/g, "");
  html = html.replace(/<meta name="googlebot"[^>]*\/?>/g, "");
  html = html.replace(/<link rel="canonical"[^>]*\/?>/g, "");
  html = html.replace(/<meta property="og:[^>]*\/?>/g, "");
  html = html.replace(/<meta name="twitter:[^>]*\/?>/g, "");

  html = html.replace("</head>", `${metaTags}\n  </head>`);

  return html;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Read-only data the public pages fetch while they render. robots.txt blocked
 * all of /api/, so a crawler that renders JavaScript (Google does, and obeys
 * robots.txt for the requests a page makes) got the page frame without its
 * facts, and X's crawler could not fetch share images from /api/og. Only these
 * prefixes are opened; admin, subscriber, newsletter, webhook and export
 * routes stay disallowed. robots.txt is not access control: those routes
 * check the admin key or a signature themselves.
 */
export const CRAWLABLE_API_PREFIXES = [
  "/api/blog",
  "/api/brief",
  "/api/catalysts/",
  "/api/changes",
  "/api/clusters",
  "/api/datacenters",
  "/api/deals/metrics",
  "/api/frontier-models",
  "/api/gpu-economics",
  "/api/gpu-prices/metrics",
  "/api/inference-prices",
  "/api/news",
  "/api/og",
  "/api/physical/",
  "/api/queue",
  "/api/sector-pulse",
  "/api/sectors",
  "/api/stack",
  "/api/state-news",
  "/api/state-pages",
  "/api/stock",
  "/api/supply-chain",
  "/api/top-movers",
] as const;

export function robotsTxt(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    ...CRAWLABLE_API_PREFIXES.map((p) => `Allow: ${p}`),
    // Longer than /api/news, so it wins for the newsletter's admin routes.
    "Disallow: /api/newsletter/",
    "Disallow: /admin/",
    `Sitemap: ${BASE_URL}/sitemap.xml`,
    "",
  ].join("\n");
}

/**
 * Whether robots.txt lets a crawler fetch this path, by the rule Google
 * documents: the longest matching rule wins, and Allow wins a tie.
 */
export function robotsAllows(path: string, txt: string = robotsTxt()): boolean {
  let best: { len: number; allow: boolean } | null = null;
  for (const line of txt.split("\n")) {
    const m = /^(Allow|Disallow):\s*(\S+)\s*$/.exec(line.trim());
    if (!m || !path.startsWith(m[2])) continue;
    const rule = { len: m[2].length, allow: m[1] === "Allow" };
    if (!best || rule.len > best.len || (rule.len === best.len && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

export interface SitemapInput {
  /** Tickers with a stock page (the company registry). */
  tickers: string[];
  clusters: Array<{ id: string; reviewed?: string | null }>;
  articles: Array<{ slug: string; date?: string | null; updated?: string | null }>;
  /** Published state pages, dated by their last review. */
  statePages?: Array<{ slug: string; reviewed?: string | null }>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function xmlEscape(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The sitemap lists only addresses that resolve to a page, with a lastmod
 * only where GridTilt knows a substantive change date: an article's date or
 * update, a project record's review. Fetching, building or deploying is not a
 * content change, so nothing is stamped with today's date, and the same
 * content gives the same sitemap tomorrow.
 */
export function buildSitemap(input: SitemapInput): string {
  const urls: Array<{ loc: string; lastmod?: string }> = [];
  for (const p of Object.keys(STATIC_PAGES)) urls.push({ loc: `${BASE_URL}${p === "/" ? "" : p}` });
  for (const t of Array.from(new Set(input.tickers.map((x) => x.toUpperCase()))).filter(knownTicker).sort()) {
    urls.push({ loc: `${BASE_URL}/stock/${t}` });
  }
  for (const slug of Object.keys(SECTOR_SLUGS)) urls.push({ loc: `${BASE_URL}/sector/${slug}` });
  for (const slug of Object.keys(REGION_SLUGS)) urls.push({ loc: `${BASE_URL}/region/${slug}` });
  for (const slug of Object.keys(OPERATOR_SLUGS)) urls.push({ loc: `${BASE_URL}/operator/${slug}` });
  for (const c of input.clusters) {
    if (!/^[a-z0-9-]+$/.test(c.id)) continue;
    urls.push({ loc: `${BASE_URL}/compute-frontier/${c.id}`, ...(c.reviewed && DAY.test(c.reviewed) ? { lastmod: c.reviewed } : {}) });
  }
  for (const s of input.statePages ?? []) {
    if (!/^[a-z][a-z-]{1,40}$/.test(s.slug)) continue;
    urls.push({ loc: `${BASE_URL}/state/${s.slug}`, ...(s.reviewed && DAY.test(s.reviewed) ? { lastmod: s.reviewed } : {}) });
  }
  for (const a of input.articles) {
    if (!/^[a-z0-9-]+$/.test(a.slug)) continue;
    const changed = [a.updated, a.date].find((d): d is string => typeof d === "string" && DAY.test(d));
    urls.push({ loc: `${BASE_URL}/blog/${a.slug}`, ...(changed ? { lastmod: changed } : {}) });
  }
  const body = urls
    .map((u) => `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ""}\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export { BASE_URL, SECTOR_SLUGS, REGION_SLUGS, OPERATOR_SLUGS };
