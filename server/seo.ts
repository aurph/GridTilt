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
    title: "GridTilt \u2014 The AI Power Buildout, Tracked Honestly",
    description: "A research dashboard for the AI infrastructure buildout \u2014 data centers, power, compute, and the public equities behind them. Three live market gauges. Six modules. No Bloomberg required.",
    slug: "",
  },
  "/overview": {
    title: "Tilt Overview \u2014 Live Dashboard \u2014 GridTilt",
    description: "Live composite indices, top movers, sector pulse, and catalyst calendar across the AI power thesis. Updated every 15 minutes.",
    slug: "overview",
  },
  "/stack": {
    title: "AI Power Stocks by Sector \u2014 GridTilt",
    description: "Live prices for 60+ stocks across nuclear, uranium, construction, utilities, data centers, and power hardware. Updated every 15 minutes.",
    slug: "stack",
  },
  "/power-map": {
    title: "AI Data Center Map \u2014 Locations by Grid Region \u2014 GridTilt",
    description: "48 AI data center facilities mapped by operator, grid region, and capacity. Filter by Google, Amazon, Meta, Microsoft.",
    slug: "power-map",
  },
  "/my-grid": {
    title: "My Grid \u2014 Your State's Grid Operator, Buildout, and Rates \u2014 GridTilt",
    description: "Pick a state to see its grid operator, projected reserve margin, the AI datacenter buildout in and around it, the regional interconnection queue, and residential electricity rates from the EIA.",
    slug: "my-grid",
  },
  "/catalysts": {
    title: "AI Power Earnings Calendar and Catalyst Events \u2014 GridTilt",
    description: "Upcoming earnings dates, regulatory decisions, and policy events for AI infrastructure stocks. Auto-updated catalyst calendar.",
    slug: "catalysts",
  },
  "/blog": {
    title: "AI Power Infrastructure Analysis \u2014 GridTilt",
    description: "Research and analysis on the AI power infrastructure thesis. Data center power demand, nuclear energy, grid constraints, and investment implications.",
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
    title: "Analyze - Portfolio Exposure and Buildout Scenarios | GridTilt",
    description: "Score any portfolio for AI power exposure, and model buildout scenarios across demand growth, generation mix, and grid variables.",
    slug: "analyze",
  },
  "/neocloud-intel": {
    title: "Neocloud Intel \u00b7 GPU Rental Price Index \u00b7 GridTilt",
    description: "On-demand GPU rental prices ($/GPU/hr) for H100, H200, GB200, B200, B300, MI300X and more, blended across the major neoclouds and marketplaces. Sourced blended estimates with marketplace ranges and 1W/1M/YTD/1Y changes.",
    slug: "neocloud-intel",
  },
  "/subscribe": {
    title: "Get the Tilt \u2014 Weekly AI Power Market Intel \u2014 GridTilt",
    description: "Weekly digest of AI power market moves, catalysts, and thesis updates. Built for investors tracking the buildout.",
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
    "description": "AI power infrastructure investment dashboard",
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
    "name": "AI Data Center Locations \u2014 United States",
    "description": "48 active and planned AI data center facilities mapped by operator, grid region, capacity, and status",
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

const TRADE_FAQS = [
  { question: "How much electricity do AI data centers use?", answer: "AI data centers currently consume approximately 6.4% of US electricity, or about 288 TWh annually. Under base case projections, new AI capacity could reach 50 GW by 2030." },
  { question: "What is the AI power demand thesis?", answer: "The thesis holds that companies building power infrastructure for AI data centers will benefit from multi-year demand driven by physical construction bottlenecks, grid interconnection queues, and transformer shortages." },
  { question: "How many AI data centers are being built?", answer: "GridTilt tracks 48 AI data center facilities across the US, including operational, under construction, and announced projects totaling over 20 GW of capacity." },
  { question: "What does the GridTilt Scenario Calculator model?", answer: "The calculator models total capex, large power transformer demand, nuclear build requirements, and grid interconnect timelines under conservative (35 GW), base (50 GW), and aggressive (75 GW) scenarios." },
  { question: "What is a large power transformer (LPT) shortage?", answer: "The US produces approximately 60 large power transformers per year domestically. Under base case AI demand scenarios, annual LPT requirements could exceed domestic capacity, creating a multi-year supply bottleneck." },
];

const HOME_FAQS = [
  { question: "What is GridTilt?", answer: "GridTilt is a financial dashboard tracking the AI power infrastructure buildout. It provides live market data for 60+ equities across compute, nuclear, uranium, power hardware, utilities, data centers, construction, and ETF sectors." },
  { question: "What is the AI Power Demand Index?", answer: "The AI Power Demand Index is a composite indicator tracking semiconductor demand signals, datacenter REIT performance, and power hardware order trends to gauge the pace of AI infrastructure buildout." },
  { question: "What is the Nuclear Power Index?", answer: "The Nuclear Power Index (NPI) tracks the performance of nuclear power generators, uranium miners, and nuclear policy developments relative to a January 2024 baseline. Values above 100 indicate sector appreciation." },
  { question: "What is the Grid Stress Score?", answer: "The Grid Stress Score combines RTO reserve margin data, interconnection queue lengths, and transformer lead times to indicate how strained the US electrical grid is from AI datacenter demand." },
  { question: "How often is GridTilt data updated?", answer: "Market data refreshes every 15 minutes during trading hours. Catalyst events and news feeds update hourly. The Power Map facility data is updated as new projects are announced." },
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
        { name: "The Stack", url: `${BASE_URL}/stack` },
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
      title: `$${ticker} \u2014 AI Power Thesis Analysis | GridTilt`,
      description: `${ticker} analysis for the AI power infrastructure thesis. Live price, thesis score, sector context. Track ${ticker} on GridTilt.`,
      canonical: `${BASE_URL}/stock/${ticker}`,
      ogImage: `${BASE_URL}/api/og?ticker=${ticker}`,
      ogType: "website",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "FinancialProduct",
          "name": `${ticker} \u2014 AI Power Thesis Analysis`,
          "description": `Live price data, thesis alignment score, and sector analysis for ${ticker} on GridTilt`,
          "url": `${BASE_URL}/stock/${ticker}`,
          "provider": { "@type": "Organization", "name": "GridTilt" },
        },
        breadcrumbJsonLd([
          { name: "GridTilt", url: BASE_URL },
          { name: "The Stack", url: `${BASE_URL}/stack` },
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
          { name: "The Stack", url: `${BASE_URL}/stack` },
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
    title: "GridTilt \u2014 AI Power Infrastructure Dashboard",
    description: "Track the AI power buildout. Live stock data, data center mapping, and thesis modeling for 60+ companies across 9 sectors.",
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
