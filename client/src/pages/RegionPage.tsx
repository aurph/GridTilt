/**
 * One grid region's page: /region/<id>, the address a search result or a
 * shared link lands on. Its content is the map panel's (RegionContent), so
 * the page and the panel can never disagree. Around it: where the region sits
 * among the nine, the tracked campuses inside it, and the way to the others.
 *
 * The regions are the client's list (data/grid-regions.ts); the server's
 * REGION_SLUGS mirrors it (a parity test). SERC and WECC were renamed, so
 * those addresses forward. NPCC covered two of today's regions and keeps a
 * short note that points at both.
 */
import { useMemo, useState } from "react";
import { Link, Redirect, useParams } from "wouter";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { ErrorState } from "@/components/Freshness";
import { RegionLocator } from "@/components/map/region-locator";
import { RegionContent } from "@/components/map/region-panel";
import { SortableTh } from "@/components/sortable-table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { GRID_REGIONS, gridRegion, type GridRegionId } from "@/data/grid-regions";
import { regionIdForSlug, regionOf } from "@/lib/grid-regions";
import { useRegionData, type RegionCampus } from "@/lib/region-data";
import { nextSort, sortBy, type SortState } from "@/lib/table-sort";

type FacilitySortKey = "company" | "name" | "location" | "powerMW" | "status";

const FACILITY_COLS: Array<{ key: FacilitySortKey; label: string; align?: "right"; title?: string }> = [
  { key: "company", label: "Company" },
  { key: "name", label: "Campus" },
  { key: "location", label: "Location" },
  { key: "powerMW", label: "Power", align: "right" },
  { key: "status", label: "Status", align: "right", title: "Sorts by build progress, not alphabetically" },
];

/** Columns that read best A to Z on first click; the rest open largest-first. */
const FACILITY_TEXT_COLS: FacilitySortKey[] = ["company", "name", "location"];

/** Status is a build-progress ramp, so it sorts by progress rather than by name. */
const STATUS_RANK: Record<string, number> = { operational: 3, construction: 2, announced: 1 };

function facilityCell(d: RegionCampus, key: FacilitySortKey): unknown {
  if (key === "location") return `${d.city}, ${d.state}`;
  if (key === "status") return STATUS_RANK[d.status] ?? 0;
  return d[key];
}

const STATUS_BADGE: Record<RegionCampus["status"], { label: string; className: string }> = {
  operational: { label: "Operational", className: "bg-positive-deep/15 text-positive" },
  construction: { label: "Construction", className: "bg-warning/15 text-warning" },
  announced: { label: "Announced", className: "bg-muted text-muted-foreground" },
};

export default function RegionPage() {
  const { slug } = useParams<{ slug: string }>();
  if (slug === "npcc") return <NpccNote />;
  const id = regionIdForSlug(slug);
  if (!id) return <NotFound />;
  // A renamed region (serc, wecc): the server answers a direct visit with a 301; this covers a link followed inside the app.
  if (slug !== id) return <Redirect to={`/region/${id}`} replace />;
  return <RegionBody key={id} id={id} />;
}

function RegionBody({ id }: { id: GridRegionId }) {
  const region = gridRegion(id);
  const { shapes, stats, campuses, sites, sources, campusesLoading, campusesError, refetchCampuses } = useRegionData();
  const [sort, setSort] = useState<SortState<FacilitySortKey>>({ key: "powerMW", dir: "desc" });

  // The same placement rule the map and its panel count by (lib/grid-regions regionOf).
  const inside = useMemo(() => (shapes && campuses ? campuses.filter((d) => regionOf(shapes, d) === id) : null), [shapes, campuses, id]);
  const sorted = sortBy(inside ?? [], (d) => facilityCell(d, sort.key), sort.dir, (d) => d.name);
  const count = (s: RegionCampus["status"]) => (inside ?? []).filter((d) => d.status === s).length;
  const title = region.kind === "market" ? `${region.fullName} (${region.name})` : region.fullName;

  return (
    <div className="mx-auto max-w-[1200px] space-y-5 px-4 py-6 md:px-8">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="breadcrumb">
        <Link href="/" className="hover:text-foreground">
          GridTilt
        </Link>
        <span>/</span>
        <Link href="/grid" className="hover:text-foreground">
          Grid
        </Link>
        <span>/</span>
        <span className="font-medium text-foreground">{region.name}</span>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 shrink-0 rounded-sm" style={{ backgroundColor: region.color }} aria-hidden />
          <h1 className="text-2xl font-bold" data-testid="region-heading">
            {title}
          </h1>
        </div>
        <Link
          href={`/grid?region=${id}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3.5 py-2 text-sm font-semibold text-black no-underline hover:opacity-90"
          data-testid="link-region-map"
        >
          Open {region.name} on the map <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {/* Phone: the locator, then the region, then the lists. Desktop: the region on the left, the rest beside it. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        <Card className="border-card-border p-4 lg:col-start-2 lg:row-start-1" data-testid="region-locator-card">
          {shapes ? <RegionLocator shapes={shapes} id={id} sites={sites} campuses={inside ?? []} /> : <Skeleton className="aspect-[460/290] w-full" />}
          <p className="mt-2 text-10 leading-snug text-muted-foreground/70">
            {region.name} among the nine grid regions. Pale dots are mapped data center sites, locations only (PNNL IM3 atlas
            {sources.sitesVersion ? ` ${sources.sitesVersion}` : ""}, © OpenStreetMap contributors). Larger dots are the tracked campuses in this region. Click
            another region to open its page.
          </p>
        </Card>

        <Card className="self-start overflow-hidden border-card-border pt-4 lg:col-start-1 lg:row-span-2 lg:row-start-1" data-testid="region-summary">
          <RegionContent id={id} stats={stats ? stats[id] : null} sources={sources} />
        </Card>

        <div className="space-y-5 lg:col-start-2 lg:row-start-2">
          <Card className="border-card-border p-5" data-testid="region-facilities">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-[13px] font-semibold text-foreground">Tracked campuses in {region.name}</h2>
              {inside && inside.length > 0 && (
                <span className="text-10 text-muted-foreground">
                  {count("operational")} operational · {count("construction")} under construction
                  {count("announced") > 0 ? ` · ${count("announced")} announced` : ""}
                </span>
              )}
            </div>
            {campusesError ? (
              // A failed fetch must not read as "nothing is being built in this region".
              <ErrorState label="Campus registry failed to load." onRetry={refetchCampuses} />
            ) : campusesLoading || !inside ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : sorted.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground" data-testid="region-facilities-empty">
                No tracked campus sits inside this region as drawn.
              </p>
            ) : (
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-10 text-muted-foreground">
                      {FACILITY_COLS.map((c) => (
                        <SortableTh
                          key={c.key}
                          label={c.label}
                          title={c.title}
                          align={c.align ?? "left"}
                          active={sort.key === c.key}
                          dir={sort.dir}
                          onSort={() => setSort((s) => nextSort(s, c.key, FACILITY_TEXT_COLS))}
                          className="px-1 py-1.5"
                          testId={`region-sort-${c.key}`}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((d) => {
                      const badge = STATUS_BADGE[d.status];
                      return (
                        <tr key={d.id} className="border-b border-border/50 last:border-0" data-testid={`region-facility-${d.id}`}>
                          <td className="whitespace-nowrap px-1 py-2 font-medium text-foreground">{d.company}</td>
                          <td className="px-1 py-2 text-muted-foreground">
                            {d.clusterId ? (
                              <Link href={`/compute-frontier/${d.clusterId}`} className="text-foreground underline decoration-dotted underline-offset-2 hover:text-brand">
                                {d.name}
                              </Link>
                            ) : (
                              d.name
                            )}
                          </td>
                          <td className="whitespace-nowrap px-1 py-2 text-muted-foreground">
                            {d.city}, {d.state}
                          </td>
                          <td className="whitespace-nowrap px-1 py-2 text-right font-mono text-foreground">{d.powerMW.toLocaleString("en-US")} MW</td>
                          <td className="px-1 py-2 text-right">
                            <Badge className={`font-mono text-10 ${badge.className}`}>{badge.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-10 leading-snug text-muted-foreground/70">
              Every tracked campus inside the region as drawn, at any size. The megawatt figure beside the region counts only those of 400 MW and up that are
              operational or under construction.
            </p>
          </Card>

          <Card className="border-card-border p-5" data-testid="related-regions">
            <h2 className="mb-3 text-[13px] font-semibold text-foreground">The other grid regions</h2>
            <div className="flex flex-wrap gap-2">
              {GRID_REGIONS.filter((r) => r.id !== id).map((r) => {
                const n = stats?.[r.id].campuses?.count;
                return (
                  <Link key={r.id} href={`/region/${r.id}`}>
                    <Badge className="cursor-pointer gap-1.5 bg-muted/50 text-muted-foreground hover:bg-muted/70" data-testid={`link-region-${r.id}`}>
                      <span className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: r.color }} aria-hidden />
                      {r.name}
                      {typeof n === "number" && (
                        <span className="opacity-50" title="Tracked campuses inside the region">
                          {n}
                        </span>
                      )}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** /region/npcc: NPCC covered what are now two regions, so it points at both. */
function NpccNote() {
  return (
    <div className="mx-auto max-w-[720px] px-4 py-10 md:px-8">
      <Card className="border-card-border p-6" data-testid="region-npcc-note">
        <h1 className="text-xl font-bold">NPCC: New York and New England</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          NPCC is the reliability organization for New York and New England, whose grids and markets are run by NYISO and ISO New England. GridTilt maps each
          by its operator.
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
          <Link href="/region/nyiso" className="inline-flex items-center gap-1.5 text-brand hover:text-brand-2" data-testid="link-region-nyiso">
            NYISO, New York <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <Link href="/region/isone" className="inline-flex items-center gap-1.5 text-brand hover:text-brand-2" data-testid="link-region-isone">
            ISO-NE, New England <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </Card>
    </div>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 md:px-8">
      <Card className="border-card-border p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-negative" />
        <h1 className="mb-2 text-lg font-semibold">Region not found</h1>
        <p className="text-sm text-muted-foreground">
          <Link href="/grid" className="text-brand">
            Open the map
          </Link>{" "}
          to see the nine grid regions.
        </p>
      </Card>
    </div>
  );
}
