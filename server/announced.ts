// Sourced announcement dates on deal and cluster rows. A row may carry
// `announced` (YYYY-MM-DD) with `announcedSource`, the URL the day was read
// from. Both are hand-entered from a source the row already cites; neither is
// ever derived. The timeline and the deals table share these checks.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar day in YYYY-MM-DD form. "2026-02-30" and "2026-05" are not. */
export function isDay(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = DAY.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export const isHttps = (u: unknown): u is string => typeof u === "string" && /^https:\/\//.test(u);

/** The announcement date a row carries, only when its source is an https URL the row cites. */
export function sourcedAnnouncement(row: { announced?: unknown; announcedSource?: unknown; sources?: unknown[]; firmnessSource?: unknown }): { date: string; source: string } | null {
  if (!isDay(row.announced) || !isHttps(row.announcedSource)) return null;
  const cited = [...(row.sources ?? []), row.firmnessSource];
  if (!cited.includes(row.announcedSource)) return null;
  return { date: row.announced, source: row.announcedSource };
}
