// ─── Change log (T19) ────────────────────────────────────────────────────────
//
// Corrections and documented changes to published facts, from
// server/data/change-log.json (hand-curated). Each entry is one actual change
// with its value before and after, the source and its date, when GridTilt
// reviewed it, where it shows on the site, and why. "Checked, no material
// change" is its own kind and carries no before/after. Nothing is backfilled:
// an entry is added when its change ships, in the same release.

export type ChangeKind = "correction" | "update" | "checked-no-change";

export interface ChangeRecord {
  id: string;
  kind: ChangeKind;
  entity: string;
  field: string;
  before?: string;
  after?: string;
  /** For checked-no-change: what was checked and found unchanged. */
  checked?: string;
  source: string;
  sourceUrl: string;
  /** YYYY, YYYY-MM or YYYY-MM-DD: as precise as the source is. */
  sourceDate: string;
  /** YYYY-MM-DD */
  reviewed: string;
  scope: string;
  rationale: string;
  /**
   * Short display values for a post or a share card, and the page where the
   * change shows. Optional: a change without one is not posted or carded.
   */
  short?: { label: string; before: string; after: string; source: string; url: string };
}

const ID = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]{3,80}$/;
const SOURCE_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const KINDS: ChangeKind[] = ["correction", "update", "checked-no-change"];

/** Every problem with the log; empty when it is valid. */
export function validateChangeLog(changes: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(changes)) return ["changes must be a list"];
  const seen = new Set<string>();
  changes.forEach((raw, i) => {
    const c = (raw ?? {}) as Record<string, unknown>;
    const at = `changes[${i}]${typeof c.id === "string" ? ` (${c.id})` : ""}`;
    const text = (k: string) => typeof c[k] === "string" && (c[k] as string).trim().length > 0;
    if (typeof c.id !== "string" || !ID.test(c.id)) errors.push(`${at}: id must be YYYY-MM-DD-slug`);
    else if (seen.has(c.id)) errors.push(`${at}: duplicate id`);
    else seen.add(c.id);
    if (!KINDS.includes(c.kind as ChangeKind)) errors.push(`${at}: kind must be ${KINDS.join(", ")}`);
    for (const k of ["entity", "field", "source", "scope", "rationale"]) if (!text(k)) errors.push(`${at}: ${k} is required`);
    if (c.kind === "checked-no-change") {
      if (!text("checked")) errors.push(`${at}: a no-change record says what was checked`);
      if (c.before !== undefined || c.after !== undefined) errors.push(`${at}: a no-change record has no before or after`);
    } else {
      if (!text("before") || !text("after")) errors.push(`${at}: a change needs its value before and after`);
      else if (String(c.before).trim() === String(c.after).trim()) errors.push(`${at}: before and after are the same`);
    }
    try {
      if (new URL(String(c.sourceUrl)).protocol !== "https:") errors.push(`${at}: sourceUrl must be https`);
    } catch {
      errors.push(`${at}: sourceUrl is not a URL`);
    }
    if (typeof c.sourceDate !== "string" || !SOURCE_DATE.test(c.sourceDate)) errors.push(`${at}: sourceDate must be YYYY, YYYY-MM or YYYY-MM-DD`);
    if (typeof c.reviewed !== "string" || !DAY.test(c.reviewed)) errors.push(`${at}: reviewed must be YYYY-MM-DD`);
    else if (typeof c.id === "string" && ID.test(c.id) && !c.id.startsWith(c.reviewed)) errors.push(`${at}: id starts with the reviewed date`);
    if (c.short !== undefined) {
      const sh = (c.short ?? {}) as Record<string, unknown>;
      for (const k of ["label", "before", "after", "source"]) {
        if (typeof sh[k] !== "string" || !(sh[k] as string).trim() || (sh[k] as string).length > 80) {
          errors.push(`${at}: short.${k} must be 1 to 80 characters`);
        }
      }
      try {
        const u = new URL(String(sh.url));
        if (u.protocol !== "https:" || u.hostname !== "gridtilt.com") errors.push(`${at}: short.url must be a gridtilt.com page`);
      } catch {
        errors.push(`${at}: short.url is not a URL`);
      }
    }
  });
  return errors;
}

/** Newest review first; ties keep file order. */
export function sortChanges(changes: ChangeRecord[]): ChangeRecord[] {
  return changes
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (a.c.reviewed === b.c.reviewed ? a.i - b.i : a.c.reviewed < b.c.reviewed ? 1 : -1))
    .map(({ c }) => c);
}
