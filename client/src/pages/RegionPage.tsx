import { useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, MapPin, Zap } from "lucide-react";
import { RTO_CONFIG, RTO_SOURCE_NOTE } from "@/data/rto-config";
import { ErrorState } from "@/components/Freshness";
import { SortableTh } from "@/components/sortable-table";
import { nextSort, sortBy, type SortState } from "@/lib/table-sort";

const REGION_META: Record<string, { name: string; fullName: string; states: string; description: string }> = {
  "pjm": {
    name: "PJM", fullName: "PJM Interconnection",
    states: "PA, NJ, DE, MD, VA, WV, OH, IN, IL, MI, KY, NC, TN, DC",
    description: "PJM is the largest electricity market in North America, serving 65 million customers across 13 states. It hosts the highest concentration of hyperscaler data centers in the US, primarily in Northern Virginia (Data Center Alley). PJM capacity auction clearing prices hit record levels in 2025 at $270/MW-day, driven by AI data center load additions outpacing new generation.",
  },
  "ercot": {
    name: "ERCOT", fullName: "Electric Reliability Council of Texas",
    states: "TX (most of state)",
    description: "ERCOT operates the isolated Texas grid serving 26 million customers. Texas has attracted significant data center investment due to low electricity costs, land availability, and minimal regulatory overhead. EIA projects a 79% wholesale price increase in ERCOT by 2027 due to data center demand growth.",
  },
  "miso": {
    name: "MISO", fullName: "Midcontinent Independent System Operator",
    states: "ND, SD, NE, MN, IA, WI, IL, IN, MI, AR, MS, LA, TX (part)",
    description: "MISO manages one of the most capacity-constrained grids in the US, with reserve margins dropping to 13.4% per NERC's latest assessment. The region serves a growing concentration of hyperscaler data centers, particularly in Iowa and Illinois.",
  },
  "wecc": {
    name: "WECC", fullName: "Western Electricity Coordinating Council",
    states: "WA, OR, CA, NV, AZ, UT, CO, WY, MT, ID, NM",
    description: "WECC covers the western interconnection, including major data center markets in Oregon (The Dalles), Nevada, and Arizona. Google, Meta, and Microsoft have significant facility presence in the Pacific Northwest due to hydroelectric power availability.",
  },
  "serc": {
    name: "SERC", fullName: "SERC Reliability Corporation",
    states: "VA, NC, SC, GA, AL, FL, TN, MS",
    description: "SERC covers the southeastern US, a growing data center market driven by lower land costs and expanding utility partnerships. Duke Energy and Southern Company are actively negotiating AI data center power agreements in this region.",
  },
  "spp": {
    name: "SPP", fullName: "Southwest Power Pool",
    states: "KS, OK, NE, NM, TX (panhandle), AR, MO, ND, SD, MT, WY, IA, MN, LA",
    description: "SPP manages the grid across the south-central plains states. While not yet a major data center hub, SPP's abundant wind resources and available land are attracting interest from hyperscalers seeking renewable-powered facilities.",
  },
  "npcc": {
    name: "NPCC", fullName: "Northeast Power Coordinating Council",
    states: "NY, CT, MA, ME, NH, RI, VT",
    description: "NPCC covers the northeastern US and coordinates with ISO-NE and NYISO. The region has limited data center expansion due to high electricity costs and constrained transmission, but hosts critical financial services and enterprise computing infrastructure.",
  },
};

const ALL_REGIONS = Object.keys(REGION_META);

interface Datacenter {
  id: number;
  name: string;
  company: string;
  city: string;
  state: string;
  powerMW: number;
  status: "operational" | "construction" | "announced";
  gridOperator: string;
  openDate: string;
}

type FacilitySortKey = "company" | "name" | "location" | "powerMW" | "status";

const FACILITY_COLS: Array<{ key: FacilitySortKey; label: string; align?: "right"; title?: string }> = [
  { key: "company", label: "Company" },
  { key: "name", label: "Facility" },
  { key: "location", label: "Location" },
  { key: "powerMW", label: "Power", align: "right" },
  { key: "status", label: "Status", align: "right", title: "Sorts by build progress, not alphabetically" },
];

/** Columns that read best A to Z on first click; the rest open largest-first. */
const FACILITY_TEXT_COLS: FacilitySortKey[] = ["company", "name", "location"];

/** Status is a build-progress ramp, so it sorts by progress rather than by name. */
const STATUS_RANK: Record<string, number> = { operational: 3, construction: 2, announced: 1 };

function facilityCell(d: Datacenter, key: FacilitySortKey): unknown {
  if (key === "location") return `${d.city}, ${d.state}`;
  if (key === "status") return STATUS_RANK[d.status] ?? 0;
  return d[key];
}

// Mirrors PowerMap.tsx's gridOpToRTO exactly (each page re-declares its own
// copy per house convention) so a region's facility count and capacity here
// match what the same RTO filter shows on the Power map.
function gridOpToRTO(op: string): string {
  const o = op.toLowerCase();
  if (o.includes("pjm") || o.includes("ppl") || o.includes("aep")) return "PJM";
  if (o.includes("miso") || o.includes("nipsco") || o.includes("kcp")) return "MISO";
  if (o.includes("ercot")) return "ERCOT";
  if (o.includes("tva") || o.includes("southern") || o.includes("duke") || o.includes("serc") ||
      o.includes("dominion") || o.includes("entergy") || o.includes("santee")) return "SERC";
  if (o.includes("spp") || o.includes("seci")) return "SPP";
  if (o.includes("bpa") || o.includes("wecc") || o.includes("nv energy") || o.includes("rocky") ||
      o.includes("aps") || o.includes("srp") || o.includes("westconnect") || o.includes("caiso") ||
      o.includes("pacificorp") || o.includes("idaho power") || o.includes("el paso")) return "WECC";
  if (o.includes("npcc") || o.includes("iso-ne") || o.includes("nyiso")) return "NPCC";
  return "WECC";
}

const STATUS_BADGE: Record<Datacenter["status"], { label: string; className: string }> = {
  operational: { label: "Operational", className: "bg-positive-deep/15 text-positive" },
  construction: { label: "Construction", className: "bg-warning/15 text-warning" },
  announced: { label: "Announced", className: "bg-muted text-muted-foreground" },
};

const SIGNAL_BADGE: Record<string, string> = {
  Critical: "bg-negative-deep/15 text-negative border-negative-deep/30",
  Elevated: "bg-warning/15 text-warning border-warning/30",
  Moderate: "bg-positive-deep/15 text-positive border-positive-deep/30",
  Low: "bg-positive-deep/15 text-positive border-positive-deep/30",
};

export default function RegionPage() {
  const { slug } = useParams<{ slug: string }>();
  const region = slug ? REGION_META[slug] : null;
  const [sort, setSort] = useState<SortState<FacilitySortKey>>({ key: "powerMW", dir: "desc" });

  const { data: datacenters, isLoading, isError, refetch } = useQuery<Datacenter[]>({
    queryKey: ["/api/datacenters"],
  });

  if (!region) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6">
        <Card className="p-8 border-card-border text-center">
          <AlertTriangle className="h-8 w-8 text-negative mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-2">Region Not Found</h1>
          <p className="text-sm text-muted-foreground">
            <Link href="/power-map" className="text-brand">View Power</Link> to see all grid regions.
          </p>
        </Card>
      </div>
    );
  }

  const all = datacenters ?? [];
  const facilities = all.filter((d) => gridOpToRTO(d.gridOperator) === region.name);
  const sorted = sortBy(facilities, (d) => facilityCell(d, sort.key), sort.dir, (d) => d.name);
  const trackedMW = facilities.filter((d) => d.status !== "announced").reduce((t, d) => t + d.powerMW, 0);
  const announcedMW = facilities.filter((d) => d.status === "announced").reduce((t, d) => t + d.powerMW, 0);
  const statusCounts = facilities.reduce(
    (acc, d) => ({ ...acc, [d.status]: (acc[d.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  const rtoConfig = RTO_CONFIG[region.name];

  const regionCounts: Record<string, number> = {};
  for (const d of all) {
    const rto = gridOpToRTO(d.gridOperator);
    regionCounts[rto] = (regionCounts[rto] ?? 0) + 1;
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 space-y-6">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="breadcrumb">
        <Link href="/" className="hover:text-foreground">GridTilt</Link>
        <span>/</span>
        <Link href="/power-map" className="hover:text-foreground">Power</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{region.name}</span>
      </nav>

      <div>
        <div className="flex items-center gap-3 mb-2">
          <MapPin className="h-5 w-5 text-brand" />
          <h1 className="text-2xl font-bold" data-testid="region-heading">{region.fullName} ({region.name})</h1>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Coverage: {region.states}</p>
        <p className="text-sm text-muted-foreground max-w-3xl">{region.description}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 border-card-border" data-testid="stat-facility-count">
          <p className="text-[11px] text-muted-foreground mb-1">Tracked Facilities</p>
          {isLoading ? <Skeleton className="h-7 w-12" /> : (
            <p className="text-xl font-bold font-mono text-foreground">{facilities.length}</p>
          )}
        </Card>
        <Card className="p-4 border-card-border" data-testid="stat-tracked-capacity">
          <p className="text-[11px] text-muted-foreground mb-1">Tracked Capacity</p>
          {isLoading ? <Skeleton className="h-7 w-16" /> : (
            <p className="text-xl font-bold font-mono text-brand-2" title="operational + construction; announced excluded">
              {(trackedMW / 1000).toFixed(1)} GW
            </p>
          )}
        </Card>
        <Card className="p-4 border-card-border" data-testid="stat-reserve-margin">
          <p className="text-[11px] text-muted-foreground mb-1">Reserve Margin</p>
          <p className="text-xl font-bold font-mono text-foreground">
            {rtoConfig ? `${rtoConfig.reserveMargin.toFixed(1)}%` : "N/A"}
          </p>
        </Card>
        <Card className="p-4 border-card-border" data-testid="stat-ai-signal">
          <p className="text-[11px] text-muted-foreground mb-1">AI Load Signal</p>
          {rtoConfig ? (
            <Badge className={`font-mono ${SIGNAL_BADGE[rtoConfig.aiSignal] ?? ""}`}>{rtoConfig.aiSignal}</Badge>
          ) : (
            <p className="text-xl font-bold font-mono text-foreground">N/A</p>
          )}
        </Card>
      </div>
      <p className="text-9 text-muted-foreground/50 -mt-4">Reserve margin and AI load signal: {RTO_SOURCE_NOTE}.</p>

      <Card className="p-5 border-card-border" data-testid="region-facilities">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-[13px] font-semibold text-foreground">Facilities in {region.name}</h2>
          {facilities.length > 0 && (
            <span className="text-10 text-muted-foreground">
              {statusCounts.operational ?? 0} operational &middot; {statusCounts.construction ?? 0} under construction
              {statusCounts.announced ? ` · ${statusCounts.announced} announced (+${(announcedMW / 1000).toFixed(1)} GW, excluded above)` : ""}
            </span>
          )}
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : isError ? (
          // A failed fetch must not read as "nothing is being built in this RTO".
          <ErrorState label="Facility registry failed to load." onRetry={() => refetch()} />
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4" data-testid="region-facilities-empty">
            No facilities in the tracked dataset carry this RTO yet.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-10 text-muted-foreground border-b border-border">
                  {FACILITY_COLS.map((c) => (
                    <SortableTh
                      key={c.key}
                      label={c.label}
                      title={c.title}
                      align={c.align ?? "left"}
                      active={sort.key === c.key}
                      dir={sort.dir}
                      onSort={() => setSort((s) => nextSort(s, c.key, FACILITY_TEXT_COLS))}
                      className="py-1.5 px-1"
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
                      <td className="py-2 px-1 font-medium text-foreground whitespace-nowrap">{d.company}</td>
                      <td className="py-2 px-1 text-muted-foreground">{d.name}</td>
                      <td className="py-2 px-1 text-muted-foreground whitespace-nowrap">{d.city}, {d.state}</td>
                      <td className="py-2 px-1 text-right font-mono text-foreground whitespace-nowrap">{d.powerMW.toLocaleString()} MW</td>
                      <td className="py-2 px-1 text-right">
                        <Badge className={`text-10 font-mono ${badge.className}`}>{badge.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5 border-card-border" data-testid="region-map-link">
        <h2 className="text-[13px] font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-brand" /> Interactive Map
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          View every facility in {region.name} plotted on the interactive Power map.
        </p>
        <Link
          href={`/power-map?rtos=${region.name}`}
          className="inline-flex items-center gap-1.5 text-sm text-brand hover:text-brand-2 font-medium"
          data-testid="link-filtered-map"
        >
          Open Power filtered to {region.name}
        </Link>
      </Card>

      <Card className="p-5 border-card-border" data-testid="related-regions">
        <h2 className="text-[13px] font-semibold text-foreground mb-3">Other Grid Regions</h2>
        <div className="flex flex-wrap gap-2">
          {ALL_REGIONS.filter((r) => r !== slug).map((r) => (
            <Link key={r} href={`/region/${r}`}>
              <Badge className="bg-muted/50 text-muted-foreground hover:bg-muted/70 cursor-pointer" data-testid={`link-region-${r}`}>
                {REGION_META[r].name}
                {!isLoading && <span className="opacity-50 ml-1">{regionCounts[REGION_META[r].name] ?? 0}</span>}
              </Badge>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="p-5 border-card-border">
        <h2 className="text-[13px] font-semibold text-foreground mb-3">Related Tools</h2>
        <div className="space-y-2 text-sm">
          <Link href="/power-map" className="block text-brand hover:text-brand-2">Power</Link>
          <Link href="/analyze?tab=scenario" className="block text-brand hover:text-brand-2">Analyze</Link>
          <Link href="/stack" className="block text-brand hover:text-brand-2">Equities</Link>
        </div>
      </Card>
    </div>
  );
}
