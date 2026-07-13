// ─── Live GPU rental price ingestion ────────────────────────────────────────
//
// Replaces the static daily snapshot (which just copied the hand-curated
// current price every day) with real observations from providers that expose
// public, keyless APIs:
//
//   - RunPod GraphQL (api.runpod.io/graphql): secure + community on-demand
//     per-GPU pricing. Stable SKU ids.
//   - Vast.ai marketplace (console.vast.ai/api/v0/bundles): live verified
//     on-demand offers; we take the median of the cheapest verified page,
//     which is how renters actually experience the marketplace.
//
// Models with no live source that day simply record nothing - the curated
// anchors remain, flagged est., and the chart's anchor/interpolation honesty
// handles the gap. Nothing is fabricated on a fetch failure.
//
// Pure parsing/blending is separated from I/O so every decision is unit
// tested with fixture payloads.

export interface LiveObservation {
  provider: "runpod-secure" | "runpod-community" | "vast";
  price: number;
}

export interface LiveModelPrice {
  price: number; // blended (median of observations), 2dp
  low: number;
  high: number;
  sources: string[]; // provider names contributing
  n: number; // observation count
}

// Our model key -> matchers per provider. RunPod ids are exact SKU ids;
// Vast gpu_name values are the marketplace's naming.
export const RUNPOD_MODEL_IDS: Record<string, string[]> = {
  H100: ["NVIDIA H100 80GB HBM3"], // SXM - matches our curated spec (80GB HBM3)
  H200: ["NVIDIA H200"],
  B200: ["NVIDIA B200"],
  B300: ["NVIDIA B300 SXM6 AC"],
  A100: ["NVIDIA A100-SXM4-80GB"],
  MI300X: ["AMD Instinct MI300X OAM"],
};

export const VAST_GPU_NAMES: Record<string, string> = {
  H100: "H100 SXM",
  H200: "H200",
  A100: "A100 SXM4",
  GH200: "GH200 SXM",
  MI300X: "MI300X",
  B200: "B200",
};

// ─── Pure parsing ───────────────────────────────────────────────────────────

export interface RunpodGpuType {
  id: string;
  securePrice: number | null;
  communityPrice: number | null;
}

/**
 * RunPod observations for one model. Community pricing is included only when
 * it is plausibly the same product tier: RunPod pads its list with $0.5
 * placeholder community rows, so anything under 40% of the secure price (or
 * with no secure price to compare against) is dropped.
 */
export function parseRunpod(types: RunpodGpuType[], modelIds: string[]): LiveObservation[] {
  const out: LiveObservation[] = [];
  for (const t of types ?? []) {
    if (!modelIds.includes(t.id)) continue;
    const secure = typeof t.securePrice === "number" && t.securePrice > 0 ? t.securePrice : null;
    if (secure !== null) out.push({ provider: "runpod-secure", price: secure });
    const community = typeof t.communityPrice === "number" && t.communityPrice > 0 ? t.communityPrice : null;
    if (community !== null && secure !== null && community >= 0.4 * secure) {
      out.push({ provider: "runpod-community", price: community });
    }
  }
  return out;
}

export interface VastOffer {
  dph_total: number | null;
}

/**
 * Vast observation: the median dph_total of the returned verified on-demand
 * offers (queried ascending). Median of the cheap page = what a renter
 * actually pays after skipping the too-good-to-be-true head of the book.
 */
export function parseVast(offers: VastOffer[]): LiveObservation[] {
  const prices = (offers ?? [])
    .map((o) => o?.dph_total)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  if (prices.length === 0) return [];
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return [{ provider: "vast", price: round2(median) }];
}

// ─── Blending + sanity ──────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Blend per-provider observations into one recorded price. Guard rail: an
 * observation more than 4x away (either direction) from the curated current
 * price is a bad SKU match or a marketplace glitch, not a price move - real
 * rental prices do not 4x in a day. Dropped observations are counted so the
 * caller can log them.
 */
export function blendLivePrice(
  observations: LiveObservation[],
  curatedCurrent: number | null,
): { blended: LiveModelPrice | null; dropped: number } {
  let dropped = 0;
  const kept = (observations ?? []).filter((o) => {
    if (!(o.price > 0) || !Number.isFinite(o.price)) {
      dropped++;
      return false;
    }
    if (curatedCurrent && curatedCurrent > 0) {
      const ratio = o.price / curatedCurrent;
      if (ratio > 4 || ratio < 0.25) {
        dropped++;
        return false;
      }
    }
    return true;
  });
  if (kept.length === 0) return { blended: null, dropped };
  const prices = kept.map((o) => o.price).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  return {
    blended: {
      price: round2(median),
      low: round2(prices[0]),
      high: round2(prices[prices.length - 1]),
      sources: Array.from(new Set(kept.map((o) => o.provider))),
      n: kept.length,
    },
    dropped,
  };
}

// ─── I/O (thin, injected for tests) ─────────────────────────────────────────

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

export interface ProviderRequestResult<T> {
  ok: boolean;
  items: T[];
  status: number | null;
  error: string | null;
}

export interface ProviderCounts {
  requests: number;
  succeeded: number;
  failed: number;
  observations: number;
}

export interface GpuSweepSummary {
  date: string;
  ok: boolean;
  perProvider: {
    runpod: ProviderCounts;
    vast: ProviderCounts;
  };
  usableModels: number;
}

export interface LiveSweepResult {
  prices: Record<string, LiveModelPrice>;
  summary: GpuSweepSummary;
}

const TIMEOUT_MS = 8_000;

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function easternDateStr(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

export async function fetchRunpodTypes(fetchFn: FetchLike = fetch): Promise<ProviderRequestResult<RunpodGpuType>> {
  const t = withTimeout();
  try {
    const res = await fetchFn("https://api.runpod.io/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "query { gpuTypes { id securePrice communityPrice } }" }),
      signal: t.signal,
    });
    if (!res.ok) {
      const status = res.status ?? null;
      console.error(`gpu-live: runpod request failed: status ${status ?? "unknown"}`);
      return { ok: false, items: [], status, error: `status ${status ?? "unknown"}` };
    }
    const body = (await res.json()) as { data?: { gpuTypes?: RunpodGpuType[] } };
    return { ok: true, items: body?.data?.gpuTypes ?? [], status: res.status ?? null, error: null };
  } catch (error) {
    const message = errorText(error);
    console.error(`gpu-live: runpod request failed: ${message}`);
    return { ok: false, items: [], status: null, error: message };
  } finally {
    t.done();
  }
}

export async function fetchVastOffers(gpuName: string, fetchFn: FetchLike = fetch): Promise<ProviderRequestResult<VastOffer>> {
  const q = {
    gpu_name: { eq: gpuName },
    num_gpus: { eq: 1 },
    rentable: { eq: true },
    verified: { eq: true },
    order: [["dph_total", "asc"]],
    type: "on-demand",
    limit: 50,
  };
  const t = withTimeout();
  try {
    const res = await fetchFn(
      `https://console.vast.ai/api/v0/bundles/?q=${encodeURIComponent(JSON.stringify(q))}`,
      { signal: t.signal },
    );
    if (!res.ok) {
      const status = res.status ?? null;
      console.error(`gpu-live: vast request failed for ${gpuName}: status ${status ?? "unknown"}`);
      return { ok: false, items: [], status, error: `status ${status ?? "unknown"}` };
    }
    const body = (await res.json()) as { offers?: VastOffer[] };
    return { ok: true, items: body?.offers ?? [], status: res.status ?? null, error: null };
  } catch (error) {
    const message = errorText(error);
    console.error(`gpu-live: vast request failed for ${gpuName}: ${message}`);
    return { ok: false, items: [], status: null, error: message };
  } finally {
    t.done();
  }
}

/**
 * One full live sweep: every tracked model, all providers, blended with the
 * sanity guard. Returns only models that produced a usable live price.
 */
export async function fetchLivePrices(
  curated: Array<{ model: string; currentUsdPerHr: number }>,
  fetchFn: FetchLike = fetch,
): Promise<LiveSweepResult> {
  const curatedByModel = new Map(curated.map((c) => [c.model, c.currentUsdPerHr]));
  const models = curated.map((c) => c.model);

  const runpodResult = await fetchRunpodTypes(fetchFn);
  const vastResults = await Promise.all(
    models.map(async (m) => {
      const name = VAST_GPU_NAMES[m];
      if (!name) return null;
      return [m, await fetchVastOffers(name, fetchFn)] as const;
    }),
  );
  const attemptedVast = vastResults.filter((result): result is NonNullable<typeof result> => result !== null);

  const runpodObservations = new Map(
    models.map((model) => [model, parseRunpod(runpodResult.items, RUNPOD_MODEL_IDS[model] ?? [])]),
  );
  const vastObservations = new Map(
    attemptedVast.map(([model, result]) => [model, parseVast(result.items)]),
  );

  const out: Record<string, LiveModelPrice> = {};
  for (const m of models) {
    const obs: LiveObservation[] = [
      ...(runpodObservations.get(m) ?? []),
      ...(vastObservations.get(m) ?? []),
    ];
    const { blended, dropped } = blendLivePrice(obs, curatedByModel.get(m) ?? null);
    if (dropped > 0) console.warn(`gpu-live: dropped ${dropped} outlier observation(s) for ${m}`);
    if (blended) out[m] = blended;
  }

  const runpodCounts: ProviderCounts = {
    requests: 1,
    succeeded: runpodResult.ok ? 1 : 0,
    failed: runpodResult.ok ? 0 : 1,
    observations: Array.from(runpodObservations.values()).reduce((sum, obs) => sum + obs.length, 0),
  };
  const vastCounts: ProviderCounts = {
    requests: attemptedVast.length,
    succeeded: attemptedVast.filter(([, result]) => result.ok).length,
    failed: attemptedVast.filter(([, result]) => !result.ok).length,
    observations: Array.from(vastObservations.values()).reduce((sum, obs) => sum + obs.length, 0),
  };
  return {
    prices: out,
    summary: {
      date: easternDateStr(),
      ok: runpodCounts.failed + vastCounts.failed === 0,
      perProvider: { runpod: runpodCounts, vast: vastCounts },
      usableModels: Object.keys(out).length,
    },
  };
}
