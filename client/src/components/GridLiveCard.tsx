import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarRow } from "@/components/BarRow";
import { SourceFooter } from "@/components/SourceFooter";
import { SrChartTable } from "@/components/Freshness";
import { seriesMotion, tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from "@/lib/chart-theme";
import { CATEGORY_COLORS, INK, SERIES } from "@/lib/tokens";
import { fmtGW, fmtPeriodET, sparkAxis, useGridLive, type FuelShare } from "@/lib/grid-live";

const FUEL_COLOR: Record<string, string> = {
  NG: CATEGORY_COLORS.gas,
  COL: CATEGORY_COLORS.coal,
  NUC: CATEGORY_COLORS.nuclear,
  WND: CATEGORY_COLORS.wind,
  SUN: CATEGORY_COLORS.solar,
  SNB: CATEGORY_COLORS.solar,
  WAT: CATEGORY_COLORS.hydro,
  BAT: CATEGORY_COLORS.storage,
  PS: CATEGORY_COLORS.storage,
  UES: CATEGORY_COLORS.storage,
  GEO: CATEGORY_COLORS.renewables,
  BIO: CATEGORY_COLORS.renewables,
};

const fuelColor = (f: FuelShare) => FUEL_COLOR[f.code] ?? INK.muted;

/** One BarRow per fuel, largest first, with the MW on hover. */
export function FuelMixBars({ fuels, limit = 8 }: { fuels: FuelShare[]; limit?: number }) {
  return (
    <div data-testid="fuel-mix">
      {fuels.slice(0, limit).map((f) => (
        <BarRow
          key={f.code}
          label={f.label}
          segments={[{ pct: f.sharePct, color: fuelColor(f) }]}
          value={`${f.sharePct.toFixed(1)}%`}
          title={`${f.label}: ${f.mw.toLocaleString()} MW`}
          testid={`fuel-${f.code.toLowerCase()}`}
        />
      ))}
    </div>
  );
}

/**
 * What the lower-48 grid is carrying this hour and what is generating it,
 * straight from EIA's Hourly Electric Grid Monitor. The number the rest of
 * the site's capacity figures should be read against: a data center's MW
 * means something next to 460,000 MW of load and nothing on its own.
 */
export function GridLiveCard({ className = "" }: { className?: string }) {
  const { live, data, isLoading, isError } = useGridLive();
  const us = live?.demand.US48 ?? null;
  const axis = us ? sparkAxis(us.points) : null;

  return (
    <Card className={`p-5 border-card-border ${className}`} data-testid="grid-live-card">
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold text-foreground">US Grid Right Now</h2>
            {us && (
              <span className="flex items-center gap-1 text-9 font-mono uppercase tracking-wide text-muted-foreground/70">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
                live
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-3 w-64" />
              <Skeleton className="h-[72px] w-full" />
            </div>
          ) : us ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-[28px] font-bold leading-none text-foreground tabular-nums">
                  {fmtGW(us.latestMw)} GW
                </span>
                <span className="text-xs text-muted-foreground">demand at {fmtPeriodET(us.latestPeriodUtc)}</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Lower 48 states. Last 7 days: peak{" "}
                <span className="font-mono text-foreground tabular-nums">{fmtGW(us.peakMw)} GW</span> at{" "}
                {fmtPeriodET(us.peakPeriodUtc)}, low{" "}
                <span className="font-mono text-foreground tabular-nums">{fmtGW(us.minMw)} GW</span>.
              </p>
              <div className="mt-3">
                <ResponsiveContainer width="100%" height={72}>
                  <LineChart data={us.points} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <XAxis dataKey="t" hide />
                    <YAxis hide domain={[axis!.min, axis!.max]} />
                    <Tooltip
                      contentStyle={tooltipContentStyle}
                      labelStyle={tooltipLabelStyle}
                      itemStyle={tooltipItemStyle}
                      labelFormatter={(t) => fmtPeriodET(String(t))}
                      formatter={(v) => [`${fmtGW(Number(v))} GW`, "Demand"]}
                    />
                    <Line
                      {...seriesMotion()}
                      type="monotone"
                      dataKey="mw"
                      name="Demand"
                      stroke={SERIES[0]}
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 3, fill: SERIES[0] }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-1 flex justify-between font-mono text-10 text-muted-foreground/60 tabular-nums">
                  <span>7 days ago</span>
                  <span>
                    axis {fmtGW(axis!.min, 0)} to {fmtGW(axis!.max, 0)} GW, not zero
                  </span>
                  <span>now</span>
                </div>
              </div>
              <SrChartTable
                caption="US lower-48 hourly electricity demand, last 7 days (EIA)"
                columns={["Hour (UTC)", "Demand MW"]}
                rows={us.points.map((p) => [p.t, p.mw.toLocaleString()])}
              />
            </>
          ) : isError ? (
            <p className="text-xs text-muted-foreground" data-testid="grid-live-error">
              EIA's grid monitor did not answer. Nothing is shown rather than a stale guess; try again in a few minutes.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="grid-live-unconfigured">
              Live grid data is not configured on this server.
              {data && !data.configured ? ` ${data.howTo}` : ""}
            </p>
          )}
        </div>

        <div>
          {(isLoading || live) && (
          <h3 className="mb-2 text-xs font-semibold text-foreground">
            Generation by fuel
            {live?.mix && (
              <span className="ml-2 font-mono text-10 font-normal text-muted-foreground/70 tabular-nums">
                {fmtGW(live.mix.totalMw, 0)} GW at {fmtPeriodET(live.mix.periodUtc)}
              </span>
            )}
          </h3>
          )}
          {isLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : live?.mix ? (
            <>
              <FuelMixBars fuels={live.mix.fuels} />
              <p className="mt-1 text-10 text-muted-foreground/60">
                EIA posts fuel data later than demand, so this is an earlier hour than the demand figure.
              </p>
            </>
          ) : live ? (
            <p className="text-xs text-muted-foreground">EIA has not posted a complete fuel breakdown for the latest hour.</p>
          ) : null}
        </div>
      </div>

      <SourceFooter
        className="mt-4"
        source="EIA Hourly Electric Grid Monitor"
        href={live?.sourceUrl ?? "https://www.eia.gov/electricity/gridmonitor/"}
        asOf={us ? fmtPeriodET(us.latestPeriodUtc) : null}
        cadence="hourly data, refreshed every 30 min"
        stale={live?.stale ?? false}
        testid="grid-live-source"
      />
    </Card>
  );
}
