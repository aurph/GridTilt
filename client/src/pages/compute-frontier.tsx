import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { MapContainer, TileLayer, CircleMarker, Tooltip as MapTooltip, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
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
import { EstFlag, PageShell, PageTitle, Provenance, PullStat, RuleSection } from "@/components/editorial";
import { BRAND, INK, SURFACE, CATEGORY_COLORS, STATUS_COLORS } from "@/lib/tokens";
import { axisProps, gridProps, tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from "@/lib/chart-theme";

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

/** Status is typographic, not a pill: weight and ink step carry the state. */
const STATUS_CLASS: Record<string, string> = {
  operational: "font-semibold text-ink",
  construction: "text-ink-secondary",
  announced: "text-ink-muted",
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
  if (n >= 1000) return `${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })}k`;
  return n.toLocaleString("en-US");
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

  const ps = metrics?.powerSecured;

  return (
    <PageShell>
      <PageTitle
        title="Compute Frontier"
        dek="The registry of named AI training and inference superclusters being built across the US, with the chips, power, and deals behind each one."
        right={
          <>
            <AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} />
            <Link href="/power-map" className="text-[12.5px] font-semibold text-ink no-underline hover:text-brand-ink">Power Map →</Link>
            <Link href="/queue" className="text-[12.5px] font-semibold text-ink no-underline hover:text-brand-ink">Nuclear deals →</Link>
          </>
        }
        testId="cf-hero"
      />

      {/* Summary band */}
      <section className="border-b border-rule pb-5" data-testid="cf-cards">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-8 gap-y-5">
          <PullStat
            label="Tracked clusters"
            value={metrics ? String(metrics.clusterCount) : "—"}
            note={metrics ? `${metrics.operationalCount} live · ${metrics.constructionCount} building` : undefined}
          />
          <PullStat
            label="Operational power"
            value={metrics ? `${gw(metrics.operationalMW)} GW` : "—"}
            note={metrics ? `of ${gw(metrics.totalRatedMW)} GW rated today` : undefined}
          />
          <PullStat
            label="Planned power"
            value={metrics ? `${gw(metrics.totalPlannedMW)} GW` : "—"}
            note="full announced build-out"
          />
          <PullStat
            label="Tracked GPUs"
            value={metrics ? gpuCell(metrics.totalGpus) : "—"}
            note={metrics ? `across ${metrics.clustersWithGpuData} disclosing` : undefined}
          />
          <PullStat
            label="Operators"
            value={metrics ? String(metrics.concentration.operatorCount) : "—"}
            note={metrics?.concentration.topOperator ? `top: ${metrics.concentration.topOperator} ${Math.round(metrics.concentration.topOperatorPlannedShare * 100)}%` : undefined}
          />
          <PullStat
            label="Nuclear secured"
            value={ps ? `${gw(ps.securedMW)} GW` : "—"}
            note={ps ? `${ps.clustersWithDeal} clusters linked` : undefined}
          />
        </div>
        <Provenance
          source="GridTilt cluster registry"
          updated={metrics?.lastRefreshed ?? undefined}
          extra="tracked, not exhaustive"
        />
      </section>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-8 mt-8" data-testid="cf-charts">
        <RuleSection className="mt-0" head={`Planned MW by operator${metrics && metrics.concentration.operatorCount > OP_TOP_N ? ` (top ${OP_TOP_N})` : ""}`}>
          {metricsError ? (
            <ErrorState label="Cluster metrics failed to load." onRetry={() => refetchMetrics()} className="h-[280px]" />
          ) : metrics ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topOperators} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid {...gridProps} vertical={true} horizontal={false} />
                <XAxis {...axisProps} type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}`} />
                <YAxis {...axisProps} type="category" dataKey="operator" width={110} interval={0} />
                <RTooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: number, _n, p: any) => [`${v.toLocaleString()} MW`, `${p.payload.count} clusters`]} cursor={{ fill: BRAND.wash }} />
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
          <p className="mt-1 text-[12px] text-ink-muted">x axis in GW{metrics && metrics.concentration.operatorCount > OP_TOP_N ? ` · ${metrics.concentration.operatorCount} operators total` : ""}</p>
        </RuleSection>

        <RuleSection className="mt-0" head="Planned MW by grid region (ISO)">
          {metricsError ? (
            <ErrorState label="Cluster metrics failed to load." onRetry={() => refetchMetrics()} className="h-[260px]" />
          ) : metrics ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={metrics.byIso} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="iso" />
                <YAxis {...axisProps} tickFormatter={(v) => `${(v / 1000).toFixed(0)}`} />
                <RTooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: number) => [`${v.toLocaleString()} MW`, "planned"]} cursor={{ fill: BRAND.wash }} />
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
          <p className="mt-1 text-[12px] text-ink-muted">y axis in GW</p>
        </RuleSection>

        <RuleSection className="mt-0" head="Planned MW by status">
          {metricsError ? (
            <ErrorState label="Cluster metrics failed to load." onRetry={() => refetchMetrics()} className="h-[220px]" />
          ) : metrics ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={metrics.byStatus} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="status" />
                <YAxis {...axisProps} tickFormatter={(v) => `${(v / 1000).toFixed(0)}`} />
                <RTooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: number, _n, p: any) => [`${v.toLocaleString()} MW`, `${p.payload.count} clusters`]} cursor={{ fill: BRAND.wash }} />
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
          <p className="mt-1 text-[12px] text-ink-muted">y axis in GW</p>
        </RuleSection>

        <RuleSection className="mt-0" head="Build timeline (planned GW online by year)">
          {isError ? (
            <ErrorState label="Cluster dataset failed to load." onRetry={() => refetch()} className="h-[220px]" />
          ) : clusters ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={timeline} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="year" />
                <YAxis {...axisProps} />
                <RTooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: number) => [`${v} GW`, "planned online"]} cursor={{ fill: BRAND.wash }} />
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
          <p className="mt-1 text-[12px] text-ink-muted">bucketed by first announced year{timeline.some((t) => t.year === "n/a") ? " · n/a = no announced online date" : ""}</p>
        </RuleSection>

        <RuleSection className="mt-0" head="Planned MW by energy source">
          {metricsError ? (
            <ErrorState label="Cluster metrics failed to load." onRetry={() => refetchMetrics()} className="h-[220px]" />
          ) : metrics ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={metrics.byEnergySource} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid {...gridProps} vertical={true} horizontal={false} />
                <XAxis {...axisProps} type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}`} />
                <YAxis {...axisProps} type="category" dataKey="source" width={80} interval={0} />
                <RTooltip contentStyle={tooltipContentStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: number, _n, p: any) => [`${v.toLocaleString()} MW`, `${p.payload.count} clusters`]} cursor={{ fill: BRAND.wash }} />
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
          <p className="mt-1 text-[12px] text-ink-muted">x axis in GW · grid vs behind-the-meter gas, nuclear, renewables</p>
        </RuleSection>
      </div>

      {/* Map: a captioned plate */}
      <figure className="mt-8 border border-rule" data-testid="cf-map">
        <div style={{ height: 420 }}>
          {clusters && clusters.length > 0 ? (
            <MapContainer center={[39.5, -98.5]} zoom={4} minZoom={3} maxZoom={10} zoomControl={false} style={{ width: "100%", height: "100%", background: SURFACE.base }}>
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
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
            <div className="flex items-center justify-center h-full text-[13px] text-ink-muted">No clusters to map.</div>
          )}
        </div>
        <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-rule px-3 py-2">
          <span className="text-[12.5px] text-ink-secondary">Tracked clusters by location; marker area scales with planned MW.</span>
          <span className="flex items-center gap-3 text-[12px] text-ink-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.operational }} />operational</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.construction }} />construction</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR.announced }} />announced</span>
          </span>
        </figcaption>
      </figure>

      {/* Master table */}
      <RuleSection
        head="The cluster registry"
        aside={
          <span className="text-[12.5px] text-ink-muted tnum">{filtered.length} of {clusters?.length ?? 0} clusters</span>
        }
        testId="cf-table"
      >
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4 text-[13px]" data-testid="cf-filters">
          <ChipSelect label="Operator" value={operatorFilter} onChange={setOperatorFilter} options={[{ value: "all", label: "all" }, ...operators.map((o) => ({ value: o, label: o }))]} />
          <ChipSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={[{ value: "all", label: "all" }, { value: "operational", label: "operational" }, { value: "construction", label: "construction" }, { value: "announced", label: "announced" }]} />
          <ChipSelect label="Region" value={isoFilter} onChange={setIsoFilter} options={[{ value: "all", label: "all" }, ...isos.map((i) => ({ value: i, label: i }))]} />
          <label className="flex items-center gap-1.5 text-ink-secondary cursor-pointer" data-testid="cf-filter-deal">
            <input type="checkbox" checked={dealOnly} onChange={(e) => setDealOnly(e.target.checked)} className="accent-brand" />
            Nuclear-linked only
          </label>
        </div>

        {isError ? (
          <div data-testid="cf-error">
            <ErrorState label="Cluster dataset failed to load." onRetry={() => refetch()} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="print-table min-w-[860px]">
              <thead>
                <tr>
                  <SortTh label="Cluster" k="name" cur={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th>Status</th>
                  <SortTh label="GPUs" k="gpuCount" cur={sortKey} dir={sortDir} onClick={toggleSort} num />
                  <th>Chip</th>
                  <SortTh label="Rated MW" k="ratedPowerMW" cur={sortKey} dir={sortDir} onClick={toggleSort} num />
                  <SortTh label="Planned MW" k="plannedPowerMW" cur={sortKey} dir={sortDir} onClick={toggleSort} num />
                  <th>ISO</th>
                  <SortTh label="Online" k="onlineDate" cur={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th className="shrink">Deal</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array(10).fill(null).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={9}><Skeleton className="h-6 w-full" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-[13px] text-ink-muted" data-testid="cf-empty">
                      No clusters match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <UITooltip key={c.id}>
                      <TooltipTrigger asChild>
                        <tr className="row-link" data-testid={`cf-row-${c.id}`}>
                          <td>
                            <Link href={`/compute-frontier/${c.id}`} className="font-medium text-ink no-underline hover:text-brand-ink block">{c.name}</Link>
                            <span className="text-[12px] text-ink-muted">{c.operator}</span>
                          </td>
                          <td><span className={STATUS_CLASS[c.status] ?? "text-ink-muted"}>{STATUS_LABEL[c.status]}</span></td>
                          <td className="num">{gpuCell(c.gpuCount)}{c.estimated.includes("gpuCount") && <EstFlag />}</td>
                          <td className="text-ink-secondary max-w-[180px] truncate" title={c.chipType}>{c.chipType}</td>
                          <td className="num text-ink-secondary">{mwCell(c.ratedPowerMW)}{c.estimated.includes("ratedPowerMW") && <EstFlag />}</td>
                          <td className="num font-medium">{mwCell(c.plannedPowerMW)}{c.estimated.includes("plannedPowerMW") && <EstFlag />}</td>
                          <td className="text-ink-muted">{c.gridRegion}</td>
                          <td className="text-ink-muted whitespace-nowrap">{c.onlineDate}{c.estimated.includes("onlineDate") && <EstFlag />}</td>
                          <td className="shrink text-center">
                            {c.linkedDeal
                              ? <Link href="/queue" className="text-ink no-underline hover:text-brand-ink" title={`Nuclear deal: ${c.linkedDeal}`}>★</Link>
                              : <span className="text-ink-faint">—</span>}
                          </td>
                        </tr>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-md p-3">
                        <div className="text-[13px] font-semibold mb-1">{c.name} · {c.location.city}, {c.location.state}</div>
                        <div className="text-[12px] text-muted-foreground mb-1">{c.workload} · {c.energySource}{c.linkedDeal ? ` · nuclear deal: ${c.linkedDeal}` : ""}</div>
                        {c.notes && <p className="text-[12.5px] leading-relaxed mb-1.5">{c.notes}</p>}
                        {c.sources.length > 0 && (
                          <p className="text-[12px] text-muted-foreground break-all">sources: {c.sources.map((s, i) => (<a key={i} href={s} target="_blank" rel="noopener noreferrer" className="text-brand-ink hover:text-ink">[{i + 1}]</a>))}</p>
                        )}
                      </TooltipContent>
                    </UITooltip>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[12.5px] text-ink-muted">† estimated value</p>
        <Provenance
          source="GridTilt cluster registry"
          updated={metrics?.lastRefreshed ?? undefined}
          extra="compiled from public announcements; tracked, not exhaustive"
        />
      </RuleSection>

      {/* Power needed vs secured */}
      {ps && ps.deals.length > 0 && (
        <RuleSection head="Power needed vs power secured" testId="cf-power-secured">
          <p className="max-w-[68ch] text-[13.5px] text-ink-secondary leading-relaxed mb-3">
            Of <span className="text-ink font-semibold tnum">{gw(ps.totalPlannedMW)} GW</span> planned across the tracked frontier,{" "}
            <span className="text-ink font-semibold tnum">{gw(ps.plannedMWWithDeal)} GW</span> sits at clusters tied to a tracked
            nuclear-for-AI deal, backed by <span className="text-ink font-semibold tnum">{gw(ps.securedMW)} GW</span> of linked nuclear capacity
            {ps.signedSecuredMW > 0 ? <> ({gw(ps.signedSecuredMW)} GW of it under signed contracts)</> : null}.
            Most clusters run on the grid or on-site gas, not a tracked nuclear deal.
          </p>
          <div>
            {ps.deals.map((d) => (
              <div key={d.id} className="flex items-baseline justify-between gap-4 py-2 border-b border-rule last:border-b-0 text-[13px]">
                <span className="text-ink font-medium">{d.projectName}</span>
                <span className="text-ink-muted tnum text-right">{d.capacityMW.toLocaleString()} MW · {d.firmness} · {d.clusterIds.join(", ")}</span>
              </div>
            ))}
          </div>
        </RuleSection>
      )}

      {/* Methodology footnote */}
      <p className="mt-8 text-[12.5px] text-ink-muted leading-relaxed max-w-[68ch]" data-testid="cf-methodology">
        Compiled from public announcements (company press releases, Reuters, Tom's Hardware, Data Center Dynamics,
        SemiAnalysis, utility filings) and cross-referenced against GridTilt's{" "}
        <Link href="/power-map" className="text-ink no-underline hover:text-brand-ink">Power Map</Link> registry. The dagger (†)
        marks GridTilt estimates and announced targets not yet realized;
        GPU counts read "—" where an operator has not disclosed one. Nuclear links point to the tracked deals on the{" "}
        <Link href="/queue" className="text-ink no-underline hover:text-brand-ink">Backlog</Link> page. Tracked, not exhaustive.
        Full <Link href="/compute-frontier/methodology" className="text-ink no-underline hover:text-brand-ink">methodology</Link>, or{" "}
        <Link href="/compute-frontier/compare" className="text-ink no-underline hover:text-brand-ink">compare clusters side by side</Link>.
      </p>
    </PageShell>
  );
}

// ─── Small components ──────────────────────────────────────────────────────

function ChartSkeleton() {
  return <Skeleton className="h-[220px] w-full" />;
}

/** Sortable column head for the print table; active sort reads in brand ink. */
function SortTh({ label, k, cur, dir, onClick, num }: { label: string; k: SortKey; cur: SortKey; dir: SortDir; onClick: (k: SortKey) => void; num?: boolean }) {
  const active = cur === k;
  return (
    <th className={num ? "num" : undefined} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <button
        onClick={() => onClick(k)}
        className={`inline-flex items-baseline gap-1 text-[12px] transition-colors ${num ? "justify-end" : ""} ${active ? "text-brand-ink" : "hover:text-ink"}`}
        data-testid={`cf-sort-${k}`}
      >
        {label}
        {active && <span aria-hidden="true">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}

function ChipSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-1.5 text-ink-secondary">
      <span className="text-ink-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-paper border border-rule rounded-sm px-1.5 py-1 text-[13px] text-ink hover:border-rule-strong"
        data-testid={`cf-select-${label.toLowerCase()}`}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
