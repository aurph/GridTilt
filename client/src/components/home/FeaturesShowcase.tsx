import { Link } from "wouter";
import { BarChart3, MapPin, GitBranch, CalendarDays, Crosshair, TrendingUp, ArrowRight } from "lucide-react";

interface Module {
  number: string;
  name: string;
  caption: string;
  cta: string;
  icon: typeof BarChart3;
  route: string;
}

const MODULES: Module[] = [
  { number: "01", name: "Equity Heatmap", caption: "One hundred public companies behind the buildout, priced live.", cta: "Open the heatmap", icon: BarChart3, route: "/stack" },
  { number: "02", name: "Power Map", caption: "Thirty-three tracked facilities, plotted by operator and grid region.", cta: "Open the map", icon: MapPin, route: "/power-map" },
  { number: "03", name: "Supply Chain Flow", caption: "Where the buildout can get stuck, mapped to the companies exposed.", cta: "Trace the chain", icon: GitBranch, route: "/stack?view=flow" },
  { number: "04", name: "Catalyst Tracker", caption: "Earnings dates, rule changes, and policy votes. One calendar.", cta: "See what's next", icon: CalendarDays, route: "/catalysts" },
  { number: "05", name: "Analyze: Portfolio", caption: "Type a ticker. See how exposed it is to the power story.", cta: "Score a ticker", icon: Crosshair, route: "/analyze?tab=portfolio" },
  { number: "06", name: "Analyze: Scenario", caption: "Pick how fast demand grows. See what it does to the grid by 2030.", cta: "Run a scenario", icon: TrendingUp, route: "/analyze?tab=scenario" },
];

/**
 * Module directory: six clean cards, no fake preview graphics. Icons and
 * words only; the real product is one click away and speaks for itself.
 */
export function FeaturesShowcase() {
  return (
    <section className="border-b border-border bg-background" data-testid="home-features">
      <div className="mx-auto max-w-[1200px] px-6 py-16 sm:py-20">
        <h2 className="text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-[36px]">
          Six places to start.
        </h2>
        <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-muted-foreground">
          Each shows a different slice of the buildout. Pick the one closest to what you already follow.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => {
            const Icon = m.icon;
            return (
              <Link
                key={m.number}
                href={m.route}
                className="group flex flex-col rounded-md border border-border bg-card p-5 no-underline transition-colors hover:border-brand/50"
                data-testid={`feature-card-${m.number}`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-9 w-9 items-center justify-center rounded border border-border bg-background">
                    <Icon className="h-4 w-4 text-brand" aria-hidden />
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground/60">{m.number}</span>
                </div>
                <h3 className="mt-4 text-[17px] font-semibold text-foreground">{m.name}</h3>
                <p className="mt-1.5 flex-1 text-[13.5px] leading-relaxed text-muted-foreground">{m.caption}</p>
                <span className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-brand">
                  {m.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
