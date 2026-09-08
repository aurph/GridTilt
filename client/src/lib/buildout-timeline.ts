/**
 * Buildout over time: turns the cluster registry into an animatable
 * timeline. Semantics are deliberately honest:
 *
 *  - "live" entries are operational clusters, placed at the year they came
 *    online, sized by rated (running) MW.
 *  - "target" entries are construction/announced clusters, placed at their
 *    announced online year, sized by planned MW. Targets are promises, not
 *    facts, and render as such (hollow), even after their year passes.
 *  - Clusters with no parseable year are excluded and counted, so the
 *    surface can disclose exactly what it is not showing.
 */

export interface TimelineClusterInput {
  id: string;
  name: string;
  operator: string;
  status: string; // operational | construction | announced
  location: { lat: number; lng: number };
  ratedPowerMW: number;
  plannedPowerMW: number;
  onlineDate?: string;
}

export interface TimelineEntry {
  id: string;
  name: string;
  operator: string;
  kind: "live" | "target";
  status: string;
  lat: number;
  lng: number;
  mw: number;
  year: number;
}

export interface BuildoutTimeline {
  entries: TimelineEntry[]; // sorted by year asc
  minYear: number;
  maxYear: number;
  unknownCount: number; // clusters excluded (no parseable year or no MW)
}

/** First plausible 4-digit year in a free-form online-date string. */
export function parseOnlineYear(onlineDate?: string | null): number | null {
  const m = /\b(20[2-4]\d)\b/.exec(onlineDate ?? "");
  return m ? Number(m[1]) : null;
}

export function buildTimeline(clusters: TimelineClusterInput[]): BuildoutTimeline {
  const entries: TimelineEntry[] = [];
  let unknownCount = 0;

  for (const c of clusters) {
    const year = parseOnlineYear(c.onlineDate);
    const kind: TimelineEntry["kind"] = c.status === "operational" ? "live" : "target";
    const mw = kind === "live" ? c.ratedPowerMW || c.plannedPowerMW : c.plannedPowerMW;
    if (year == null || !(mw > 0)) {
      unknownCount++;
      continue;
    }
    entries.push({
      id: c.id,
      name: c.name,
      operator: c.operator,
      kind,
      status: c.status,
      lat: c.location.lat,
      lng: c.location.lng,
      mw,
      year,
    });
  }

  entries.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));
  const years = entries.map((e) => e.year);
  return {
    entries,
    minYear: years.length ? Math.min(...years) : new Date().getFullYear(),
    maxYear: years.length ? Math.max(...years) : new Date().getFullYear(),
    unknownCount,
  };
}

export interface TimelineTotals {
  liveMW: number;
  liveCount: number;
  targetMW: number;
  targetCount: number;
}

/** Cumulative state of the buildout as of the end of `year`. */
export function totalsAt(entries: TimelineEntry[], year: number): TimelineTotals {
  const t: TimelineTotals = { liveMW: 0, liveCount: 0, targetMW: 0, targetCount: 0 };
  for (const e of entries) {
    if (e.year > year) continue;
    if (e.kind === "live") {
      t.liveMW += e.mw;
      t.liveCount++;
    } else {
      t.targetMW += e.mw;
      t.targetCount++;
    }
  }
  return t;
}
