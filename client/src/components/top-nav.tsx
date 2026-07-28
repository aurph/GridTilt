import { Link, useLocation } from "wouter";
import logoPath from "@assets/Image_[Vectorized]_(2)_1773890483514.png";

/**
 * Top navigation bar: one sticky row across the screen, replacing the left
 * sidebar. Sections read left to right; the active one carries the orange
 * bar. Horizontal scroll below lg keeps every section reachable.
 */

const SECTIONS: { label: string; href: string; match: (p: string) => boolean }[] = [
  { label: "Overview", href: "/overview", match: (p) => p === "/overview" },
  { label: "Equities", href: "/stack", match: (p) => p === "/stack" || p === "/supply-chain" },
  { label: "Power", href: "/power-map", match: (p) => p.startsWith("/power") || p === "/queue" },
  { label: "My Grid", href: "/my-grid", match: (p) => p === "/my-grid" },
  { label: "Compute", href: "/compute-frontier", match: (p) => p.startsWith("/compute-frontier") },
  { label: "GPU Prices", href: "/neocloud-intel", match: (p) => p === "/neocloud-intel" || p === "/gpu-economics" },
  { label: "Analyze", href: "/analyze", match: (p) => p === "/analyze" || p === "/trade" || p === "/portfolio" },
  { label: "Catalysts", href: "/catalysts", match: (p) => p === "/catalysts" },
  { label: "Research", href: "/blog", match: (p) => p.startsWith("/blog") || p === "/brief" },
];

export function TopNav() {
  const [location] = useLocation();
  return (
    <header
      className="sticky top-0 z-50 flex-shrink-0 border-b border-border bg-sidebar"
      data-testid="top-nav"
    >
      <div className="flex h-12 items-stretch gap-5 px-4 sm:gap-6 sm:px-6 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 no-underline"
          data-testid="top-nav-wordmark"
        >
          <img src={logoPath} alt="" className="h-5 w-5 select-none" draggable={false} />
          <span className="text-[15px] font-bold leading-none tracking-tight text-foreground">
            Grid<span className="italic text-brand">Tilt</span>
          </span>
        </Link>
        <nav className="flex items-stretch gap-4 sm:gap-5" aria-label="Sections" data-testid="top-nav-sections">
          {SECTIONS.map((s) => {
            const active = s.match(location);
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`relative flex shrink-0 items-center text-[13px] leading-none no-underline transition-colors ${
                  active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`top-nav-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {s.label}
                {active && <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] bg-brand" />}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1" />
        <Link
          href="/subscribe"
          className="hidden md:flex shrink-0 items-center text-[13px] font-semibold leading-none no-underline text-muted-foreground hover:text-foreground transition-colors"
          data-testid="top-nav-subscribe"
        >
          Subscribe
        </Link>
      </div>
    </header>
  );
}
