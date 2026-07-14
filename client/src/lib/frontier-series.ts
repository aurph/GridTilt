export type BenchmarkFamily = "general" | "reasoning" | "coding" | "agents" | "multimodal";
export type BenchmarkUnit = "percent" | "elo" | "index" | "seconds" | "minutes" | "hours";
export type ReleaseStatus = "preview" | "general" | "open-weights" | "restricted";
export type InclusionReason = "flagship" | "frontier-move" | "open-weight-frontier" | "capability-shift";
export type Provenance = "lab" | "benchmark-owner" | "independent";
export type LabGlyph = "circle" | "square" | "diamond" | "triangle" | "hex";

export interface FrontierLab { id: string; name: string; color: string; glyph: LabGlyph; }
export interface FrontierSource { id: string; publisher: string; title: string; url: string; publishedAt: string; accessedAt: string; locator: string; }
export interface BenchmarkDefinition { id: string; name: string; family: BenchmarkFamily; unit: BenchmarkUnit; higherIsBetter: boolean; introducedAt?: string; }
export interface FrontierBenchmarkResult { benchmarkId: string; comparabilityKey: string; score: number; unit: BenchmarkUnit; provenance: Provenance; sourceId: string; setting: string; featured?: boolean; }
export interface FrontierModel { id: string; labId: string; name: string; family: string; releaseDate: string; releaseStatus: ReleaseStatus; inclusionReason: InclusionReason; modalities: string[]; contextWindow: number | null; summary: string; sourceIds: string[]; milestone: boolean; benchmarks: FrontierBenchmarkResult[]; }
export interface FrontierSummary { asOf: string; labCount: number; modelCount: number; sourceCount: number; firstReleaseDate: string | null; lastReleaseDate: string | null; }
export interface FrontierRegistry { asOf: string; methodology: string; summary: FrontierSummary; labs: FrontierLab[]; benchmarks: BenchmarkDefinition[]; sources: FrontierSource[]; models: FrontierModel[]; }

export type FrontierLens = "releases" | "benchmark";
export interface FrontierViewState {
  lens: FrontierLens;
  family: BenchmarkFamily | null;
  benchmarkId: string | null;
  comparabilityKey: string | null;
  labIds: string[];
  modelId: string;
}
export interface ReleaseRow { lab: FrontierLab; models: FrontierModel[]; }
export interface BenchmarkPoint { model: FrontierModel; lab: FrontierLab; result: FrontierBenchmarkResult; t: number; }
export interface YearGroup { year: number; models: FrontierModel[]; }
export interface BenchmarkOption { benchmark: BenchmarkDefinition; comparabilityKey: string; setting: string; modelCount: number; labCount: number; }
export interface LabelCandidate { id: string; x: number; width: number; priority: number; }
export interface TimeDomain { start: number; end: number; }
export interface ScoreDomain { min: number; max: number; ticks: number[]; }

const ISO_DAY = /^20\d\d-\d\d-\d\d$/;

export function parseFrontierDate(value: string): number | null {
  if (!ISO_DAY.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  return timestamp;
}

function compareModels(a: FrontierModel, b: FrontierModel): number {
  return a.releaseDate.localeCompare(b.releaseDate) || a.name.localeCompare(b.name);
}

export function orderLabs(registry: FrontierRegistry): FrontierLab[] {
  const firstRelease = new Map<string, string>();
  for (const model of registry.models) {
    const current = firstRelease.get(model.labId);
    if (!current || model.releaseDate < current) firstRelease.set(model.labId, model.releaseDate);
  }
  return [...registry.labs].sort((a, b) =>
    (firstRelease.get(a.id) ?? "9999-12-31").localeCompare(firstRelease.get(b.id) ?? "9999-12-31") || a.name.localeCompare(b.name),
  );
}

export function releaseRows(registry: FrontierRegistry, visibleLabIds = new Set(registry.labs.map((lab) => lab.id))): ReleaseRow[] {
  return orderLabs(registry)
    .filter((lab) => visibleLabIds.has(lab.id))
    .map((lab) => ({ lab, models: registry.models.filter((model) => model.labId === lab.id).sort(compareModels) }));
}

export function benchmarkSeries(registry: FrontierRegistry, benchmarkId: string, comparabilityKey: string, visibleLabIds: Set<string>): BenchmarkPoint[] {
  const labs = new Map(registry.labs.map((lab) => [lab.id, lab]));
  const points: BenchmarkPoint[] = [];
  for (const model of registry.models) {
    if (!visibleLabIds.has(model.labId)) continue;
    const lab = labs.get(model.labId);
    const result = model.benchmarks.find((item) => item.benchmarkId === benchmarkId && item.comparabilityKey === comparabilityKey);
    const t = parseFrontierDate(model.releaseDate);
    if (lab && result && t !== null) points.push({ model, lab, result, t });
  }
  return points.sort((a, b) => a.t - b.t || a.model.name.localeCompare(b.model.name));
}

export function benchmarkCoverage(registry: FrontierRegistry, benchmarkId: string, comparabilityKey: string): { modelCount: number; labCount: number } {
  const models = registry.models.filter((model) => model.benchmarks.some((result) => result.benchmarkId === benchmarkId && result.comparabilityKey === comparabilityKey));
  return { modelCount: models.length, labCount: new Set(models.map((model) => model.labId)).size };
}

export function benchmarkOptions(registry: FrontierRegistry, family: BenchmarkFamily | null = null): BenchmarkOption[] {
  const definitions = new Map(registry.benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const groups = new Map<string, { benchmarkId: string; comparabilityKey: string; setting: string }>();
  for (const model of registry.models) {
    for (const result of model.benchmarks) {
      const definition = definitions.get(result.benchmarkId);
      if (!definition || (family && definition.family !== family)) continue;
      groups.set(`${result.benchmarkId}\u0000${result.comparabilityKey}`, { benchmarkId: result.benchmarkId, comparabilityKey: result.comparabilityKey, setting: result.setting });
    }
  }
  return Array.from(groups.values()).map((group) => {
    const benchmark = definitions.get(group.benchmarkId)!;
    const coverage = benchmarkCoverage(registry, group.benchmarkId, group.comparabilityKey);
    return { benchmark, comparabilityKey: group.comparabilityKey, setting: group.setting, ...coverage };
  }).sort((a, b) => b.modelCount - a.modelCount || a.benchmark.name.localeCompare(b.benchmark.name) || a.comparabilityKey.localeCompare(b.comparabilityKey));
}

export function groupModelsByYear(models: FrontierModel[]): YearGroup[] {
  const groups = new Map<number, FrontierModel[]>();
  for (const model of models) {
    const timestamp = parseFrontierDate(model.releaseDate);
    if (timestamp === null) continue;
    const year = new Date(timestamp).getUTCFullYear();
    groups.set(year, [...(groups.get(year) ?? []), model]);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, rows]) => ({ year, models: rows.sort(compareModels) }));
}

export function parseFrontierParams(search: string, registry: FrontierRegistry): FrontierViewState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const validLabs = new Set(registry.labs.map((lab) => lab.id));
  const requestedLabs = params.has("labs") ? (params.get("labs") ?? "").split(",").filter((id) => validLabs.has(id)) : Array.from(validLabs);
  const labIds = requestedLabs.length > 0 ? requestedLabs : Array.from(validLabs);
  const familyRaw = params.get("family") as BenchmarkFamily | null;
  const family = registry.benchmarks.some((benchmark) => benchmark.family === familyRaw) ? familyRaw : null;
  const benchmarkIdRaw = params.get("benchmark");
  const benchmarkId = registry.benchmarks.some((benchmark) => benchmark.id === benchmarkIdRaw) ? benchmarkIdRaw : null;
  const keyRaw = params.get("config");
  const comparabilityKey = benchmarkId && keyRaw && registry.models.some((model) => model.benchmarks.some((result) => result.benchmarkId === benchmarkId && result.comparabilityKey === keyRaw)) ? keyRaw : null;
  const lens = params.get("lens") === "benchmark" && benchmarkId && comparabilityKey ? "benchmark" : "releases";
  const availableModels = registry.models.filter((model) => labIds.includes(model.labId)).sort(compareModels);
  const fallbackModel = [...registry.models].sort(compareModels).at(-1);
  const requestedModel = params.get("model");
  const modelId = availableModels.some((model) => model.id === requestedModel) ? requestedModel! : fallbackModel?.id ?? "";
  return { lens, family, benchmarkId: lens === "benchmark" ? benchmarkId : null, comparabilityKey: lens === "benchmark" ? comparabilityKey : null, labIds, modelId };
}

export function frontierSearchParams(state: FrontierViewState, registry: FrontierRegistry): string {
  const params = new URLSearchParams();
  if (state.lens === "benchmark" && state.benchmarkId && state.comparabilityKey) {
    params.set("lens", "benchmark");
    if (state.family) params.set("family", state.family);
    params.set("benchmark", state.benchmarkId);
    params.set("config", state.comparabilityKey);
  }
  const allLabs = registry.labs.map((lab) => lab.id);
  if (state.labIds.length !== allLabs.length || !allLabs.every((id) => state.labIds.includes(id))) params.set("labs", state.labIds.join(","));
  if (state.modelId) params.set("model", state.modelId);
  return params.toString();
}

export function solveFrontierLabels(candidates: LabelCandidate[], minX: number, maxX: number, padding = 8): LabelCandidate[] {
  const accepted: LabelCandidate[] = [];
  for (const candidate of [...candidates].sort((a, b) => b.priority - a.priority || a.x - b.x || a.id.localeCompare(b.id))) {
    const left = Math.max(minX, candidate.x - candidate.width / 2) - padding;
    const right = Math.min(maxX, candidate.x + candidate.width / 2) + padding;
    const overlaps = accepted.some((item) => {
      const itemLeft = Math.max(minX, item.x - item.width / 2) - padding;
      const itemRight = Math.min(maxX, item.x + item.width / 2) + padding;
      return left < itemRight && right > itemLeft;
    });
    if (!overlaps) accepted.push(candidate);
  }
  return accepted.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
}

export function frontierTimeDomain(_models: FrontierModel[], asOf: string): TimeDomain {
  const start = Date.UTC(2019, 1, 14);
  const parsedEnd = parseFrontierDate(asOf);
  return { start, end: parsedEnd !== null && parsedEnd > start ? parsedEnd : start };
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function scoreDomain(points: BenchmarkPoint[], unit: BenchmarkUnit, _higherIsBetter: boolean): ScoreDomain {
  const scores = points.map((point) => point.result.score).filter(Number.isFinite);
  if (scores.length === 0) return unit === "percent" ? { min: 0, max: 100, ticks: [0, 25, 50, 75, 100] } : { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  const observedMin = Math.min(...scores);
  const observedMax = Math.max(...scores);
  let min: number;
  let max: number;
  if (unit === "percent") {
    min = Math.max(0, Math.floor(observedMin - 5));
    max = Math.min(100, Math.ceil(observedMax + 5));
  } else {
    const span = Math.max(1, observedMax - observedMin);
    min = observedMin - span * 0.08;
    max = observedMax + span * 0.08;
  }
  if (max <= min) max = min + 1;
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount }, (_, index) => rounded(min + ((max - min) * index) / (tickCount - 1)));
  return { min: rounded(min), max: rounded(max), ticks };
}

export function modelAriaLabel(model: FrontierModel, lab: FrontierLab): string {
  return `${lab.name} ${model.name}, released ${model.releaseDate}, ${model.releaseStatus}`;
}
