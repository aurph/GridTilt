// ─── AI power agreements (pure) ──────────────────────────────────────────
//
// Corporate power procurement for AI: a hyperscaler or AI company buying power
// from a generator. Computed from the interconnection-queue projects, filtered
// to agreements; the data-center "load" projects live in Compute Frontier.
//
// Agreements differ in how binding they are, and the page used to add them all
// into one "contracted" figure: letters of intent, "up to" frameworks, a
// company-wide portfolio beside the deals inside it. Every figure here is
// scoped to one agreement status and is never added across statuses. A status
// counts only when the row names the document that establishes it and the
// date it was reviewed; anything else is "unreviewed".

export const FIRMNESS_VALUES = [
  "signed", // a definitive agreement or completed acquisition
  "framework", // a signed master agreement for up to X, project contracts to follow
  "option", // the buyer may, but need not, purchase
  "preliminary", // LOI, MOU, non-binding agreement, terms agreed pending documents
  "portfolio", // a company-reported total across many agreements
  "not-ai-offtake", // the power is not contracted to an AI or data-center buyer
] as const;
export type Firmness = (typeof FIRMNESS_VALUES)[number];

export const ASSET_VALUES = ["existing", "restart", "uprate", "new-build", "mixed"] as const;
export type AssetBasis = (typeof ASSET_VALUES)[number];

export interface DealProject {
  id: string;
  projectName: string;
  sponsor: string; // the generator / developer selling the power
  /** MW as disclosed. Null when the parties have not disclosed it. */
  capacityMW: number | null;
  type: string; // nuclear | solar | wind | gas | hybrid | ...
  iso?: string;
  state?: string;
  status?: string; // active | operational | ...
  category?: string; // ppa | generation | aggregate | load
  expectedOnline?: string | null;
  offtaker?: string | null; // the AI / hyperscaler buyer (raw, with terms)
  dcRelevant?: boolean;
  sources?: string[];
  notes?: string;
  // Review fields. Set only from a primary document, never by inference.
  firmness?: Firmness;
  /** URL of the document that establishes `firmness`. */
  firmnessSource?: string;
  /** YYYY-MM-DD the row was checked against that document. Not a fetch date. */
  reviewed?: string;
  asset?: AssetBasis;
  /** Ids of rows whose capacity is inside this one (a plant inside its framework). */
  includes?: string[];
  /** The capacity is a ceiling ("up to"), not a contract quantity. */
  upTo?: boolean;
}

export type FirmnessKey = Firmness | "unreviewed";

export interface DealRow {
  id: string;
  name: string;
  sponsor: string;
  offtaker: string; // normalized buyer
  offtakerRaw: string; // original string (carries the deal terms)
  type: string;
  capacityMW: number | null;
  iso: string | null;
  state: string | null;
  status: string;
  online: string | null;
  sources: string[];
  notes: string | null;
  firmness: FirmnessKey;
  firmnessSource: string | null;
  reviewed: string | null;
  asset: AssetBasis | null;
  upTo: boolean;
  /** A portfolio or aggregate: listed, never added to the rows inside it. */
  aggregate: boolean;
  includes: string[];
}

export interface Bucket {
  key: string;
  count: number;
  /** Sum of disclosed MW. Rows with undisclosed capacity add to `undisclosed`, not to this. */
  mw: number;
  undisclosed: number;
}

export interface DealMetrics {
  /** Rows listed, of every status. Not a count of contracts. */
  rowCount: number;
  /** Signed agreements only, each counted once. */
  signed: Bucket;
  /** Frameworks and options together: stated ceilings, each MW counted once. Not signed. */
  frameworksAndOptions: Bucket;
  /** One subtotal per status. Subtotals overlap (a framework can include a signed plant); never add them. */
  byFirmness: Bucket[];
  signedByBuyer: Bucket[]; // sorted by mw desc
  signedByType: Bucket[]; // sorted by mw desc
  signedByAsset: Bucket[]; // existing / restart / uprate / new-build / mixed / not stated
  topSignedBuyer: string | null;
  rows: DealRow[]; // sorted by capacity desc, undisclosed last
}

/** Fold buyer-name variants to one canonical label. Buyers that are not
 *  public fold into two honest buckets so the chart doesn't grow a new
 *  near-duplicate slot per anonymous deal ("Undisclosed hyperscaler",
 *  "Unnamed PA datacenter", ...). Rows keep the raw string. */
export function normalizeOfftaker(raw: string): string {
  const head = raw.split(/[(,+]/)[0].trim();
  if (/^amazon/i.test(head)) return "Amazon (AWS)";
  if (/^microsoft/i.test(head)) return "Microsoft";
  if (/^google/i.test(head)) return "Google";
  if (/^meta/i.test(head)) return "Meta";
  if (/^(undisclosed|unnamed|two undisclosed)/i.test(head)) return "Undisclosed buyers";
  if (/^(multiple|hyperscale data centers)/i.test(head)) return "Multiple buyers";
  return head;
}

const REVIEW_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The status a row has earned: a recorded status with its document and date, else unreviewed. */
export function effectiveFirmness(p: DealProject): FirmnessKey {
  if (!p.firmness || !(FIRMNESS_VALUES as readonly string[]).includes(p.firmness)) return "unreviewed";
  if (!p.firmnessSource?.startsWith("https://")) return "unreviewed";
  if (!REVIEW_DATE.test(p.reviewed ?? "")) return "unreviewed";
  return p.firmness;
}

/** An agreement row: has a buyer, is not a data-center load, is not grid supply. */
function isPowerAgreement(p: DealProject): boolean {
  if (!p.offtaker || p.type === "load" || p.category === "load") return false;
  return effectiveFirmness(p) !== "not-ai-offtake";
}

const FIRMNESS_ORDER: FirmnessKey[] = ["signed", "framework", "option", "preliminary", "portfolio", "unreviewed"];

function toRow(p: DealProject): DealRow {
  const firmness = effectiveFirmness(p);
  const unreviewed = firmness === "unreviewed";
  return {
    id: p.id,
    name: p.projectName,
    sponsor: p.sponsor,
    offtaker: normalizeOfftaker(p.offtaker as string),
    offtakerRaw: p.offtaker as string,
    type: p.type,
    capacityMW: typeof p.capacityMW === "number" && Number.isFinite(p.capacityMW) ? p.capacityMW : null,
    iso: p.iso ?? null,
    state: p.state ?? null,
    status: p.status ?? "active",
    online: p.expectedOnline ?? null,
    sources: p.sources ?? [],
    notes: p.notes ?? null,
    firmness,
    firmnessSource: unreviewed ? null : p.firmnessSource ?? null,
    reviewed: unreviewed ? null : p.reviewed ?? null,
    asset: unreviewed ? null : p.asset ?? null,
    upTo: p.upTo === true,
    aggregate: p.category === "aggregate" || firmness === "portfolio",
    includes: p.includes ?? [],
  };
}

/** Rows not contained in another row of the same set, so a subtotal counts each MW once. */
function uniqueWithin(rows: DealRow[]): DealRow[] {
  const nested = new Set(rows.flatMap((r) => r.includes));
  return rows.filter((r) => !nested.has(r.id));
}

function sumBucket(key: string, rows: DealRow[]): Bucket {
  const b: Bucket = { key, count: 0, mw: 0, undisclosed: 0 };
  for (const r of rows) {
    b.count++;
    if (r.capacityMW === null) b.undisclosed++;
    else b.mw += r.capacityMW;
  }
  return b;
}

function bucketBy(rows: DealRow[], keyFn: (r: DealRow) => string): Bucket[] {
  const groups = new Map<string, DealRow[]>();
  for (const r of rows) {
    const k = keyFn(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return Array.from(groups.entries())
    .map(([k, rs]) => sumBucket(k, rs))
    .sort((a, b) => b.mw - a.mw || a.key.localeCompare(b.key));
}

export function computeDealMetrics(projects: DealProject[]): DealMetrics {
  const rows: DealRow[] = projects
    .filter(isPowerAgreement)
    .map(toRow)
    .sort((a, b) => (b.capacityMW ?? -1) - (a.capacityMW ?? -1) || a.name.localeCompare(b.name));

  const byFirmness = FIRMNESS_ORDER.map((k) =>
    sumBucket(k, uniqueWithin(rows.filter((r) => r.firmness === k))),
  ).filter((b) => b.count > 0);

  const signedRows = uniqueWithin(rows.filter((r) => r.firmness === "signed" && !r.aggregate));
  const signedByBuyer = bucketBy(signedRows, (r) => r.offtaker);

  return {
    rowCount: rows.length,
    signed: sumBucket("signed", signedRows),
    frameworksAndOptions: sumBucket(
      "framework-or-option",
      uniqueWithin(rows.filter((r) => r.firmness === "framework" || r.firmness === "option")),
    ),
    byFirmness,
    signedByBuyer,
    signedByType: bucketBy(signedRows, (r) => r.type),
    signedByAsset: bucketBy(signedRows, (r) => r.asset ?? "not stated"),
    topSignedBuyer: signedByBuyer[0]?.key ?? null,
    rows,
  };
}

// ─── Admin writes ────────────────────────────────────────────────────────

const REVIEW_FIELDS = ["firmness", "firmnessSource", "reviewed", "asset", "includes", "upTo"] as const;
/** The facts a review is checked against. Changing any of them voids the review. */
const REVIEWED_FACTS = ["capacityMW", "offtaker", "sponsor", "type"] as const;

/**
 * The admin "add or update project" write. It used to replace a stored project
 * with a fixed field list, which silently dropped every other field. Now it
 * keeps fields the request does not mention, and keeps a review only while the
 * facts it was checked against are unchanged, unless the request carries a
 * newer review of its own.
 */
export function mergeBacklogProjectUpdate(existing: DealProject | undefined, incoming: DealProject): DealProject {
  // A field the request left out arrives as undefined; it must not erase the stored value.
  const given = Object.fromEntries(
    Object.entries(incoming).filter(([, v]) => v !== undefined),
  ) as unknown as DealProject;
  if (!existing) return { ...given };
  const merged: DealProject = { ...existing, ...given };
  const factsChanged = REVIEWED_FACTS.some((k) => (existing[k] ?? null) !== (merged[k] ?? null));
  const newerReview = !!incoming.reviewed && !!existing.reviewed && incoming.reviewed > existing.reviewed;
  if (factsChanged && !newerReview) {
    for (const k of REVIEW_FIELDS) delete merged[k];
  }
  return merged;
}
