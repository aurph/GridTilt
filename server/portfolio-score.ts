// ─── Basket sector comparison (pure) ─────────────────────────────────────
//
// Scores a list of tickers against GridTilt's editorial sector classifications
// (COMPANY_DATABASE in routes.ts). A ticker the registry does not cover has no
// score: it used to get 8/100, a made-up sector split and a sentence about its
// exposure, and was averaged into the basket as if that were evidence.

export const MAX_TICKERS = 15;

export interface SectorWeights {
  Compute: number;
  Infrastructure: number;
  Power: number;
  Cooling: number;
  Grid: number;
}

export interface CompanyEntry {
  name: string;
  primarySegment: string;
  sectors: SectorWeights;
  explanation: string;
}

export type ScoreResult =
  | {
      ticker: string;
      covered: true;
      name: string;
      score: number;
      sectors: SectorWeights;
      primarySegment: string;
      explanation: string;
    }
  | { ticker: string; covered: false };

export interface BasketScore {
  results: ScoreResult[];
  summary: {
    /** Distinct tickers asked about. */
    requested: number;
    /** Of those, how many the registry classifies. */
    covered: number;
    /** Equal-weight mean over covered tickers only. Null when none are covered. */
    meanScore: number | null;
  };
}

/** Letters and digits, with the dot and dash some share classes use. */
const SYMBOL = /^[A-Z0-9][A-Z0-9.\-]{0,14}$/;

/**
 * Trims, uppercases and de-duplicates a request's ticker list. Anything that is
 * not a list of symbol strings is a validation error, not a server error.
 */
export function normalizeTickerInput(input: unknown): { ok: true; tickers: string[] } | { ok: false; error: string } {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: "tickers must be a non-empty array of ticker symbols" };
  }
  const seen = new Set<string>();
  const tickers: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") return { ok: false, error: "each ticker must be a string" };
    const t = raw.trim().toUpperCase();
    if (!SYMBOL.test(t)) return { ok: false, error: `"${raw.trim().slice(0, 20)}" is not a ticker symbol` };
    if (seen.has(t)) continue;
    seen.add(t);
    tickers.push(t);
  }
  if (tickers.length > MAX_TICKERS) {
    return { ok: false, error: `at most ${MAX_TICKERS} tickers at once` };
  }
  return { ok: true, tickers };
}

/** The editorial score for one covered ticker. Weights are unchanged from the original route. */
export function scoreTicker(ticker: string, db: Record<string, CompanyEntry>): ScoreResult {
  const known = db[ticker];
  if (!known) return { ticker, covered: false };
  const s = known.sectors;
  const score = Math.round(s.Compute * 0.3 + s.Infrastructure * 0.25 + s.Power * 0.25 + s.Cooling * 0.1 + s.Grid * 0.1);
  return {
    ticker,
    covered: true,
    name: known.name,
    score: Math.min(score, 100),
    sectors: s,
    primarySegment: known.primarySegment,
    explanation: known.explanation,
  };
}

/** Scores already-normalized tickers; the mean covers only what the registry classifies. */
export function scoreBasket(tickers: string[], db: Record<string, CompanyEntry>): BasketScore {
  const results = tickers.map((t) => scoreTicker(t, db));
  const covered = results.filter((r): r is Extract<ScoreResult, { covered: true }> => r.covered);
  return {
    results,
    summary: {
      requested: results.length,
      covered: covered.length,
      meanScore: covered.length ? Math.round(covered.reduce((s, r) => s + r.score, 0) / covered.length) : null,
    },
  };
}
