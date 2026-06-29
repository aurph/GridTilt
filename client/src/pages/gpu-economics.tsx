import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calculator } from "lucide-react";

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

const VENDOR_COLOR: Record<string, string> = { NVIDIA: "#F07800", AMD: "#22D3EE" };
const vc = (v: string) => VENDOR_COLOR[v] ?? "#9ca3af";

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

export default function GpuEconomics() {
  const { data, isLoading, isError } = useQuery<EconData>({ queryKey: ["/api/gpu-economics"] });
  const rows = data?.rows ?? [];
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
    const eff = gpu.tflopsBf16 * 1e12 * (mfu / 100);
    const gpuHours = preset.flops / eff / 3600;
    const usdCost = gpuHours * gpu.pricePerHr;
    const days = gpuCount > 0 ? gpuHours / gpuCount / 24 : 0;
    return { gpuHours, usdCost, days, gpu, preset };
  }, [calcGpus, gpuModel, presetIdx, mfu, gpuCount, presets]);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="grid-bg border-b border-border px-4 sm:px-6 py-6 sm:py-8" data-testid="econ-header">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="h-5 w-5 text-[#F07800]" />
              <h1 className="text-2xl sm:text-3xl font-semibold text-foreground tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                GPU Economics
              </h1>
            </div>
            <p className="text-muted-foreground text-sm leading-relaxed">
              What the <Link href="/neocloud-intel" className="text-[#F07800] hover:text-[#F0A500]">rental prices</Link> actually
              cost you. Hourly rates rolled out to a year, and normalized by compute so you can see which GPU is cheapest
              per unit of work, not just per hour. The calculator below estimates what a training run costs. Compute specs
              are vendor peak BF16 (dense); training figures are public estimates. Every assumption is shown and adjustable.
            </p>
          </div>
          {data?.lastRefreshed && (
            <div className="text-[11px] text-muted-foreground/70 font-mono text-right">prices as of {data.lastRefreshed}</div>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 sm:p-6 space-y-5">
        {/* Cost-of-compute table */}
        <Card className="border-card-border overflow-hidden" data-testid="econ-table">
          <div className="px-4 py-2 bg-[#0E0E0C] border-b border-border">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Cost of compute</span>
            <span className="text-[10px] font-mono text-muted-foreground/40 ml-2">sorted by cheapest compute (lower $/PFLOP-hr is better)</span>
          </div>
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-[#0E0E0C]/60 border-b border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span className="col-span-3">Model</span>
            <span className="col-span-2 text-right">$/hr</span>
            <span className="col-span-2 text-right">$/year</span>
            <span className="col-span-2 text-right">Peak BF16</span>
            <span className="col-span-3 text-right">$/PFLOP-hr</span>
          </div>
          {isLoading ? (
            <div className="p-4 space-y-2">{Array(10).fill(null).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
          ) : isError ? (
            <div className="p-6 text-center text-xs text-red-400">Economics unavailable.</div>
          ) : (
            rows.map((r, idx) => (
              <div key={r.model} className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/30 last:border-0 text-xs items-center hover:bg-[#F07800]/5" data-testid={`econ-row-${r.model}`}>
                <span className="col-span-3 font-mono font-semibold flex items-center gap-1.5" style={{ color: vc(r.vendor) }}>
                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: vc(r.vendor) }} />
                  {r.model}
                  {idx === 0 && r.usdPerPflopHr != null && <span className="text-[8px] font-normal text-[#4ade80] border border-[#4ade80]/40 rounded-sm px-1">cheapest compute</span>}
                </span>
                <span className="col-span-2 font-mono text-foreground text-right tabular-nums">{usd(r.pricePerHr)}</span>
                <span className="col-span-2 font-mono text-muted-foreground text-right tabular-nums">{usdBig(r.perYear)}</span>
                <span className="col-span-2 font-mono text-muted-foreground/70 text-right tabular-nums text-[11px]">{r.tflopsBf16 != null ? `${(r.tflopsBf16 / 1000).toFixed(2)} PF` : "—"}</span>
                <span className="col-span-3 font-mono text-right tabular-nums" style={{ color: r.usdPerPflopHr != null ? "#F0A500" : "#6b7280" }}>{r.usdPerPflopHr != null ? `$${r.usdPerPflopHr.toFixed(2)}` : "—"}</span>
              </div>
            ))
          )}
          <div className="px-4 py-2 text-[10px] text-muted-foreground/50 font-mono border-t border-border">
            $/year = on-demand rate held for 8,760 hours. Peak BF16 = vendor dense tensor throughput (PF = petaflops). $/PFLOP-hr = rate ÷ petaflops.
          </div>
        </Card>

        {/* Training cost calculator */}
        <Card className="border-card-border p-4" data-testid="econ-calc">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="h-4 w-4 text-[#F07800]" />
            <span className="text-sm font-semibold text-foreground">Training cost calculator</span>
          </div>
          {calcGpus.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center">Compute specs loading.</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
              {/* Inputs */}
              <div className="space-y-3">
                <label className="block">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Model scale</span>
                  <select value={presetIdx} onChange={(e) => setPresetIdx(+e.target.value)} className="mt-1 w-full bg-[#0E0E0C] border border-white/[0.08] rounded px-2 py-1.5 text-sm text-foreground font-mono" data-testid="econ-preset">
                    {presets.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                  </select>
                  {presets[presetIdx] && <span className="text-[10px] text-muted-foreground/50 mt-0.5 block">{presets[presetIdx].flops.toExponential(1)} FLOPs · {presets[presetIdx].note}</span>}
                </label>
                <label className="block">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">GPU</span>
                  <select value={gpuModel} onChange={(e) => setGpuModel(e.target.value)} className="mt-1 w-full bg-[#0E0E0C] border border-white/[0.08] rounded px-2 py-1.5 text-sm text-foreground font-mono" data-testid="econ-gpu">
                    {calcGpus.map((g) => <option key={g.model} value={g.model}>{g.model} — {usd(g.pricePerHr)}/hr, {(g.tflopsBf16! / 1000).toFixed(2)} PF</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Utilization (MFU): {mfu}%</span>
                  <input type="range" min={20} max={60} value={mfu} onChange={(e) => setMfu(+e.target.value)} className="mt-1 w-full accent-[#F07800]" data-testid="econ-mfu" />
                  <span className="text-[10px] text-muted-foreground/50">real training runs land ~30-50%</span>
                </label>
                <label className="block">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Cluster size (GPUs)</span>
                  <input type="number" min={1} value={gpuCount} onChange={(e) => setGpuCount(Math.max(1, +e.target.value || 1))} className="mt-1 w-full bg-[#0E0E0C] border border-white/[0.08] rounded px-2 py-1.5 text-sm text-foreground font-mono" data-testid="econ-gpucount" />
                </label>
              </div>
              {/* Output */}
              <div className="flex flex-col justify-center gap-3 bg-[#0E0E0C]/50 rounded-lg p-4 border border-white/[0.05]">
                {calc ? (
                  <>
                    <Out label="Estimated cost" value={usdBig(calc.usdCost)} accent />
                    <Out label="GPU-hours" value={numBig(calc.gpuHours)} />
                    <Out label="Wall-clock" value={`${calc.days < 1 ? (calc.days * 24).toFixed(1) + " hr" : calc.days.toFixed(0) + " days"} on ${numBig(gpuCount)} GPUs`} />
                    <p className="text-[10px] text-muted-foreground/50 leading-relaxed pt-1">
                      {presets[presetIdx]?.label} on {calc.gpu.model} at {mfu}% MFU. On-demand pricing; reserved/owned hardware is cheaper. Compute only, excludes networking, storage, failed runs, and staff.
                    </p>
                  </>
                ) : <span className="text-xs text-muted-foreground">Pick a model and GPU.</span>}
              </div>
            </div>
          )}
        </Card>

        <p className="text-[11px] text-muted-foreground/60 leading-relaxed px-1">
          GPU-hours = training FLOPs ÷ (peak BF16 × MFU). This is the standard first-order estimate; it ignores
          communication overhead, restarts, and data-loading stalls, so treat it as a floor. Prices come from
          <Link href="/neocloud-intel" className="text-[#F07800] hover:text-[#F0A500]"> Neocloud Intel</Link>.
        </p>
      </div>
    </div>
  );
}

function Out({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">{label}</div>
      <div className={`font-semibold tabular-nums ${accent ? "text-2xl text-[#F07800]" : "text-lg text-foreground"}`}>{value}</div>
    </div>
  );
}
