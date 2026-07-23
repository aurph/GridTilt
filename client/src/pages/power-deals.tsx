import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "recharts";
import { ArrowUpDown } from "lucide-react";
import { BORDER, BRAND, CATEGORY_COLORS, FONT, INK, SERIES } from "@/lib/tokens";
import { axisProps, gridProps, tooltipContentStyle } from "@/lib/chart-theme";
import { PageShell, Provenance, PullStat, RuleSection } from "@/components/editorial";

interface Bucket { key: string; count: number; mw: number; }
interface DealRow {
  id: string;
  name: string;
  sponsor: string;
  offtaker: string;
  offtakerRaw: string;
  type: string;
  capacityMW: number;
  iso: string | null;
  state: string | null;
  status: string;
  online: string | null;
  sources: string[];
  notes: string | null;
}
interface DealMetrics {
  dealCount: number;
  totalContractedMW: number;
  topBuyer: string | null;
  byOfftaker: Bucket[];
  byType: Bucket[];
  byStatus: Bucket[];
  rows: DealRow[];
  lastRefreshed: string | null;
}

// Energy types from CATEGORY_COLORS; hybrid/geothermal have no token
// category, so they take free SERIES slots (distinct from co-occurring types;
// hybrid matches Queue's slot). Used only for the filter-chip swatches.
const TYPE_COLOR: Record<string, string> = {
  nuclear: CATEGORY_COLORS.nuclear,
  solar: CATEGORY_COLORS.solar,
  wind: CATEGORY_COLORS.wind,
  gas: CATEGORY_COLORS.gas,
  hybrid: SERIES[5], // series slot 6
  hydro: CATEGORY_COLORS.hydro,
  geothermal: SERIES[4], // series slot 5
};
const typeColor = (t: string) => TYPE_COLOR[t] ?? INK.muted;

// Deal status as typography, not a pill (tooltip context uses popover inks).
const STATUS_CLASS: Record<string, string> = {
  operational: "font-semibold text-foreground",
  active: "text-foreground",
  announced: "text-muted-foreground",
};

const gw = (mw: number) => (mw / 1000).toFixed(mw >= 10_000 ? 0 : 1);

type SortKey = "capacityMW" | "name" | "offtaker" | "type" | "online";

// `params` keeps this assignable to wouter's <Route component={...}> while the
// standalone /power-deals route lives on; `embedded` is the Power-tool tab mode.
export default function PowerDeals({ embedded = false }: { embedded?: boolean; params?: unknown }) {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<DealMetrics>({ queryKey: ["/api/deals/metrics"] });
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("capacityMW");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rows = data?.rows ?? [];

  const byBuyer = useMemo(
    () => (data?.byOfftaker ?? []).map((b) => ({ buyer: b.key, gw: +(b.mw / 1000).toFixed(2), count: b.count })),
    [data],
  );

  const visibleRows = useMemo(() => {
    const filtered = typeFilter ? rows.filter((r) => r.type === typeFilter) : rows;
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "capacityMW") cmp = a.capacityMW - b.capacityMW;
      else cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, typeFilter, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "capacityMW" ? "desc" : "asc"); }
  };

  const chipBase = "inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[12px] transition-colors";
  const chipOn = "border-rule-strong bg-brand/10 font-medium text-brand-ink";
  const chipOff = "border-rule text-ink-secondary hover:bg-paper-shade hover:text-ink";

  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink-secondary">
          Corporate power procurement for AI: every named deal where a hyperscaler or AI company has
          contracted generation (a PPA, a reactor restart, an SMR option) to feed its compute.
          Capacity is the contracted figure; hover a row for terms and sources.
        </p>
        <div className="space-y-0.5 text-right text-[12px] text-ink-muted" data-testid="deals-sync">
          <div><AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} /></div>
          {data?.lastRefreshed && <div>Data as of {data.lastRefreshed}</div>}
          {data && <div className="tnum">{data.dealCount} deals · {gw(data.totalContractedMW)} GW contracted</div>}
          {data?.topBuyer && <div>Top buyer: <span className="font-semibold text-ink-secondary">{data.topBuyer}</span></div>}
        </div>
      </div>

      {/* Key figures */}
      <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
        <DealStat label="Tracked deals" value={data ? String(data.dealCount) : "—"} loading={isLoading} />
        <DealStat label="Contracted power" value={data ? `${gw(data.totalContractedMW)} GW` : "—"} loading={isLoading} />
        <DealStat label="Top buyer" value={data?.topBuyer ?? "—"} loading={isLoading} />
        <DealStat label="Energy types" value={data ? String(data.byType.length) : "—"} loading={isLoading} />
      </div>

      <RuleSection
        head="Contracted power by buyer"
        aside={<span>Gigawatts, all tracked deals</span>}
        testId="deals-buyers"
      >
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : isError ? (
          <ErrorState label="The deals dataset failed to load." onRetry={() => refetch()} className="h-[300px]" />
        ) : byBuyer.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-[13px] text-ink-muted">No deals.</div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, byBuyer.length * 32)}>
            <BarChart data={byBuyer} layout="vertical" margin={{ left: 8, right: 56, top: 8, bottom: 4 }}>
              <CartesianGrid {...gridProps} vertical={true} horizontal={false} />
              <XAxis {...axisProps} type="number" tickFormatter={(v) => `${v}`} />
              <YAxis {...axisProps} type="category" dataKey="buyer" width={140} axisLine={false} />
              <RTooltip
                cursor={{ fill: BORDER.subtle }}
                contentStyle={tooltipContentStyle}
                formatter={(v: number, _n, p: any) => [`${v} GW across ${p.payload.count} deal${p.payload.count === 1 ? "" : "s"}`, p.payload.buyer]}
              />
              <Bar dataKey="gw" fill={BRAND.primary} radius={[0, 2, 2, 0]} isAnimationActive={false}
                label={{ position: "right", formatter: (v: number) => `${v}`, fill: INK.secondary, fontSize: 11, fontFamily: FONT.sans }} />
            </BarChart>
          </ResponsiveContainer>
        )}
        {byBuyer.length > 0 && (
          <SrChartTable
            caption="Contracted power by buyer, in gigawatts"
            columns={["Buyer", "GW"]}
            rows={byBuyer.map((b) => [b.buyer, b.gw])}
          />
        )}
        <Provenance source="GridTilt deal registry" updated={data?.lastRefreshed ?? undefined} />
      </RuleSection>

      <RuleSection
        head="Deals"
        aside={<span className="tnum">{visibleRows.length} shown · hover a row for terms and sources</span>}
        testId="deals-table"
      >
        {/* Energy type filter row */}
        {data && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5" data-testid="deals-type-filter">
            <button
              onClick={() => setTypeFilter(null)}
              className={`${chipBase} ${typeFilter === null ? chipOn : chipOff}`}
            >
              All types
            </button>
            {data.byType.map((b) => {
              const on = typeFilter === b.key;
              return (
                <button
                  key={b.key}
                  onClick={() => setTypeFilter(on ? null : b.key)}
                  className={`${chipBase} ${on ? chipOn : chipOff}`}
                >
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: typeColor(b.key) }} />
                  <span className="capitalize">{b.key}</span>
                  <span className="tnum">{gw(b.mw)} GW</span>
                </button>
              );
            })}
          </div>
        )}

        {isError ? (
          <ErrorState label="The deals dataset failed to load." onRetry={() => refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <table className="print-table min-w-[680px]">
              <thead>
                <tr>
                  <th><SortTh label="Buyer" k="offtaker" cur={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                  <th>Project</th>
                  <th><SortTh label="Type" k="type" cur={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                  <th className="num"><SortTh label="Capacity" k="capacityMW" cur={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                  <th className="num"><SortTh label="Online" k="online" cur={sortKey} dir={sortDir} onClick={toggleSort} /></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <div className="space-y-2 p-4">{Array(10).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((r) => (
                    <UITooltip key={r.id}>
                      <TooltipTrigger asChild>
                        <tr className="cursor-help" data-testid={`deal-row-${r.id}`}>
                          <td className="shrink font-semibold text-ink">{r.offtaker}</td>
                          <td className="text-ink-secondary">
                            {r.name} <span className="text-ink-muted">· {r.sponsor}</span>
                          </td>
                          <td className="capitalize text-ink-secondary">{r.type}</td>
                          <td className="num text-ink">{gw(r.capacityMW)} GW</td>
                          <td className="num text-ink-muted">{r.online ?? "—"}</td>
                        </tr>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-md p-3">
                        <div className="mb-1 text-[13px] font-semibold text-foreground">{r.name}</div>
                        <div className="mb-1.5 text-[12px] text-muted-foreground">
                          <span className="capitalize">{r.type}</span> · {gw(r.capacityMW)} GW · {r.sponsor} → {r.offtakerRaw}
                          {r.state ? ` · ${r.state}` : ""}{r.iso ? ` (${r.iso})` : ""} ·{" "}
                          <span className={STATUS_CLASS[r.status] ?? "text-muted-foreground"}>{r.status}</span>
                        </div>
                        {r.notes && <p className="mb-1.5 text-[12px] text-muted-foreground">{r.notes}</p>}
                        {r.sources.length > 0 && (
                          <p className="text-[12px] text-muted-foreground">Sources: {r.sources.join(" · ")}</p>
                        )}
                      </TooltipContent>
                    </UITooltip>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <Provenance
          source="GridTilt deal registry"
          updated={data?.lastRefreshed ?? undefined}
          extra="capacity is the contracted figure as disclosed; staged deals show their full target"
        />
      </RuleSection>

      <p className="mt-4 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-muted">
        Deals are corporate power purchase agreements, reactor restarts, and SMR options with a named
        AI or hyperscaler offtaker, curated by hand in the GridTilt deal registry. Terms and sources
        are on each row.
      </p>
    </>
  );

  // Embedded mode (Power tool, Deals tab): the host page owns the title and
  // tabs; the standalone route wraps the same content in the page shell.
  if (embedded) return <div className="flex flex-col">{body}</div>;
  return (
    <PageShell>
      <div className="pt-7 sm:pt-9">
        <RuleSection head="AI power deals" className="mt-0" testId="deals-header">
          {body}
        </RuleSection>
      </div>
    </PageShell>
  );
}

function DealStat({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  if (loading) {
    return (
      <div>
        <p className="text-[13px] leading-tight text-ink-secondary">{label}</p>
        <Skeleton className="mt-1.5 h-8 w-24" />
      </div>
    );
  }
  return <PullStat label={label} value={value} />;
}

function SortTh({ label, k, cur, dir, onClick }: { label: string; k: SortKey; cur: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void }) {
  const active = cur === k;
  return (
    <button
      onClick={() => onClick(k)}
      className={`inline-flex items-center gap-1 text-[12px] transition-colors hover:text-ink ${active ? "text-ink" : ""}`}
    >
      {label}
      <ArrowUpDown className={`h-3 w-3 ${active ? (dir === "asc" ? "rotate-180" : "") : "opacity-40"}`} />
    </button>
  );
}
