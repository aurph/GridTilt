import { Link, useLocation } from "wouter";
import logoPath from "@assets/Image_[Vectorized]_(2)_1773890483514.png";

/**
 * Publication masthead: wordmark + dek + dateline over a sticky section-nav
 * rule. Replaces the sidebar/header/ticker dashboard chrome. The full
 * masthead scrolls away; only the nav row sticks.
 */

const SECTIONS: { label: string; href: string; match: (path: string) => boolean }[] = [
  { label: "Today", href: "/overview", match: (p) => p === "/overview" },
  { label: "The Stack", href: "/stack", match: (p) => p === "/stack" || p === "/supply-chain" },
  { label: "Power", href: "/power-map", match: (p) => p.startsWith("/power") || p === "/queue" },
  { label: "Compute", href: "/compute-frontier", match: (p) => p.startsWith("/compute-frontier") },
  { label: "GPUs", href: "/neocloud-intel", match: (p) => p === "/neocloud-intel" || p === "/gpu-economics" },
  { label: "Analyze", href: "/analyze", match: (p) => p === "/analyze" || p === "/trade" || p === "/portfolio" },
  { label: "Catalysts", href: "/catalysts", match: (p) => p === "/catalysts" },
  { label: "Analysis", href: "/blog", match: (p) => p.startsWith("/blog") || p === "/brief" },
];

function dateline(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function Masthead() {
  const [location] = useLocation();
  const onFrontPage = location === "/";

  return (
    <header data-testid="masthead">
      {/* Brand block: scrolls away. One confident ink rule closes it. */}
      <div>
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <div className="flex items-end justify-between gap-4 pt-6 pb-5 sm:pt-8 sm:pb-6">
            <div className="min-w-0">
              <Link
                href="/"
                className="group inline-flex items-center gap-3.5 no-underline"
                data-testid="masthead-wordmark"
              >
                <img
                  src={logoPath}
                  alt=""
                  className="h-9 w-9 sm:h-11 sm:w-11 select-none"
                  draggable={false}
                />
                <span className="font-serif font-medium text-[38px] sm:text-[50px] leading-none tracking-[-0.02em] text-ink">
                  Grid
                  <em className="italic text-brand-ink">Tilt</em>
                </span>
              </Link>
              <p className="mt-2 text-[13.5px] leading-snug text-ink-secondary">
                Energy infrastructure, in plain sight.
              </p>
            </div>
            <div className="hidden sm:block shrink-0 pb-1 text-right">
              <p className="text-[13px] text-ink-secondary">{dateline()}</p>
            </div>
          </div>
          <div className="rule-scotch" />
        </div>
      </div>

      {/* Section nav: sticks. Double rule below = the fold line. */}
      <nav
        className="sticky top-0 z-50 bg-paper border-b border-rule shadow-[0_1px_0_rgba(28,23,18,0.04)]"
        aria-label="Sections"
        data-testid="masthead-nav"
      >
        <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
          <div className="flex items-stretch gap-5 sm:gap-7 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Condensed mark: only useful once the brand block has scrolled off */}
            <Link
              href="/"
              aria-label="GridTilt front page"
              className={`hidden sm:flex items-center shrink-0 pr-1 ${onFrontPage ? "opacity-40" : ""}`}
              data-testid="masthead-nav-mark"
            >
              <img src={logoPath} alt="" className="h-4 w-4 select-none" draggable={false} />
            </Link>
            {SECTIONS.map((s) => {
              const active = s.match(location);
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className={`relative shrink-0 py-2.5 text-[13.5px] leading-none no-underline transition-colors duration-fast ${
                    active
                      ? "font-semibold text-brand-ink"
                      : "text-ink-secondary hover:text-ink"
                  }`}
                  data-testid={`masthead-nav-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {s.label}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-x-0 bottom-0 h-[3px] bg-brand"
                    />
                  )}
                </Link>
              );
            })}
            <div className="flex-1" />
            <Link
              href="/subscribe"
              className="hidden md:flex items-center shrink-0 py-2.5 text-[13px] font-semibold leading-none no-underline text-ink hover:text-brand-ink transition-colors duration-fast"
              data-testid="masthead-nav-subscribe"
            >
              Subscribe
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
