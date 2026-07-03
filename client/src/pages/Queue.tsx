import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState } from "@/components/Freshness";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Zap, ArrowUpDown, ExternalLink, Sun, Wind, Atom, Flame, Battery, Cable, Server, Layers,
} from "lucide-react";
import { CATEGORY_COLORS, INK, SEMANTIC, SERIES } from "@/lib/tokens";

interface BacklogProject {
  id: string;
  projectName: string;
  sponsor: string;
  capacityMW: number;
  type: "nuclear" | "gas" | "solar" | "wind" | "storage" | "hybrid" | "load" | "other";
  iso: string;
  state: string;
  status: "active" | "withdrawn" | "operational";
  category: "generation" | "load" | "ppa" | "aggregate" | "regulatory";
  expectedOnline: string | null;
  offtaker?: string | null;
  dcRelevant: boolean;
  sources?: string[];
  notes?: string;
}

interface BacklogResponse {
  lastRefreshed: string;
  headline: {
    trackedProjects: number;
    trackedCapacityGW: number;
    queueOverallGW: number;
    queueOverallProjects: number;
    medianWaitMonths: number;
    historicalWithdrawalPct: number;
    queueOverallAsOf: string;
    queueOverallSourceUrl: string;
    ercotLargeLoadGW: number;
    ercotLargeLoadDataCenterPct: number;
    ercotLargeLoadAsOf: string;
    pjmReopenedGW: number;
    pjmReopenedProjects: number;
    pjmReopenedAsOf: string;
    dominionContractedGW: number;
    dominionAsOf: string;
    duke5yrGenAddGW: number;
    metaHyperionGW: number;
    stargateAbileneGW: number;
  };
  projects: BacklogProject[];
  /**
   * Headline fields whose values came from hardcoded fallback literals (the
   * old-shape API has no source for them), not sourced data. Rendered with
   * an "est." flag so they are distinguishable from sourced numbers.
   */
  estimatedHeadline?: string[];
}

// Energy types from CATEGORY_COLORS; hybrid/load have no token category, so
// they take free SERIES slots (distinct from every co-occurring type here).
const TYPE_COLORS: Record<string, string> = {
  nuclear: CATEGORY_COLORS.nuclear,
  gas: CATEGORY_COLORS.gas,
  solar: CATEGORY_COLORS.solar,
  wind: CATEGORY_COLORS.wind,
  storage: CATEGORY_COLORS.storage,
  hybrid: SERIES[5], // series slot 6
  load: SERIES[2], // series slot 3 (teal, shared with datacenters - load rows are DC demand)
  other: INK.muted,
};

const TYPE_ICONS: Record<string, any> = {
  nuclear: Atom,
  gas: Flame,
  solar: Sun,
  wind: Wind,
  storage: Battery,
  hybrid: Cable,
  load: Server,
  other: Layers,
};

const CATEGORY_LABELS: Record<string, string> = {
  generation: "generation",
  load: "load",
  ppa: "ppa",
  aggregate: "aggregate",
  regulatory: "regulatory",
};

type SortKey = "capacityMW" | "projectName" | "iso" | "type" | "expectedOnline";
type SortDir = "asc" | "desc";

// Normalize the API response so the page renders whether the deployed server
// is on the OLD (aggregates/notableProjects) or NEW (headline/projects) shape.
// This protects against deploy lag where the server and client are out of sync.
function normalizeBacklog(raw: any): BacklogResponse | undefined {
  if (!raw) return undefined;
  if (raw.headline && Array.isArray(raw.projects)) {
    return raw as BacklogResponse;
  }
  if (raw.aggregates && Array.isArray(raw.notableProjects)) {
    const a = raw.aggregates;
    const isoTotal = Array.isArray(a.byIso)
      ? a.byIso.find((r: any) => r.iso === "PJM")?.gw ?? 258
      : 258;
    const projects = (raw.notableProjects as any[]).map((p) => ({
      id: p.id,
      projectName: p.projectName,
      sponsor: p.sponsor,
      capacityMW: p.capacityMW,
      type: p.type,
      iso: p.iso,
      state: p.state,
      status: p.status,
      category: p.capacityMW > 50000 ? "aggregate" : (p.type === "load" ? "load" : "generation"),
      expectedOnline: p.expectedOnline ?? null,
      offtaker: p.offtaker ?? null,
      dcRelevant: !!p.dcRelevant,
      sources: p.sources,
      notes: p.notes,
    }));
    const nonAgg = projects.filter((p) => p.category !== "aggregate");
    // The old shape has no source for these headline fields; the literals
    // below are estimates, so flag them for the "est." marker in the UI.
    const estimatedHeadline = [
      "dominionContractedGW",
      "duke5yrGenAddGW",
      "metaHyperionGW",
      "stargateAbileneGW",
      ...(a.historicalWithdrawalPct == null ? ["historicalWithdrawalPct"] : []),
    ];
    return {
      lastRefreshed: raw.source?.asOf ?? "unknown",
      headline: {
        trackedProjects: nonAgg.length,
        trackedCapacityGW: parseFloat((nonAgg.reduce((s, p) => s + p.capacityMW, 0) / 1000).toFixed(1)),
        queueOverallGW: a.totalActiveGW ?? 2290,
        queueOverallProjects: a.totalActiveProjects ?? 10300,
        medianWaitMonths: a.medianQueueMonths ?? 55,
        historicalWithdrawalPct: a.historicalWithdrawalPct ?? 77,
        queueOverallAsOf: raw.source?.asOf ?? "LBNL Queued Up 2025",
        queueOverallSourceUrl: raw.source?.sourceUrl ?? "https://emp.lbl.gov/queues",
        ercotLargeLoadGW: a.ercotDetail?.largeLoadQueueGW ?? 230,
        ercotLargeLoadDataCenterPct: a.ercotDetail?.largeLoadDataCenterPct ?? 72.9,
        ercotLargeLoadAsOf: a.ercotDetail?.asOf ?? "ERCOT late 2025",
        pjmReopenedGW: a.pjmDetail?.totalGW ?? isoTotal,
        pjmReopenedProjects: a.pjmDetail?.totalProjects ?? 811,
        pjmReopenedAsOf: a.pjmDetail?.asOf ?? "PJM Cycle 1, Apr 2026",
        dominionContractedGW: 47.1,
        dominionAsOf: "Q1 2026",
        duke5yrGenAddGW: 13,
        metaHyperionGW: 5,
        stargateAbileneGW: 1.2,
      },
      projects: projects as any,
      estimatedHeadline,
    };
  }
  return undefined;
}

/** Small "est." tag for headline numbers the old-shape fallback filled with hardcoded estimates. */
function Est({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="ml-1 text-8 font-mono uppercase tracking-wide text-estimate align-top">est.</span>;
}

export default function Queue() {
  const { data: rawData, isLoading, isError, refetch, dataUpdatedAt } = useQuery<any>({
    queryKey: ["/api/queue"],
    refetchInterval: 24 * 60 * 60 * 1000,
  });
  const data = normalizeBacklog(rawData);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isoFilter, setIsoFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("non-aggregate");
  const [dcOnly, setDcOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("capacityMW");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    if (!data?.projects) return [];
    let rows = data.projects.filter((p) => {
      if (categoryFilter === "non-aggregate" && p.category === "aggregate") return false;
      if (categoryFilter !== "all" && categoryFilter !== "non-aggregate" && p.category !== categoryFilter) return false;
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (isoFilter !== "all" && p.iso !== isoFilter) return false;
      if (dcOnly && !p.dcRelevant) return false;
      return true;
    });
    rows = rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "capacityMW") cmp = a.capacityMW - b.capacityMW;
      else if (sortKey === "projectName") cmp = a.projectName.localeCompare(b.projectName);
      else if (sortKey === "iso") cmp = a.iso.localeCompare(b.iso);
      else if (sortKey === "type") cmp = a.type.localeCompare(b.type);
      else if (sortKey === "expectedOnline") cmp = (a.expectedOnline ?? "").localeCompare(b.expectedOnline ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, typeFilter, isoFilter, categoryFilter, dcOnly, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const isos = data?.projects ? Array.from(new Set(data.projects.map((p) => p.iso))).sort() : [];
  const types = data?.projects ? Array.from(new Set(data.projects.map((p) => p.type))) : [];
  const h = data?.headline;
  const isEst = (field: string) => !!data?.estimatedHeadline?.includes(field);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Hero — narrative not boxes */}
      <div className="grid-bg border-b border-border px-4 sm:px-6 py-6 sm:py-8" data-testid="backlog-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight mb-2">
              Interconnection Backlog
            </h1>
            {h ? (
              <p className="text-muted-foreground text-sm leading-relaxed">
                The named US power projects and hyperscaler campuses waiting on the grid, plus the ISO totals that contain them.
                The overall US queue holds <span className="text-foreground font-mono">~{h.queueOverallGW.toLocaleString()} GW</span> across{" "}
                <span className="text-foreground font-mono">~{h.queueOverallProjects.toLocaleString()}</span> projects, with a median wait of{" "}
                <span className="text-foreground font-mono">{h.medianWaitMonths} months</span>. ERCOT's large-load queue alone is{" "}
                <span className="text-foreground font-mono">{h.ercotLargeLoadGW} GW</span>, of which{" "}
                <span className="text-foreground font-mono">{h.ercotLargeLoadDataCenterPct}%</span> is datacenters.
                Dominion has <span className="text-foreground font-mono">{h.dominionContractedGW} GW</span><Est on={isEst("dominionContractedGW")} /> already under hyperscaler contract in Virginia alone.
              </p>
            ) : isError ? (
              <p className="text-muted-foreground text-sm">The backlog dataset failed to load.</p>
            ) : (
              <div className="space-y-2 max-w-3xl" aria-hidden="true">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}
          </div>
          {data && (
            <div className="text-11 text-muted-foreground/70 font-mono tracking-wide text-right space-y-0.5" data-testid="backlog-sources">
              <div><AsOf updatedAt={dataUpdatedAt} intervalMs={24 * 60 * 60 * 1000} /></div>
              <FreshnessChip lastRefreshed={data.lastRefreshed} />
              <div className="text-muted-foreground/50">queue totals · {h?.queueOverallAsOf}</div>
              <div className="text-muted-foreground/50">PJM cycle · {h?.pjmReopenedAsOf}</div>
              <div className="text-muted-foreground/50">ERCOT load · {h?.ercotLargeLoadAsOf}</div>
              <a
                href={h?.queueOverallSourceUrl ?? "https://emp.lbl.gov/queues"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:text-brand-2 inline-flex items-center gap-0.5"
                data-testid="link-lbnl"
              >
                LBNL dataset <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6 space-y-3">

        {/* One compact summary strip (replaces 4 stat boxes) */}
        {isLoading && <Skeleton className="h-5 w-full max-w-3xl" aria-hidden="true" />}
        {h && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-1 text-11 font-mono text-muted-foreground" data-testid="summary-strip">
            <span><span className="text-foreground">{h.trackedProjects}</span> named projects tracked</span>
            <span className="text-muted-foreground/30">·</span>
            <span><span className="text-foreground">{h.trackedCapacityGW.toLocaleString()} GW</span> across those projects</span>
            <span className="text-muted-foreground/30">·</span>
            <span><span className="text-foreground">{h.pjmReopenedGW}</span> GW in PJM's reopened queue</span>
            <span className="text-muted-foreground/30">·</span>
            <span><span className="text-foreground">{h.historicalWithdrawalPct}%</span><Est on={isEst("historicalWithdrawalPct")} /> historical withdrawal rate</span>
            <span className="text-muted-foreground/30">·</span>
            <span>Meta Hyperion: <span className="text-foreground">{h.metaHyperionGW} GW</span><Est on={isEst("metaHyperionGW")} /></span>
            <span className="text-muted-foreground/30">·</span>
            <span>Stargate Abilene: <span className="text-foreground">{h.stargateAbileneGW} GW</span><Est on={isEst("stargateAbileneGW")} /></span>
          </div>
        )}

        {/* Filters — compact chip row */}
        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="backlog-filters">
          <ChipSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} options={[
            { value: "non-aggregate", label: "specific only" },
            { value: "all", label: "all" },
            { value: "generation", label: "generation" },
            { value: "load", label: "load" },
            { value: "ppa", label: "ppas" },
            { value: "aggregate", label: "aggregates" },
            { value: "regulatory", label: "regulatory" },
          ]} />
          <ChipSelect label="Type" value={typeFilter} onChange={setTypeFilter} options={[{ value: "all", label: "all" }, ...types.map((t) => ({ value: t, label: t }))]} />
          <ChipSelect label="Region" value={isoFilter} onChange={setIsoFilter} options={[{ value: "all", label: "all" }, ...isos.map((i) => ({ value: i, label: i }))]} />
          <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer px-2 py-1 rounded border border-subtle hover:border-strong" data-testid="filter-dc-only">
            <input type="checkbox" checked={dcOnly} onChange={(e) => setDcOnly(e.target.checked)} className="accent-brand" />
            DC-relevant only
          </label>
          <span className="text-muted-foreground/60 font-mono ml-auto">{filtered.length} of {data?.projects?.length ?? 0}</span>
        </div>

        {/* Projects table — the page is THIS now */}
        <Card className="border-card-border overflow-hidden" data-testid="backlog-table">
          {isError ? (
            <div data-testid="backlog-error">
              <ErrorState label="The backlog dataset failed to load." onRetry={() => refetch()} />
            </div>
          ) : (
          <div className="overflow-x-auto">
          <div className="min-w-[760px]">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-base border-b border-border text-10 font-mono uppercase tracking-wider text-muted-foreground">
            <SortHeader label="Project" sortKey="projectName" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-4" />
            <SortHeader label="Type" sortKey="type" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1" />
            <SortHeader label="MW" sortKey="capacityMW" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 text-right" />
            <SortHeader label="Region" sortKey="iso" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1" />
            <span className="col-span-1">State</span>
            <SortHeader label="Online" sortKey="expectedOnline" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-2" />
            <span className="col-span-1 text-center">Cat</span>
            <span className="col-span-1 text-center">DC</span>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array(12).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground" data-testid="backlog-empty">No projects match the current filters.</div>
          ) : (
            filtered.map((p) => {
              const Icon = TYPE_ICONS[p.type] ?? Zap;
              const statusColor = p.status === "active" ? SEMANTIC.warning : p.status === "operational" ? SEMANTIC.positiveDeep : INK.faint;
              const isAggregate = p.category === "aggregate";
              const hasTooltip = !!p.notes || !!(p.sources && p.sources.length > 0);
              const row = (
                    <div
                      key={p.id}
                      className={`grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs hover:bg-brand/5 ${hasTooltip ? "cursor-help" : ""} ${isAggregate ? "bg-surface-sunken" : ""}`}
                      data-testid={`backlog-row-${p.id}`}
                    >
                      <div className="col-span-4 min-w-0">
                        <div className="font-medium text-foreground truncate flex items-center gap-1.5">
                          {p.projectName}
                          {p.status === "operational" && (
                            <Badge variant="outline" className="text-8 font-mono px-1 py-0 text-positive border-positive/30">live</Badge>
                          )}
                        </div>
                        <div className="text-10 text-muted-foreground truncate">
                          {p.sponsor}{p.offtaker ? ` → ${p.offtaker}` : ""}
                        </div>
                      </div>
                      <span className="col-span-1 inline-flex items-center gap-1 capitalize" style={{ color: TYPE_COLORS[p.type] ?? INK.muted }}>
                        <Icon className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{p.type}</span>
                      </span>
                      <span className="col-span-1 font-mono text-foreground text-right tabular-nums">
                        {p.capacityMW === 0 ? "—" : p.capacityMW >= 10000 ? `${(p.capacityMW / 1000).toFixed(0)}k` : p.capacityMW.toLocaleString()}
                      </span>
                      <span className="col-span-1 font-mono text-foreground truncate">{p.iso}</span>
                      <span className="col-span-1 font-mono text-muted-foreground truncate">{p.state}</span>
                      <span className="col-span-2 font-mono text-muted-foreground text-10 truncate">{p.expectedOnline ?? "—"}</span>
                      <span className="col-span-1 text-center">
                        <Badge variant="outline" className="text-9 font-mono px-1.5 py-0" style={{ color: statusColor, borderColor: `${statusColor}40` }}>
                          {CATEGORY_LABELS[p.category] ?? p.category}
                        </Badge>
                      </span>
                      <span className="col-span-1 text-center font-mono text-10">
                        {p.dcRelevant ? <span className="text-brand">★</span> : <span className="text-muted-foreground/30">—</span>}
                      </span>
                    </div>
              );
              if (!hasTooltip) return row;
              return (
                <UITooltip key={p.id}>
                  <TooltipTrigger asChild>{row}</TooltipTrigger>
                  <TooltipContent side="top" className="max-w-md p-3">
                    {p.notes && <p className="text-xs leading-relaxed mb-1.5">{p.notes}</p>}
                    {p.sources && p.sources.length > 0 && (
                      <p className="text-10 text-muted-foreground">
                        sources: {p.sources.join(" · ")}
                      </p>
                    )}
                  </TooltipContent>
                </UITooltip>
              );
            })
          )}
          </div>
          </div>
          )}
        </Card>

        <p className="text-11 text-muted-foreground/60 leading-relaxed px-1">
          Specific projects are verified against SEC filings, utility press releases, FERC dockets, NRC documents, and trade press.
          Aggregate rows roll up entire ISO cycles or fleet positions; toggle "specific only" to filter them out.
          The full ~{h?.queueOverallProjects?.toLocaleString() ?? "10,300"}-project LBNL dataset is at{" "}
          <a href="https://emp.lbl.gov/queues" target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-2">emp.lbl.gov/queues</a>.
        </p>
      </div>
    </div>
  );
}

function FreshnessChip({ lastRefreshed }: { lastRefreshed: string }) {
  const refreshDate = new Date(lastRefreshed + "T12:00:00");
  const days = Math.max(0, Math.floor((Date.now() - refreshDate.getTime()) / 86400000));
  const label = days === 0 ? "refreshed today" : days === 1 ? "refreshed yesterday" : `refreshed ${days} days ago`;
  const color =
    days <= 14 ? "text-positive border-positive/30" :
    days <= 60 ? "text-warning border-warning/30" :
    "text-negative border-negative/30";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border ${color}`} data-testid="freshness-chip">
      {label}
    </span>
  );
}

function ChipSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-1.5 text-muted-foreground px-2 py-1 rounded border border-subtle hover:border-strong">
      <span className="text-10 uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-foreground text-xs outline-none cursor-pointer"
        data-testid={`filter-${label.toLowerCase()}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface-raised">{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function SortHeader({ label, sortKey, current, dir, onClick, className }: { label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onClick: (k: SortKey) => void; className?: string }) {
  const active = current === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={`flex items-center gap-1 text-left ${active ? "text-foreground" : ""} ${className ?? ""}`}
      data-testid={`sort-${sortKey}`}
    >
      {label}
      <ArrowUpDown className={`h-2.5 w-2.5 ${active ? (dir === "asc" ? "rotate-180" : "") : "opacity-40"}`} />
    </button>
  );
}
