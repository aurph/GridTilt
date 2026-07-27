/**
 * My Grid: pick a state, see your grid operator and its headroom, what is
 * being built near you, and what residential electricity costs there.
 * State choice persists locally; no account, nothing leaves the browser.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, SrChartTable } from "@/components/Freshness";
import { PageShell, PageTitle, Provenance, PullStat, RuleSection } from "@/components/editorial";
import { RTO_CONFIG, RTO_SOURCE_NOTE } from "@/data/rto-config";
import { STATE_GRID, STATE_GRID_SOURCE } from "@/data/state-grid";
import { HIGHLIGHT, axisProps, gridProps, tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from "@/lib/chart-theme";

const STORAGE_KEY = "gt-my-grid-state";

interface Facility {
  id: number;
  name: string;
  company: string;
  city: string;
  state: string;
  powerMW: number | null;
  status: string;
}

interface RatePoint {
  month: string;
  centsPerKwh: number;
}

type RetailRates =
  | { configured: false; howTo: string }
  | { configured: true; unit: string; source: string; sourceUrl: string; byState: Record<string, RatePoint[]> };

const SIGNAL_CLASS: Record<string, string> = {
  Critical: "text-negative",
  Elevated: "text-warning",
  Moderate: "text-ink-secondary",
  Low: "text-positive",
};

const STATUS_LABEL: Record<string, string> = {
  operational: "Operational",
  construction: "Under construction",
  announced: "Announced",
};

function fmtMonth(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export default function MyGrid() {
  const [state, setState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved && STATE_GRID[saved] ? saved : "";
    } catch {
      return "";
    }
  });

  function chooseState(code: string) {
    setState(code);
    try {
      if (code) localStorage.setItem(STORAGE_KEY, code);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage blocked; selection still works for the session */
    }
  }

  const {
    data: facilities,
    isLoading: facilitiesLoading,
    isError: facilitiesError,
    refetch: refetchFacilities,
  } = useQuery<Facility[]>({
    queryKey: ["/api/datacenters"],
    refetchInterval: 900000,
  });

  const {
    data: rates,
    isError: ratesError,
    refetch: refetchRates,
  } = useQuery<RetailRates>({
    queryKey: ["/api/physical/retail-rates"],
    // 503 = honestly unconfigured, still a payload we render; only network
    // failures should register as errors.
    queryFn: async () => {
      const res = await fetch("/api/physical/retail-rates");
      if (!res.ok && res.status !== 503) throw new Error(`retail-rates ${res.status}`);
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
  });

  const grid = state ? STATE_GRID[state] : null;
  const rto = grid?.region ? RTO_CONFIG[grid.region] : null;

  const localFacilities = useMemo(() => {
    if (!facilities || !state) return [];
    return facilities
      .filter((f) => f.state === state)
      .sort((a, b) => (b.powerMW ?? 0) - (a.powerMW ?? 0));
  }, [facilities, state]);

  const series = useMemo(() => {
    if (!rates || !("byState" in rates) || !state) return [];
    return (rates.byState[state] ?? []).slice(-24);
  }, [rates, state]);

  const latest = series.length ? series[series.length - 1] : null;
  const yearAgo = series.length >= 13 ? series[series.length - 13] : null;
  const yoy = latest && yearAgo ? ((latest.centsPerKwh - yearAgo.centsPerKwh) / yearAgo.centsPerKwh) * 100 : null;

  const stateOptions = Object.entries(STATE_GRID).sort((a, b) => a[1].name.localeCompare(b[1].name));

  return (
    <PageShell>
      <PageTitle
        title="My Grid"
        right={
          <label className="flex items-baseline gap-2 text-[13px] text-ink-secondary">
            State
            <select
              value={state}
              onChange={(e) => chooseState(e.target.value)}
              className="rounded-sm border border-rule bg-card px-2 py-1.5 text-[13.5px] text-ink"
              data-testid="my-grid-state"
            >
              <option value="">Choose…</option>
              {stateOptions.map(([code, s]) => (
                <option key={code} value={code}>{s.name}</option>
              ))}
            </select>
          </label>
        }
        testId="my-grid-header"
      />

      {!grid ? (
        <div className="max-w-[60ch] py-8" data-testid="my-grid-empty">
          <p className="text-[15px] leading-relaxed text-ink-secondary">
            Pick a state to see its grid operator, the capacity being built there, and what
            residential electricity costs. The choice stays in your browser.
          </p>
        </div>
      ) : (
        <>
          <RuleSection head="Your grid" className="mt-2" testId="my-grid-operator">
            <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-3">
              <div className="md:col-span-1">
                <p className="text-[13px] leading-tight text-ink-secondary">Grid operator</p>
                <p className="mt-1 font-serif text-[26px] leading-tight text-ink">{grid.operatorLabel}</p>
                {grid.note && <p className="mt-2 text-[12.5px] leading-snug text-ink-muted">{grid.note}</p>}
              </div>
              {rto ? (
                <>
                  <PullStat
                    label="Projected reserve margin"
                    value={`${rto.reserveMargin.toFixed(1)}%`}
                    delta={<span className={`text-[13px] font-semibold ${SIGNAL_CLASS[rto.aiSignal] ?? "text-ink-muted"}`}>{rto.aiSignal}</span>}
                    note="Headroom between expected peak demand and supply"
                    testId="my-grid-margin"
                  />
                  <div>
                    <p className="text-[13px] leading-tight text-ink-secondary">What that signal means</p>
                    <p className="mt-1.5 max-w-[38ch] text-[13.5px] leading-relaxed text-ink-secondary">
                      NERC's reference level is about 15%. Regions under it face constrained
                      interconnection for large new loads; new data centers there compete
                      hardest for supply.
                    </p>
                  </div>
                </>
              ) : (
                <div className="md:col-span-2">
                  <p className="max-w-[48ch] text-[13.5px] leading-relaxed text-ink-secondary">
                    {grid.note ?? "No regional reliability assessment applies here."}
                  </p>
                </div>
              )}
            </div>
            <Provenance source={RTO_SOURCE_NOTE} extra={STATE_GRID_SOURCE} />
          </RuleSection>

          <RuleSection head={`Being built in ${grid.name}`} testId="my-grid-facilities">
            {facilitiesLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : facilitiesError ? (
              // A fetch failure must not read as "nothing is being built here".
              <ErrorState label="Facility registry failed to load." onRetry={() => refetchFacilities()} className="h-24" />
            ) : localFacilities.length === 0 ? (
              <p className="text-[13.5px] text-ink-secondary" data-testid="my-grid-no-facilities">
                No tracked facilities in {grid.name}. The registry covers hyperscale campuses of
                400 MW and up; smaller sites are out of scope.
              </p>
            ) : (
              <table className="print-table" data-testid="my-grid-facility-table">
                <thead>
                  <tr>
                    <th>Facility</th>
                    <th>Operator</th>
                    <th>City</th>
                    <th className="num">MW</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {localFacilities.map((f) => (
                    <tr key={f.id}>
                      <td className="font-semibold text-ink">{f.name}</td>
                      <td className="text-ink-secondary">{f.company}</td>
                      <td className="text-ink-secondary">{f.city}</td>
                      <td className="num">{f.powerMW ?? "--"}</td>
                      <td className={f.status === "operational" ? "font-semibold text-ink" : f.status === "construction" ? "text-ink-secondary" : "text-ink-muted"}>
                        {STATUS_LABEL[f.status] ?? f.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2">
              <Link href="/power-map" className="text-[12.5px] font-semibold text-ink no-underline hover:text-brand-ink">
                See the national map →
              </Link>
            </p>
            <Provenance source="GridTilt facility registry" extra="hyperscale campuses of 400 MW and up" />
          </RuleSection>

          <RuleSection head={`What electricity costs in ${grid.name}`} testId="my-grid-rates">
            {ratesError ? (
              <ErrorState label="Rate data failed to load." onRetry={() => refetchRates()} className="h-40" />
            ) : !rates ? (
              <Skeleton className="h-40 w-full" />
            ) : !("byState" in rates) ? (
              <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-ink-secondary" data-testid="my-grid-rates-unconfigured">
                Rate data is not configured on this deployment yet. It comes straight from the
                EIA once a free API key is set; nothing is shown in its place.
              </p>
            ) : series.length === 0 ? (
              <p className="text-[13.5px] text-ink-secondary">No EIA series available for {grid.name}.</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-end gap-x-10 gap-y-4">
                  <PullStat
                    label={`Residential average, ${latest ? fmtMonth(latest.month) : ""}`}
                    value={latest ? `${latest.centsPerKwh.toFixed(1)}¢/kWh` : "--"}
                    delta={
                      yoy != null ? (
                        <span className={`text-[13px] font-semibold tnum ${yoy >= 0 ? "text-negative" : "text-positive"}`}>
                          {yoy >= 0 ? "+" : "−"}{Math.abs(yoy).toFixed(1)}% y/y
                        </span>
                      ) : undefined
                    }
                    testId="my-grid-rate"
                  />
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis {...axisProps} dataKey="month" tickFormatter={fmtMonth} interval="preserveStartEnd" minTickGap={40} />
                    <YAxis {...axisProps} axisLine={false} width={40} domain={["auto", "auto"]} tickFormatter={(v: number) => `${v.toFixed(0)}¢`} />
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                      labelFormatter={(m: string) => fmtMonth(m)}
                      formatter={(v: number) => [`${v.toFixed(2)}¢/kWh`, "Residential average"]}
                    />
                    <Line type="monotone" dataKey="centsPerKwh" stroke={HIGHLIGHT} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
                <SrChartTable
                  caption={`Residential electricity price in ${grid.name}, cents per kWh`}
                  columns={["Month", "Cents per kWh"]}
                  rows={series.map((p) => [p.month, p.centsPerKwh.toFixed(2)])}
                />
                <Provenance source={rates.source} href={rates.sourceUrl} extra={rates.unit} />
              </>
            )}
          </RuleSection>
        </>
      )}
    </PageShell>
  );
}
