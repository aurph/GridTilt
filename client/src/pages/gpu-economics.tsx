import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState } from "@/components/Freshness";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trainingEstimate, trainingSensitivity } from "@/lib/gpu-economics-series";
import { PageShell, Provenance, PullStat, RuleSection } from "@/components/editorial";
import {
  CONTEXT,
  HIGHLIGHT,
  axisProps,
  gridProps,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from "@/lib/chart-theme";
import { FONT, INK, SURFACE } from "@/lib/tokens";

interface EconRow {
  model: string;
  vendor: string;
  pricePerHr: number;
  tflopsBf16: number | null;
  perDay: number;
  perMonth: number;
  perYear: number;
  usdPerPflopHr: number | null;
}
interface TrainingPreset { label: string; flops: number; note: string; }
interface EconData { rows: EconRow[]; trainingPresets: TrainingPreset[]; lastRefreshed: string | null; }

const usd = (n: number) => `$${n.toFixed(2)}`;
function usdBig(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`;
  return `$${Math.round(n)}`;
}
function numBig(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return String(Math.round(n));
}

// Worksheet form chrome: sentence-case labels over ruled input rows.
const FIELD_LABEL = "text-[13px] text-ink-secondary";
const FIELD_INPUT =
  "mt-1.5 block w-full rounded-sm border border-rule bg-transparent px-2 py-1.5 text-[13.5px] text-ink";

export default function GpuEconomics({ embedded = false }: { embedded?: boolean }) {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery<EconData>({ queryKey: ["/api/gpu-economics"] });
  const rows = data?.rows ?? [];
  // Presentation-layer sort: cheapest compute first ($/PFLOP-hr ascending, nulls last),
  // so the table matches the header claim regardless of server order.
  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.usdPerPflopHr == null) return b.usdPerPflopHr == null ? 0 : 1;
        if (b.usdPerPflopHr == null) return -1;
        return a.usdPerPflopHr - b.usdPerPflopHr;
      }),
    [rows],
  );
  // Actual min $/PFLOP-hr (nulls excluded); the highlight pins to this row, not to row order.
  const cheapestModel = useMemo(() => {
    let best: EconRow | null = null;
    for (const r of rows) {
      if (r.usdPerPflopHr == null) continue;
      if (!best || r.usdPerPflopHr < best.usdPerPflopHr!) best = r;
    }
    return best?.model ?? null;
  }, [rows]);
  const efficiencyRows = useMemo(
    () => sortedRows.filter((row): row is EconRow & { usdPerPflopHr: number } => row.usdPerPflopHr != null),
    [sortedRows],
  );
  const calcGpus = useMemo(() => rows.filter((r) => r.tflopsBf16 && r.usdPerPflopHr != null), [rows]);
  const presets = data?.trainingPresets ?? [];

  // Calculator state
  const [presetIdx, setPresetIdx] = useState(0);
  const [gpuModel, setGpuModel] = useState<string>("");
  const [mfu, setMfu] = useState(40); // percent
  const [gpuCount, setGpuCount] = useState(1000);

  useEffect(() => {
    if (!gpuModel && calcGpus.length) setGpuModel(calcGpus[0].model);
  }, [calcGpus, gpuModel]);

  const calc = useMemo(() => {
    const gpu = calcGpus.find((g) => g.model === gpuModel);
    const preset = presets[presetIdx];
    if (!gpu || !preset || !gpu.tflopsBf16) return null;
    const estimate = trainingEstimate({
      totalFlops: preset.flops,
      tflopsBf16: gpu.tflopsBf16,
      pricePerHr: gpu.pricePerHr,
      gpuCount,
      mfu,
    });
    return estimate ? { ...estimate, gpu, preset } : null;
  }, [calcGpus, gpuModel, presetIdx, mfu, gpuCount, presets]);

  const sensitivity = useMemo(() => {
    const gpu = calcGpus.find((g) => g.model === gpuModel);
    const preset = presets[presetIdx];
    if (!gpu || !preset || !gpu.tflopsBf16) return [];
    return trainingSensitivity({
      totalFlops: preset.flops,
      tflopsBf16: gpu.tflopsBf16,
      pricePerHr: gpu.pricePerHr,
      gpuCount,
    }, 20, 60, 1);
  }, [calcGpus, gpuModel, presetIdx, gpuCount, presets]);

  const freshness = (
    <div className="space-y-0.5 text-right text-[12px] text-ink-muted">
      {data?.lastRefreshed && <div>prices as of {data.lastRefreshed}</div>}
      <div><AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} /></div>
    </div>
  );

  // Embedded mode (GPU Prices tool, economics tab): the host page owns the
  // title, so this tab opens with a plain intro paragraph.
  const intro = embedded ? (
    <div className="mt-5 flex flex-wrap items-start justify-between gap-3">
      <p className="max-w-[70ch] text-[13.5px] leading-relaxed text-ink-secondary">
        What the rental prices actually cost you: hourly rates rolled out to a year, normalized by compute so you can
        see which GPU is cheapest per unit of work, not just per hour. The calculator estimates a training run.
        Compute specs are vendor peak BF16 (dense); training figures are public estimates. Every assumption is
        shown and adjustable.
      </p>
      {freshness}
    </div>
  ) : (
    <div className="pt-7 pb-4 border-b border-rule" data-testid="econ-header">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[70ch]">
          <h1 className="font-serif font-medium text-[30px] leading-[1.05] tracking-tight text-ink">GPU Economics</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-secondary">
            What the <Link href="/neocloud-intel" className="text-brand-ink hover:text-ink">rental prices</Link> actually
            cost you. Hourly rates rolled out to a year, and normalized by compute so you can see which GPU is cheapest
            per unit of work, not just per hour. The calculator below estimates what a training run costs. Compute specs
            are vendor peak BF16 (dense); training figures are public estimates. Every assumption is shown and adjustable.
          </p>
        </div>
        {freshness}
      </div>
    </div>
  );

  const content = (
    <>
      {intro}

      {/* Comparable compute efficiency; the one highlighted bar is the cheapest compute. */}
      <RuleSection head="Compute efficiency" aside={<span>$/PFLOP-hr · lower is better</span>} testId="econ-efficiency-chart">
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : isError ? (
          <ErrorState label="Compute efficiency failed to load." onRetry={() => refetch()} />
        ) : efficiencyRows.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-ink-muted">No GPUs with both price and published BF16 compute.</div>
        ) : (
          <div role="img" aria-label="Horizontal bars comparing GPU rental cost per PFLOP-hour. Lower values are better.">
            <ResponsiveContainer width="100%" height={Math.max(280, efficiencyRows.length * 34 + 50)}>
              <BarChart data={efficiencyRows} layout="vertical" margin={{ top: 8, right: 66, bottom: 24, left: 10 }}>
                <CartesianGrid {...gridProps} vertical={true} horizontal={false} />
                <XAxis
                  {...axisProps}
                  type="number"
                  tickFormatter={(value: number) => `$${value}`}
                  label={{ value: "USD per PFLOP-hour", position: "insideBottom", offset: -14, fill: INK.muted, fontFamily: FONT.sans, fontSize: 11 }}
                />
                <YAxis
                  {...axisProps}
                  type="category"
                  dataKey="model"
                  width={76}
                  axisLine={false}
                />
                <ChartTooltip
                  cursor={{ fill: "rgba(28,23,18,0.04)" }}
                  contentStyle={tooltipContentStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  formatter={(value: number) => [`$${Number(value).toFixed(2)} / PFLOP-hr`, "Compute cost"]}
                />
                <Bar dataKey="usdPerPflopHr" radius={[0, 2, 2, 0]} isAnimationActive={false}>
                  {efficiencyRows.map((row) => (
                    <Cell key={row.model} fill={row.model === cheapestModel ? HIGHLIGHT : CONTEXT} />
                  ))}
                  <LabelList
                    dataKey="usdPerPflopHr"
                    position="right"
                    formatter={(value: number) => `$${Number(value).toFixed(2)}`}
                    fill={INK.secondary}
                    fontFamily={FONT.sans}
                    fontSize={11}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
          The orange bar marks the cheapest compute{cheapestModel ? ` (${cheapestModel})` : ""}. Bars use published dense
          BF16 peak throughput; they compare rental compute economics, not realized application performance.
        </p>
        <Provenance source="GridTilt GPU price index" updated={data?.lastRefreshed ?? undefined} />
      </RuleSection>

      {/* Cost-of-compute table */}
      <RuleSection head="Cost of compute" aside={<span>sorted by cheapest compute</span>} testId="econ-table">
        {isError ? (
          <ErrorState label="GPU economics failed to load." onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="space-y-2 py-2">{Array(10).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
        ) : (
          <>
            <table className="print-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th className="num">$/hr</th>
                  <th className="num hidden sm:table-cell">$/year</th>
                  <th className="num hidden sm:table-cell">Peak BF16</th>
                  <th className="num">$/PFLOP-hr</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((r) => (
                  <tr key={r.model} data-testid={`econ-row-${r.model}`}>
                    <td className="shrink font-semibold text-ink">
                      {r.model}
                      {cheapestModel != null && r.model === cheapestModel && (
                        <span className="ml-1.5 text-[11.5px] font-normal text-positive">cheapest compute</span>
                      )}
                    </td>
                    <td className="num">{usd(r.pricePerHr)}</td>
                    <td className="num hidden sm:table-cell text-ink-secondary">{usdBig(r.perYear)}</td>
                    <td className="num hidden sm:table-cell text-ink-muted">{r.tflopsBf16 != null ? `${(r.tflopsBf16 / 1000).toFixed(2)} PF` : "—"}</td>
                    <td className={`num ${r.usdPerPflopHr != null ? "font-semibold text-ink" : "text-ink-faint"}`}>
                      {r.usdPerPflopHr != null ? `$${r.usdPerPflopHr.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
              $/year = on-demand rate held for 8,760 hours. Peak BF16 = vendor dense tensor throughput (PF = petaflops).
              $/PFLOP-hr = rate ÷ petaflops.
            </p>
            <Provenance source="GridTilt GPU price index" updated={data?.lastRefreshed ?? undefined} />
          </>
        )}
      </RuleSection>

      {/* Training cost worksheet: ruled inputs on the left, pull-number results on the right. */}
      <RuleSection head="Training cost calculator" testId="econ-calc">
        {isLoading ? (
          <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
            <div className="space-y-3">{Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            <Skeleton className="h-52" />
          </div>
        ) : isError ? (
          <ErrorState label="The calculator needs the price feed, which failed to load." onRetry={() => refetch()} />
        ) : calcGpus.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-ink-muted">No GPUs with published compute specs.</div>
        ) : (
          <>
            <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
              {/* Inputs */}
              <div className="divide-y divide-rule">
                <label className="block py-3 first:pt-0">
                  <span className={FIELD_LABEL}>Model scale</span>
                  <select value={presetIdx} onChange={(e) => setPresetIdx(+e.target.value)} className={FIELD_INPUT} data-testid="econ-preset">
                    {presets.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                  </select>
                  {presets[presetIdx] && (
                    <span className="mt-1 block text-[12px] text-ink-muted tnum">
                      {presets[presetIdx].flops.toExponential(1)} FLOPs · {presets[presetIdx].note}
                    </span>
                  )}
                </label>
                <label className="block py-3">
                  <span className={FIELD_LABEL}>GPU</span>
                  <select value={gpuModel} onChange={(e) => setGpuModel(e.target.value)} className={FIELD_INPUT} data-testid="econ-gpu">
                    {calcGpus.map((g) => (
                      <option key={g.model} value={g.model}>
                        {g.model} · {usd(g.pricePerHr)}/hr · {(g.tflopsBf16! / 1000).toFixed(2)} PF
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block py-3">
                  <span className={FIELD_LABEL}>Utilization (MFU): <span className="tnum">{mfu}%</span></span>
                  <input type="range" min={20} max={60} value={mfu} onChange={(e) => setMfu(+e.target.value)} className="mt-1.5 w-full accent-brand" data-testid="econ-mfu" />
                  <span className="mt-0.5 block text-[12px] text-ink-muted">real training runs land ~30-50%</span>
                </label>
                <label className="block py-3 last:pb-0">
                  <span className={FIELD_LABEL}>Cluster size (GPUs)</span>
                  <input
                    type="number"
                    min={1}
                    value={gpuCount}
                    onChange={(e) => setGpuCount(Math.max(1, +e.target.value || 1))}
                    className={FIELD_INPUT}
                    data-testid="econ-gpucount"
                  />
                </label>
              </div>
              {/* Results */}
              <div className="flex flex-col justify-center gap-5 border-t border-rule pt-5 sm:border-t-0 sm:pt-0 sm:border-l sm:border-rule sm:pl-10">
                {calc ? (
                  <>
                    <PullStat label="Estimated cost" value={usdBig(calc.usdCost)} testId="econ-out-cost" />
                    <PullStat label="GPU-hours" value={numBig(calc.gpuHours)} />
                    <PullStat
                      label="Wall-clock"
                      value={calc.wallClockDays < 1 ? `${(calc.wallClockDays * 24).toFixed(1)} hr` : `${calc.wallClockDays.toFixed(0)} days`}
                      note={`on ${numBig(gpuCount)} GPUs`}
                    />
                    <p className="text-[12px] leading-relaxed text-ink-muted">
                      {presets[presetIdx]?.label} on {calc.gpu.model} at {mfu}% MFU. On-demand pricing; reserved or owned
                      hardware is cheaper. Compute only, excludes networking, storage, failed runs, and staff.
                    </p>
                  </>
                ) : <span className="text-[13px] text-ink-muted">Pick a model and GPU.</span>}
              </div>
            </div>

            {calc && sensitivity.length > 0 && (
              <div className="mt-6 border-t border-rule pt-4" data-testid="econ-sensitivity-chart">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[13px] font-semibold text-ink">Training cost sensitivity</p>
                    <p className="mt-0.5 text-[12px] text-ink-muted">Modeled training cost across machine utilization. Same inputs and formula as the calculator.</p>
                  </div>
                  <p className="text-[12.5px] text-ink tnum">Selected: {mfu}% MFU · {usdBig(calc.usdCost)}</p>
                </div>
                <div role="img" aria-label={`Line chart of modeled training cost from 20 to 60 percent machine utilization for ${calc.gpu.model}.`}>
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={sensitivity} margin={{ top: 14, right: 14, bottom: 24, left: 8 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis
                        {...axisProps}
                        type="number"
                        dataKey="mfu"
                        domain={[20, 60]}
                        ticks={[20, 30, 40, 50, 60]}
                        tickFormatter={(value: number) => `${value}%`}
                        label={{ value: "Machine utilization (MFU)", position: "insideBottom", offset: -14, fill: INK.muted, fontFamily: FONT.sans, fontSize: 11 }}
                      />
                      <YAxis
                        {...axisProps}
                        axisLine={false}
                        width={62}
                        tickFormatter={(value: number) => usdBig(value)}
                      />
                      <ChartTooltip
                        contentStyle={tooltipContentStyle}
                        itemStyle={tooltipItemStyle}
                        labelStyle={tooltipLabelStyle}
                        formatter={(value: number) => [usdBig(Number(value)), "Modeled cost"]}
                        labelFormatter={(value: number) => `${value}% MFU`}
                      />
                      <Line
                        type="linear"
                        dataKey="usdCost"
                        stroke={HIGHLIGHT}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: HIGHLIGHT, stroke: SURFACE.base, strokeWidth: 2 }}
                        isAnimationActive={false}
                      />
                      <ReferenceDot
                        x={mfu}
                        y={calc.usdCost}
                        r={5}
                        fill={HIGHLIGHT}
                        stroke={SURFACE.base}
                        strokeWidth={2}
                        isFront
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </>
        )}
      </RuleSection>

      <p className="mt-6 max-w-[80ch] text-[12.5px] leading-relaxed text-ink-muted">
        GPU-hours = training FLOPs ÷ (peak BF16 × MFU). This is the standard first-order estimate; it ignores
        communication overhead, restarts, and data-loading stalls, so treat it as a floor. Prices come from
        the <Link href="/neocloud-intel" className="text-brand-ink hover:text-ink">GPU Prices index</Link>.
      </p>
    </>
  );

  if (embedded) return <div className="flex flex-col">{content}</div>;
  return <PageShell>{content}</PageShell>;
}
