// ─── Daily index history recorder ────────────────────────────────────────
//
// Appends today's gauge values to server/data/index-history.json so the
// series the validation study needed never has to be reconstructed again.
//
// Two honesty rules baked in:
// 1. Dates are US-Eastern trading dates, not UTC. A 9pm ET check would
//    otherwise label tonight's session as tomorrow.
// 2. `npiEquityLegs` is recorded with the EXACT construction the backtest
//    uses (uranium and policy legs held at par), so the charted line is one
//    consistent methodology end to end. The full live `npi` (which includes
//    uranium spot + policy score) is stored alongside, never spliced into
//    the same line.
//
// Persistence: on autoscale hosts the disk is ephemeral, so in-deploy
// appends can vanish on redeploy. Acceptable: the committed seed restores
// the baseline series each deploy and every value is deterministically
// regenerable from public prices via `npm run backtest:indices`.

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { NPI_WEIGHTS } from "./indices";

const FILE = join(process.cwd(), "server", "data", "index-history.json");

interface HistoryDay {
  date: string;
  aiDemand: number | null;
  gridStress: number | null;
  npiEquityLegs?: number | null; // equity legs only, uranium/policy at par
  npi?: number | null; // full live NPI
}

interface RecorderInput {
  aiPowerIndex: number;
  gridStress: number;
  npiValue: number;
  source: "live" | "static";
  constituents: {
    cegPerf: number;
    vstPerf: number;
    ccjPerf: number;
    nlrPerf: number;
  };
}

// YYYY-MM-DD in America/New_York (en-CA locale formats ISO-style).
function easternDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
}

function easternDow(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(d);
}

function easternHour(d: Date): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(d),
    10,
  );
}

/** Same construction as scripts/backtest-indices.ts npiEquityLegs. */
function npiEquityLegsFrom(c: RecorderInput["constituents"]): number {
  const weighted =
    NPI_WEIGHTS.ceg * c.cegPerf +
    NPI_WEIGHTS.vst * c.vstPerf +
    NPI_WEIGHTS.ccj * c.ccjPerf +
    NPI_WEIGHTS.nlr * c.nlrPerf +
    NPI_WEIGHTS.uranium * 1 +
    NPI_WEIGHTS.policy * 1;
  return parseFloat((100 * weighted).toFixed(1));
}

let lastRecordedDate: string | null = null;

export function recordDailyIndexValues(k: RecorderInput): void {
  try {
    // Static fallback values are placeholders, not observations.
    if (k.source !== "live") return;
    const now = new Date();
    const dow = easternDow(now);
    // Weekend quotes echo Friday's session; don't record duplicates.
    if (dow === "Sat" || dow === "Sun") return;
    // Before ~10am ET the quotes still echo yesterday's close; recording
    // then would label yesterday's session with today's date.
    if (easternHour(now) < 10) return;
    const today = easternDate(now);
    if (lastRecordedDate === today) return;

    const raw = JSON.parse(readFileSync(FILE, "utf-8")) as { days?: HistoryDay[] };
    const days = (raw.days ?? []).filter((d) => d.date !== today);
    days.push({
      date: today,
      aiDemand: parseFloat(k.aiPowerIndex.toFixed(1)),
      gridStress: parseFloat(k.gridStress.toFixed(1)),
      npiEquityLegs: npiEquityLegsFrom(k.constituents),
      npi: k.npiValue,
    });
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
    raw.days = days;
    writeFileSync(FILE, JSON.stringify(raw, null, 2) + "\n");
    lastRecordedDate = today;
  } catch {
    // History logging must never break the request path.
  }
}

export function readIndexHistory(): unknown {
  try {
    return JSON.parse(readFileSync(FILE, "utf-8"));
  } catch {
    return { days: [] };
  }
}
