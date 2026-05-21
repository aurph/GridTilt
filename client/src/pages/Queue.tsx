import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Zap, ArrowUpDown, ExternalLink, Sun, Wind, Atom, Flame, Battery, Cable, Server, Layers,
} from "lucide-react";

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
}

const TYPE_COLORS: Record<string, string> = {
  nuclear: "#a855f7",
  gas: "#F07800",
  solar: "#F0A500",
  wind: "#22c55e",
  storage: "#1E90FF",
  hybrid: "#D4A843",
  load: "#ef4444",
  other: "#94a3b8",
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
    };
  }
  return undefined;
}

export default function Queue() {
  const { data: rawData, isLoading, isError } = useQuery<any>({
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
                Dominion has <span className="text-foreground font-mono">{h.dominionContractedGW} GW</span> already under hyperscaler contract in Virginia alone.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">Loading the backlog.</p>
            )}
          </div>
          {data && (
            <div className="text-[11px] text-muted-foreground/70 font-mono tracking-wide text-right space-y-0.5" data-testid="backlog-sources">
              <FreshnessChip lastRefreshed={data.lastRefreshed} />
              <div className="text-muted-foreground/50">queue totals · {h?.queueOverallAsOf}</div>
              <div className="text-muted-foreground/50">PJM cycle · {h?.pjmReopenedAsOf}</div>
              <div className="text-muted-foreground/50">ERCOT load · {h?.ercotLargeLoadAsOf}</div>
              <a
                href={h?.queueOverallSourceUrl ?? "https://emp.lbl.gov/queues"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#F07800] hover:text-[#F0A500] inline-flex items-center gap-0.5"
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
        {h && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 px-1 text-[11px] font-mono text-muted-foreground" data-testid="summary-strip">
            <span><span className="text-foreground">{h.trackedProjects}</span> named projects tracked</span>
            <span className="text-muted-foreground/30">·</span>
            <span><span className="text-foreground">{h.trackedCapacityGW.toLocaleString()} GW</span> across those projects</span>
            <span className="text-muted-foreground/30">·</span>
            <span><span className="text-foreground">{h.pjmReopenedGW}</span> GW in PJM's reopened queue</span>
            <span className="text-muted-foreground/30">·</span>
            <span><span className="text-foreground">{h.historicalWithdrawalPct}%</span> historical withdrawal rate</span>
            <span className="text-muted-foreground/30">·</span>
            <span>Meta Hyperion: <span className="text-foreground">{h.metaHyperionGW} GW</span></span>
            <span className="text-muted-foreground/30">·</span>
            <span>Stargate Abilene: <span className="text-foreground">{h.stargateAbileneGW} GW</span></span>
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
          <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer px-2 py-1 rounded border border-white/[0.06] hover:border-white/[0.12]" data-testid="filter-dc-only">
            <input type="checkbox" checked={dcOnly} onChange={(e) => setDcOnly(e.target.checked)} className="accent-[#F07800]" />
            DC-relevant only
          </label>
          <span className="text-muted-foreground/60 font-mono ml-auto">{filtered.length} of {data?.projects?.length ?? 0}</span>
        </div>

        {/* Projects table — the page is THIS now */}
        <Card className="border-card-border overflow-hidden" data-testid="backlog-table">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-[#0E0E0C] border-b border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
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
          ) : isError ? (
            <div className="p-6 text-center text-xs text-red-400" data-testid="backlog-error">Backlog dataset unavailable.</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground" data-testid="backlog-empty">No projects match the current filters.</div>
          ) : (
            filtered.map((p) => {
              const Icon = TYPE_ICONS[p.type] ?? Zap;
              const statusColor = p.status === "active" ? "#F0A500" : p.status === "operational" ? "#22C55E" : "#6b7280";
              const isAggregate = p.category === "aggregate";
              return (
                <UITooltip key={p.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={`grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs hover:bg-[#F07800]/5 cursor-help ${isAggregate ? "bg-[#0a0a08]" : ""}`}
                      data-testid={`backlog-row-${p.id}`}
                    >
                      <div className="col-span-4 min-w-0">
                        <div className="font-medium text-foreground truncate flex items-center gap-1.5">
                          {p.projectName}
                          {p.status === "operational" && (
                            <Badge variant="outline" className="text-[8px] font-mono px-1 py-0 text-green-400 border-green-400/30">live</Badge>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {p.sponsor}{p.offtaker ? ` → ${p.offtaker}` : ""}
                        </div>
                      </div>
                      <span className="col-span-1 inline-flex items-center gap-1 capitalize" style={{ color: TYPE_COLORS[p.type] ?? "#94a3b8" }}>
                        <Icon className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{p.type}</span>
                      </span>
                      <span className="col-span-1 font-mono text-foreground text-right tabular-nums">
                        {p.capacityMW === 0 ? "—" : p.capacityMW >= 10000 ? `${(p.capacityMW / 1000).toFixed(0)}k` : p.capacityMW.toLocaleString()}
                      </span>
                      <span className="col-span-1 font-mono text-foreground truncate">{p.iso}</span>
                      <span className="col-span-1 font-mono text-muted-foreground truncate">{p.state}</span>
                      <span className="col-span-2 font-mono text-muted-foreground text-[10px] truncate">{p.expectedOnline ?? "—"}</span>
                      <span className="col-span-1 text-center">
                        <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0" style={{ color: statusColor, borderColor: `${statusColor}40` }}>
                          {CATEGORY_LABELS[p.category] ?? p.category}
                        </Badge>
                      </span>
                      <span className="col-span-1 text-center font-mono text-[10px]">
                        {p.dcRelevant ? <span className="text-[#F07800]">★</span> : <span className="text-muted-foreground/30">—</span>}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-md p-3">
                    {p.notes && <p className="text-xs leading-relaxed mb-1.5">{p.notes}</p>}
                    {p.sources && p.sources.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        sources: {p.sources.join(" · ")}
                      </p>
                    )}
                  </TooltipContent>
                </UITooltip>
              );
            })
          )}
        </Card>

        <p className="text-[11px] text-muted-foreground/60 leading-relaxed px-1">
          Specific projects are verified against SEC filings, utility press releases, FERC dockets, NRC documents, and trade press.
          Aggregate rows roll up entire ISO cycles or fleet positions; toggle "specific only" to filter them out.
          The full ~{h?.queueOverallProjects?.toLocaleString() ?? "10,300"}-project LBNL dataset is at{" "}
          <a href="https://emp.lbl.gov/queues" target="_blank" rel="noopener noreferrer" className="text-[#F07800] hover:text-[#F0A500]">emp.lbl.gov/queues</a>.
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
    days <= 14 ? "text-green-400/80 border-green-400/30" :
    days <= 60 ? "text-[#F0A500] border-[#F0A500]/30" :
    "text-red-400 border-red-400/30";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded border ${color}`} data-testid="freshness-chip">
      {label}
    </span>
  );
}

function ChipSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-1.5 text-muted-foreground px-2 py-1 rounded border border-white/[0.06] hover:border-white/[0.12]">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-foreground text-xs outline-none cursor-pointer"
        data-testid={`filter-${label.toLowerCase()}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#1a1917]">{o.label}</option>
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
