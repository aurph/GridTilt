import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState } from "@/components/Freshness";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUpDown } from "lucide-react";
import { EstFlag, PageShell, Provenance, RuleSection } from "@/components/editorial";

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
   * the dagger flag so they are distinguishable from sourced numbers.
   */
  estimatedHeadline?: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  generation: "Generation",
  load: "Load",
  ppa: "PPA",
  aggregate: "Aggregate",
  regulatory: "Regulatory",
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
    // below are estimates, so flag them for the dagger marker in the UI.
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

/**
 * Footnote dagger for headline numbers the old-shape fallback filled with
 * hardcoded estimates; the "† estimated" footnote sits in the provenance line.
 */
function Est({ on }: { on: boolean }) {
  if (!on) return null;
  return <EstFlag title="Estimated value, not from the sourced dataset" />;
}

// `params` keeps this assignable to wouter's <Route component={...}> while the
// standalone /queue route lives on; `embedded` is the Power-tool tab mode.
export default function Queue({ embedded = false }: { embedded?: boolean; params?: unknown }) {
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
  const anyEst =
    isEst("historicalWithdrawalPct") || isEst("metaHyperionGW") || isEst("stargateAbileneGW");

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink-secondary">
          The named US power projects and hyperscaler campuses waiting on the grid, plus the ISO
          totals that contain them.
          {h && (
            <>
              {" "}The overall US queue holds about {h.queueOverallGW.toLocaleString()} GW across{" "}
              {h.queueOverallProjects.toLocaleString()} projects, with a median wait of{" "}
              {h.medianWaitMonths} months.
            </>
          )}
        </p>
        <div className="space-y-0.5 text-right text-[12px] text-ink-muted" data-testid="backlog-sources">
          <div><AsOf updatedAt={dataUpdatedAt} intervalMs={24 * 60 * 60 * 1000} /></div>
          {data && <div><FreshnessChip lastRefreshed={data.lastRefreshed} /></div>}
        </div>
      </div>

      {/* One compact summary strip (replaces 4 stat boxes) */}
      {isLoading && <Skeleton className="mt-4 h-5 w-full max-w-3xl" aria-hidden="true" />}
      {h && (
        <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-[12.5px] text-ink-secondary" data-testid="summary-strip">
          <span><span className="font-semibold text-ink tnum">{h.trackedProjects}</span> named projects tracked</span>
          <span><span className="font-semibold text-ink tnum">{h.trackedCapacityGW.toLocaleString()} GW</span> across those projects</span>
          <span><span className="font-semibold text-ink tnum">{h.pjmReopenedGW} GW</span> in PJM's reopened queue</span>
          <span><span className="font-semibold text-ink tnum">{h.historicalWithdrawalPct}%</span><Est on={isEst("historicalWithdrawalPct")} /> historical withdrawal rate</span>
          <span>Meta Hyperion <span className="font-semibold text-ink tnum">{h.metaHyperionGW} GW</span><Est on={isEst("metaHyperionGW")} /></span>
          <span>Stargate Abilene <span className="font-semibold text-ink tnum">{h.stargateAbileneGW} GW</span><Est on={isEst("stargateAbileneGW")} /></span>
        </div>
      )}

      <RuleSection
        head="Projects in the queue"
        aside={<span className="tnum">{filtered.length} of {data?.projects?.length ?? 0} shown</span>}
        testId="backlog-table"
      >
        {/* Filters - compact row */}
        <div className="mb-3 flex flex-wrap items-center gap-2" data-testid="backlog-filters">
          <ChipSelect label="Category" value={categoryFilter} onChange={setCategoryFilter} options={[
            { value: "non-aggregate", label: "Specific only" },
            { value: "all", label: "All" },
            { value: "generation", label: "Generation" },
            { value: "load", label: "Load" },
            { value: "ppa", label: "PPAs" },
            { value: "aggregate", label: "Aggregates" },
            { value: "regulatory", label: "Regulatory" },
          ]} />
          <ChipSelect label="Type" value={typeFilter} onChange={setTypeFilter} options={[{ value: "all", label: "All" }, ...types.map((t) => ({ value: t, label: cap(t) }))]} />
          <ChipSelect label="Region" value={isoFilter} onChange={setIsoFilter} options={[{ value: "all", label: "All" }, ...isos.map((i) => ({ value: i, label: i }))]} />
          <label className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-rule px-2 py-1 text-[12px] text-ink-secondary hover:border-rule-strong" data-testid="filter-dc-only">
            <input type="checkbox" checked={dcOnly} onChange={(e) => setDcOnly(e.target.checked)} className="accent-brand" />
            DC-relevant only
          </label>
        </div>

        {isError ? (
          <div data-testid="backlog-error">
            <ErrorState label="The backlog dataset failed to load." onRetry={() => refetch()} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="print-table min-w-[760px]">
              <thead>
                <tr>
                  <th><SortHeader label="Project" sortKey="projectName" current={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                  <th><SortHeader label="Type" sortKey="type" current={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                  <th className="num"><SortHeader label="MW" sortKey="capacityMW" current={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                  <th><SortHeader label="Region" sortKey="iso" current={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                  <th>State</th>
                  <th><SortHeader label="Online" sortKey="expectedOnline" current={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                  <th>Category</th>
                  <th className="text-center">DC</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="p-0">
                      <div className="space-y-2 p-4">
                        {Array(12).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-[13px] text-ink-muted" data-testid="backlog-empty">
                      No projects match the current filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => {
                    const isAggregate = p.category === "aggregate";
                    const hasTooltip = !!p.notes || !!(p.sources && p.sources.length > 0);
                    const row = (
                      <tr
                        key={p.id}
                        className={`${hasTooltip ? "cursor-help" : ""} ${isAggregate ? "bg-paper-shade" : ""}`}
                        data-testid={`backlog-row-${p.id}`}
                      >
                        <td>
                          <span className="flex items-baseline gap-1.5 font-medium text-ink">
                            {p.projectName}
                            {p.status === "operational" && (
                              <span className="text-[12px] font-semibold text-positive">live</span>
                            )}
                          </span>
                          <span className="block text-[12px] text-ink-muted">
                            {p.sponsor}{p.offtaker ? ` → ${p.offtaker}` : ""}
                          </span>
                        </td>
                        <td className="capitalize text-ink-secondary">{p.type}</td>
                        <td className="num text-ink">
                          {p.capacityMW === 0 ? "—" : p.capacityMW >= 10000 ? `${(p.capacityMW / 1000).toFixed(0)}k` : p.capacityMW.toLocaleString()}
                        </td>
                        <td className="text-ink-secondary">{p.iso}</td>
                        <td className="text-ink-muted">{p.state}</td>
                        <td className="text-ink-muted tnum">{p.expectedOnline ?? "—"}</td>
                        <td className="text-ink-muted">{CATEGORY_LABELS[p.category] ?? p.category}</td>
                        <td className="text-center">
                          {p.dcRelevant
                            ? <span className="text-brand-ink" title="Data-center relevant">★</span>
                            : <span className="text-ink-faint">—</span>}
                        </td>
                      </tr>
                    );
                    if (!hasTooltip) return row;
                    return (
                      <UITooltip key={p.id}>
                        <TooltipTrigger asChild>{row}</TooltipTrigger>
                        <TooltipContent side="top" className="max-w-md p-3">
                          {p.notes && <p className="mb-1.5 text-[12.5px] leading-relaxed">{p.notes}</p>}
                          {p.sources && p.sources.length > 0 && (
                            <p className="text-[12px] text-muted-foreground">
                              Sources: {p.sources.join(" · ")}
                            </p>
                          )}
                        </TooltipContent>
                      </UITooltip>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        <Provenance
          source="LBNL Queued Up + GridTilt curation"
          updated={data?.lastRefreshed}
          extra={
            <>
              queue totals {h?.queueOverallAsOf ?? "LBNL Queued Up 2025"} · PJM cycle{" "}
              {h?.pjmReopenedAsOf ?? "Apr 2026"} · ERCOT load {h?.ercotLargeLoadAsOf ?? "late 2025"} ·{" "}
              <a
                href={h?.queueOverallSourceUrl ?? "https://emp.lbl.gov/queues"}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-rule-strong underline-offset-2 hover:text-brand-ink"
                data-testid="link-lbnl"
              >
                full LBNL dataset
              </a>
              {anyEst && <> · † estimated</>}
            </>
          }
        />
      </RuleSection>

      <p className="mt-4 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-muted">
        Specific projects are verified against SEC filings, utility press releases, FERC dockets,
        NRC documents, and trade press. Aggregate rows roll up entire ISO cycles or fleet positions;
        the "Specific only" category filter hides them. The full{" "}
        {h?.queueOverallProjects?.toLocaleString() ?? "10,300"}-project LBNL dataset is at{" "}
        <a
          href="https://emp.lbl.gov/queues"
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-rule-strong underline-offset-2 hover:text-brand-ink"
        >
          emp.lbl.gov/queues
        </a>.
      </p>
    </>
  );

  // Embedded mode (Power tool, Queue tab): the host page owns the title and
  // tabs; the standalone route wraps the same content in the page shell.
  if (embedded) return <div className="flex flex-col">{body}</div>;
  return (
    <PageShell>
      <div className="pt-7 sm:pt-9">
        <RuleSection head="Interconnection backlog" className="mt-0" testId="backlog-hero">
          {body}
        </RuleSection>
      </div>
    </PageShell>
  );
}

function FreshnessChip({ lastRefreshed }: { lastRefreshed: string }) {
  const refreshDate = new Date(lastRefreshed + "T12:00:00");
  const days = Math.max(0, Math.floor((Date.now() - refreshDate.getTime()) / 86400000));
  const label = days === 0 ? "refreshed today" : days === 1 ? "refreshed yesterday" : `refreshed ${days} days ago`;
  const color =
    days <= 14 ? "text-positive" :
    days <= 60 ? "text-warning" :
    "text-negative";
  return (
    <span className={`font-medium ${color}`} data-testid="freshness-chip">
      {label}
    </span>
  );
}

function ChipSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-1.5 rounded-sm border border-rule px-2 py-1 text-[12px] text-ink-secondary hover:border-rule-strong">
      <span className="text-ink-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="cursor-pointer bg-transparent text-[12.5px] text-ink outline-none"
        data-testid={`filter-${label.toLowerCase()}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-surface-overlay">{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function SortHeader({ label, sortKey, current, dir, onClick }: { label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onClick: (k: SortKey) => void }) {
  const active = current === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={`inline-flex items-center gap-1 text-[12px] transition-colors hover:text-ink ${active ? "text-ink" : ""}`}
      data-testid={`sort-${sortKey}`}
    >
      {label}
      <ArrowUpDown className={`h-2.5 w-2.5 ${active ? (dir === "asc" ? "rotate-180" : "") : "opacity-40"}`} />
    </button>
  );
}
