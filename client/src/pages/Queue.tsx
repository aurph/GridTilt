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
  Zap, Cable, Filter, ArrowUpDown, Info, ExternalLink, Sun, Wind, Atom, Flame, Battery,
} from "lucide-react";

interface QueueProject {
  id: string;
  projectName: string;
  sponsor: string;
  capacityMW: number;
  type: "solar" | "gas" | "nuclear" | "wind" | "storage" | "hybrid" | "other";
  iso: string;
  state: string;
  status: "active" | "withdrawn" | "operational";
  queueDate: string;
  expectedOnline: string | null;
  dcRelevant: boolean;
  notes?: string;
}

interface QueueSummary {
  totalProjects: number;
  activeProjects: number;
  withdrawnProjects: number;
  operationalProjects: number;
  activePendingGW: number;
  dcRelevantProjects: number;
  dcRelevantPendingGW: number;
  withdrawalRatePct: number;
  byIso: Record<string, { count: number; mw: number }>;
  byType: Record<string, { count: number; mw: number }>;
  byState: Record<string, { count: number; mw: number }>;
}

interface QueueResponse {
  source: string;
  sourceUrl: string;
  lastUpdated: string;
  summary: QueueSummary;
  projects: QueueProject[];
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

type SortKey = "capacityMW" | "queueDate" | "projectName" | "iso";
type SortDir = "asc" | "desc";

export default function Queue() {
  const { data, isLoading, isError } = useQuery<QueueResponse>({
    queryKey: ["/api/queue"],
    refetchInterval: 24 * 60 * 60 * 1000,
  });

  const [isoFilter, setIsoFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [dcOnly, setDcOnly] = useState(false);
  const [minMW, setMinMW] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("capacityMW");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const filtered = useMemo(() => {
    if (!data?.projects) return [];
    let rows = data.projects.filter((p) => {
      if (isoFilter !== "all" && p.iso !== isoFilter) return false;
      if (typeFilter !== "all" && p.type !== typeFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (dcOnly && !p.dcRelevant) return false;
      if (p.capacityMW < minMW) return false;
      return true;
    });
    rows = rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "capacityMW") cmp = a.capacityMW - b.capacityMW;
      else if (sortKey === "queueDate") cmp = a.queueDate.localeCompare(b.queueDate);
      else if (sortKey === "projectName") cmp = a.projectName.localeCompare(b.projectName);
      else if (sortKey === "iso") cmp = a.iso.localeCompare(b.iso);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, isoFilter, typeFilter, statusFilter, dcOnly, minMW, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const isos = data?.summary?.byIso ? Object.keys(data.summary.byIso).sort() : [];
  const types = data?.summary?.byType ? Object.keys(data.summary.byType) : [];

  const maxIsoMw = data ? Math.max(...Object.values(data.summary.byIso).map((v) => v.mw), 1) : 1;
  const maxTypeMw = data ? Math.max(...Object.values(data.summary.byType).map((v) => v.mw), 1) : 1;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Hero */}
      <div className="grid-bg border-b border-border px-4 sm:px-6 py-6 sm:py-8" data-testid="queue-hero">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight mb-1.5">
              Interconnection Queue
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">
              Every power project waiting to plug into the US grid.
              The binding constraint on AI datacenter buildout.
              <span className="text-muted-foreground/60"> Sourced from </span>
              <a
                href={data?.sourceUrl ?? "https://emp.lbl.gov/queues"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#F07800] hover:text-[#F0A500] inline-flex items-center gap-0.5"
                data-testid="link-lbnl"
              >
                LBNL Queued Up <ExternalLink className="h-3 w-3" />
              </a>
              <span className="text-muted-foreground/60">.</span>
            </p>
          </div>
          {data && (
            <div className="text-xs text-muted-foreground font-mono tracking-wide" data-testid="queue-last-updated">
              dataset: {data.lastUpdated}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6 space-y-4 sm:space-y-5">

        {/* Headline stats */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : isError || !data ? (
          <Card className="p-4 border-red-500/20 bg-red-500/5">
            <p className="text-xs text-red-400">Queue dataset unavailable.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="queue-stats">
            <StatTile label="Active pending" value={`${data.summary.activePendingGW} GW`} sub={`${data.summary.activeProjects} projects`} color="#F07800" />
            <StatTile label="DC-relevant" value={`${data.summary.dcRelevantPendingGW} GW`} sub={`${data.summary.dcRelevantProjects} projects flagged`} color="#F0A500" />
            <StatTile label="Withdrawal rate" value={`${data.summary.withdrawalRatePct}%`} sub={`${data.summary.withdrawnProjects} of ${data.summary.totalProjects}`} color="#94a3b8" />
            <StatTile label="ISOs covered" value={`${Object.keys(data.summary.byIso).length}`} sub="balancing areas" color="#94a3b8" />
          </div>
        )}

        {/* By ISO + By Type bar charts */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 border-card-border" data-testid="chart-by-iso">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Pending GW by ISO</h2>
                <UITooltip>
                  <TooltipTrigger><Info className="h-3.5 w-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent><p className="text-xs">Sum of nameplate capacity for active queue requests in each balancing area.</p></TooltipContent>
                </UITooltip>
              </div>
              <div className="space-y-2">
                {Object.entries(data.summary.byIso).sort((a, b) => b[1].mw - a[1].mw).map(([iso, v]) => (
                  <div key={iso} className="flex items-center gap-3" data-testid={`iso-bar-${iso}`}>
                    <span className="font-mono text-xs text-foreground w-16 flex-shrink-0">{iso}</span>
                    <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(v.mw / maxIsoMw) * 100}%`, backgroundColor: "#F0A500" }} />
                    </div>
                    <span className="font-mono text-xs text-foreground w-20 text-right">{(v.mw / 1000).toFixed(1)} GW</span>
                    <span className="font-mono text-[10px] text-muted-foreground w-10 text-right">{v.count}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5 border-card-border" data-testid="chart-by-type">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Pending GW by Type</h2>
              </div>
              <div className="space-y-2">
                {Object.entries(data.summary.byType).sort((a, b) => b[1].mw - a[1].mw).map(([type, v]) => {
                  const Icon = TYPE_ICONS[type] ?? Zap;
                  return (
                    <div key={type} className="flex items-center gap-3" data-testid={`type-bar-${type}`}>
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color: TYPE_COLORS[type] ?? "#94a3b8" }} />
                      <span className="font-mono text-xs text-foreground w-16 flex-shrink-0">{type}</span>
                      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(v.mw / maxTypeMw) * 100}%`, backgroundColor: TYPE_COLORS[type] ?? "#94a3b8" }} />
                      </div>
                      <span className="font-mono text-xs text-foreground w-20 text-right">{(v.mw / 1000).toFixed(1)} GW</span>
                      <span className="font-mono text-[10px] text-muted-foreground w-10 text-right">{v.count}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="p-4 border-card-border" data-testid="queue-filters">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-3.5 w-3.5 text-[#F0A500]" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Filters</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <SelectControl label="ISO" value={isoFilter} onChange={setIsoFilter} options={[{ value: "all", label: "All ISOs" }, ...isos.map((i) => ({ value: i, label: i }))]} />
            <SelectControl label="Type" value={typeFilter} onChange={setTypeFilter} options={[{ value: "all", label: "All types" }, ...types.map((t) => ({ value: t, label: t }))]} />
            <SelectControl label="Status" value={statusFilter} onChange={setStatusFilter} options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "withdrawn", label: "Withdrawn" },
              { value: "operational", label: "Operational" },
            ]} />
            <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer" data-testid="filter-dc-only">
              <input
                type="checkbox"
                checked={dcOnly}
                onChange={(e) => setDcOnly(e.target.checked)}
                className="accent-[#F07800]"
              />
              DC-relevant only
            </label>
            <label className="flex items-center gap-1.5 text-muted-foreground">
              Min MW
              <input
                type="number"
                value={minMW}
                onChange={(e) => setMinMW(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 bg-[#0E0E0C] border border-white/[0.08] rounded px-2 py-1 text-foreground font-mono"
                data-testid="filter-min-mw"
                min={0}
                step={50}
              />
            </label>
            <span className="text-muted-foreground/60 ml-auto font-mono">{filtered.length} / {data?.projects?.length ?? 0}</span>
          </div>
        </Card>

        {/* Projects table */}
        <Card className="border-card-border overflow-hidden" data-testid="queue-table">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-[#0E0E0C] border-b border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <SortHeader label="Project" sortKey="projectName" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-4" />
            <SortHeader label="ISO" sortKey="iso" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1" />
            <span className="col-span-1">State</span>
            <span className="col-span-1">Type</span>
            <SortHeader label="MW" sortKey="capacityMW" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-1 text-right" />
            <SortHeader label="Queued" sortKey="queueDate" current={sortKey} dir={sortDir} onClick={toggleSort} className="col-span-2" />
            <span className="col-span-1 text-center">Status</span>
            <span className="col-span-1 text-center">DC</span>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array(8).fill(null).map((_, i) => <Skeleton key={i} className="h-6" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground" data-testid="queue-empty">
              No projects match the current filters.
            </div>
          ) : (
            filtered.map((p) => {
              const Icon = TYPE_ICONS[p.type] ?? Zap;
              const statusColor = p.status === "active" ? "#F0A500" : p.status === "operational" ? "#22C55E" : "#6b7280";
              return (
                <UITooltip key={p.id}>
                  <TooltipTrigger asChild>
                    <div
                      className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-border/30 last:border-0 text-xs hover:bg-[#F07800]/5 cursor-help"
                      data-testid={`queue-row-${p.id}`}
                    >
                      <div className="col-span-4 min-w-0">
                        <div className="font-medium text-foreground truncate">{p.projectName}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{p.sponsor}</div>
                      </div>
                      <span className="col-span-1 font-mono text-foreground">{p.iso}</span>
                      <span className="col-span-1 font-mono text-foreground">{p.state}</span>
                      <span className="col-span-1 inline-flex items-center gap-1 capitalize" style={{ color: TYPE_COLORS[p.type] ?? "#94a3b8" }}>
                        <Icon className="h-3 w-3" />
                        {p.type}
                      </span>
                      <span className="col-span-1 font-mono text-foreground text-right tabular-nums">{p.capacityMW.toLocaleString()}</span>
                      <span className="col-span-2 font-mono text-muted-foreground">{p.queueDate}</span>
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
                  {(p.notes || p.expectedOnline) && (
                    <TooltipContent side="top" className="max-w-md p-3">
                      {p.expectedOnline && (
                        <p className="text-[10px] text-muted-foreground mb-1">Expected online: <span className="text-foreground font-mono">{p.expectedOnline}</span></p>
                      )}
                      {p.notes && <p className="text-xs leading-relaxed">{p.notes}</p>}
                    </TooltipContent>
                  )}
                </UITooltip>
              );
            })
          )}
        </Card>

        <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
          Queue data is a curated sample of the LBNL Queued Up dataset focused on AI-power-relevant projects.
          For the full ~12,000-request dataset across all balancing areas, see <a href="https://emp.lbl.gov/queues" target="_blank" rel="noopener noreferrer" className="text-[#F07800] hover:text-[#F0A500]">emp.lbl.gov/queues</a>.
          The withdrawal rate historically runs around 70-80% across all ISOs.
        </p>
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
