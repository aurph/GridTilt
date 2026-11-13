// ─── The Buildout Brief (pure) ───────────────────────────────────────────
//
// An issue leads with the record: what changed since the previous issue (the
// change log, by dataset), each state's new decisions and next public dates,
// agreements that are new or were reviewed, and the public dates in the next
// 14 days. The rollups the modules already compute (Compute Frontier, GPU
// rental prices, the grid queue, power agreements) follow.
//
// buildBriefRecord() selects the rows from the stored files; composeBrief()
// builds the structured brief; renderBriefText() flattens it to plaintext for
// the newsletter body and social. No fabricated numbers: every line is a row
// from a registry or a figure a module already computes. A section with no
// rows is left out, never printed as an empty heading.

// ── The record ──────────────────────────────────────────────────────────────

export interface BriefChange {
  /** The dataset the change belongs to, as a reader's label ("GPU prices"). */
  dataset: string;
  /** What changed: the entry's short label when it has one, else its field. */
  label: string;
  kind: "correction" | "update" | "checked-no-change";
  before?: string;
  after?: string;
  checked?: string;
  source: string;
  /** YYYY, YYYY-MM or YYYY-MM-DD, as the source is dated. */
  sourceDate: string;
  /** YYYY-MM-DD: the day GridTilt reviewed it. */
  reviewed: string;
}

export interface BriefState {
  name: string;
  /** Decisions dated after the previous issue, newest first. */
  decisions: Array<{ date: string; title: string; source: string }>;
  /** Public dates still ahead, soonest first. */
  nextDates: Array<{ date: string; through?: string; what: string }>;
}

export interface BriefAgreement {
  name: string;
  firmness: string;
  capacityMW: number | null;
  /** "new": announced since the previous issue. "reviewed": its classification was reviewed since then. */
  change: "new" | "reviewed";
  /** The announcement day for a new row, the review day otherwise. */
  date: string;
}

export interface BriefDate {
  date: string;
  through?: string;
  what: string;
  /** Where it comes from: a state's name, or "Catalyst calendar". */
  where: string;
}

export interface BriefRecord {
  /** YYYY-MM-DD: the previous issue's day. Rows on or before it are not repeated. */
  since: string;
  changes: BriefChange[];
  states: BriefState[];
  agreements: BriefAgreement[];
  /** Public dates from the issue day through 14 days after it. */
  nextDates: BriefDate[];
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-11-17" as "November 17, 2026"; a month as "November 2026"; anything else unchanged. */
export function briefDate(day: string): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(day);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return day;
  const month = MONTHS[Number(m[2]) - 1];
  return m[3] ? `${month} ${Number(m[3])}, ${m[1]}` : `${month} ${m[1]}`;
}

/** The day `n` days after a YYYY-MM-DD day. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

/** The change log's entity prefix as a reader's dataset name. */
const DATASET_LABEL: Record<string, string> = {
  "gpu-prices": "GPU prices",
  clusters: "Compute clusters",
  grid: "Grid",
  catalysts: "Catalyst calendar",
  site: "Site figures",
  "inference-prices": "Inference prices",
  "interconnection-queue": "Interconnection queue",
  "supply-chain": "Supply chain",
  "state-pages": "State pages",
  deals: "Power agreements",
};

export function datasetLabel(entity: string): string {
  const key = entity.split("/")[0];
  return DATASET_LABEL[key] ?? key;
}

const FIRMNESS_LABEL: Record<string, string> = {
  signed: "signed",
  framework: "framework",
  option: "option",
  preliminary: "preliminary",
  portfolio: "portfolio total",
  unreviewed: "not yet reviewed",
};

export interface BriefRecordSource {
  /** The issue's day, YYYY-MM-DD. */
  asOf: string;
  /** The previous issue's day, YYYY-MM-DD. */
  since: string;
  changes: Array<{
    kind: BriefChange["kind"];
    entity: string;
    field: string;
    before?: string;
    after?: string;
    checked?: string;
    source: string;
    sourceDate: string;
    reviewed: string;
    short?: { label: string; before: string; after: string; source?: string };
  }>;
  states: Array<{
    name: string;
    documents: Array<{ kind?: "decision" | "status"; date: string; title: string; source: string }>;
    nextDates: Array<{ date: string; through?: string; what: string }>;
  }>;
  agreements: Array<{ name: string; firmness: string; capacityMW: number | null; announced: string | null; reviewed: string | null }>;
  /** Dated calendar entries; ones without a full day or already completed are skipped. */
  catalysts?: Array<{ date: string; title: string; status?: string | null }>;
}

/** Select the rows an issue carries. Pure: the same files and days give the same record. */
export function buildBriefRecord(src: BriefRecordSource): BriefRecord {
  const { asOf, since } = src;
  const inWindow = (d: string | null | undefined): d is string => typeof d === "string" && DAY.test(d) && d > since && d <= asOf;
  const horizon = addDays(asOf, 14);

  const changes: BriefChange[] = src.changes
    .filter((c) => inWindow(c.reviewed))
    .map((c) => ({
      dataset: datasetLabel(c.entity),
      label: c.short?.label ?? c.field,
      kind: c.kind,
      ...(c.kind === "checked-no-change"
        ? { checked: c.checked }
        : { before: c.short?.before ?? c.before, after: c.short?.after ?? c.after }),
      source: c.short?.source ?? c.source,
      sourceDate: c.sourceDate,
      reviewed: c.reviewed,
    }))
    .sort((a, b) => a.dataset.localeCompare(b.dataset) || (a.reviewed < b.reviewed ? 1 : a.reviewed > b.reviewed ? -1 : 0));

  const states: BriefState[] = src.states
    .map((st) => ({
      name: st.name,
      decisions: st.documents
        .filter((d) => (d.kind ?? "decision") === "decision" && inWindow(d.date))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((d) => ({ date: d.date, title: d.title, source: d.source })),
      nextDates: st.nextDates
        .filter((d) => (d.through ?? d.date) >= asOf)
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .map((d) => ({ date: d.date, ...(d.through ? { through: d.through } : {}), what: d.what })),
    }))
    .filter((st) => st.decisions.length > 0 || st.nextDates.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  const agreements: BriefAgreement[] = src.agreements
    .flatMap((a): BriefAgreement[] => {
      const base = { name: a.name, firmness: a.firmness, capacityMW: a.capacityMW };
      if (inWindow(a.announced)) return [{ ...base, change: "new", date: a.announced }];
      if (inWindow(a.reviewed)) return [{ ...base, change: "reviewed", date: a.reviewed }];
      return [];
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name)));

  const nextDates: BriefDate[] = [
    ...src.states.flatMap((st) =>
      st.nextDates
        .filter((d) => (d.through ?? d.date) >= asOf && d.date <= horizon)
        .map((d) => ({ date: d.date, ...(d.through ? { through: d.through } : {}), what: d.what, where: st.name })),
    ),
    ...(src.catalysts ?? [])
      .filter((c) => DAY.test(c.date) && c.date >= asOf && c.date <= horizon && c.status !== "completed")
      .map((c) => ({ date: c.date, what: c.title, where: "Catalyst calendar" })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.where.localeCompare(b.where)));

  return { since, changes, states, agreements, nextDates };
}

const span = (d: { date: string; through?: string }) =>
  d.through && d.through !== d.date ? `${briefDate(d.date)} to ${briefDate(d.through)}` : briefDate(d.date);
/** "Source, date", without repeating a date the source's own name already carries. */
function sourced(source: string, sourceDate: string): string {
  const date = briefDate(sourceDate);
  return source.includes(date) ? source.trim() : `${source.trim()}, ${date}`;
}
const stop = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

/** The record as sections, in issue order. A part with no rows gives no section. */
export function recordSections(record: BriefRecord): BriefSection[] {
  const out: BriefSection[] = [];

  if (record.changes.length > 0) {
    out.push({
      heading: "What changed",
      points: record.changes.map((c) =>
        c.kind === "checked-no-change"
          ? `${c.dataset}: ${c.label}. Checked, no change (${sourced(c.source, c.sourceDate)}).`
          : `${c.dataset}: ${c.label}. Was: ${stop(c.before ?? "")} Now: ${stop(c.after ?? "")} Source: ${sourced(c.source, c.sourceDate)}.`,
      ),
    });
  }

  for (const st of record.states) {
    out.push({
      heading: st.name,
      points: [
        ...st.decisions.map((d) => `Decided ${briefDate(d.date)}: ${stop(d.title)} Source: ${stop(d.source)}`),
        ...st.nextDates.map((d) => `Next public date, ${span(d)}: ${stop(d.what)}`),
      ],
    });
  }

  if (record.agreements.length > 0) {
    out.push({
      heading: "Agreements",
      points: record.agreements.map((a) => {
        const size = a.capacityMW ? `${a.capacityMW.toLocaleString("en-US")} MW` : "capacity not disclosed";
        const firmness = FIRMNESS_LABEL[a.firmness] ?? a.firmness;
        return a.change === "new"
          ? `New: ${a.name}. ${firmness[0].toUpperCase()}${firmness.slice(1)}, ${size}, announced ${briefDate(a.date)}.`
          : `Reviewed ${briefDate(a.date)}: ${a.name}. Classified ${firmness}, ${size}.`;
      }),
    });
  }

  if (record.nextDates.length > 0) {
    out.push({
      heading: "Next public dates",
      points: record.nextDates.map((d) => `${span(d)}, ${d.where}: ${stop(d.what)}`),
    });
  }
  return out;
}

export interface BriefInput {
  /** The issue's day, YYYY-MM-DD. */
  asOf: string;
  /** What changed since the previous issue. Absent: the brief is rollups only. */
  record?: BriefRecord;
  compute: {
    clusterCount: number;
    plannedGW: number;
    operationalGW: number;
    operatorCount: number;
    topOperator: string | null;
    topOperatorSharePct: number;
    biggestName: string | null;
    biggestGW: number;
  };
  gpu: {
    fleetAvg: number;
    fleetAvg1yChange: number | null;
    h100: number;
    gb200: number;
    moverModel: string;
    moverChangePct: number;
    cheapestModel: string;
    cheapestPrice: number;
  };
  grid: { queueGW: number; medianWaitMonths: number; ercotGW: number };
  /** Signed means reviewed against a primary document. Nothing else is summed. */
  deals: {
    signedCount: number;
    /** Signed agreements with no disclosed size: counted, not in signedGW. */
    signedUndisclosed: number;
    signedGW: number;
    /** Reviewed frameworks, options and letters of intent. Not counted as signed. */
    pendingCount: number;
    /** Listed but not yet reviewed. Not counted at all. */
    unreviewedCount: number;
    topSignedBuyer: string | null;
    topSignedBuyerGW: number;
    topSignedType: string | null;
    topSignedTypeGW: number;
  };
}

export interface BriefSection {
  heading: string;
  points: string[];
}

export interface Brief {
  title: string;
  asOf: string;
  summary: string;
  sections: BriefSection[];
  takeaway: string;
}

const commas = (n: number) => n.toLocaleString("en-US");
const gw = (n: number) => (Number.isInteger(n) ? `${n} GW` : `${n.toFixed(1)} GW`);
const usd = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n == null ? "flat" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

function moverPhrase(model: string, changePct: number): string {
  const dir = changePct < 0 ? "down" : "up";
  return `${model} ${dir} ${Math.abs(Math.round(changePct))}%`;
}

export function composeBrief(input: BriefInput): Brief {
  const { compute: c, gpu: g, grid: q, deals: d } = input;
  // An undisclosed size is counted but adds nothing to the GW, so the sentence
  // names how many agreements the total covers.
  const sized = d.signedCount - d.signedUndisclosed;
  const signedTotal =
    d.signedUndisclosed > 0
      ? `${d.signedCount} signed power agreements; the ${sized} with a disclosed size total ${gw(d.signedGW)}`
      : `${d.signedCount} signed power agreements total ${gw(d.signedGW)}`;

  const summary =
    `The US compute buildout we track now spans ${c.clusterCount} named clusters and ${gw(c.plannedGW)} of planned power ` +
    `across ${c.operatorCount} operators, with ${gw(c.operationalGW)} already live. ` +
    `${signedTotal}, and on-demand GPUs rent for an average of ${usd(g.fleetAvg)}/GPU-hr.`;

  const compute: BriefSection = {
    heading: "Compute",
    points: [
      `${c.clusterCount} named clusters, ${gw(c.plannedGW)} planned, ${gw(c.operationalGW)} operational.`,
      ...(c.topOperator ? [`${c.topOperator} leads with ${Math.round(c.topOperatorSharePct)}% of planned capacity.`] : []),
      ...(c.biggestName ? [`Largest single site: ${c.biggestName} at ${gw(c.biggestGW)}.`] : []),
    ],
  };

  const gpu: BriefSection = {
    heading: "GPUs",
    points: [
      `Fleet on-demand average ${usd(g.fleetAvg)}/GPU-hr, ${pct(g.fleetAvg1yChange)} over the past year.`,
      `H100 ${usd(g.h100)}, GB200 ${usd(g.gb200)} per GPU-hr; cheapest is ${g.cheapestModel} at ${usd(g.cheapestPrice)}.`,
      `Biggest 12-month move: ${moverPhrase(g.moverModel, g.moverChangePct)}.`,
    ],
  };

  const grid: BriefSection = {
    heading: "Power & grid",
    points: [
      `${commas(q.queueGW)} GW waiting in US interconnection queues, ${q.medianWaitMonths}-month median wait.`,
      `ERCOT large-load queue alone: ${commas(q.ercotGW)} GW.`,
    ],
  };

  const deals: BriefSection = {
    heading: "Power agreements",
    points: [
      d.signedUndisclosed > 0
        ? `${d.signedCount} signed agreements, ${gw(d.signedGW)} across the ${sized} with a disclosed size.`
        : `${d.signedCount} signed agreements, ${gw(d.signedGW)}.`,
      ...(d.pendingCount > 0
        ? [`${d.pendingCount} more are frameworks, options or letters of intent, not counted as signed.`]
        : []),
      ...(d.unreviewedCount > 0
        ? [d.unreviewedCount === 1
            ? "1 listed agreement is not yet reviewed and is not counted."
            : `${d.unreviewedCount} listed agreements are not yet reviewed and are not counted.`]
        : []),
      ...(d.topSignedBuyer ? [`${d.topSignedBuyer} holds the most signed capacity, ${gw(d.topSignedBuyerGW)}.`] : []),
      ...(d.topSignedType
        ? [`${d.topSignedType[0].toUpperCase()}${d.topSignedType.slice(1)} leads the signed mix at ${gw(d.topSignedTypeGW)}.`]
        : []),
    ],
  };

  const takeaway =
    `Demand keeps outrunning the grid: ${gw(c.plannedGW)} of planned compute against a ${q.medianWaitMonths}-month interconnection queue, ` +
    `while ${d.topSignedBuyer ?? "hyperscalers"} and peers sign for their own power.`;

  return {
    title: `The Buildout Brief, ${briefDate(input.asOf)}`,
    asOf: input.asOf,
    summary,
    // The record first, then the rollups.
    sections: [...(input.record ? recordSections(input.record) : []), compute, gpu, grid, deals],
    takeaway,
  };
}

/** Flatten the brief to plaintext for the newsletter body / a social thread. */
export function renderBriefText(b: Brief): string {
  const lines: string[] = [b.title, "", b.summary, ""];
  for (const s of b.sections) {
    lines.push(s.heading);
    for (const p of s.points) lines.push(`- ${p}`);
    lines.push("");
  }
  lines.push(b.takeaway, "", "https://gridtilt.com");
  return lines.join("\n");
}
