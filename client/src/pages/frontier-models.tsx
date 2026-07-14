import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import FrontierRelayChart from "@/components/frontier-relay-chart";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, SrChartTable } from "@/components/Freshness";
import { useMeasuredWidth } from "@/lib/use-measured-width";
import {
  benchmarkOptions,
  benchmarkSeries,
  frontierSearchParams,
  groupModelsByYear,
  parseFrontierParams,
  releaseRows,
  type BenchmarkFamily,
  type FrontierRegistry,
  type FrontierViewState,
} from "@/lib/frontier-series";
import { BRAND, FONT, INK } from "@/lib/tokens";

const FAMILIES: Array<{ id: BenchmarkFamily; label: string }> = [
  { id: "general", label: "General" },
  { id: "reasoning", label: "Reasoning" },
  { id: "coding", label: "Coding" },
  { id: "agents", label: "Agents" },
  { id: "multimodal", label: "Multimodal" },
];

const STATUS_COPY: Record<string, string> = {
  general: "general release",
  preview: "preview",
  "open-weights": "open weights",
  restricted: "restricted release",
};

function monthDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function compactContext(tokens: number | null): string {
  if (!tokens) return "not disclosed";
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M tokens`;
  if (tokens >= 1_000) return `${tokens / 1_000}K tokens`;
  return `${tokens} tokens`;
}

function scoreText(score: number, unit: string): string {
  if (unit === "percent") return `${score}%`;
  return `${score} ${unit}`;
}

function chip(active: boolean): string {
  return `rounded border px-2.5 py-1 text-10 font-mono transition-colors ${active ? "border-brand/60 bg-brand/10 text-brand" : "border-subtle text-muted-foreground hover:border-strong hover:text-foreground"}`;
}

export default function FrontierModels({ embedded = false }: { embedded?: boolean }) {
  const query = useQuery<FrontierRegistry>({ queryKey: ["/api/frontier-models"] });
  const [view, setView] = useState<FrontierViewState | null>(null);
  const [chartRef, chartWidth] = useMeasuredWidth<HTMLDivElement>();

  useEffect(() => {
    if (query.data && !view) setView(parseFrontierParams(window.location.search, query.data));
  }, [query.data, view]);

  useEffect(() => {
    if (!query.data || !view) return;
    const current = new URLSearchParams(window.location.search);
    for (const key of ["lens", "family", "benchmark", "config", "labs", "model"]) current.delete(key);
    const frontier = new URLSearchParams(frontierSearchParams(view, query.data));
    frontier.forEach((value, key) => current.set(key, value));
    const search = current.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}`);
  }, [query.data, view]);

  const allOptions = useMemo(() => query.data ? benchmarkOptions(query.data, view?.family ?? null) : [], [query.data, view?.family]);
  const visibleLabs = useMemo(() => new Set(view?.labIds ?? []), [view?.labIds]);
  const rows = useMemo(() => query.data ? releaseRows(query.data, visibleLabs) : [], [query.data, visibleLabs]);
  const points = useMemo(() => query.data && view?.benchmarkId && view.comparabilityKey
    ? benchmarkSeries(query.data, view.benchmarkId, view.comparabilityKey, visibleLabs)
    : [], [query.data, view?.benchmarkId, view?.comparabilityKey, visibleLabs]);
  const benchmark = query.data?.benchmarks.find((item) => item.id === view?.benchmarkId) ?? null;
  const selected = query.data?.models.find((model) => model.id === view?.modelId) ?? null;
  const selectedLab = query.data?.labs.find((lab) => lab.id === selected?.labId) ?? null;
  const sourceMap = useMemo(() => new Map((query.data?.sources ?? []).map((source) => [source.id, source])), [query.data?.sources]);
  const mobileGroups = useMemo(() => query.data && view ? groupModelsByYear(query.data.models.filter((model) => visibleLabs.has(model.labId))) : [], [query.data, view, visibleLabs]);

  function chooseFamily(family: BenchmarkFamily) {
    if (!query.data || !view) return;
    const option = benchmarkOptions(query.data, family)[0];
    if (!option) return;
    setView({ ...view, lens: "benchmark", family, benchmarkId: option.benchmark.id, comparabilityKey: option.comparabilityKey });
  }

  function chooseBenchmark(benchmarkId: string) {
    if (!view) return;
    const option = allOptions.find((item) => item.benchmark.id === benchmarkId);
    if (option) setView({ ...view, benchmarkId, comparabilityKey: option.comparabilityKey });
  }

  function toggleLab(labId: string) {
    if (!view) return;
    const next = new Set(view.labIds);
    if (next.has(labId)) next.delete(labId); else next.add(labId);
    setView({ ...view, labIds: Array.from(next) });
  }

  if (query.isError) return <Card className="border-card-border"><ErrorState label="Frontier model registry unavailable" onRetry={() => query.refetch()} /></Card>;
  if (query.isLoading || !query.data || !view) {
    return <div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-[560px]" /><Skeleton className="h-48" /></div>;
  }

  const registry = query.data;
  const chartHeight = view.lens === "releases" ? 602 : 430;
  const benchmarkConfigs = allOptions.filter((item) => item.benchmark.id === view.benchmarkId);

  return (
    <section className="space-y-4" data-testid="frontier-models">
      <div className={`flex flex-wrap items-start justify-between gap-4 ${embedded ? "px-1" : "border-b border-border px-4 sm:px-6 py-6"}`}>
        <div className="max-w-3xl">
          <div className="mb-1 flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_10px_rgba(240,120,0,0.75)]" />
            <span className="text-10 font-mono uppercase tracking-[0.18em] text-brand">Frontier relay</span>
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground" style={{ fontFamily: FONT.mono }}>The model race, without the fake master score</h2>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Every major lab on one release clock. Switch to a capability lens to compare only the same benchmark, version, and evaluation setup. A point disappears when the evidence is not like-for-like.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-right font-mono text-10 text-muted-foreground">
          <span>coverage</span><span className="text-foreground">Feb 2019 - Jul 2026</span>
          <span>ledger</span><span className="text-foreground">{registry.summary.modelCount} models · {registry.summary.labCount} labs</span>
          <span>verified</span><span className="text-foreground">through Jul 14, 2026</span>
        </div>
      </div>

      <Card className="border-card-border p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={chip(view.lens === "releases")} onClick={() => setView({ ...view, lens: "releases", family: null, benchmarkId: null, comparabilityKey: null })} data-testid="frontier-lens-releases">All releases</button>
          <span className="mx-1 h-4 w-px bg-border" />
          {FAMILIES.map((family) => <button key={family.id} className={chip(view.lens === "benchmark" && view.family === family.id)} onClick={() => chooseFamily(family.id)} data-testid={`frontier-family-${family.id}`}>{family.label}</button>)}
        </div>

        {view.lens === "benchmark" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-9 font-mono uppercase tracking-wider text-muted-foreground">
              Exact benchmark
              <select value={view.benchmarkId ?? ""} onChange={(event) => chooseBenchmark(event.target.value)} className="block w-full rounded border border-subtle bg-background px-2 py-1.5 text-11 normal-case tracking-normal text-foreground" data-testid="frontier-benchmark">
                {Array.from(new Map(allOptions.map((option) => [option.benchmark.id, option.benchmark])).values()).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-9 font-mono uppercase tracking-wider text-muted-foreground">
              Evaluation setup
              <select value={view.comparabilityKey ?? ""} onChange={(event) => setView({ ...view, comparabilityKey: event.target.value })} className="block w-full rounded border border-subtle bg-background px-2 py-1.5 text-11 normal-case tracking-normal text-foreground" data-testid="frontier-compare">
                {benchmarkConfigs.map((option) => <option key={option.comparabilityKey} value={option.comparabilityKey}>{option.setting} · {option.modelCount} models / {option.labCount} labs</option>)}
              </select>
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
          <span className="mr-1 text-9 font-mono uppercase tracking-wider text-muted-foreground/70">labs</span>
          {registry.labs.map((lab) => {
            const active = visibleLabs.has(lab.id);
            return <button key={lab.id} onClick={() => toggleLab(lab.id)} aria-pressed={active} data-testid={`frontier-lab-${lab.id}`} className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-9 font-mono ${active ? "border-strong text-foreground" : "border-subtle text-muted-foreground/35"}`}><span className="h-1.5 w-1.5 rounded-full" style={{ background: lab.color, opacity: active ? 1 : 0.3 }} />{lab.name}</button>;
          })}
          {view.labIds.length === 0 && <button className="text-10 font-mono text-brand" onClick={() => setView({ ...view, labIds: registry.labs.map((lab) => lab.id) })}>Show all labs</button>}
        </div>
      </Card>

      {view.labIds.length === 0 ? (
        <Card className="border-card-border p-10 text-center"><p className="text-xs text-muted-foreground">Every lab is hidden.</p><button className="mt-2 text-11 font-mono text-brand" onClick={() => setView({ ...view, labIds: registry.labs.map((lab) => lab.id) })}>Show all labs</button></Card>
      ) : view.lens === "benchmark" && points.length < 2 ? (
        <Card className="border-card-border p-5">
          <p className="text-sm font-medium text-foreground">No like-for-like series is available for this exact evaluation setup.</p>
          <p className="mt-1 text-xs text-muted-foreground">The cited value stays visible, but GridTilt will not draw a trend from a single result.</p>
          <div className="mt-4 space-y-2">{points.map((point) => <button key={point.model.id} onClick={() => setView({ ...view, modelId: point.model.id })} className="flex w-full items-center justify-between rounded border border-subtle px-3 py-2 text-left"><span className="text-xs text-foreground">{point.lab.name} · {point.model.name}</span><span className="font-mono text-sm text-brand">{scoreText(point.result.score, point.result.unit)}</span></button>)}</div>
        </Card>
      ) : (
        <Card className="hidden overflow-x-auto border-card-border p-2 md:block" ref={chartRef}>
          {chartWidth > 0 && <FrontierRelayChart width={chartWidth - 16} height={chartHeight} registry={registry} lens={view.lens} releaseRows={rows} benchmarkPoints={points} benchmark={benchmark} selectedModelId={view.modelId} onSelectModel={(modelId) => setView({ ...view, modelId })} />}
        </Card>
      )}

      <div className="space-y-5 md:hidden" data-testid="frontier-mobile-ledger">
        {mobileGroups.map((group) => <div key={group.year}><div className="sticky top-0 z-10 mb-2 border-b border-border bg-background/95 py-1 font-mono text-xs text-brand backdrop-blur">{group.year}</div><div className="space-y-1">{group.models.map((model) => { const lab = registry.labs.find((item) => item.id === model.labId)!; return <button key={model.id} onClick={() => setView({ ...view, modelId: model.id })} className={`grid w-full grid-cols-[70px_1fr_auto] items-center gap-2 rounded border px-2.5 py-2 text-left ${model.id === view.modelId ? "border-brand/60 bg-brand/5" : "border-subtle"}`}><span className="font-mono text-9 text-muted-foreground">{model.releaseDate.slice(5)}</span><span><span className="block text-xs text-foreground">{model.name}</span><span className="text-9 font-mono" style={{ color: lab.color }}>{lab.name}</span></span><span className="text-8 font-mono uppercase text-muted-foreground/60">{model.releaseStatus}</span></button>; })}</div></div>)}
      </div>

      {selected && selectedLab && (
        <Card className="relative overflow-hidden border-card-border" data-testid="frontier-receipt">
          <div className="absolute inset-y-0 left-0 w-0.5" style={{ background: selectedLab.color }} />
          <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
            <div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-9 uppercase tracking-wider text-muted-foreground">
                <span style={{ color: selectedLab.color }}>{selectedLab.name}</span><span>·</span><span>{monthDay(selected.releaseDate)}</span><span>·</span><span>{STATUS_COPY[selected.releaseStatus]}</span>
              </div>
              <h3 className="mt-1 text-xl font-semibold text-foreground" style={{ fontFamily: FONT.mono }}>{selected.name}</h3>
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">{selected.summary}</p>
              <div className="mt-4 flex flex-wrap gap-2 font-mono text-9 text-muted-foreground">
                <span className="rounded border border-subtle px-2 py-1">{selected.modalities.join(" + ")}</span>
                <span className="rounded border border-subtle px-2 py-1">context · {compactContext(selected.contextWindow)}</span>
                <span className="rounded border border-subtle px-2 py-1">{selected.inclusionReason.replaceAll("-", " ")}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {selected.sourceIds.map((sourceId) => { const source = sourceMap.get(sourceId); return source ? <a key={sourceId} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-10 font-mono text-brand hover:text-brand-2">{source.publisher} source <ExternalLink className="h-2.5 w-2.5" /></a> : null; })}
              </div>
            </div>
            <div>
              <div className="mb-2 text-9 font-mono uppercase tracking-wider text-muted-foreground">reported evaluations</div>
              {selected.benchmarks.length ? <div className="space-y-2">{[...selected.benchmarks].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))).map((result, index) => { const definition = registry.benchmarks.find((item) => item.id === result.benchmarkId); const source = sourceMap.get(result.sourceId); return <div key={`${result.benchmarkId}-${index}`} className="rounded border border-subtle bg-background/40 p-2.5"><div className="flex items-baseline justify-between gap-3"><span className="text-10 text-foreground">{definition?.name ?? result.benchmarkId}</span><span className="font-mono text-base tabular-nums" style={{ color: result.featured ? BRAND.secondary : INK.primary }}>{scoreText(result.score, result.unit)}</span></div><div className="mt-1 text-9 leading-relaxed text-muted-foreground">{result.setting} · {result.provenance}</div>{source && <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-9 font-mono text-brand">evidence ↗</a>}</div>; })}</div> : <p className="rounded border border-dashed border-subtle p-3 text-10 leading-relaxed text-muted-foreground">No exact, settings-complete benchmark record is in this release receipt yet. The release remains in the timeline because its date and frontier relevance are sourced.</p>}
            </div>
          </div>
        </Card>
      )}

      <details className="rounded border border-subtle bg-card/30" data-testid="frontier-sources">
        <summary className="cursor-pointer px-4 py-3 text-10 font-mono uppercase tracking-wider text-muted-foreground">Source ledger · {registry.sources.length} first-party and benchmark records</summary>
        <div className="grid gap-2 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-3">{registry.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="rounded border border-subtle p-2.5 hover:border-strong"><span className="block text-10 text-foreground">{source.title}</span><span className="mt-1 block text-9 font-mono text-muted-foreground">{source.publisher} · {source.publishedAt} · {source.locator}</span></a>)}</div>
      </details>

      <p className="px-1 text-9 leading-relaxed text-muted-foreground/60">Release inclusion is editorial; scores are not normalized. Lab-reported, benchmark-owner, and independent results are visually distinguished. Exact evaluation settings live in every receipt.</p>

      <SrChartTable caption="Frontier model release ledger" columns={["Date", "Lab", "Model", "Status"]} rows={registry.models.map((model) => [model.releaseDate, registry.labs.find((lab) => lab.id === model.labId)?.name ?? model.labId, model.name, model.releaseStatus])} />
    </section>
  );
}
