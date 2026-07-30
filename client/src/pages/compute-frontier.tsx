import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapContainer, TileLayer, CircleMarker, Tooltip as MapTooltip, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState, SrChartTable } from "@/components/Freshness";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Cell,
} from "recharts";
import { ArrowUpDown, Atom } from "lucide-react";
import { PageHeader, HeaderStat } from "@/components/PageHeader";
import { BRAND, INK, SURFACE, CATEGORY_COLORS, STATUS_COLORS } from "@/lib/tokens";
import { axisProps, gridProps } from "@/lib/chart-theme";

// ─── Types (mirror /api/clusters and /api/clusters/metrics) ────────────────

interface Cluster {
  id: string;
  name: string;
  operator: string;
  status: "operational" | "construction" | "announced";
  location: { city: string; state: string; lat: number; lng: number };
  gridRegion: string;
  gpuCount: number | null;
  chipType: string;
  ratedPowerMW: number;
  plannedPowerMW: number;
  energySource: string;
  workload: "training" | "inference" | "mixed";
  linkedDeal: string | null;
  onlineDate: string;
  estimated: string[];
  sources: string[];
  notes?: string;
}

interface OperatorBucket { operator: string; count: number; ratedMW: number; plannedMW: number; gpus: number; }
interface IsoBucket { iso: string; count: number; ratedMW: number; plannedMW: number; }
interface StatusBucket { status: string; count: number; ratedMW: number; plannedMW: number; }
interface EnergyBucket { source: string; count: number; ratedMW: number; plannedMW: number; }
interface PowerSecuredDeal { id: string; projectName: string; capacityMW: number; firmness: string; clusterIds: string[]; }
interface ClusterMetrics {
  clusterCount: number;
  operationalCount: number;
  constructionCount: number;
  announcedCount: number;
  totalRatedMW: number;
  operationalMW: number;
  totalPlannedMW: number;
  totalGpus: number;
  clustersWithGpuData: number;
  byStatus: StatusBucket[];
  byOperator: OperatorBucket[];
  byIso: IsoBucket[];
  byEnergySource: EnergyBucket[];
  gpusPerMW: number | null;
  concentration: { topOperator: string | null; topOperatorPlannedShare: number; hhi: number; operatorCount: number };
  linkedDealCount: number;
  linkedDealIds: string[];
  powerSecured: {
    clustersWithDeal: number;
    plannedMWWithDeal: number;
    totalPlannedMW: number;
    securedMW: number;
    signedSecuredMW: number;
    deals: PowerSecuredDeal[];
  };
  lastRefreshed: string | null;
}

// ─── Display helpers ───────────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = STATUS_COLORS;

const ENERGY_COLOR: Record<string, string> = {
  nuclear: CATEGORY_COLORS.nuclear,
  "on-site gas": CATEGORY_COLORS.gas,
  grid: CATEGORY_COLORS.grid,
  hydro: CATEGORY_COLORS.hydro,
  renewables: CATEGORY_COLORS.renewables,
  other: INK.faint,
};

const STATUS_LABEL: Record<string, string> = {
  operational: "operational",
  construction: "construction",
  announced: "announced",
};

/** GW with one decimal from MW. */
function gw(mw: number): string {
  return (mw / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function mwCell(n: number): string {
  if (n === 0) return "—";
  return n.toLocaleString("en-US");
}

function gpuCell(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}M`;
  if (n >= 1000) return `${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })}k`;
  return n.toLocaleString("en-US");
}

/** Truncate a long category-axis label to a fixed length with an ellipsis, so
 *  crowded horizontal bar charts (long operator/company names) never smear
 *  into each other. Full names still surface in the tooltip and screen-reader table. */
function truncateLabel(s: string, max = 16): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** Small "est." tag for any value whose field is in the cluster's estimated[]. */
function Est({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="ml-1 text-8 text-brand-2/80 align-top">est.</span>;
}

type SortKey = "name" | "operator" | "plannedPowerMW" | "ratedPowerMW" | "gpuCount" | "onlineDate";
type SortDir = "asc" | "desc";

// ─── Page ──────────────────────────────────────────────────────────────────

export default function ComputeFrontier() {
  const { data: clusters, isLoading, isError, refetch, dataUpdatedAt } = useQuery<Cluster[]>({ queryKey: ["/api/clusters"] });
  const { data: metrics, isError: metricsError, refetch: refetchMetrics } = useQuery<ClusterMetrics>({ queryKey: ["/api/clusters/metrics"] });

  const [operatorFilter, setOperatorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isoFilter, setIsoFilter] = useState("all");
  const [dealOnly, setDealOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("plannedPowerMW");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const operators = clusters ? Array.from(new Set(clusters.map((c) => c.operator))).sort() : [];
  const isos = clusters ? Array.from(new Set(clusters.map((c) => c.gridRegion))).sort() : [];

  const filtered = useMemo(() => {
    if (!clusters) return [];
    let rows = clusters.filter((c) => {
      if (operatorFilter !== "all" && c.operator !== operatorFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (isoFilter !== "all" && c.gridRegion !== isoFilter) return false;
      if (dealOnly && !c.linkedDeal) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "operator") cmp = a.operator.localeCompare(b.operator);
      else if (sortKey === "plannedPowerMW") cmp = a.plannedPowerMW - b.plannedPowerMW;
      else if (sortKey === "ratedPowerMW") cmp = a.ratedPowerMW - b.ratedPowerMW;
      else if (sortKey === "gpuCount") cmp = (a.gpuCount ?? -1) - (b.gpuCount ?? -1);
      else if (sortKey === "onlineDate") cmp = a.onlineDate.localeCompare(b.onlineDate);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [clusters, operatorFilter, statusFilter, isoFilter, dealOnly, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" || key === "operator" ? "asc" : "desc"); }
  };

  // Build-timeline: planned MW bucketed by the first 4-digit year in onlineDate.
  const timeline = useMemo(() => {
    if (!clusters) return [];
    const byYear = new Map<string, number>();
    for (const c of clusters) {
      const m = c.onlineDate.match(/\d{4}/);
      const year = m ? m[0] : "n/a";
      byYear.set(year, (byYear.get(year) ?? 0) + c.plannedPowerMW);
    }
    // Numeric year ascending; the "n/a" bucket (no announced online date) always last.
    return Array.from(byYear.entries())
      .sort((a, b) => {
        if (a[0] === "n/a") return 1;
        if (b[0] === "n/a") return -1;
        return Number(a[0]) - Number(b[0]);
      })
      .map(([year, mw]) => ({ year, gw: parseFloat((mw / 1000).toFixed(2)) }));
  }, [clusters]);

  // Operator chart: cap at the 15 largest by planned MW and roll the rest into
  // an "Others" bar, so the chart stays legible across dozens of operators.
  const OP_TOP_N = 15;
  const topOperators = useMemo(() => {
    if (!metrics) return [];
    const top = metrics.byOperator.slice(0, OP_TOP_N);
    const rest = metrics.byOperator.slice(OP_TOP_N);
    if (rest.length === 0) return top;
    const others = rest.reduce(
      (a, o) => ({ operator: a.operator, count: a.count + o.count, ratedMW: a.ratedMW + o.ratedMW, plannedMW: a.plannedMW + o.plannedMW, gpus: a.gpus + o.gpus }),
      { operator: `Others (${rest.length})`, count: 0, ratedMW: 0, plannedMW: 0, gpus: 0 },
    );
    return [...top, others];
  }, [metrics]);

  // Fixed row height per operator bar so labels always have their own clear
  // line at interval={0}; grows past the 280px default once there are enough
  // bars (15 top + Others) that a static height would pack rows too tight.
  const OPERATOR_ROW_HEIGHT = 26;
  const operatorChartHeight = Math.max(280, topOperators.length * OPERATOR_ROW_HEIGHT + 40);

  const ps = metrics?.powerSecured;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="Compute Frontier"
        testId="cf-hero"
        about={
          <>
            The named AI training and inference superclusters being built across the US, by GPUs, chips, and power,
            tied to the nuclear-for-AI deals GridTilt already tracks. This registry is tracked, not exhaustive.
            Power is in MW. Every figure that is a GridTilt estimate or an announced target carries an{" "}
            <span className="text-brand-2">est.</span> tag; GPU counts are shown only where an operator has
            disclosed them.
          </>
        }
        stats={
          metrics ? (
            <>
              <HeaderStat label="Clusters" value={String(metrics.clusterCount)} valueClass="text-foreground" />
              <HeaderStat label="Planned" value={`${gw(metrics.totalPlannedMW)} GW`} />
            </>
          ) : undefined
        }
        right={
          <>
            {metrics?.lastRefreshed && <span className="text-11 font-mono text-muted-foreground/60">refreshed {metrics.lastRefreshed}</span>}
            <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} />
            <Link href="/power-map" className="text-11 text-brand hover:text-brand-2 font-medium">Power Map →</Link>
            <Link href="/queue" className="text-11 text-brand hover:text-brand-2 font-medium">Nuclear deals →</Link>
          </>
        }
      />

      <div className="flex-1 p-4 sm:p-6 space-y-4">
        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3" data-testid="cf-cards">
          <MetricCard label="Tracked clusters" value={metrics ? String(metrics.clusterCount) : "—"} sub={metrics ? `${metrics.operationalCount} live · ${metrics.constructionCount} building` : ""} />
          <MetricCard label="Operational power" value={metrics ? `${gw(metrics.operationalMW)} GW` : "—"} sub={metrics ? `of ${gw(metrics.totalRatedMW)} GW rated today` : ""} />
          <MetricCard label="Planned power" value={metrics ? `${gw(metrics.totalPlannedMW)} GW` : "—"} sub="full announced build-out" accent />
          <MetricCard label="Tracked GPUs" value={metrics ? gpuCell(metrics.totalGpus) : "—"} sub={metrics ? `across ${metrics.clustersWithGpuData} disclosing` : ""} />
          <MetricCard label="Operators" value={metrics ? String(metrics.concentration.operatorCount) : "—"} sub={metrics?.concentration.topOperator ? `top: ${metrics.concentration.topOperator} ${Math.round(metrics.concentration.topOperatorPlannedShare * 100)}%` : ""} />
          <MetricCard label="Nuclear secured" value={ps ? `${gw(ps.securedMW)} GW` : "—"} sub={ps ? `${ps.clustersWithDeal} clusters linked` : ""} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" data-testid="cf-charts">
          <ChartCard title={`Planned MW by operator${metrics && metrics.concentration.operatorCount > OP_TOP_N ? ` (top ${OP_TOP_N})` : ""}`}>
            {metricsError ? (
              <ErrorState label="Cluster metrics failed to load." onRetry={() => refetchMetrics()} className="h-[280px]" />
            ) : metrics ? (
              <ResponsiveContainer width="100%" height={operatorChartHeight}>
                <BarChart data={topOperators} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid {...gridProps} vertical={true} horizontal={false} />
                  <XAxis {...axisProps} type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}`} />
                  <YAxis
                    {...axisProps}
                    type="category"
                    dataKey="operator"
                    width={150}
                    interval={0}
                    tickFormatter={(v: string) => truncateLabel(v, 16)}
                  />
                  <RTooltip formatter={(v: number, _n, p: any) => [`${v.toLocaleString()} MW`, `${p.payload.count} clusters`]} cursor={{ fill: BRAND.glow }} />
                  <Bar dataKey="plannedMW" fill={BRAND.primary} radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartSkeleton />}
            {topOperators.length > 0 && (
              <SrChartTable
                caption="Planned MW by operator"
                columns={["Operator", "Planned MW"]}
                rows={topOperators.map((o) => [o.operator, o.plannedMW.toLocaleString()])}
              />
            )}
            <p className="text-10 text-muted-foreground/50 mt-1">x axis in GW{metrics && metrics.concentration.operatorCount > OP_TOP_N ? ` · ${metrics.concentration.operatorCount} operators total` : ""}</p>
          </ChartCard>

          <ChartCard title="Planned MW by grid region (ISO)">
            {metricsError ? (
              <ErrorState label="Cluster metrics failed to load." onRetry={() => refetchMetrics()} className="h-[260px]" />
            ) : metrics ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={metrics.byIso} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...axisProps} dataKey="iso" />
                  <YAxis {...axisProps} tickFormatter={(v) => `${(v / 1000).toFixed(0)}`} />
                  <RTooltip formatter={(v: number) => [`${v.toLocaleString()} MW`, "planned"]} cursor={{ fill: BRAND.glow }} />
                  <Bar dataKey="plannedMW" fill={BRAND.secondary} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartSkeleton />}
            {metrics && (
              <SrChartTable
                caption="Planned MW by grid region (ISO)"
                columns={["Grid region", "Planned MW"]}
                rows={metrics.byIso.map((b) => [b.iso, b.plannedMW.toLocaleString()])}
              />
            )}
            <p className="text-10 text-muted-foreground/50 mt-1">y axis in GW</p>
          </ChartCard>

          <ChartCard title="Planned MW by status">
            {metricsError ? (
              <ErrorState label="Cluster metrics failed to load." onRetry={() => refetchMetrics()} className="h-[220px]" />
            ) : metrics ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={metrics.byStatus} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...axisProps} dataKey="status" />
                  <YAxis {...axisProps} tickFormatter={(v) => `${(v / 1000).toFixed(0)}`} />
                  <RTooltip formatter={(v: number, _n, p: any) => [`${v.toLocaleString()} MW`, `${p.payload.count} clusters`]} cursor={{ fill: BRAND.glow }} />
                  <Bar dataKey="plannedMW" radius={[2, 2, 0, 0]}>
                    {metrics.byStatus.map((s) => <Cell key={s.status} fill={STATUS_COLOR[s.status] ?? INK.muted} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartSkeleton />}
            {metrics && (
              <SrChartTable
                caption="Planned MW by build status"
                columns={["Status", "Planned MW"]}
                rows={metrics.byStatus.map((s) => [s.status, s.plannedMW.toLocaleString()])}
              />
            )}
            <p className="text-10 text-muted-foreground/50 mt-1">y axis in GW</p>
          </ChartCard>

          <ChartCard title="Build timeline (planned GW online by year)">
            {isError ? (
              <ErrorState label="Cluster dataset failed to load." onRetry={() => refetch()} className="h-[220px]" />
            ) : clusters ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={timeline} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...axisProps} dataKey="year" />
                  <YAxis {...axisProps} />
                  <RTooltip formatter={(v: number) => [`${v} GW`, "planned online"]} cursor={{ fill: BRAND.glow }} />
                  <Bar dataKey="gw" radius={[2, 2, 0, 0]}>
                    {timeline.map((t) => <Cell key={t.year} fill={t.year === "n/a" ? INK.faint : BRAND.primary} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartSkeleton />}
            {timeline.length > 0 && (
              <SrChartTable
                caption="Build timeline: planned GW online by year"
                columns={["Year", "Planned GW"]}
                rows={timeline.map((t) => [t.year, t.gw])}
              />
            )}
            <p className="text-10 text-muted-foreground/50 mt-1">bucketed by first announced year{timeline.some((t) => t.year === "n/a") ? " · n/a = no announced online date" : ""}</p>
          </ChartCard>

          <ChartCard title="Planned MW by energy source">
            {metricsError ? (
              <ErrorState label="Cluster metrics failed to load." onRetry={() => refetchMetrics()} className="h-[220px]" />
            ) : metrics ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={metrics.byEnergySource} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid {...gridProps} vertical={true} horizontal={false} />
                  <XAxis {...axisProps} type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}`} />
                  <YAxis {...axisProps} type="category" dataKey="source" width={80} interval={0} />
                  <RTooltip formatter={(v: number, _n, p: any) => [`${v.toLocaleString()} MW`, `${p.payload.count} clusters`]} cursor={{ fill: BRAND.glow }} />
                  <Bar dataKey="plannedMW" radius={[0, 2, 2, 0]}>
                    {metrics.byEnergySource.map((e) => <Cell key={e.source} fill={ENERGY_COLOR[e.source] ?? INK.faint} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <ChartSkeleton />}
            {metrics && (
              <SrChartTable
                caption="Planned MW by energy source"
                columns={["Energy source", "Planned MW"]}
                rows={metrics.byEnergySource.map((e) => [e.source, e.plannedMW.toLocaleString()])}
              />
            )}
            <p className="text-10 text-muted-foreground/50 mt-1">x axis in GW · grid vs behind-the-meter gas, nuclear, renewables</p>
          </ChartCard>
        </div>

        {/* Map */}
        <Card className="border-card-border overflow-hidden" data-testid="cf-map">
          <div className="flex items-center justify-between px-4 py-2 bg-surface-base border-b border-border">
            <span className="text-[13px] font-semibold text-foreground">Cluster map</span>
            <div className="flex items-center gap-3 text-10 text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.operational }} />operational</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.construction }} />construction</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.announced }} />announced</span>
            </div>
          </div>
          <div style={{ height: 420 }}>
            {clusters && clusters.length > 0 ? (
              <MapContainer center={[39.5, -98.5]} zoom={4} minZoom={3} maxZoom={10} zoomControl={false} style={{ width: "100%", height: "100%", background: SURFACE.base }}>
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  subdomains="abcd"
                />
                {filtered.map((c) => (
                  <CircleMarker
                    key={c.id}
                    center={[c.location.lat, c.location.lng]}
                    radius={Math.max(4, Math.min(22, Math.sqrt(c.plannedPowerMW) / 3.2))}
                    pathOptions={{
                      color: STATUS_COLOR[c.status] ?? INK.muted,
                      fillColor: STATUS_COLOR[c.status] ?? INK.muted,
                      fillOpacity: 0.5,
                      weight: 1,
                    }}
                  >
                    <MapTooltip>
                      <div className="text-xs">
                        <div className="font-semibold">{c.name}</div>
                        <div>{c.operator} · {c.plannedPowerMW.toLocaleString()} MW planned · {STATUS_LABEL[c.status]}</div>
                      </div>
                    </MapTooltip>
                  </CircleMarker>
                ))}
                <ZoomControl position="bottomright" />
              </MapContainer>
            ) : isLoading ? (
              <Skeleton className="h-full w-full rounded-none" aria-hidden="true" />
            ) : isError ? (
              <ErrorState label="Cluster dataset failed to load." onRetry={() => refetch()} className="h-full" />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">No clusters to map.</div>
            )}
          </div>
        </Card>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="cf-filters">
          <ChipSelect label="Operator" value={operatorFilter} onChange={setOperatorFilter} options={[{ value: "all", label: "all" }, ...operators.map((o) => ({ value: o, label: o }))]} />
          <ChipSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: "all", label: "all" }, { value: "operational", label: "operational" }, { value: "construction", label: "construction" }, { value: "announced", label: "announced" }]} />
          <ChipSelect label="Region" value={isoFilter} onChange={setIsoFilter} options={[{ value: "all", label: "all" }, ...isos.map((i) => ({ value: i, label: i }))]} />
          <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer px-2 py-1 rounded border border-subtle hover:border-strong" data-testid="cf-filter-deal">
            <input type="checkbox" checked={dealOnly} onChange={(e) => setDealOnly(e.target.checked)} className="accent-brand" />
            Nuclear-linked only
          </label>
          <span className="text-muted-foreground/60 font-mono ml-auto">{filtered.length} of {clusters?.length ?? 0}</span>
        </div>

        {/* Table */}
        <Card className="border-card-border overflow-hidden" data-testid="cf-table">
          {isError ? (
            <div data-testid="cf-error">
              <ErrorState label="Cluster dataset failed to load." onRetry={() => refetch()} />
            </div>
          ) : (
          <div className="overflow-x-auto">
          <div className="min-w-[820px]">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-base border-b border-border text-[11px] text-muted-foreground">
            <SortHeader label="Cluster" k="name" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-3" />
            <span className="col-span-1">Status</span>
            <SortHeader label="GPUs" k="gpuCount" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 justify-end" />
            <span className="col-span-2">Chip</span>
            <SortHeader label="Rated" k="ratedPowerMW" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 justify-end" />
            <SortHeader label="Planned" k="plannedPowerMW" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 justify-end" />
            <span className="col-span-1">ISO</span>
            <SortHeader label="Online" k="onlineDate" cur={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1" />
            <span className="col-span-1 text-center">Deal</span>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">{Array(10).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground" data-testid="cf-empty">No clusters match the current filters.</div>
          ) : (
            filtered.map((c) => (
              <UITooltip key={c.id}>
                <TooltipTrigger asChild>
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs hover:bg-brand/5" data-testid={`cf-row-${c.id}`}>
                    <div className="col-span-3 min-w-0">
                      <Link href={`/compute-frontier/${c.id}`} className="font-medium text-foreground truncate hover:text-brand block no-underline">{c.name}</Link>
                      <div className="text-10 text-muted-foreground truncate">{c.operator}</div>
                    </div>
                    <span className="col-span-1">
                      <Badge variant="outline" className="text-9 px-1.5 py-0" style={{ color: STATUS_COLOR[c.status] ?? INK.muted, borderColor: `${STATUS_COLOR[c.status] ?? INK.muted}55` }}>
                        {STATUS_LABEL[c.status]}
                      </Badge>
                    </span>
                    <span className="col-span-1 font-mono text-foreground text-right tabular-nums">{gpuCell(c.gpuCount)}<Est on={c.estimated.includes("gpuCount")} /></span>
                    <span className="col-span-2 text-muted-foreground truncate" title={c.chipType}>{c.chipType}</span>
                    <span className="col-span-1 font-mono text-muted-foreground text-right tabular-nums">{mwCell(c.ratedPowerMW)}<Est on={c.estimated.includes("ratedPowerMW")} /></span>
                    <span className="col-span-1 font-mono text-foreground text-right tabular-nums">{mwCell(c.plannedPowerMW)}<Est on={c.estimated.includes("plannedPowerMW")} /></span>
                    <span className="col-span-1 font-mono text-muted-foreground truncate">{c.gridRegion}</span>
                    <span className="col-span-1 font-mono text-muted-foreground text-10 truncate">{c.onlineDate}<Est on={c.estimated.includes("onlineDate")} /></span>
                    <span className="col-span-1 text-center text-10">
                      {c.linkedDeal ? <Link href="/queue" className="text-brand hover:text-brand-2">★</Link> : <span className="text-muted-foreground/30">—</span>}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-md p-3">
                  <div className="text-xs font-semibold mb-1">{c.name} · {c.location.city}, {c.location.state}</div>
                  <div className="text-11 text-muted-foreground mb-1">{c.workload} · {c.energySource}{c.linkedDeal ? ` · nuclear deal: ${c.linkedDeal}` : ""}</div>
                  {c.notes && <p className="text-xs leading-relaxed mb-1.5">{c.notes}</p>}
                  {c.sources.length > 0 && (
                    <p className="text-10 text-muted-foreground break-all">sources: {c.sources.map((s, i) => (<a key={i} href={s} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-2">[{i + 1}]</a>))}</p>
                  )}
                </TooltipContent>
              </UITooltip>
            ))
          )}
          </div>
          </div>
          )}
        </Card>

        {/* Power needed vs secured */}
        {ps && ps.deals.length > 0 && (
          <Card className="border-card-border p-4" data-testid="cf-power-secured">
            <div className="flex items-center gap-2 mb-2">
              <Atom className="h-4 w-4 text-brand" />
              <span className="text-[13px] font-semibold text-foreground">Power needed vs power secured</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-3">
              Of <span className="text-foreground font-mono">{gw(ps.totalPlannedMW)} GW</span> planned across the tracked frontier,{" "}
              <span className="text-foreground font-mono">{gw(ps.plannedMWWithDeal)} GW</span> sits at clusters tied to a tracked
              nuclear-for-AI deal, backed by <span className="text-foreground font-mono">{gw(ps.securedMW)} GW</span> of linked nuclear capacity
              {ps.signedSecuredMW > 0 ? <> ({gw(ps.signedSecuredMW)} GW of it under signed contracts)</> : null}.
              Most clusters run on the grid or on-site gas, not a tracked nuclear deal.
            </p>
            <div className="space-y-1.5">
              {ps.deals.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-11 border-t border-border/30 pt-1.5">
                  <span className="text-foreground">{d.projectName}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{d.capacityMW.toLocaleString()} MW · {d.firmness} · {d.clusterIds.join(", ")}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Methodology footnote */}
        <p className="text-11 text-muted-foreground/60 leading-relaxed px-1" data-testid="cf-methodology">
          Compiled from public announcements (company press releases, Reuters, Tom's Hardware, Data Center Dynamics,
          SemiAnalysis, utility filings) and cross-referenced against GridTilt's{" "}
          <Link href="/power-map" className="text-brand hover:text-brand-2">Power Map</Link> registry. The{" "}
          <span className="text-brand-2">est.</span> tag marks GridTilt estimates and announced targets not yet realized;
          GPU counts read "—" where an operator has not disclosed one. Nuclear links point to the tracked deals on the{" "}
          <Link href="/queue" className="text-brand hover:text-brand-2">Backlog</Link> page. Tracked, not exhaustive.
          Full <Link href="/compute-frontier/methodology" className="text-brand hover:text-brand-2">methodology</Link>, or{" "}
          <Link href="/compute-frontier/compare" className="text-brand hover:text-brand-2">compare clusters side by side</Link>.
        </p>
      </div>
    </div>
  );
}

// ─── Small components ──────────────────────────────────────────────────────

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card className={`border-card-border p-3 ${accent ? "ring-1 ring-brand/20" : ""}`}>
      <div className="text-[11px] text-muted-foreground/70">{label}</div>
      <div className={`text-lg font-semibold tabular-nums mt-0.5 ${accent ? "text-brand" : "text-foreground"}`}>{value}</div>
      {sub && <div className="text-10 text-muted-foreground/60 truncate">{sub}</div>}
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="border-card-border p-3">
      <div className="text-[13px] font-semibold text-foreground mb-2">{title}</div>
      {children}
    </Card>
  );
}

function ChartSkeleton() {
  return <Skeleton className="h-[220px] w-full" />;
}

function SortHeader({ label, k, cur, dir, onClick, className = "" }: { label: string; k: SortKey; cur: SortKey; dir: SortDir; onClick: (k: SortKey) => void; className?: string }) {
  const active = cur === k;
  return (
    <button onClick={() => onClick(k)} className={`flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-brand" : ""} ${className}`} data-testid={`cf-sort-${k}`}>
      {label}
      <ArrowUpDown className="h-3 w-3" style={{ opacity: active ? 1 : 0.3 }} />
      {active && <span className="text-8">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

function ChipSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-1.5 text-muted-foreground">
      <span className="text-muted-foreground/60">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface-base border border-subtle rounded px-1.5 py-1 text-xs text-foreground focus:outline-none focus:border-brand/40"
        data-testid={`cf-select-${label.toLowerCase()}`}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
