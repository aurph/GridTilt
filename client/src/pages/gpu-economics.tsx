import { useMemo, useState, useEffect } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
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
import { seriesAnimation } from "@/lib/chart-theme";

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

interface InfSource { id: string; publisher: string; title: string; url: string; publishedAt: string; accessedAt: string; locator: string; }
interface InfPriceRow {
  id: string; labId: string; name: string; tier: "flagship" | "mid" | "efficient";
  inputPerMTok: number; outputPerMTok: number; sourceId: string; note?: string;
  labName: string; labColor: string; blendedPerMTok: number; source: InfSource;
}
interface InfPriceEvent { id: string; date: string; headline: string; sourceIds: string[]; }
interface InfTrajPoint { id: string; name: string; tier: "flagship" | "mid" | "efficient"; date: string; inputPerMTok: number; sourceId: string; }
interface InfPriceView {
  asOf: string; methodology: string; blend: { input: number; output: number };
  labs: { id: string; name: string; color: string }[];
  sources: InfSource[]; events: InfPriceEvent[];
  trajectory: { metric: string; note: string; points: InfTrajPoint[] };
  rows: InfPriceRow[]; cheapestId: string | null; priciestId: string | null;
}

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
  const inf = useQuery<InfPriceView>({ queryKey: ["/api/inference-prices"] });
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
            <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight">
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
        {/* Demand side: what the compute below actually produces, priced and cited. */}
        <TokenPriceCard q={inf} />

        {/* Comparable compute efficiency, with vendor identity and the cheapest option explicit. */}
        <Card className="border-card-border overflow-hidden" data-testid="econ-efficiency-chart">
          <div className="px-4 py-3 bg-surface-base border-b border-border flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-foreground">Compute efficiency · $/PFLOP-hr</div>
              <div className="text-10 text-muted-foreground/50 mt-0.5">Lower is better · on-demand hourly price normalized by peak BF16 compute</div>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-10">
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
                  <Bar {...seriesAnimation} dataKey="usdPerPflopHr" radius={[0, 3, 3, 0]} isAnimationActive={false}>
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
          <div className="px-4 py-2 text-10 text-muted-foreground/50 border-t border-border">
            Bars use published dense BF16 peak throughput. They compare rental compute economics, not realized application performance.
          </div>
        </Card>

        {/* Cost-of-compute table */}
        <Card className="border-card-border overflow-hidden" data-testid="econ-table">
          <div className="px-4 py-2 bg-surface-base border-b border-border">
            <span className="text-[13px] font-semibold text-foreground">Cost of compute</span>
            <span className="text-[11px] text-muted-foreground/40 ml-2">sorted by cheapest compute (lower $/PFLOP-hr is better)</span>
          </div>
          {isError ? (
            <ErrorState label="GPU economics failed to load." onRetry={() => refetch()} />
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[560px]">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-surface-base border-b border-border text-[11px] text-muted-foreground">
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
          <div className="px-4 py-2 text-10 text-muted-foreground/50 border-t border-border">
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
                    <span className="text-[11px] text-muted-foreground">Model scale</span>
                    <select value={presetIdx} onChange={(e) => setPresetIdx(+e.target.value)} className="mt-1 w-full bg-surface-base border border-subtle rounded px-2 py-1.5 text-sm text-foreground" data-testid="econ-preset">
                      {presets.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                    </select>
                    {presets[presetIdx] && <span className="text-10 text-muted-foreground/50 mt-0.5 block">{presets[presetIdx].flops.toExponential(1)} FLOPs · {presets[presetIdx].note}</span>}
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-muted-foreground">GPU</span>
                    <select value={gpuModel} onChange={(e) => setGpuModel(e.target.value)} className="mt-1 w-full bg-surface-base border border-subtle rounded px-2 py-1.5 text-sm text-foreground" data-testid="econ-gpu">
                      {calcGpus.map((g) => <option key={g.model} value={g.model}>{g.model} · {usd(g.pricePerHr)}/hr, {(g.tflopsBf16! / 1000).toFixed(2)} PF</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-muted-foreground">Utilization (MFU): {mfu}%</span>
                    <input type="range" min={20} max={60} value={mfu} onChange={(e) => setMfu(+e.target.value)} className="mt-1 w-full accent-brand" data-testid="econ-mfu" />
                    <span className="text-10 text-muted-foreground/50">real training runs land ~30-50%</span>
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-muted-foreground">Cluster size (GPUs)</span>
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
                      <div className="text-[13px] font-semibold text-foreground">Training cost sensitivity</div>
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
                        <Line {...seriesAnimation}
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
      <div className="text-[11px] text-muted-foreground/60">{label}</div>
      <div className={`font-semibold tabular-nums ${accent ? "text-2xl text-brand" : "text-lg text-foreground"}`}>{value}</div>
    </div>
  );
}

function TokenPriceCard({ q }: { q: UseQueryResult<InfPriceView> }) {
  const view = q.data;
  const rows = view?.rows ?? [];
  const maxBlended = rows.reduce((m, r) => Math.max(m, r.blendedPerMTok), 0) || 1;
  const event = view?.events?.[0];
  const srcById = new Map((view?.sources ?? []).map((s) => [s.id, s] as const));
  const modelSourceIds = new Set(rows.map((r) => r.sourceId));

  return (
    <Card className="border-card-border overflow-hidden" data-testid="token-prices">
      <div className="px-4 py-3 bg-surface-base border-b border-border flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-foreground">The price of a token</div>
          <div className="text-10 text-muted-foreground/50 mt-0.5">What frontier labs charge to run a model, per million tokens. Blended at a 3-to-1 input-to-output mix.</div>
        </div>
        {view?.asOf && <div className="text-10 text-muted-foreground/70 font-mono whitespace-nowrap">list prices as of {view.asOf}</div>}
      </div>

      <div className="px-4 py-3">
        <TrajectoryChart traj={view?.trajectory} sources={view?.sources ?? []} />

        <p className="text-xs text-muted-foreground leading-relaxed max-w-3xl mb-3">
          This is the demand side of the buildout. As inference gets cheaper, work that was not worth running becomes
          worth running, so total compute keeps climbing even as unit prices fall. That rising compute is what shows up
          downstream as datacenter load and power demand.
        </p>

        {event && (
          <div className="mb-3 rounded-md border border-brand/30 bg-brand/5 px-3 py-2" data-testid="token-price-event">
            <div className="flex items-baseline gap-2">
              <span className="text-10 font-mono text-brand flex-shrink-0">{event.date}</span>
              <span className="text-xs text-foreground leading-snug">{event.headline}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {event.sourceIds.map((id) => {
                const src = srcById.get(id);
                return src ? (
                  <a key={id} href={src.url} target="_blank" rel="noopener noreferrer" className="text-10 text-brand/80 hover:text-brand underline underline-offset-2">{src.publisher}</a>
                ) : null;
              })}
            </div>
          </div>
        )}

        {q.isLoading ? (
          <div className="space-y-2">{Array(6).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
        ) : q.isError ? (
          <ErrorState label="Frontier pricing failed to load." onRetry={() => q.refetch()} />
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              <div className="grid grid-cols-12 gap-2 px-1 pb-1.5 border-b border-border text-[11px] text-muted-foreground">
                <span className="col-span-4">Model</span>
                <span className="col-span-2 text-right">In $/M</span>
                <span className="col-span-2 text-right">Out $/M</span>
                <span className="col-span-4">Blended $/M</span>
              </div>
              {rows.map((r) => {
                const cheapest = r.id === view?.cheapestId;
                return (
                  <div key={r.id} className="grid grid-cols-12 gap-2 px-1 py-2 border-b border-border/30 last:border-0 text-xs items-center hover:bg-brand/5" data-testid={`token-row-${r.id}`}>
                    <span className="col-span-4 flex items-center gap-1.5 min-w-0">
                      <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: r.labColor }} />
                      <span className="font-mono font-semibold text-foreground truncate">{r.name}</span>
                      <span className="text-8 uppercase tracking-wide text-muted-foreground/50 border border-border rounded-sm px-1 flex-shrink-0">{r.tier}</span>
                    </span>
                    <span className="col-span-2 font-mono text-muted-foreground text-right tabular-nums">${r.inputPerMTok.toFixed(2)}</span>
                    <span className="col-span-2 font-mono text-muted-foreground text-right tabular-nums">${r.outputPerMTok.toFixed(2)}</span>
                    <span className="col-span-4 flex items-center gap-2">
                      <span className="relative h-3 flex-1 rounded-sm bg-surface-sunken overflow-hidden">
                        <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${Math.max(3, (r.blendedPerMTok / maxBlended) * 100)}%`, background: cheapest ? AMBER : NVIDIA_COLOR, opacity: cheapest ? 1 : 0.62 }} />
                      </span>
                      <span className="font-mono tabular-nums w-12 text-right flex-shrink-0" style={{ color: cheapest ? AMBER : "#e5e7eb" }}>${r.blendedPerMTok.toFixed(2)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-2 text-10 text-muted-foreground/50 border-t border-border flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>Standard tier list prices, curated cross-section. Sources:</span>
        {(view?.sources ?? []).filter((src) => modelSourceIds.has(src.id)).map((src) => (
          <a key={src.id} href={src.url} target="_blank" rel="noopener noreferrer" className="text-brand/70 hover:text-brand underline underline-offset-2">{src.publisher}</a>
        ))}
      </div>
    </Card>
  );
}

function decimalYear(d: string): number {
  const [y, m, day] = d.split("-").map(Number);
  return y + ((m - 1) + (day - 1) / 31) / 12;
}

function fmtTraj(v: number): string {
  return v >= 1 ? `$${v}` : `$${v.toFixed(2)}`;
}

function TrajectoryChart({ traj, sources }: { traj?: InfPriceView["trajectory"]; sources: InfSource[] }) {
  if (!traj || traj.points.length === 0) return null;
  const pts = traj.points;
  const byX = new Map<number, Record<string, number | string>>();
  for (const p of pts) {
    const x = decimalYear(p.date);
    const row = byX.get(x) ?? { x, year: p.date.slice(0, 4) };
    const key = p.tier === "efficient" ? "efficient" : "flagship";
    row[key] = p.inputPerMTok;
    row[key + "Name"] = p.name;
    byX.set(x, row);
  }
  const data = Array.from(byX.values()).sort((a, b) => (a.x as number) - (b.x as number));
  const flagshipFirst = pts.find((p) => p.tier !== "efficient");
  const efficientLast = [...pts].reverse().find((p) => p.tier === "efficient");
  const srcIds = Array.from(new Set(pts.map((p) => p.sourceId)));
  const srcById = new Map(sources.map((src) => [src.id, src] as const));

  return (
    <div className="mb-4" data-testid="token-trajectory">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1">
        <div className="text-[13px] font-semibold text-foreground">Since GPT-4, the price has collapsed</div>
        <div className="flex items-center gap-3 text-10 text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-0.5 w-3 inline-block" style={{ background: NVIDIA_COLOR }} />flagship</span>
          <span className="inline-flex items-center gap-1"><span className="h-0 w-3 inline-block border-t border-dashed" style={{ borderColor: AMBER }} />efficient</span>
        </div>
      </div>
      {flagshipFirst && efficientLast && (
        <p className="text-xs text-muted-foreground leading-relaxed mb-2">
          {flagshipFirst.name} cost {fmtTraj(flagshipFirst.inputPerMTok)} per million input tokens at launch. Today the efficient
          tier is {fmtTraj(efficientLast.inputPerMTok)}. OpenAI list price, input tokens, log scale.
        </p>
      )}
      <div role="img" aria-label="Line chart of OpenAI input token price per million from 2023 to 2026, flagship and efficient tiers, log scale.">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 18, right: 22, bottom: 22, left: 6 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[2023, 2027]}
              ticks={[2023, 2024, 2025, 2026, 2027]}
              tickFormatter={(v: number) => `${Math.round(v)}`}
              tick={{ fill: "#9ca3af", fontFamily: FONT.mono, fontSize: 10 }}
              axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
              tickLine={false}
            />
            <YAxis
              scale="log"
              domain={[0.1, 40]}
              ticks={[0.1, 1, 10, 30]}
              tickFormatter={(v: number) => `$${v}`}
              tick={{ fill: "#9ca3af", fontFamily: FONT.mono, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <ChartTooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              itemStyle={{ color: "#e5e7eb", fontFamily: FONT.mono, fontSize: 11 }}
              labelStyle={{ color: "#9ca3af", fontFamily: FONT.mono, fontSize: 10, marginBottom: 4 }}
              labelFormatter={(v: number) => `${Math.round(v)}`}
              formatter={(value: number, key: string, item: { payload?: Record<string, string> }) => [`$${value} / M input`, item?.payload?.[key + "Name"] ?? key]}
            />
            <Line {...seriesAnimation} type="linear" dataKey="flagship" stroke={NVIDIA_COLOR} strokeWidth={2} connectNulls dot={{ r: 3, fill: NVIDIA_COLOR }} isAnimationActive={false}>
              <LabelList dataKey="flagship" position="top" formatter={(v: number) => (v != null ? fmtTraj(v) : "")} fill="#e5e7eb" fontFamily={FONT.mono} fontSize={9} />
            </Line>
            <Line {...seriesAnimation} type="linear" dataKey="efficient" stroke={AMBER} strokeWidth={2} strokeDasharray="4 3" connectNulls dot={{ r: 3, fill: AMBER }} isAnimationActive={false}>
              <LabelList dataKey="efficient" position="bottom" formatter={(v: number) => (v != null ? fmtTraj(v) : "")} fill={AMBER} fontFamily={FONT.mono} fontSize={9} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-10 text-muted-foreground/50 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
        <span>{traj.note} Sources:</span>
        {srcIds.map((id) => {
          const src = srcById.get(id);
          return src ? (
            <a key={id} href={src.url} target="_blank" rel="noopener noreferrer" className="text-brand/70 hover:text-brand underline underline-offset-2">{src.publishedAt}</a>
          ) : null;
        })}
      </div>
    </div>
  );
}
