// ─── AI power deals (pure) ───────────────────────────────────────────────
//
// Corporate power procurement for AI: a hyperscaler / AI offtaker contracting a
// generation source (a PPA, a reactor restart, an SMR option). Computed from the
// same interconnection-queue projects, filtered to genuine power-purchase deals
// — the data-center "load" projects themselves live in Compute Frontier, not
// here. Pure function from rows to displayed numbers, unit-tested, thin route.

export interface DealProject {
  id: string;
  projectName: string;
  sponsor: string; // the generator / developer selling the power
  capacityMW: number;
  type: string; // nuclear | solar | wind | gas | hybrid | ...
  iso?: string;
  state?: string;
  status?: string; // active | operational | ...
  category?: string; // ppa | nuclear | generation | load
  expectedOnline?: string;
  offtaker?: string | null; // the AI / hyperscaler buyer (raw, with terms)
  dcRelevant?: boolean;
  sources?: string[];
  notes?: string;
}

export interface DealRow {
  id: string;
  name: string;
  sponsor: string;
  offtaker: string; // normalized buyer
  offtakerRaw: string; // original string (carries the deal terms)
  type: string;
  capacityMW: number;
  iso: string | null;
  state: string | null;
  status: string;
  online: string | null;
  sources: string[];
  notes: string | null;
}

export interface Bucket {
  key: string;
  count: number;
  mw: number;
}

export interface DealMetrics {
  dealCount: number;
  totalContractedMW: number;
  topBuyer: string | null;
  byOfftaker: Bucket[]; // sorted by mw desc
  byType: Bucket[]; // sorted by mw desc
  byStatus: Bucket[];
  rows: DealRow[]; // sorted by capacityMW desc
}

/** Fold buyer-name variants to one canonical label. */
export function normalizeOfftaker(raw: string): string {
  const head = raw.split(/[(,+]/)[0].trim();
  if (/^amazon/i.test(head)) return "Amazon (AWS)";
  if (/^microsoft/i.test(head)) return "Microsoft";
  if (/^google/i.test(head)) return "Google";
  if (/^meta/i.test(head)) return "Meta";
  return head;
}

/** A power deal = an offtaker contracting generation. The DC "load" projects
 *  (the compute sites themselves) are not procurement deals. */
function isPowerDeal(p: DealProject): boolean {
  return !!p.offtaker && p.type !== "load" && p.category !== "load";
}

export function computeDealMetrics(projects: DealProject[]): DealMetrics {
  const rows: DealRow[] = projects
    .filter(isPowerDeal)
    .map((p) => ({
      id: p.id,
      name: p.projectName,
      sponsor: p.sponsor,
      offtaker: normalizeOfftaker(p.offtaker as string),
      offtakerRaw: p.offtaker as string,
      type: p.type,
      capacityMW: p.capacityMW,
      iso: p.iso ?? null,
      state: p.state ?? null,
      status: p.status ?? "active",
      online: p.expectedOnline ?? null,
      sources: p.sources ?? [],
      notes: p.notes ?? null,
    }))
    .sort((a, b) => b.capacityMW - a.capacityMW || a.name.localeCompare(b.name));

  const bucket = (keyFn: (r: DealRow) => string): Bucket[] => {
    const m = new Map<string, Bucket>();
    for (const r of rows) {
      const k = keyFn(r);
      const b = m.get(k) ?? { key: k, count: 0, mw: 0 };
      b.count++;
      b.mw += r.capacityMW;
      m.set(k, b);
    }
    return Array.from(m.values()).sort((a, b) => b.mw - a.mw);
  };

  const byOfftaker = bucket((r) => r.offtaker);

  return {
    dealCount: rows.length,
    totalContractedMW: rows.reduce((s, r) => s + r.capacityMW, 0),
    topBuyer: byOfftaker[0]?.key ?? null,
    byOfftaker,
    byType: bucket((r) => r.type),
    byStatus: bucket((r) => r.status),
    rows,
  };
}
