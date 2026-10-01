/**
 * A citation a reader can paste: which record, which claim and scope, which
 * document says so and when, when GridTilt checked it, and the permalink.
 * Only a record reviewed field by field has a claim to cite; for any other
 * the function returns null and the page says the record is unreviewed.
 */

export interface EvidenceEntry {
  field: string;
  value: string;
  /** What the source says the figure measures, in its terms ("not stated" when it does not say). */
  basis?: string;
  /** GridTilt's own reading of the figure. Never the source's words, so never in a citation. */
  note?: string;
  kind?: string;
  asOf?: string;
  source: string;
  url: string;
  published: string;
  primary?: boolean;
}

export interface CitableRecord {
  id: string;
  name: string;
  location: { city: string; state: string };
  reviewed?: string;
  evidence?: EvidenceEntry[];
}

export const FIELD_LABEL: Record<string, string> = {
  status: "Status",
  ratedPowerMW: "Rated power",
  plannedPowerMW: "Planned power",
  gpuCount: "Accelerators",
  operator: "Operator",
  location: "Location",
  energySource: "Energy source",
  onlineDate: "Online",
  notes: "Context",
  scope: "Scope",
};

/** The claim a citation leads with: delivered power, else planned power, else the first entry. */
export function materialEvidence(evidence: EvidenceEntry[] | undefined): EvidenceEntry | null {
  if (!evidence || evidence.length === 0) return null;
  return (
    evidence.find((e) => e.field === "ratedPowerMW") ??
    evidence.find((e) => e.field === "plannedPowerMW") ??
    evidence[0]
  );
}

export function permalink(id: string, siteUrl = "https://gridtilt.com"): string {
  return `${siteUrl}/compute-frontier/${encodeURIComponent(id)}`;
}

export function buildCitation(record: CitableRecord, siteUrl = "https://gridtilt.com"): string | null {
  const e = materialEvidence(record.evidence);
  if (!e || !record.reviewed) return null;
  const label = FIELD_LABEL[e.field] ?? e.field;
  const scope = [label.toLowerCase(), e.basis ? `basis: ${e.basis}` : null].filter(Boolean).join("; ");
  return (
    `${record.name}, ${record.location.city}, ${record.location.state}: ${e.value} (${scope}). ` +
    `Source: ${e.source}, ${e.published}, ${e.url}. ` +
    `GridTilt record, reviewed ${record.reviewed}: ${permalink(record.id, siteUrl)}`
  );
}
