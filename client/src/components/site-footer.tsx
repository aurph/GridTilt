import { Link } from "wouter";
import { SECTIONS } from "@/lib/sections";

/**
 * Site footer: brand, section index, data provenance, and the standing
 * disclaimer. Renders at the bottom of every page's scroll.
 */

// The four sections come from the site map (lib/sections.ts), so the footer
// cannot drift from the top bar.
const SECTION_LINKS: [string, string][] = [
  ...SECTIONS.map((s): [string, string] => [s.label, s.href]),
  ["Research", "/blog"],
  ["Get the Brief", "/subscribe"],
];

const DATA: [string, string][] = [
  ["Data status", "/data-status"],
  ["Methodology", "/compute-frontier/methodology"],
  ["Privacy", "/privacy"],
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-dashed border-border bg-sidebar" data-testid="site-footer">
      <div className="mx-auto max-w-[1200px] px-6 py-10">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="inline-flex min-h-[40px] items-center gap-2 no-underline" data-testid="footer-wordmark">
              <span className="text-[15px] font-bold tracking-tight text-foreground">
                Grid<span className="italic text-brand">Tilt</span>
              </span>
            </Link>
            <p className="mt-2 max-w-[30ch] text-[12.5px] leading-relaxed text-muted-foreground">
              Power projects, grid conditions, and the companies behind them.
            </p>
          </div>
          <nav aria-label="Sections">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">Sections</p>
            <ul className="mt-2.5 space-y-1.5">
              {SECTION_LINKS.map(([label, href]) => (
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
              Yahoo Finance, EIA, FRED, NERC, LBNL, and public filings. Each page links the
              sources for its data.
            </p>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-2 border-t border-border pt-5 text-[12px] text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <span data-testid="footer-owner">
            © {year} GridTilt. Run by Jack Schwartz, Baltimore.{" "}
            <a href="mailto:gridtilt1@gmail.com" className="underline-offset-2 hover:underline">gridtilt1@gmail.com</a>.
            {" "}Market data may be delayed.
          </span>
          <span>Research and commentary, not investment advice.</span>
        </div>
      </div>
    </footer>
  );
}
