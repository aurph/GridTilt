import { readFileSync } from "node:fs";
import { join } from "node:path";

export type BenchmarkFamily = "general" | "reasoning" | "coding" | "agents" | "multimodal";
export type BenchmarkUnit = "percent" | "elo" | "index" | "seconds" | "minutes" | "hours";
export type ReleaseStatus = "preview" | "general" | "open-weights" | "restricted";
export type InclusionReason = "flagship" | "frontier-move" | "open-weight-frontier" | "capability-shift";
export type Provenance = "lab" | "benchmark-owner" | "independent";
export type LabGlyph = "circle" | "square" | "diamond" | "triangle" | "hex";

export interface FrontierLab {
  id: string;
  name: string;
  color: string;
  glyph: LabGlyph;
}

export interface FrontierSource {
  id: string;
  publisher: string;
  title: string;
  url: string;
  publishedAt: string;
  accessedAt: string;
  locator: string;
}

export interface BenchmarkDefinition {
  id: string;
  name: string;
  family: BenchmarkFamily;
  unit: BenchmarkUnit;
  higherIsBetter: boolean;
  introducedAt?: string;
}

export interface FrontierBenchmarkResult {
  benchmarkId: string;
  comparabilityKey: string;
  score: number;
  unit: BenchmarkUnit;
  provenance: Provenance;
  sourceId: string;
  setting: string;
  featured?: boolean;
}

export interface FrontierModel {
  id: string;
  labId: string;
  name: string;
  family: string;
  releaseDate: string;
  releaseStatus: ReleaseStatus;
  inclusionReason: InclusionReason;
  modalities: string[];
  contextWindow: number | null;
  summary: string;
  sourceIds: string[];
  milestone: boolean;
  benchmarks: FrontierBenchmarkResult[];
}

export interface FrontierRegistry {
  asOf: string;
  methodology: string;
  labs: FrontierLab[];
  benchmarks: BenchmarkDefinition[];
  sources: FrontierSource[];
  models: FrontierModel[];
}

const ISO_DAY = /^20\d\d-\d\d-\d\d$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UNITS = new Set<BenchmarkUnit>(["percent", "elo", "index", "seconds", "minutes", "hours"]);
const STATUSES = new Set<ReleaseStatus>(["preview", "general", "open-weights", "restricted"]);
const REASONS = new Set<InclusionReason>(["flagship", "frontier-move", "open-weight-frontier", "capability-shift"]);
const PROVENANCE = new Set<Provenance>(["lab", "benchmark-owner", "independent"]);
const GLYPHS = new Set<LabGlyph>(["circle", "square", "diamond", "triangle", "hex"]);
const FAMILIES = new Set<BenchmarkFamily>(["general", "reasoning", "coding", "agents", "multimodal"]);

function isRealDay(value: string): boolean {
  if (!ISO_DAY.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function uniqueIds<T extends { id: string }>(rows: T[], label: string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!ID.test(row.id)) throw new Error(`${label} has invalid id ${row.id}`);
    if (seen.has(row.id)) throw new Error(`${label} has duplicate id ${row.id}`);
    seen.add(row.id);
  }
}

export function validateFrontierRegistry(value: unknown): FrontierRegistry {
  if (!value || typeof value !== "object") throw new Error("frontier registry must be an object");
  const root = value as FrontierRegistry;
  if (!isRealDay(root.asOf)) throw new Error("frontier registry has invalid asOf");
  if (!root.methodology?.trim()) throw new Error("frontier registry needs methodology");
  if (!Array.isArray(root.labs) || !Array.isArray(root.benchmarks) || !Array.isArray(root.sources) || !Array.isArray(root.models)) {
    throw new Error("frontier registry arrays are required");
  }

  uniqueIds(root.labs, "lab");
  uniqueIds(root.benchmarks, "benchmark");
  uniqueIds(root.sources, "source");
  uniqueIds(root.models, "model");

  for (const lab of root.labs) {
    if (!lab.name?.trim() || !/^#[0-9a-f]{6}$/i.test(lab.color) || !GLYPHS.has(lab.glyph)) {
      throw new Error(`lab ${lab.id} has invalid display metadata`);
    }
  }

  const labs = new Set(root.labs.map((item) => item.id));
  const sources = new Set(root.sources.map((item) => item.id));
  const benchmarks = new Map(root.benchmarks.map((item) => [item.id, item]));

  for (const source of root.sources) {
    if (!source.publisher?.trim() || !source.title?.trim() || !source.locator?.trim()) throw new Error(`source ${source.id} has incomplete metadata`);
    if (!/^https:\/\//.test(source.url)) throw new Error(`source ${source.id} needs https URL`);
    if (!isRealDay(source.publishedAt) || !isRealDay(source.accessedAt)) throw new Error(`source ${source.id} has invalid date`);
  }

  for (const benchmark of root.benchmarks) {
    if (!benchmark.name?.trim() || !FAMILIES.has(benchmark.family) || !UNITS.has(benchmark.unit)) {
      throw new Error(`benchmark ${benchmark.id} has invalid metadata`);
    }
    if (benchmark.introducedAt && !isRealDay(benchmark.introducedAt)) throw new Error(`benchmark ${benchmark.id} has invalid introduction date`);
  }

  for (const model of root.models) {
    if (!labs.has(model.labId)) throw new Error(`model ${model.id} references missing lab ${model.labId}`);
    if (!isRealDay(model.releaseDate) || model.releaseDate > root.asOf) throw new Error(`model ${model.id} has invalid release date`);
    if (!STATUSES.has(model.releaseStatus)) throw new Error(`model ${model.id} has invalid release status`);
    if (!REASONS.has(model.inclusionReason)) throw new Error(`model ${model.id} has invalid inclusion reason`);
    if (!model.name?.trim() || !model.family?.trim() || !model.summary?.trim()) throw new Error(`model ${model.id} has incomplete metadata`);
    if (!Array.isArray(model.modalities) || model.modalities.length === 0) throw new Error(`model ${model.id} needs modalities`);
    if (model.contextWindow !== null && (!Number.isInteger(model.contextWindow) || model.contextWindow <= 0)) {
      throw new Error(`model ${model.id} has invalid context window`);
    }
    if (!Array.isArray(model.sourceIds) || model.sourceIds.length === 0) throw new Error(`model ${model.id} needs a release source`);
    for (const sourceId of model.sourceIds) {
      if (!sources.has(sourceId)) throw new Error(`model ${model.id} references missing source ${sourceId}`);
    }
    if (!Array.isArray(model.benchmarks)) throw new Error(`model ${model.id} needs benchmark array`);
    for (const result of model.benchmarks) {
      const benchmark = benchmarks.get(result.benchmarkId);
      if (!benchmark) throw new Error(`model ${model.id} references missing benchmark ${result.benchmarkId}`);
      if (!sources.has(result.sourceId)) throw new Error(`model ${model.id} result references missing source ${result.sourceId}`);
      if (!Number.isFinite(result.score)) throw new Error(`model ${model.id} result has non-finite score`);
      if (!UNITS.has(result.unit) || result.unit !== benchmark.unit) throw new Error(`model ${model.id} result unit disagrees with ${benchmark.id}`);
      if (!PROVENANCE.has(result.provenance)) throw new Error(`model ${model.id} result has invalid provenance`);
      if (!result.comparabilityKey.startsWith(`${benchmark.id}:`)) throw new Error(`model ${model.id} result has invalid comparability key`);
      if (!result.setting?.trim()) throw new Error(`model ${model.id} result needs setting`);
    }
  }

  return root;
}

export function readFrontierRegistry(): FrontierRegistry {
  const path = join(process.cwd(), "server", "data", "frontier-models.json");
  return validateFrontierRegistry(JSON.parse(readFileSync(path, "utf-8")));
}

export function summarizeFrontierRegistry(registry: FrontierRegistry) {
  const dates = registry.models.map((model) => model.releaseDate).sort();
  return {
    asOf: registry.asOf,
    labCount: registry.labs.length,
    modelCount: registry.models.length,
    sourceCount: registry.sources.length,
    firstReleaseDate: dates[0] ?? null,
    lastReleaseDate: dates.at(-1) ?? null,
  };
}
