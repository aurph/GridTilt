import type { Request } from "express";
import { readFileSync } from "fs";
import { join } from "path";

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  ogType: string;
  jsonLd: object[];
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
  "nuclear-power": { name: "Nuclear Power", description: "Track nuclear power generation stocks tied to the AI infrastructure buildout. Live prices, thesis analysis, and sector performance." },
  "uranium": { name: "Uranium & Fuel Cycle", description: "Track uranium mining and nuclear fuel cycle stocks. Live prices, supply dynamics, and AI power demand impact." },
  "compute": { name: "Compute", description: "Track GPU, semiconductor, and cloud compute stocks driving AI infrastructure. Live prices and thesis analysis." },
  "power-hardware": { name: "Power Hardware", description: "Track electrical equipment and power hardware stocks supplying AI data center infrastructure." },
  "utilities": { name: "Utilities", description: "Track regulated and merchant utilities positioned for AI data center power demand growth." },
  "data-center-reits": { name: "Data Center REITs", description: "Track data center REIT stocks hosting AI compute infrastructure. Live prices and capacity data." },
  "construction-epc": { name: "Construction & EPC", description: "Track construction and engineering firms building AI data center and grid infrastructure." },
  "etf-benchmarks": { name: "ETF Benchmarks", description: "Track ETFs and index funds benchmarking the AI power infrastructure thesis sectors." },
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

export function getPageMeta(pathname: string): PageMeta {
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

  const stockMatch = pathname.match(/^\/stock\/([A-Z]+)$/i);
  if (stockMatch) {
    const ticker = stockMatch[1].toUpperCase();
    return {
      title: `$${ticker} - AI Power Sector Classification | GridTilt`,
      description: `${ticker} on GridTilt: live price, editorial sector classification and sector context.`,
      canonical: `${BASE_URL}/stock/${ticker}`,
      ogImage: `${BASE_URL}/api/og?ticker=${ticker}`,
      ogType: "website",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "FinancialProduct",
          "name": `${ticker} - AI Power Sector Classification`,
          "description": `Live price data, editorial sector classification, and sector context for ${ticker} on GridTilt`,
          "url": `${BASE_URL}/stock/${ticker}`,
          "provider": { "@type": "Organization", "name": "GridTilt" },
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
  }

  const regionMatch = pathname.match(/^\/region\/([a-z]+)$/);
  if (regionMatch) {
    const slug = regionMatch[1];
    const region = REGION_SLUGS[slug];
    if (region) {
      return {
        title: `${region.name} Grid Region \u2014 AI Data Center Locations | GridTilt`,
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
  }

  const operatorMatch = pathname.match(/^\/operator\/([a-z]+)$/);
  if (operatorMatch) {
    const slug = operatorMatch[1];
    const name = OPERATOR_SLUGS[slug];
    if (name) {
      return {
        title: `${name} AI Data Centers \u2014 Locations and Capacity | GridTilt`,
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
  }

  const blogMatch = pathname.match(/^\/blog\/([a-z0-9-]+)$/);
  if (blogMatch) {
    const slug = blogMatch[1];
    let articleTitle = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    let articleDescription = "Analysis and research on the AI power infrastructure thesis from GridTilt.";
    let articleDate = "";
    let articleKeywords: string[] = [];

    try {
      const blogPath = join(process.cwd(), "content", "blog", "articles.json");
      const raw = readFileSync(blogPath, "utf-8");
      const articles = JSON.parse(raw);
      const article = articles.find((a: any) => a.slug === slug);
      if (article) {
        articleTitle = article.title;
        articleDescription = article.description;
        articleDate = article.date;
        articleKeywords = article.keywords || [];
      }
    } catch {}

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
      const desc = `${cluster.name}: ${cluster.operator}, ${cluster.status}, ${Number(cluster.plannedPowerMW).toLocaleString()} MW planned in ${cluster.gridRegion} (${loc}). Chips: ${cluster.chipType}.`.slice(0, 300);
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
  }

  return {
    title: "GridTilt: Power projects, grid conditions, electricity costs",
    description: "GridTilt shows what is being built on your power grid, who is behind it, and what is known about the cost.",
    canonical: BASE_URL,
    ogImage: `${BASE_URL}/api/og?page=home`,
    ogType: "website",
    jsonLd: [],
  };
}

export function injectMetaTags(html: string, meta: PageMeta): string {
  const metaTags = `
    <title>${escapeHtml(meta.title)}</title>
    <meta name="description" content="${escapeHtml(meta.description)}" />
    <link rel="canonical" href="${meta.canonical}" />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="${escapeHtml(meta.title)}" />
    <meta property="og:description" content="${escapeHtml(meta.description)}" />
    <meta property="og:image" content="${meta.ogImage}" />
    <meta property="og:url" content="${meta.canonical}" />
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

export const SITEMAP_STATIC_PAGES = Object.keys(STATIC_PAGES);
export const SITEMAP_SECTOR_SLUGS = Object.keys(SECTOR_SLUGS);
export const SITEMAP_REGION_SLUGS = Object.keys(REGION_SLUGS);
export const SITEMAP_OPERATOR_SLUGS = Object.keys(OPERATOR_SLUGS);
export const SITEMAP_CLUSTER_SLUGS: string[] = loadClustersForSeo().map((c: any) => c.id);
export { BASE_URL, SECTOR_SLUGS, REGION_SLUGS, OPERATOR_SLUGS };
