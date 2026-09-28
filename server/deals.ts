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
  /** The part of `mw` stated as a ceiling ("up to"), not a contracted quantity. */
  upToMW: number;
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
  const b: Bucket = { key, count: 0, mw: 0, undisclosed: 0, upToMW: 0 };
  for (const r of rows) {
    b.count++;
    if (r.capacityMW === null) b.undisclosed++;
    else {
      b.mw += r.capacityMW;
      if (r.upTo) b.upToMW += r.capacityMW;
    }
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

/**
 * Subtotals by status for any set of rows, such as the agreements Compute
 * Frontier links to clusters. Same rules as the deals page: a row nested in
 * another row of the same status counts once, an undisclosed size is counted
 * apart instead of as 0, and company-wide aggregates stay out of "signed".
 * The buckets overlap by design; never add them together.
 */
export function subtotalsByStatus(projects: DealProject[]): { byFirmness: Bucket[]; signed: Bucket } {
  const rows = projects.map((p) => toRow({ ...p, offtaker: p.offtaker ?? "" }));
  const order: FirmnessKey[] = [...FIRMNESS_VALUES, "unreviewed"];
  const byFirmness = order
    .map((k) => sumBucket(k, uniqueWithin(rows.filter((r) => r.firmness === k))))
    .filter((b) => b.count > 0);
  const signed = sumBucket("signed", uniqueWithin(rows.filter((r) => r.firmness === "signed" && !r.aggregate)));
  return { byFirmness, signed };
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
 * facts it was checked against are unchanged, unless the request carries its
 * own review: the row's first, or one dated after the stored review. A request
 * that echoes the stored review date with a changed fact loses the review, so
 * a same-day correction is two requests: the fact, then the review.
 */
export function mergeBacklogProjectUpdate(existing: DealProject | undefined, incoming: DealProject): DealProject {
  // A field the request left out arrives as undefined; it must not erase the stored value.
  const given = Object.fromEntries(
    Object.entries(incoming).filter(([, v]) => v !== undefined),
  ) as unknown as DealProject;
  if (!existing) return { ...given };
  const merged: DealProject = { ...existing, ...given };
  const factsChanged = REVIEWED_FACTS.some((k) => (existing[k] ?? null) !== (merged[k] ?? null));
  const reviewedNow = !!incoming.reviewed && (!existing.reviewed || incoming.reviewed > existing.reviewed);
  if (factsChanged && !reviewedNow) {
    for (const k of REVIEW_FIELDS) delete merged[k];
  }
  return merged;
}

export const BACKLOG_TYPES = [
  "nuclear", "gas", "solar", "wind", "storage", "hybrid", "load", "other",
  "geothermal", "utility", "fusion", "hydro",
] as const;
export const BACKLOG_CATEGORIES = ["generation", "load", "ppa", "aggregate", "regulatory"] as const;
export const BACKLOG_STATUSES = ["active", "withdrawn", "operational"] as const;

const REQUIRED_TEXT = ["projectName", "sponsor", "iso", "state"] as const;

/**
 * Validates the admin add-or-update body for one row. A field the request
 * leaves out comes back undefined, so mergeBacklogProjectUpdate keeps the
 * stored value; only a new row gets status "active" and dcRelevant false.
 * capacityMW must be sent, as a number or as null when it is undisclosed.
 */
export function parseBacklogProjectRequest(
  body: unknown,
  id: string,
  isNew: boolean,
): { ok: true; project: DealProject } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "body must be a JSON object" };
  const b = body as Record<string, unknown>;
  for (const k of REQUIRED_TEXT) {
    if (typeof b[k] !== "string" || (b[k] as string).trim() === "") {
      return { ok: false, error: `missing required field: ${k}` };
    }
  }
  if (!("capacityMW" in b) || b.capacityMW === undefined) {
    return { ok: false, error: "missing required field: capacityMW (a number, or null when undisclosed)" };
  }
  if (b.capacityMW !== null && (typeof b.capacityMW !== "number" || !Number.isFinite(b.capacityMW) || b.capacityMW < 0)) {
    return { ok: false, error: "capacityMW must be a non-negative number, or null when undisclosed" };
  }
  if (!(BACKLOG_TYPES as readonly unknown[]).includes(b.type)) {
    return { ok: false, error: `type must be one of: ${BACKLOG_TYPES.join(", ")}` };
  }
  if (!(BACKLOG_CATEGORIES as readonly unknown[]).includes(b.category)) {
    return { ok: false, error: `category must be one of: ${BACKLOG_CATEGORIES.join(", ")}` };
  }
  if (b.status !== undefined && !(BACKLOG_STATUSES as readonly unknown[]).includes(b.status)) {
    return { ok: false, error: `status must be one of: ${BACKLOG_STATUSES.join(", ")}` };
  }
  if (b.dcRelevant !== undefined && typeof b.dcRelevant !== "boolean") {
    return { ok: false, error: "dcRelevant must be true or false" };
  }
  for (const k of ["expectedOnline", "offtaker"] as const) {
    if (b[k] !== undefined && b[k] !== null && typeof b[k] !== "string") {
      return { ok: false, error: `${k} must be a string or null` };
    }
  }
  if (b.sources !== undefined && (!Array.isArray(b.sources) || !b.sources.every((x) => typeof x === "string"))) {
    return { ok: false, error: "sources must be an array of URLs" };
  }
  if (b.notes !== undefined && typeof b.notes !== "string") return { ok: false, error: "notes must be a string" };

  // Review fields are optional, but a status must arrive with the document
  // that establishes it and the date it was checked.
  const review: Partial<DealProject> = {};
  if (b.firmness !== undefined) {
    if (!(FIRMNESS_VALUES as readonly unknown[]).includes(b.firmness)) {
      return { ok: false, error: `firmness must be one of: ${FIRMNESS_VALUES.join(", ")}` };
    }
    if (typeof b.firmnessSource !== "string" || !b.firmnessSource.startsWith("https://")) {
      return { ok: false, error: "firmness needs firmnessSource, an https URL of the document that establishes it" };
    }
    if (typeof b.reviewed !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.reviewed)) {
      return { ok: false, error: "firmness needs reviewed, the YYYY-MM-DD it was checked" };
    }
    review.firmness = b.firmness as Firmness;
    review.firmnessSource = b.firmnessSource;
    review.reviewed = b.reviewed;
  }
  if (b.asset !== undefined) {
    if (!(ASSET_VALUES as readonly unknown[]).includes(b.asset)) {
      return { ok: false, error: `asset must be one of: ${ASSET_VALUES.join(", ")}` };
    }
    review.asset = b.asset as AssetBasis;
  }
  if (b.includes !== undefined) {
    if (!Array.isArray(b.includes) || !b.includes.every((x) => typeof x === "string")) {
      return { ok: false, error: "includes must be an array of project ids" };
    }
    review.includes = b.includes as string[];
  }
  if (b.upTo !== undefined) review.upTo = b.upTo === true;

  return {
    ok: true,
    project: {
      id,
      projectName: b.projectName as string,
      sponsor: b.sponsor as string,
      capacityMW: b.capacityMW as number | null,
      type: b.type as string,
      iso: b.iso as string,
      state: b.state as string,
      category: b.category as string,
      status: (b.status as string | undefined) ?? (isNew ? "active" : undefined),
      dcRelevant: (b.dcRelevant as boolean | undefined) ?? (isNew ? false : undefined),
      expectedOnline: b.expectedOnline as string | null | undefined,
      offtaker: b.offtaker as string | null | undefined,
      sources: b.sources as string[] | undefined,
      notes: b.notes as string | undefined,
      ...review,
    },
  };
}
