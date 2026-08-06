import { Link } from "wouter";

/**
 * Site footer: brand, section index, data provenance, and the standing
 * disclaimer. Renders at the bottom of every page's scroll.
 */

const SECTIONS: [string, string][] = [
  ["Overview", "/overview"],
  ["Equities", "/stack"],
  ["Power", "/power-map"],
  ["My Grid", "/my-grid"],
  ["Compute", "/compute-frontier"],
  ["GPU Prices", "/neocloud-intel"],
  ["Analyze", "/analyze"],
  ["Catalysts", "/catalysts"],
  ["Research", "/blog"],
];

const DATA: [string, string][] = [
  ["Methodology", "/compute-frontier/methodology"],
  ["The weekly brief", "/subscribe"],
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-sidebar" data-testid="site-footer">
      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2 no-underline" data-testid="footer-wordmark">
              <span className="text-[15px] font-bold tracking-tight text-foreground">
                Grid<span className="italic text-brand">Tilt</span>
              </span>
            </Link>
            <p className="mt-2 max-w-[30ch] text-[12.5px] leading-relaxed text-muted-foreground">
              The AI power buildout, tracked with sourced numbers. Data centers, generation,
              transmission, and the companies behind them.
            </p>
          </div>
          <nav aria-label="Sections">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Sections</p>
            <ul className="mt-2.5 space-y-1.5">
              {SECTIONS.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-[13px] text-muted-foreground no-underline transition-colors hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Data">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Data</p>
            <ul className="mt-2.5 space-y-1.5">
              {DATA.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-[13px] text-muted-foreground no-underline transition-colors hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
              <li>
                <a href="https://x.com/gridtilt" target="_blank" rel="noopener noreferrer" className="text-[13px] text-muted-foreground no-underline transition-colors hover:text-foreground">
                  @gridtilt
                </a>
              </li>
              {/* Carried up from the marketing footer when the landing stopped
                  rendering a second one. These were previously reachable only
                  from "/"; every page has them now. */}
              <li>
                <a href="https://github.com/aurph/GridTilt" target="_blank" rel="noopener noreferrer" className="text-[13px] text-muted-foreground no-underline transition-colors hover:text-foreground">
                  Source on GitHub
                </a>
              </li>
              <li>
                <a href="mailto:gridtilt1@gmail.com" className="text-[13px] text-muted-foreground no-underline transition-colors hover:text-foreground">
                  Contact
                </a>
              </li>
            </ul>
          </nav>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Sources</p>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
              Yahoo Finance, EIA, FRED, NERC, LBNL, and public filings. Every figure carries its
              source and date on the page.
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-border pt-5 text-[12px] text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <span>© {year} GridTilt. Market data may be delayed.</span>
          <span>Research and commentary, not investment advice.</span>
        </div>
      </div>
    </footer>
  );
}
