/**
 * Live grid: hourly demand for the Lower 48 and the fuel mix by grid
 * operator, from the EIA feed (server/eia-grid.ts). The card carries its own
 * source line, loading state and the honest "not available" state; this page
 * only gives it an address inside the Grid section.
 */
import { Link } from "wouter";
import { PageHeader } from "@/components/PageHeader";
import { GridLiveCard } from "@/components/GridLiveCard";

const REGIONS: [string, string][] = [
  ["PJM", "/region/pjm"],
  ["ERCOT", "/region/ercot"],
  ["MISO", "/region/miso"],
  ["SPP", "/region/spp"],
  ["SERC", "/region/serc"],
  ["WECC", "/region/wecc"],
  ["NPCC", "/region/npcc"],
];

export default function GridLive() {
  return (
    <div className="flex flex-col" data-testid="grid-live-page">
      <PageHeader
        title="Live grid"
        testId="grid-live-header"
        about="Hourly electricity demand and generation by fuel, as reported by grid operators to the EIA."
      />
      <div className="space-y-4 p-4 sm:p-6">
        <GridLiveCard />
        <nav aria-label="Grid regions" className="flex flex-wrap items-baseline gap-x-3 gap-y-2" data-testid="grid-live-regions">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground/80">Grid regions</span>
          {REGIONS.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-[40px] items-center rounded border border-border bg-card/70 px-3 text-[13px] font-semibold text-foreground no-underline transition-colors hover:border-brand/60 hover:text-brand"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
