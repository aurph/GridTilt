import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import FrontierRelayChart from "@/components/frontier-relay-chart";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, SrChartTable } from "@/components/Freshness";
import { RuleSection } from "@/components/editorial";
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
import { BRAND, INK } from "@/lib/tokens";

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
  return `rounded-sm border px-2.5 py-1 text-[12.5px] transition-colors ${active ? "border-rule-strong bg-paper-shade font-semibold text-brand-ink" : "border-rule text-ink-secondary hover:border-rule-strong hover:text-ink"}`;
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
  const mobileGroups = useMemo(() => {
    if (!query.data || !view) return [];
    const models = view.lens === "benchmark" ? points.map((point) => point.model) : query.data.models.filter((model) => visibleLabs.has(model.labId));
    return groupModelsByYear(models);
  }, [points, query.data, view, visibleLabs]);

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

  if (query.isError) return <ErrorState label="Frontier model registry unavailable" onRetry={() => query.refetch()} />;
  if (query.isLoading || !query.data || !view) {
    return <div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-[560px]" /><Skeleton className="h-48" /></div>;
  }

  const registry = query.data;
  const chartHeight = view.lens === "releases" ? 602 : 430;
  const benchmarkConfigs = allOptions.filter((item) => item.benchmark.id === view.benchmarkId);

  return (
    <section className="space-y-5" data-testid="frontier-models">
      <RuleSection
        head="The model race, without the fake master score"
        aside={
          <span className="text-right">
            {registry.summary.modelCount} models · {registry.summary.labCount} labs · Feb 2019 to Jul 2026 · verified through Jul 14, 2026
          </span>
        }
        className="mt-0"
      >
        <p className="max-w-[70ch] text-[13.5px] leading-relaxed text-ink-secondary">
          Every major lab on one release clock. Switch to a capability lens to compare only the
          same benchmark, version, and evaluation setup. A point disappears when the evidence is
          not like-for-like.
        </p>
      </RuleSection>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={chip(view.lens === "releases")} onClick={() => setView({ ...view, lens: "releases", family: null, benchmarkId: null, comparabilityKey: null })} data-testid="frontier-lens-releases">All releases</button>
          <span className="mx-1 h-4 w-px bg-rule" />
          {FAMILIES.map((family) => <button key={family.id} className={chip(view.lens === "benchmark" && view.family === family.id)} onClick={() => chooseFamily(family.id)} data-testid={`frontier-family-${family.id}`}>{family.label}</button>)}
        </div>

        {view.lens === "benchmark" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-[12.5px] text-ink-secondary">
              Exact benchmark
              <select value={view.benchmarkId ?? ""} onChange={(event) => chooseBenchmark(event.target.value)} className="block w-full rounded-sm border border-rule bg-card px-2 py-1.5 text-[13px] text-ink" data-testid="frontier-benchmark">
                {Array.from(new Map(allOptions.map((option) => [option.benchmark.id, option.benchmark])).values()).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-[12.5px] text-ink-secondary">
              Evaluation setup
              <select value={view.comparabilityKey ?? ""} onChange={(event) => setView({ ...view, comparabilityKey: event.target.value })} className="block w-full rounded-sm border border-rule bg-card px-2 py-1.5 text-[13px] text-ink" data-testid="frontier-compare">
                {benchmarkConfigs.map((option) => <option key={option.comparabilityKey} value={option.comparabilityKey}>{option.setting} · {option.modelCount} models / {option.labCount} labs</option>)}
              </select>
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 border-t border-rule pt-3">
          <span className="mr-1 text-[12.5px] text-ink-muted">Labs</span>
          {registry.labs.map((lab) => {
            const active = visibleLabs.has(lab.id);
            return <button key={lab.id} onClick={() => toggleLab(lab.id)} aria-pressed={active} data-testid={`frontier-lab-${lab.id}`} className={`flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[12px] ${active ? "border-rule-strong text-ink" : "border-rule text-ink-muted"}`}><span className="h-1.5 w-1.5 rounded-full" style={{ background: lab.color, opacity: active ? 1 : 0.3 }} />{lab.name}</button>;
          })}
          {view.labIds.length === 0 && <button className="text-[12.5px] font-semibold text-brand-ink" onClick={() => setView({ ...view, labIds: registry.labs.map((lab) => lab.id) })}>Show all labs</button>}
        </div>
      </div>

      {view.labIds.length === 0 ? (
        <div className="border-y border-rule py-10 text-center"><p className="text-[13px] text-ink-secondary">Every lab is hidden.</p><button className="mt-2 text-[12.5px] font-semibold text-brand-ink" onClick={() => setView({ ...view, labIds: registry.labs.map((lab) => lab.id) })}>Show all labs</button></div>
      ) : view.lens === "benchmark" && points.length < 2 ? (
        <div className="border-y border-rule py-5">
          <p className="text-[14px] font-medium text-ink">No like-for-like series is available for this exact evaluation setup.</p>
          <p className="mt-1 text-[13px] text-ink-secondary">The cited value stays visible, but GridTilt will not draw a trend from a single result.</p>
          <div className="mt-4 space-y-2">{points.map((point) => <button key={point.model.id} onClick={() => setView({ ...view, modelId: point.model.id })} className="flex w-full items-center justify-between rounded-sm border border-rule px-3 py-2 text-left hover:border-rule-strong"><span className="text-[13px] text-ink">{point.lab.name} · {point.model.name}</span><span className="text-[14px] font-semibold text-brand-ink tnum">{scoreText(point.result.score, point.result.unit)}</span></button>)}</div>
        </div>
      ) : (
        <div className="hidden overflow-x-auto border border-rule md:block">
          <div ref={chartRef} className="min-h-[430px] w-full">
            <FrontierRelayChart width={Math.max(chartWidth, 860)} height={chartHeight} registry={registry} lens={view.lens} releaseRows={rows} benchmarkPoints={points} benchmark={benchmark} selectedModelId={view.modelId} onSelectModel={(modelId) => setView({ ...view, modelId })} />
          </div>
        </div>
      )}

      <div className="space-y-5 md:hidden" data-testid="frontier-mobile-ledger">
        {mobileGroups.map((group) => <div key={group.year}><div className="sticky top-10 z-10 mb-2 border-b border-rule-strong bg-paper py-1 text-[13px] font-semibold text-ink">{group.year}</div><div className="space-y-1">{group.models.map((model) => { const lab = registry.labs.find((item) => item.id === model.labId)!; const point = points.find((item) => item.model.id === model.id); return <button key={model.id} onClick={() => setView({ ...view, modelId: model.id })} className={`grid w-full grid-cols-[70px_1fr_auto] items-center gap-2 rounded-sm border px-2.5 py-2 text-left ${model.id === view.modelId ? "border-rule-strong bg-paper-shade" : "border-rule"}`}><span className="text-[12px] text-ink-muted tnum">{model.releaseDate.slice(5)}</span><span><span className="block text-[13px] text-ink">{model.name}</span><span className="text-[12px]" style={{ color: lab.color }}>{lab.name}</span></span><span className={point ? "text-[13.5px] font-semibold text-brand-ink tnum" : "text-[12px] text-ink-muted"}>{point ? scoreText(point.result.score, point.result.unit) : model.releaseStatus}</span></button>; })}</div></div>)}
      </div>

      {selected && selectedLab && (
        <div className="relative overflow-hidden border border-rule bg-card" data-testid="frontier-receipt">
          <div className="absolute inset-y-0 left-0 w-0.5" style={{ background: selectedLab.color }} />
          <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.65fr)]">
            <div>
              <p className="text-[12.5px] text-ink-muted">
                <span style={{ color: selectedLab.color }} className="font-semibold">{selectedLab.name}</span>
                {" · "}{monthDay(selected.releaseDate)}{" · "}{STATUS_COPY[selected.releaseStatus]}
              </p>
              <h3 className="mt-1 font-serif font-medium text-[24px] text-ink">{selected.name}</h3>
              <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-ink-secondary">{selected.summary}</p>
              <p className="mt-3 text-[12.5px] text-ink-muted">
                {selected.modalities.join(" + ")} · context {compactContext(selected.contextWindow)} · {selected.inclusionReason.replaceAll("-", " ")}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {selected.sourceIds.map((sourceId) => { const source = sourceMap.get(sourceId); return source ? <a key={sourceId} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-brand-ink no-underline hover:text-ink">{source.publisher} source <ExternalLink className="h-2.5 w-2.5" /></a> : null; })}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ink">Reported evaluations</p>
              {selected.benchmarks.length ? <div className="space-y-2">{[...selected.benchmarks].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))).map((result, index) => { const definition = registry.benchmarks.find((item) => item.id === result.benchmarkId); const source = sourceMap.get(result.sourceId); return <div key={`${result.benchmarkId}-${index}`} className="border-b border-rule pb-2.5 last:border-b-0"><div className="flex items-baseline justify-between gap-3"><span className="text-[13px] text-ink">{definition?.name ?? result.benchmarkId}</span><span className="text-[15px] font-semibold tnum" style={{ color: result.featured ? BRAND.secondary : INK.primary }}>{scoreText(result.score, result.unit)}</span></div><div className="mt-1 text-[12px] leading-relaxed text-ink-muted">{result.setting} · {result.provenance}</div>{source && <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[12px] text-brand-ink no-underline hover:text-ink">evidence ↗</a>}</div>; })}</div> : <p className="border-l-2 border-rule pl-3 text-[12.5px] leading-relaxed text-ink-muted">No exact, settings-complete benchmark record is in this release receipt yet. The release remains in the timeline because its date and frontier relevance are sourced.</p>}
            </div>
          </div>
        </div>
      )}

      <details data-testid="frontier-sources">
        <summary className="cursor-pointer list-none border-b border-rule-strong pb-1.5 text-[14px] font-semibold text-ink">Source ledger · {registry.sources.length} first-party and benchmark records</summary>
        <div className="grid gap-2 p-2 pt-4 sm:grid-cols-2 lg:grid-cols-3">{registry.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="rounded-sm border border-rule p-2.5 no-underline hover:border-rule-strong"><span className="block text-[13px] text-ink">{source.title}</span><span className="mt-1 block text-[12px] text-ink-muted">{source.publisher} · {source.publishedAt} · {source.locator}</span></a>)}</div>
      </details>

      <p className="text-[12.5px] leading-relaxed text-ink-muted">Release inclusion is editorial; scores are not normalized. Lab-reported, benchmark-owner, and independent results are visually distinguished. Exact evaluation settings live in every receipt.</p>

      <SrChartTable caption="Frontier model release ledger" columns={["Date", "Lab", "Model", "Status"]} rows={registry.models.map((model) => [model.releaseDate, registry.labs.find((lab) => lab.id === model.labId)?.name ?? model.labId, model.name, model.releaseStatus])} />
    </section>
  );
}
