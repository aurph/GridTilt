// Pure math for the Stack page's uranium correlation card.
//
// History: this card used to chart synthetic scatter data generated per
// request with Box-Muller noise tuned to a target r (the "Math.random
// correlation" finding, audit M5). That is gone. The card now plots real
// weekly closes: a physical-uranium proxy (Sprott Physical Uranium Trust)
// on x, CCJ on y, with Pearson r computed from the same observed series.
// Fetching lives in routes.ts; everything here is deterministic and tested.

export interface WeeklyClose {
  date: string; // ISO yyyy-mm-dd (weekly bar date)
  close: number;
}

export interface ScatterPoint {
  date: string;
  uranium: number; // proxy close, $/share
  ccj: number; // stock close, $ (field name kept for the client's chart keys)
}

// Pearson r over two equal-length series. Returns null when the inputs are
// too short (n < 3) or either series has zero variance — the client renders
// "—" instead of a fabricated coefficient.
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  const num = x.reduce((s, v, i) => s + (v - meanX) * (y[i] - meanY), 0);
  const denX = Math.sqrt(x.reduce((s, v) => s + (v - meanX) ** 2, 0));
  const denY = Math.sqrt(y.reduce((s, v) => s + (v - meanY) ** 2, 0));
  if (denX === 0 || denY === 0) return null;
  return num / (denX * denY);
}

// Inner-join two weekly series on their bar date. Yahoo occasionally drops a
// bar for one symbol (halts, OTC gaps), so pairing by index would silently
// shift every later observation — join on date instead.
export function alignByDate(
  a: WeeklyClose[],
  b: WeeklyClose[]
): Array<{ date: string; a: number; b: number }> {
  const bByDate = new Map(b.map((w) => [w.date, w.close]));
  const out: Array<{ date: string; a: number; b: number }> = [];
  for (const w of a) {
    const match = bByDate.get(w.date);
    if (match !== undefined && Number.isFinite(w.close) && Number.isFinite(match)) {
      out.push({ date: w.date, a: w.close, b: match });
    }
  }
  return out;
}

export interface CorrelationResult {
  points: ScatterPoint[];
  r: number | null;
  weeks: number;
}

// Scatter points + Pearson r for one stock against the uranium proxy.
export function buildScatter(
  proxy: WeeklyClose[],
  stock: WeeklyClose[]
): CorrelationResult {
  const aligned = alignByDate(proxy, stock);
  const points = aligned.map((p) => ({
    date: p.date,
    uranium: round2(p.a),
    ccj: round2(p.b),
  }));
  const r = pearson(
    aligned.map((p) => p.a),
    aligned.map((p) => p.b)
  );
  return { points, r: r === null ? null : round3(r), weeks: aligned.length };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
