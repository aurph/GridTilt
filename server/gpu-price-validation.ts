// ─── GPU price refresh validation gate (pure) ────────────────────────────
//
// The weekly agentic refresh (ops/prompts/gpu-price-refresh.md, run by
// .github/workflows/gpu-price-refresh.yml) may only ship what passes this
// gate. The gate is code, not judgment: an agent that hallucinates a price,
// drops a source, rewrites history, or slips a wild move gets its run
// failed, and nothing reaches a PR. Rules carried over from the original
// n8n refresh design (ops/n8n/gpu-price-refresh.json):
//
//   - the model set is fixed (adding/removing accelerators is human work)
//   - prices are positive and inside their own observed low..high band
//   - every model keeps >= 2 sources, https only
//   - estimated[] flags never silently shrink
//   - history anchors are append-only: the past is immutable
//   - no price moves more than 60% in one refresh (block, don't average)
//   - asOf only moves forward

export interface GpuPriceModel {
  model: string;
  currentUsdPerHr: number;
  low: number;
  high: number;
  asOf: string;
  historyAnchors: Array<{ date: string; price: number }>;
  estimated: string[];
  confidence: string;
  sources: string[];
}

export interface GpuPriceFile {
  lastRefreshed: string;
  unit: string;
  methodology: string;
  models: GpuPriceModel[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const CONFIDENCE = new Set(["low", "medium", "high"]);
const MAX_MOVE = 0.6;

export function validateGpuPrices(next: GpuPriceFile, prev: GpuPriceFile): ValidationResult {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);

  if (next.unit !== prev.unit) err(`unit changed: "${prev.unit}" -> "${next.unit}"`);
  if (!next.methodology?.trim()) err("methodology is empty");
  if (!next.lastRefreshed || next.lastRefreshed < prev.lastRefreshed) {
    err(`lastRefreshed went backwards: ${prev.lastRefreshed} -> ${next.lastRefreshed}`);
  }

  const prevBy = new Map(prev.models.map((m) => [m.model, m]));
  const nextBy = new Map(next.models.map((m) => [m.model, m]));
  for (const name of Array.from(prevBy.keys())) {
    if (!nextBy.has(name)) err(`model removed: ${name} (model-set changes are human work)`);
  }
  for (const name of Array.from(nextBy.keys())) {
    if (!prevBy.has(name)) err(`model added: ${name} (model-set changes are human work)`);
  }

  for (const m of next.models) {
    const p = prevBy.get(m.model);
    const tag = m.model;

    if (!(m.low > 0 && m.currentUsdPerHr > 0 && m.high > 0)) {
      err(`${tag}: non-positive price fields`);
    }
    if (!(m.low <= m.currentUsdPerHr && m.currentUsdPerHr <= m.high)) {
      err(`${tag}: current ${m.currentUsdPerHr} outside its own band ${m.low}..${m.high}`);
    }
    if (!Array.isArray(m.sources) || m.sources.length < 2) {
      err(`${tag}: needs at least 2 sources, has ${m.sources?.length ?? 0}`);
    }
    for (const s of m.sources ?? []) {
      if (!/^https:\/\//.test(s)) err(`${tag}: non-https source: ${s}`);
    }
    if (!CONFIDENCE.has(m.confidence)) err(`${tag}: bad confidence "${m.confidence}"`);

    if (!p) continue; // already reported as an added model

    for (const f of p.estimated) {
      if (!m.estimated.includes(f)) err(`${tag}: estimated flag silently dropped: ${f}`);
    }

    const move = Math.abs(m.currentUsdPerHr - p.currentUsdPerHr) / p.currentUsdPerHr;
    if (move > MAX_MOVE) {
      err(
        `${tag}: price moved ${(move * 100).toFixed(0)}% (${p.currentUsdPerHr} -> ${m.currentUsdPerHr}); ` +
          `moves over ${MAX_MOVE * 100}% are blocked for human review`,
      );
    }

    if (m.asOf < p.asOf) err(`${tag}: asOf went backwards: ${p.asOf} -> ${m.asOf}`);

    // Anchors append-only: prev's anchors must be an unchanged prefix.
    const pa = p.historyAnchors ?? [];
    const na = m.historyAnchors ?? [];
    if (na.length < pa.length) {
      err(`${tag}: history anchors shrank (${pa.length} -> ${na.length}); the past is immutable`);
    } else {
      for (let i = 0; i < pa.length; i++) {
        if (na[i]?.date !== pa[i].date || na[i]?.price !== pa[i].price) {
          err(`${tag}: history anchor ${i} rewritten (${pa[i].date} ${pa[i].price} -> ${na[i]?.date} ${na[i]?.price})`);
          break;
        }
      }
      const lastPrev = pa[pa.length - 1];
      for (const a of na.slice(pa.length)) {
        if (lastPrev && a.date < lastPrev.date) err(`${tag}: new anchor ${a.date} predates existing history`);
        if (!(a.price > 0)) err(`${tag}: new anchor with non-positive price`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
