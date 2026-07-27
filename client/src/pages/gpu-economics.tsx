import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AsOf, ErrorState } from "@/components/Freshness";
import { Calculator } from "lucide-react";
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
import { FONT, INK } from "@/lib/tokens";

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

const NVIDIA_COLOR = "#F07800";
const AMD_COLOR = "#22D3EE";
const AMBER = "#F0A500";
const VENDOR_COLOR: Record<string, string> = { NVIDIA: NVIDIA_COLOR, AMD: AMD_COLOR };
const vc = (v: string) => VENDOR_COLOR[v] ?? INK.muted;

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
  // Actual min $/PFLOP-hr (nulls excluded); the badge pins to this row, not to row order.
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

  // Embedded mode (GPU Prices tool, economics tab): the host page owns the
  // hero, so render a slim intro instead of the full header.
  const intro = embedded ? (
    <div className="flex flex-wrap items-start justify-between gap-3 px-1">
      <p className="text-muted-foreground text-xs leading-relaxed max-w-3xl">
        What the rental prices actually cost you: hourly rates rolled out to a year, normalized by compute so you can
        see which GPU is cheapest per unit of work, not just per hour. The calculator estimates a training run.
        Compute specs are vendor peak BF16 (dense); training figures are public estimates. Every assumption is
        shown and adjustable.
      </p>
      <div className="text-11 text-muted-foreground/70 font-mono text-right space-y-0.5">
        {data?.lastRefreshed && <div>prices as of {data.lastRefreshed}</div>}
        <div><AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} /></div>
      </div>
    </div>
  ) : (
    <div className="border-b border-border px-4 sm:px-6 py-6 sm:py-8" data-testid="econ-header">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 mb-2">
            <Calculator className="h-5 w-5 text-brand" />
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight" style={{ fontFamily: FONT.mono }}>
              GPU Economics
            </h1>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed">
            What the <Link href="/neocloud-intel" className="text-brand hover:text-brand-2">rental prices</Link> actually
            cost you. Hourly rates rolled out to a year, and normalized by compute so you can see which GPU is cheapest
            per unit of work, not just per hour. The calculator below estimates what a training run costs. Compute specs
            are vendor peak BF16 (dense); training figures are public estimates. Every assumption is shown and adjustable.
          </p>
        </div>
        <div className="text-11 text-muted-foreground/70 font-mono text-right space-y-0.5">
          {data?.lastRefreshed && <div>prices as of {data.lastRefreshed}</div>}
          <div><AsOf updatedAt={dataUpdatedAt} intervalMs={900_000} /></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={embedded ? "flex flex-col" : "flex flex-col h-full overflow-y-auto"}>
      {intro}

      <div className={embedded ? "flex-1 space-y-5 mt-3" : "flex-1 p-4 sm:p-6 space-y-5"}>
        {/* Comparable compute efficiency, with vendor identity and the cheapest option explicit. */}
        <Card className="border-card-border overflow-hidden" data-testid="econ-efficiency-chart">
          <div className="px-4 py-3 bg-surface-base border-b border-border flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-11 font-mono uppercase tracking-wider text-muted-foreground">Compute efficiency · $/PFLOP-hr</div>
              <div className="text-10 text-muted-foreground/50 mt-0.5">Lower is better · on-demand hourly price normalized by peak BF16 compute</div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-10 font-mono">
              <LegendDot color={NVIDIA_COLOR} label="NVIDIA" />
              <LegendDot color={AMD_COLOR} label="AMD" />
              {efficiencyRows[0] && (
                <span style={{ color: AMBER }}>
                  best · {efficiencyRows[0].model} · ${efficiencyRows[0].usdPerPflopHr.toFixed(2)}
                </span>
              )}
            </div>
          </div>
          {isLoading ? (
            <div className="p-4"><Skeleton className="h-[300px] w-full" /></div>
          ) : isError ? (
            <ErrorState label="Compute efficiency failed to load." onRetry={() => refetch()} />
          ) : efficiencyRows.length === 0 ? (
            <div className="py-16 text-center text-xs text-muted-foreground">No GPUs with both price and published BF16 compute.</div>
          ) : (
            <div className="px-2 py-3" role="img" aria-label="Horizontal bars comparing GPU rental cost per PFLOP-hour. Lower values are better.">
              <ResponsiveContainer width="100%" height={Math.max(280, efficiencyRows.length * 34 + 50)}>
                <BarChart data={efficiencyRows} layout="vertical" margin={{ top: 8, right: 66, bottom: 24, left: 10 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#9ca3af", fontFamily: FONT.mono, fontSize: 10 }}
                    tickFormatter={(value: number) => `$${value}`}
                    axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                    tickLine={false}
                    label={{ value: "USD per PFLOP-hour", position: "insideBottom", offset: -14, fill: "#6b7280", fontFamily: FONT.mono, fontSize: 9 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="model"
                    width={76}
                    tick={{ fill: "#9ca3af", fontFamily: FONT.mono, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ChartTooltip
                    cursor={{ fill: "rgba(240,120,0,0.06)" }}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    itemStyle={{ color: "#e5e7eb", fontFamily: FONT.mono, fontSize: 11 }}
                    labelStyle={{ color: "#9ca3af", fontFamily: FONT.mono, fontSize: 10, marginBottom: 4 }}
                    formatter={(value: number) => [`$${Number(value).toFixed(2)} / PFLOP-hr`, "Compute cost"]}
                  />
                  <Bar dataKey="usdPerPflopHr" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                    {efficiencyRows.map((row) => (
                      <Cell
                        key={row.model}
                        fill={vc(row.vendor)}
                        fillOpacity={row.model === cheapestModel ? 1 : 0.58}
                        stroke={row.model === cheapestModel ? AMBER : "transparent"}
                        strokeWidth={row.model === cheapestModel ? 1.5 : 0}
                      />
                    ))}
                    <LabelList
                      dataKey="usdPerPflopHr"
                      position="right"
                      formatter={(value: number) => `$${Number(value).toFixed(2)}`}
                      fill="#e5e7eb"
                      fontFamily={FONT.mono}
                      fontSize={10}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="px-4 py-2 text-10 text-muted-foreground/50 font-mono border-t border-border">
            Bars use published dense BF16 peak throughput. They compare rental compute economics, not realized application performance.
          </div>
        </Card>

        {/* Cost-of-compute table */}
        <Card className="border-card-border overflow-hidden" data-testid="econ-table">
          <div className="px-4 py-2 bg-surface-base border-b border-border">
            <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">Cost of compute</span>
            <span className="text-10 font-mono text-muted-foreground/40 ml-2">sorted by cheapest compute (lower $/PFLOP-hr is better)</span>
          </div>
          {isError ? (
            <ErrorState label="GPU economics failed to load." onRetry={() => refetch()} />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-base border-b border-border text-10 font-mono uppercase tracking-wider text-muted-foreground">
                  <span className="col-span-3">Model</span>
                  <span className="col-span-2 text-right">$/hr</span>
                  <span className="col-span-2 text-right">$/year</span>
                  <span className="col-span-2 text-right">Peak BF16</span>
                  <span className="col-span-3 text-right">$/PFLOP-hr</span>
                </div>
                {isLoading ? (
                  <div className="p-4 space-y-2">{Array(10).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
                ) : (
                sortedRows.map((r) => (
                  <div key={r.model} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs items-center hover:bg-brand/5" data-testid={`econ-row-${r.model}`}>
                    <span className="col-span-3 font-mono font-semibold flex items-center gap-1.5" style={{ color: vc(r.vendor) }}>
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: vc(r.vendor) }} />
                      {r.model}
                      {cheapestModel != null && r.model === cheapestModel && <span className="text-8 font-normal text-positive border border-positive/40 rounded-sm px-1">cheapest compute</span>}
                    </span>
                    <span className="col-span-2 font-mono text-foreground text-right tabular-nums">{usd(r.pricePerHr)}</span>
                    <span className="col-span-2 font-mono text-muted-foreground text-right tabular-nums">{usdBig(r.perYear)}</span>
                    <span className="col-span-2 font-mono text-muted-foreground/70 text-right tabular-nums text-11">{r.tflopsBf16 != null ? `${(r.tflopsBf16 / 1000).toFixed(2)} PF` : "—"}</span>
                    <span className="col-span-3 font-mono text-right tabular-nums" style={{ color: r.usdPerPflopHr != null ? AMBER : INK.faint }}>{r.usdPerPflopHr != null ? `$${r.usdPerPflopHr.toFixed(2)}` : "—"}</span>
                  </div>
                ))
                )}
              </div>
            </div>
          )}
          <div className="px-4 py-2 text-10 text-muted-foreground/50 font-mono border-t border-border">
            $/year = on-demand rate held for 8,760 hours. Peak BF16 = vendor dense tensor throughput (PF = petaflops). $/PFLOP-hr = rate ÷ petaflops.
          </div>
        </Card>

        {/* Training cost calculator */}
        <Card className="border-card-border p-4" data-testid="econ-calc">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="h-4 w-4 text-brand" />
            <span className="text-sm font-semibold text-foreground">Training cost calculator</span>
          </div>
          {isLoading ? (
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              <div className="space-y-3">{Array(4).fill(null).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
              <Skeleton className="h-52" />
            </div>
          ) : isError ? (
            <ErrorState label="The calculator needs the price feed, which failed to load." onRetry={() => refetch()} />
          ) : calcGpus.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">No GPUs with published compute specs.</div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
                {/* Inputs */}
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">Model scale</span>
                    <select value={presetIdx} onChange={(e) => setPresetIdx(+e.target.value)} className="mt-1 w-full bg-surface-base border border-subtle rounded px-2 py-1.5 text-sm text-foreground font-mono" data-testid="econ-preset">
                      {presets.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                    </select>
                    {presets[presetIdx] && <span className="text-10 text-muted-foreground/50 mt-0.5 block">{presets[presetIdx].flops.toExponential(1)} FLOPs · {presets[presetIdx].note}</span>}
                  </label>
                  <label className="block">
                    <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">GPU</span>
                    <select value={gpuModel} onChange={(e) => setGpuModel(e.target.value)} className="mt-1 w-full bg-surface-base border border-subtle rounded px-2 py-1.5 text-sm text-foreground font-mono" data-testid="econ-gpu">
                      {calcGpus.map((g) => <option key={g.model} value={g.model}>{g.model} — {usd(g.pricePerHr)}/hr, {(g.tflopsBf16! / 1000).toFixed(2)} PF</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">Utilization (MFU): {mfu}%</span>
                    <input type="range" min={20} max={60} value={mfu} onChange={(e) => setMfu(+e.target.value)} className="mt-1 w-full accent-brand" data-testid="econ-mfu" />
                    <span className="text-10 text-muted-foreground/50">real training runs land ~30-50%</span>
                  </label>
                  <label className="block">
                    <span className="text-11 font-mono uppercase tracking-wider text-muted-foreground">Cluster size (GPUs)</span>
                    <input type="number" min={1} value={gpuCount} onChange={(e) => setGpuCount(Math.max(1, +e.target.value || 1))} className="mt-1 w-full bg-surface-base border border-subtle rounded px-2 py-1.5 text-sm text-foreground font-mono" data-testid="econ-gpucount" />
                  </label>
                </div>
                {/* Output */}
                <div className="flex flex-col justify-center gap-3 bg-surface-base rounded-lg p-4 border border-subtle">
                  {calc ? (
                    <>
                      <Out label="Estimated cost" value={usdBig(calc.usdCost)} accent />
                      <Out label="GPU-hours" value={numBig(calc.gpuHours)} />
                      <Out label="Wall-clock" value={`${calc.wallClockDays < 1 ? (calc.wallClockDays * 24).toFixed(1) + " hr" : calc.wallClockDays.toFixed(0) + " days"} on ${numBig(gpuCount)} GPUs`} />
                      <p className="text-10 text-muted-foreground/50 leading-relaxed pt-1">
                        {presets[presetIdx]?.label} on {calc.gpu.model} at {mfu}% MFU. On-demand pricing; reserved/owned hardware is cheaper. Compute only, excludes networking, storage, failed runs, and staff.
                      </p>
                    </>
                  ) : <span className="text-xs text-muted-foreground">Pick a model and GPU.</span>}
                </div>
              </div>

              {calc && sensitivity.length > 0 && (
                <div className="mt-5 pt-4 border-t border-border" data-testid="econ-sensitivity-chart">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-11 font-mono uppercase tracking-wider text-muted-foreground">Training cost sensitivity</div>
                      <p className="text-10 text-muted-foreground/50 mt-0.5">Modeled training cost across machine utilization. Same inputs and formula as the calculator.</p>
                    </div>
                    <div className="text-10 font-mono text-right" style={{ color: NVIDIA_COLOR }}>
                      selected · {mfu}% MFU · {usdBig(calc.usdCost)}
                    </div>
                  </div>
                  <div role="img" aria-label={`Line chart of modeled training cost from 20 to 60 percent machine utilization for ${calc.gpu.model}.`}>
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={sensitivity} margin={{ top: 14, right: 14, bottom: 24, left: 8 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis
                          type="number"
                          dataKey="mfu"
                          domain={[20, 60]}
                          ticks={[20, 30, 40, 50, 60]}
                          tickFormatter={(value: number) => `${value}%`}
                          tick={{ fill: "#9ca3af", fontFamily: FONT.mono, fontSize: 10 }}
                          axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                          tickLine={false}
                          label={{ value: "Machine utilization (MFU)", position: "insideBottom", offset: -14, fill: "#6b7280", fontFamily: FONT.mono, fontSize: 9 }}
                        />
                        <YAxis
                          width={62}
                          tickFormatter={(value: number) => usdBig(value)}
                          tick={{ fill: "#9ca3af", fontFamily: FONT.mono, fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <ChartTooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          itemStyle={{ color: "#e5e7eb", fontFamily: FONT.mono, fontSize: 11 }}
                          labelStyle={{ color: "#9ca3af", fontFamily: FONT.mono, fontSize: 10, marginBottom: 4 }}
                          formatter={(value: number) => [usdBig(Number(value)), "Modeled cost"]}
                          labelFormatter={(value: number) => `${value}% MFU`}
                        />
                        <Line
                          type="linear"
                          dataKey="usdCost"
                          stroke={NVIDIA_COLOR}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: NVIDIA_COLOR, stroke: "hsl(var(--card))", strokeWidth: 2 }}
                          isAnimationActive={false}
                        />
                        <ReferenceDot
                          x={mfu}
                          y={calc.usdCost}
                          r={5}
                          fill={NVIDIA_COLOR}
                          stroke="hsl(var(--card))"
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
        </Card>

        <p className="text-11 text-muted-foreground/60 leading-relaxed px-1">
          GPU-hours = training FLOPs ÷ (peak BF16 × MFU). This is the standard first-order estimate; it ignores
          communication overhead, restarts, and data-loading stalls, so treat it as a floor. Prices come from
          <Link href="/neocloud-intel" className="text-brand hover:text-brand-2"> Neocloud Intel</Link>.
        </p>
      </div>
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 6,
  boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
};

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function Out({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-10 font-mono uppercase tracking-wider text-muted-foreground/60">{label}</div>
      <div className={`font-semibold tabular-nums ${accent ? "text-2xl text-brand" : "text-lg text-foreground"}`}>{value}</div>
    </div>
  );
}
