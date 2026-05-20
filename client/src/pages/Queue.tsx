import { useState, useMemo } from "react";
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
  Zap, Filter, ArrowUpDown, Info, ExternalLink, Sun, Wind, Atom, Flame, Battery, Cable,
} from "lucide-react";

interface AggregateRow {
  type?: string;
  iso?: string;
  gw: number | null;
  yoyPct?: number | null;
  asOfNote?: string;
}

interface NotableProject {
  id: string;
  projectName: string;
  sponsor: string;
  capacityMW: number;
  type: "solar" | "gas" | "nuclear" | "wind" | "storage" | "hybrid" | "other";
  iso: string;
  state: string;
  status: "active" | "withdrawn" | "operational";
  expectedOnline: string | null;
  dcRelevant: boolean;
  offtaker?: string | null;
  sources?: string[];
  notes?: string;
}

interface QueueResponse {
  source: {
    title: string;
    publisher: string;
    publishedDate: string;
    asOf: string;
    sourceUrl: string;
    reportUrl?: string;
    notes?: string;
  };
  aggregates: {
    totalActiveGW: number;
    totalActiveProjects: number;
    medianQueueMonths: number;
    historicalWithdrawalPct: number;
    historicalCompletionPct: number;
    byType: AggregateRow[];
    byIso: AggregateRow[];
    pjmDetail?: { totalGW: number; totalProjects: number; byTypeGW: Record<string, number>; asOf: string };
    ercotDetail?: { generationGW: number; generationProjects: number; byTypeGW: Record<string, number>; largeLoadQueueGW: number; largeLoadDataCenterPct: number; largeLoadCryptoPct: number; asOf: string };
  };
  notableProjects: NotableProject[];
}

const TYPE_COLORS: Record<string, string> = {
  solar: "#F0A500",
  gas: "#F07800",
  nuclear: "#a855f7",
  wind: "#22c55e",
  storage: "#1E90FF",
  hybrid: "#D4A843",
  other: "#94a3b8",
};

const TYPE_ICONS: Record<string, any> = {
  solar: Sun,
  gas: Flame,
  nuclear: Atom,
  wind: Wind,
  storage: Battery,
  hybrid: Cable,
  other: Zap,
};

type SortKey = "capacityMW" | "projectName" | "iso" | "type";
type SortDir = "asc" | "desc";

export default function Queue() {
  const { data, isLoading, isError } = useQuery<QueueResponse>({
    queryKey: ["/api/queue"],
    refetchInterval: 24 * 60 * 60 * 1000,
  });

  const [isoFilter, setIsoFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dcOnly, setDcOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("capacityMW");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    if (!data?.notableProjects) return [];
    let rows = data.notableProjects.filter((p) => {
      if (isoFilter !== "all" && p.iso !== isoFilter) return false;
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (dcOnly && !p.dcRelevant) return false;
      return true;
    });
    rows = rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "capacityMW") cmp = a.capacityMW - b.capacityMW;
      else if (sortKey === "projectName") cmp = a.projectName.localeCompare(b.projectName);
      else if (sortKey === "iso") cmp = a.iso.localeCompare(b.iso);
      else if (sortKey === "type") cmp = a.type.localeCompare(b.type);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, isoFilter, typeFilter, dcOnly, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const isos = data?.notableProjects ? Array.from(new Set(data.notableProjects.map((p) => p.iso))).sort() : [];
  const types = data?.notableProjects ? Array.from(new Set(data.notableProjects.map((p) => p.type))) : [];

  const a = data?.aggregates;
  const maxTypeGw = a ? Math.max(...a.byType.map((r) => r.gw ?? 0), 1) : 1;
  const maxIsoGw = a ? Math.max(...a.byIso.map((r) => r.gw ?? 0), 1) : 1;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Hero */}
      <div className="grid-bg border-b border-border px-4 sm:px-6 py-6 sm:py-8" data-testid="queue-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight mb-1.5">
              Interconnection Queue
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
              Every active US interconnection request. ~10,300 projects, ~2,290 GW pending.
              Headline numbers from{" "}
              <a
                href={data?.source?.sourceUrl ?? "https://emp.lbl.gov/queues"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#F07800] hover:text-[#F0A500] inline-flex items-center gap-0.5"
                data-testid="link-lbnl"
              >
                LBNL Queued Up <ExternalLink className="h-3 w-3" />
              </a>
              ; notable projects curated from SEC filings, utility press, and FERC dockets.
            </p>
          </div>
          {data && (
            <div className="text-xs text-muted-foreground font-mono tracking-wide text-right" data-testid="queue-asof">
              <div>dataset: {data.source.asOf}</div>
              <div className="text-muted-foreground/50">published {data.source.publishedDate}</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6 space-y-4 sm:space-y-5">
        {/* Headline stats — all from LBNL aggregates */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : isError || !data ? (
          <Card className="p-4 border-red-500/20 bg-red-500/5">
            <p className="text-xs text-red-400">Queue dataset unavailable.</p>
          </Card>
        ) : a && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="queue-stats">
            <StatTile label="Active capacity" value={`${a.totalActiveGW.toLocaleString()} GW`} sub={`${a.totalActiveProjects.toLocaleString()} projects`} color="#F07800" />
            <StatTile label="Median queue wait" value={`${a.medianQueueMonths} mo`} sub="2024 cohort. was 22 mo in 2008." color="#F0A500" />
            <StatTile label="Historical withdrawal" value={`${a.historicalWithdrawalPct}%`} sub={`only ${a.historicalCompletionPct}% reached COD`} color="#ef4444" />
            <StatTile label="Gas YoY" value="+72%" sub="gas the only category growing in 2024" color="#94a3b8" />
          </div>
        )}

        {/* By Type + By ISO */}
        {a && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 border-card-border" data-testid="chart-by-type">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Capacity by type (GW)</h2>
                <UITooltip>
                  <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent><p className="text-xs">LBNL Queued Up 2025, end of 2024. YoY change shown to the right.</p></TooltipContent>
                </UITooltip>
              </div>
              <div className="space-y-2">
                {a.byType.map((r) => {
                  const Icon = TYPE_ICONS[r.type ?? "other"] ?? Zap;
                  const gw = r.gw ?? 0;
                  return (
                    <div key={r.type} className="flex items-center gap-3" data-testid={`type-bar-${r.type}`}>
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: TYPE_COLORS[r.type ?? "other"] ?? "#94a3b8" }} />
                      <span className="font-mono text-xs text-foreground w-16 flex-shrink-0 capitalize">{r.type}</span>
                      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(gw / maxTypeGw) * 100}%`, backgroundColor: TYPE_COLORS[r.type ?? "other"] ?? "#94a3b8" }} />
                      </div>
                      <span className="font-mono text-xs text-foreground w-16 text-right">{r.gw == null ? "—" : `${r.gw} GW`}</span>
                      <span className={`font-mono text-[10px] w-12 text-right ${r.yoyPct == null ? "text-muted-foreground/40" : r.yoyPct >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {r.yoyPct == null ? "" : `${r.yoyPct >= 0 ? "+" : ""}${r.yoyPct}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-5 border-card-border" data-testid="chart-by-iso">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Capacity by region (GW)</h2>
                <UITooltip>
                  <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent><p className="text-xs max-w-xs">Pulled from LBNL where available; major-ISO figures updated with each operator's most recent monthly report.</p></TooltipContent>
                </UITooltip>
              </div>
              <div className="space-y-2">
                {a.byIso.filter((r) => r.gw != null).sort((x, y) => (y.gw ?? 0) - (x.gw ?? 0)).map((r) => (
                  <div key={r.iso} className="flex items-center gap-3" data-testid={`iso-bar-${r.iso}`}>
                    <span className="font-mono text-xs text-foreground w-28 flex-shrink-0 truncate">{r.iso}</span>
                    <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${((r.gw ?? 0) / maxIsoGw) * 100}%`, backgroundColor: "#F0A500" }} />
                    </div>
                    <span className="font-mono text-xs text-foreground w-16 text-right">{r.gw} GW</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-3">Some regional totals not separately published in LBNL summary; aggregates may include hybrids.</p>
            </Card>
          </div>
        )}

        {/* ERCOT detail callout — the large-load story is the headline */}
        {a?.ercotDetail && (
          <Card className="p-5 border-[#F07800]/20 bg-[#F07800]/5" data-testid="ercot-callout">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-[#F07800] mb-1">ERCOT large-load queue</h2>
                <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                  Texas's large-load (datacenter + crypto + industrial) interconnection requests stand at{" "}
                  <span className="text-foreground font-mono">{a.ercotDetail.largeLoadQueueGW} GW</span>,
                  up ~4x in the past year. Datacenters are{" "}
                  <span className="text-foreground font-mono">{a.ercotDetail.largeLoadDataCenterPct}%</span> of that load.
                  Generation queue separately at <span className="text-foreground font-mono">{a.ercotDetail.generationGW} GW</span> across{" "}
                  {a.ercotDetail.generationProjects.toLocaleString()} active requests.
                </p>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground/60">{a.ercotDetail.asOf}</span>
            </div>
          </Card>
        )}

        {/* PJM detail callout — the gas pivot is the second headline */}
        {a?.pjmDetail && (
          <Card className="p-5 border-card-border" data-testid="pjm-callout">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">PJM reopened queue</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  After PJM's first-ready-first-served reform: {a.pjmDetail.totalProjects.toLocaleString()} projects, {a.pjmDetail.totalGW} GW. Gas leads.
                </p>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground/60">{a.pjmDetail.asOf}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-3">
              {Object.entries(a.pjmDetail.byTypeGW).map(([type, gw]) => (
                <div key={type} className="text-center" data-testid={`pjm-type-${type}`}>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{type.replace(/_/g, " ")}</div>
                  <div className="text-lg font-bold font-mono text-foreground">{gw} GW</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Notable projects header + filters */}
        <Card className="p-4 border-card-border" data-testid="queue-filters">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-[#F0A500]" />
              <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Notable named projects</h2>
              <UITooltip>
                <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                <TooltipContent><p className="text-xs max-w-xs">Curated set of publicly disclosed projects (SEC filings, utility press, FERC dockets). Not the full {data?.aggregates?.totalActiveProjects?.toLocaleString() ?? "10,300"}-project queue.</p></TooltipContent>
              </UITooltip>
            </div>
            <span className="text-muted-foreground/60 font-mono text-[11px]">{filtered.length} / {data?.notableProjects?.length ?? 0}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <SelectControl label="ISO" value={isoFilter} onChange={setIsoFilter} options={[{ value: "all", label: "All ISOs" }, ...isos.map((i) => ({ value: i, label: i }))]} />
            <SelectControl label="Type" value={typeFilter} onChange={setTypeFilter} options={[{ value: "all", label: "All types" }, ...types.map((t) => ({ value: t, label: t }))]} />
            <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer" data-testid="filter-dc-only">
              <input type="checkbox" checked={dcOnly} onChange={(e) => setDcOnly(e.target.checked)} className="accent-[#F07800]" />
              DC-relevant only
            </label>
          </div>
        </Card>

        {/* Notable projects table */}
        <Card className="border-card-border overflow-hidden" data-testid="queue-table">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-[#0E0E0C] border-b border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <SortHeader label="Project" sortKey="projectName" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-4" />
            <SortHeader label="ISO" sortKey="iso" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1" />
            <span className="col-span-1">State</span>
            <SortHeader label="Type" sortKey="type" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1" />
            <SortHeader label="MW" sortKey="capacityMW" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 text-right" />
            <span className="col-span-2">Online</span>
            <span className="col-span-1 text-center">Status</span>
            <span className="col-span-1 text-center">DC</span>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array(8).fill(null).map((_, i) => <Skeleton key={i} className="h-6" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground" data-testid="queue-empty">No projects match the current filters.</div>
          ) : (
            filtered.map((p) => {
              const Icon = TYPE_ICONS[p.type] ?? Zap;
              const statusColor = p.status === "active" ? "#F0A500" : p.status === "operational" ? "#22C55E" : "#6b7280";
              return (
                <UITooltip key={p.id}>
                  <TooltipTrigger asChild>
                    <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-border/30 last:border-0 text-xs hover:bg-[#F07800]/5 cursor-help" data-testid={`queue-row-${p.id}`}>
                      <div className="col-span-4 min-w-0">
                        <div className="font-medium text-foreground truncate">{p.projectName}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{p.sponsor}{p.offtaker ? ` → ${p.offtaker}` : ""}</div>
                      </div>
                      <span className="col-span-1 font-mono text-foreground">{p.iso}</span>
                      <span className="col-span-1 font-mono text-foreground">{p.state}</span>
                      <span className="col-span-1 inline-flex items-center gap-1 capitalize" style={{ color: TYPE_COLORS[p.type] ?? "#94a3b8" }}>
                        <Icon className="h-3 w-3" />
                        {p.type}
                      </span>
                      <span className="col-span-1 font-mono text-foreground text-right tabular-nums">{p.capacityMW.toLocaleString()}</span>
                      <span className="col-span-2 font-mono text-muted-foreground text-[10px] truncate">{p.expectedOnline ?? "—"}</span>
                      <span className="col-span-1 text-center">
                        <Badge variant="outline" className="text-[9px] font-mono px-1.5 py-0" style={{ color: statusColor, borderColor: `${statusColor}40` }}>
                          {p.status}
                        </Badge>
                      </span>
                      <span className="col-span-1 text-center font-mono text-[10px]">
                        {p.dcRelevant ? <span className="text-[#F07800]">★</span> : <span className="text-muted-foreground/30">—</span>}
                      </span>
                    </div>
                  </TooltipTrigger>
                  {(p.notes || p.sources) && (
                    <TooltipContent side="top" className="max-w-md p-3">
                      {p.notes && <p className="text-xs leading-relaxed">{p.notes}</p>}
                      {p.sources && p.sources.length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-1.5">
                          sources: {p.sources.join(", ")}
                        </p>
                      )}
                    </TooltipContent>
                  )}
                </UITooltip>
              );
            })
          )}
        </Card>

        {data?.source?.notes && (
          <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
            {data.source.notes}
          </p>
        )}
      </div>
    </div>
  );
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <Card className="p-4 border-card-border">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>
    </Card>
  );
}

function SelectControl({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-1.5 text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#0E0E0C] border border-white/[0.08] rounded px-2 py-1 text-foreground capitalize"
        data-testid={`filter-${label.toLowerCase()}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
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
