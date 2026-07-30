// ─── Frontier inference pricing (pure) ────────────────────────────────────
//
// The demand side of the buildout: what frontier labs charge to run a model,
// per million tokens. Curated, cited, hand-maintained like frontier-models.json
// (code never writes this file). Every price carries the provider's official
// pricing page and the date it was read. Blended price is a stated-assumption
// comparison aid (input:output token mix), never presented as a quote.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export type PriceTier = "flagship" | "mid" | "efficient";

export interface PriceLab {
  id: string;
  name: string;
  color: string;
}

export interface PriceSource {
  id: string;
  publisher: string;
  title: string;
  url: string;
  publishedAt: string;
  accessedAt: string;
  locator: string;
}

export interface InferencePriceModel {
  id: string;
  labId: string;
  name: string;
  tier: PriceTier;
  inputPerMTok: number;
  outputPerMTok: number;
  sourceId: string;
  note?: string;
}

export interface PriceEvent {
  id: string;
  date: string;
  headline: string;
  sourceIds: string[];
}

export interface InferencePriceRegistry {
  asOf: string;
  methodology: string;
  blendRatioInput: number;
  blendRatioOutput: number;
  labs: PriceLab[];
  sources: PriceSource[];
  models: InferencePriceModel[];
  events: PriceEvent[];
}

const ISO_DAY = /^20\d\d-\d\d-\d\d$/;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TIERS = new Set<PriceTier>(["flagship", "mid", "efficient"]);

function round2(n: number): number {
  return parseFloat(n.toFixed(2));
}

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

/** Blended $/M under a stated input:output token mix. */
export function blendedPrice(input: number, output: number, weightIn: number, weightOut: number): number {
  const total = weightIn + weightOut;
  if (total <= 0) throw new Error("blend weights must sum above zero");
  return round2((input * weightIn + output * weightOut) / total);
}

export function validateInferencePrices(value: unknown): InferencePriceRegistry {
  if (!value || typeof value !== "object") throw new Error("inference prices must be an object");
  const root = value as InferencePriceRegistry;
  if (!isRealDay(root.asOf)) throw new Error("inference prices has invalid asOf");
  if (!root.methodology?.trim()) throw new Error("inference prices needs methodology");
  if (!(root.blendRatioInput > 0) || !(root.blendRatioOutput > 0)) throw new Error("inference prices needs positive blend ratios");
  if (!Array.isArray(root.labs) || !Array.isArray(root.sources) || !Array.isArray(root.models) || !Array.isArray(root.events)) {
    throw new Error("inference prices arrays are required");
  }

  uniqueIds(root.labs, "lab");
  uniqueIds(root.sources, "source");
  uniqueIds(root.models, "model");
  uniqueIds(root.events, "event");

  for (const lab of root.labs) {
    if (!lab.name?.trim() || !/^#[0-9a-f]{6}$/i.test(lab.color)) throw new Error(`lab ${lab.id} has invalid display metadata`);
  }

  const labs = new Set(root.labs.map((item) => item.id));
  const sources = new Set(root.sources.map((item) => item.id));

  for (const source of root.sources) {
    if (!source.publisher?.trim() || !source.title?.trim() || !source.locator?.trim()) throw new Error(`source ${source.id} has incomplete metadata`);
    if (!/^https:\/\//.test(source.url)) throw new Error(`source ${source.id} needs https URL`);
    if (!isRealDay(source.publishedAt) || !isRealDay(source.accessedAt)) throw new Error(`source ${source.id} has invalid date`);
  }

  if (root.models.length === 0) throw new Error("inference prices needs at least one model");
  for (const model of root.models) {
    if (!labs.has(model.labId)) throw new Error(`model ${model.id} references missing lab ${model.labId}`);
    if (!sources.has(model.sourceId)) throw new Error(`model ${model.id} references missing source ${model.sourceId}`);
    if (!model.name?.trim()) throw new Error(`model ${model.id} has no name`);
    if (!TIERS.has(model.tier)) throw new Error(`model ${model.id} has invalid tier ${model.tier}`);
    if (!Number.isFinite(model.inputPerMTok) || model.inputPerMTok < 0) throw new Error(`model ${model.id} has invalid input price`);
    if (!Number.isFinite(model.outputPerMTok) || model.outputPerMTok < 0) throw new Error(`model ${model.id} has invalid output price`);
    if (model.note !== undefined && !model.note.trim()) throw new Error(`model ${model.id} has empty note`);
  }

  for (const event of root.events) {
    if (!isRealDay(event.date) || event.date > root.asOf) throw new Error(`event ${event.id} has invalid date`);
    if (!event.headline?.trim()) throw new Error(`event ${event.id} has no headline`);
    if (!Array.isArray(event.sourceIds) || event.sourceIds.length === 0) throw new Error(`event ${event.id} needs a source`);
    for (const sourceId of event.sourceIds) {
      if (!sources.has(sourceId)) throw new Error(`event ${event.id} references missing source ${sourceId}`);
    }
  }

  return root;
}

export function readInferencePrices(): InferencePriceRegistry {
  const path = join(process.cwd(), "server", "data", "inference-prices.json");
  return validateInferencePrices(JSON.parse(readFileSync(path, "utf-8")));
}

export interface InferencePriceRow extends InferencePriceModel {
  labName: string;
  labColor: string;
  blendedPerMTok: number;
  source: PriceSource;
}

export interface InferencePriceView {
  asOf: string;
  methodology: string;
  blend: { input: number; output: number };
  labs: PriceLab[];
  sources: PriceSource[];
  events: PriceEvent[];
  rows: InferencePriceRow[];
  cheapestId: string | null;
  priciestId: string | null;
}

/** Join each model to its lab and source, compute blended $/M, sort cheapest first. */
export function buildInferencePriceView(registry: InferencePriceRegistry): InferencePriceView {
  const labById = new Map(registry.labs.map((lab) => [lab.id, lab]));
  const sourceById = new Map(registry.sources.map((source) => [source.id, source]));

  const rows: InferencePriceRow[] = registry.models
    .map((model) => {
      const lab = labById.get(model.labId)!;
      return {
        ...model,
        labName: lab.name,
        labColor: lab.color,
        blendedPerMTok: blendedPrice(model.inputPerMTok, model.outputPerMTok, registry.blendRatioInput, registry.blendRatioOutput),
        source: sourceById.get(model.sourceId)!,
      };
    })
    .sort((a, b) => a.blendedPerMTok - b.blendedPerMTok || a.name.localeCompare(b.name));

  return {
    asOf: registry.asOf,
    methodology: registry.methodology,
    blend: { input: registry.blendRatioInput, output: registry.blendRatioOutput },
    labs: registry.labs,
    sources: registry.sources,
    events: registry.events,
    rows,
    cheapestId: rows[0]?.id ?? null,
    priciestId: rows.at(-1)?.id ?? null,
  };
}
