/**
 * Grid, Buildout and Markets: one section page holding several features.
 *
 * Anatomy: a centered statement naming the section's data, the chip row, then
 * the selected feature's existing page. Each feature is its own chunk, so a
 * section downloads only the feature being read; data already fetched stays
 * cached by react-query, so switching chips does not refetch it. The feature
 * keeps its own heading (one level below the section's) so a deep link reads
 * right on arrival.
 */
import { lazy, Suspense, useMemo, type ComponentType, type LazyExoticComponent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { ErrorBoundary } from "@/components/error-boundary";
import { HeadingLevelProvider } from "@/components/section-heading";
import { ChipMenu, SectionChips, type ChipItem } from "@/components/section-chips";
import { Skeleton } from "@/components/ui/skeleton";
import { STATE_GRID } from "@/data/state-grid";
import { chipFromSearch, chipHref, sectionById, type Section } from "@/lib/sections";
import { statePageLinks, type PublishedStatePage } from "@/lib/state-pages";

type Feature = LazyExoticComponent<ComponentType<any>>;

const FEATURES: Record<Exclude<Section["id"], "states">, Record<string, Feature>> = {
  grid: {
    map: lazy(() => import("@/pages/PowerMap")),
    queue: lazy(() => import("@/pages/Queue")),
    deals: lazy(() => import("@/pages/power-deals")),
    live: lazy(() => import("@/pages/grid-live")),
    timeline: lazy(() => import("@/pages/timeline")),
  },
  compute: {
    clusters: lazy(() => import("@/pages/compute-frontier")),
    "supply-chain": lazy(() => import("@/pages/SupplyChain")),
    "gpu-prices": lazy(() => import("@/pages/neocloud-intel")),
  },
  markets: {
    overview: lazy(() => import("@/pages/TiltOverview")),
    equities: lazy(() => import("@/pages/TheStack")),
    analyze: lazy(() => import("@/pages/Analyze")),
    catalysts: lazy(() => import("@/pages/CatalystTracker")),
  },
};

/** The centered line above a section's content: one bold line and one dek. */
export function SectionStatement({ statement, dek }: { statement: string; dek: string }) {
  return (
    <div className="mx-auto max-w-[640px] px-4 pb-6 pt-9 text-center sm:pt-12" data-testid="section-statement">
      <h1 className="text-balance text-[22px] font-bold leading-tight tracking-tight text-foreground sm:text-[26px]">
        {statement}
      </h1>
      <p className="mx-auto mt-2.5 max-w-[52ch] text-[14px] leading-relaxed text-muted-foreground">{dek}</p>
    </div>
  );
}

function FeatureLoading() {
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6" role="status" aria-live="polite" data-testid="feature-loading">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-5 w-40" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[68px] w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

/** The Grid section's scope control: jump from the national view to one state's record. */
function StateScope() {
  const { data } = useQuery<PublishedStatePage[]>({ queryKey: ["/api/state-pages"] });
  const links = statePageLinks(data, STATE_GRID);
  return (
    <ChipMenu
      label="State"
      testId="grid-state-scope"
      items={links.map((l) => ({ label: l.name, href: l.href, hint: l.code }))}
    />
  );
}

export default function SectionPage({ id }: { id: Exclude<Section["id"], "states"> }) {
  const section = sectionById(id);
  const search = useSearch();
  const active = chipFromSearch(section, search);
  const chips: ChipItem[] = useMemo(
    () => section.chips.map((c) => ({ id: c.id, label: c.label, href: chipHref(id, c.id) })),
    [section, id],
  );
  const Feature = FEATURES[id][active];
  // Queue, Deals and the like render compact when told they are embedded.
  const embedded = id === "grid" && (active === "queue" || active === "deals");

  return (
    <div data-testid={`section-${id}`}>
      <SectionStatement statement={section.statement} dek={section.dek} />
      <div className="border-b border-dashed border-border px-4 pb-4 sm:px-6">
        <SectionChips
          chips={chips}
          active={active}
          label={`${section.label} features`}
          right={id === "grid" ? <StateScope /> : undefined}
        />
      </div>
      <HeadingLevelProvider level={2}>
        <ErrorBoundary label="This view failed to render." resetKey={`${id}:${active}`}>
          <Suspense fallback={<FeatureLoading />}>
            <div className={embedded ? "p-4 sm:p-6" : undefined} data-testid={`feature-${active}`}>
              <Feature embedded={embedded || undefined} />
            </div>
          </Suspense>
        </ErrorBoundary>
      </HeadingLevelProvider>
    </div>
  );
}
