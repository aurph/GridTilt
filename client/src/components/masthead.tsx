import { Link, useLocation } from "wouter";
import logoPath from "@assets/Image_[Vectorized]_(2)_1773890483514.png";

/**
 * App bar: one compact sticky row. Mark and wordmark left, sections inline,
 * subscribe right. GridTilt is an instrument; the chrome stays out of the way.
 */

const SECTIONS: { label: string; href: string; match: (path: string) => boolean }[] = [
  { label: "Today", href: "/overview", match: (p) => p === "/overview" },
  { label: "My Grid", href: "/my-grid", match: (p) => p === "/my-grid" },
  { label: "The Stack", href: "/stack", match: (p) => p === "/stack" || p === "/supply-chain" },
  { label: "Power", href: "/power-map", match: (p) => p.startsWith("/power") || p === "/queue" },
  { label: "Compute", href: "/compute-frontier", match: (p) => p.startsWith("/compute-frontier") },
  { label: "GPUs", href: "/neocloud-intel", match: (p) => p === "/neocloud-intel" || p === "/gpu-economics" },
  { label: "Analyze", href: "/analyze", match: (p) => p === "/analyze" || p === "/trade" || p === "/portfolio" },
  { label: "Catalysts", href: "/catalysts", match: (p) => p === "/catalysts" },
  { label: "Analysis", href: "/blog", match: (p) => p.startsWith("/blog") || p === "/brief" },
];

export function Masthead() {
  const [location] = useLocation();

  return (
    <header
      className="sticky top-0 z-50 border-b border-rule bg-paper"
      data-testid="masthead"
    >
      <div className="mx-auto flex h-12 max-w-[1360px] items-stretch gap-5 px-4 sm:gap-6 sm:px-6 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 no-underline"
          data-testid="masthead-wordmark"
        >
          <img src={logoPath} alt="" className="h-5 w-5 select-none" draggable={false} />
          <span className="font-serif text-[16.5px] leading-none text-ink">
            Grid<em className="italic text-brand-ink">Tilt</em>
          </span>
        </Link>
        <nav className="flex items-stretch gap-4 sm:gap-5" aria-label="Sections" data-testid="masthead-nav">
          {SECTIONS.map((s) => {
            const active = s.match(location);
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`relative flex shrink-0 items-center text-[13px] leading-none no-underline transition-colors duration-fast ${
                  active ? "font-semibold text-ink" : "text-ink-secondary hover:text-ink"
                }`}
                data-testid={`masthead-nav-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {s.label}
                {active && (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-brand" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <Link
          href="/subscribe"
          className="hidden md:flex shrink-0 items-center text-[13px] font-semibold leading-none no-underline text-ink hover:text-brand-ink transition-colors duration-fast"
          data-testid="masthead-nav-subscribe"
        >
          Subscribe
        </Link>
      </div>
    </header>
  );
}
