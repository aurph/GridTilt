/**
 * Tracked campuses whose grid region a person checked against the utility
 * that serves them.
 *
 * A campus is normally placed by where it sits on the region lines
 * (lib/grid-regions regionOf). The lines are approximate, operator footprints
 * interleave, and the registry's own gridOperator field is free text that is
 * sometimes a reliability region or simply wrong. So where the two disagree,
 * or the lines leave a campus in the water, the serving utility is read from
 * a source and the answer is recorded here. `region` then wins over the
 * lines (regionOfCampus), and megawatts follow it.
 *
 * A test fails when a campus lands in a different region than the operator
 * its registry row names and no row here settles it, and when a row's name
 * stops matching the registry (so a renumbered registry cannot silently move
 * megawatts).
 *
 * Checked 2026-11-19. Each row cites one page that can be opened; `note`
 * says what the source does not state.
 */
import type { GridRegionId } from "./grid-regions";

export interface CampusRegionReview {
  /** The campus as the registry names it (server/data/datacenters.json). */
  name: string;
  region: GridRegionId;
  /** The utility that serves the site. */
  utility: string;
  source: string;
  sourceUrl: string;
  /** YYYY-MM-DD */
  checked: string;
  note?: string;
}

/** Keyed by the registry's campus id. */
export const CAMPUS_REGION_REVIEWED: Record<number, CampusRegionReview> = {
  4: {
    name: "Meta DeKalb AI Campus",
    region: "pjm",
    utility: "Commonwealth Edison",
    source: "Meta's DeKalb data center fact sheet (ComEd supplies it); PJM plans and operates ComEd's transmission system",
    sourceUrl: "https://datacenters.atmeta.com/wp-content/uploads/2026/09/Meta_s-DeKalb-Data-Center.pdf",
    checked: "2026-11-19",
    note: "Drawn in PJM, which is right. The registry field says MISO.",
  },
  30: {
    name: "Google Council Bluffs IA",
    region: "miso",
    utility: "MidAmerican Energy",
    source: "MidAmerican Energy: its grid is managed by MISO, and Google is among the data centers it powers",
    sourceUrl: "https://www.midamericanenergy.com/electricity-interconnected-grid",
    checked: "2026-11-19",
    note: "Drawn inside the lines for SPP, whose members interleave with MISO's in western Iowa. The sources name MidAmerican as Google's supplier in Iowa; they do not name Council Bluffs.",
  },
  32: {
    name: "Microsoft Racine WI Campus",
    region: "miso",
    utility: "We Energies, over American Transmission Co. lines",
    source: "American Transmission Co.'s FERC filing of July 24, 2026 for the Microsoft campus in Racine County, with MISO as transmission provider",
    sourceUrl: "https://www.wpr.org/wp-content/uploads/2026/07/20260724-5251_Transmittal-Letter_ATC-WEPCo-Amended-LLPCAs_MTCA.pdf",
    checked: "2026-11-19",
    note: "On the Lake Michigan shore, just off the drawn lines. The filing is a copy hosted by Wisconsin Public Radio.",
  },
  43: {
    name: "Nebius Independence MO",
    region: "spp",
    utility: "Independence Power & Light",
    source: "Nebius's Independence page: power from Independence Power & Light, which participates in the Southwest Power Pool",
    sourceUrl: "https://nebius.com/independencemo",
    checked: "2026-11-19",
    note: "Drawn in SPP, which is right. The registry field says MISO/KCP&L.",
  },
  44: {
    name: "Meta Hyperion Louisiana",
    region: "miso",
    utility: "Entergy Louisiana",
    source: "Entergy: Louisiana regulators approved the facilities to serve Meta's data center; Entergy's utilities joined MISO in December 2013",
    sourceUrl: "https://www.entergy.com/news/entergy-louisiana-receives-lpsc-approval-for-major-infrastructure-investments-to-support-metas-data-center-and-improve-reliability",
    checked: "2026-11-19",
    note: "Drawn in MISO, which is right. The registry field names SERC, the reliability region, not the market operator. Entergy's release does not use the name Hyperion.",
  },
  45: {
    name: "AWS Project Rainier",
    region: "pjm",
    utility: "Indiana Michigan Power",
    source: "Indiana Utility Regulatory Commission, Cause 46097: the AWS campus is in Indiana Michigan Power's territory; Cause 45933: I&M is a PJM member",
    sourceUrl: "https://www.in.gov/iurc/files/ord_46097_021925.pdf",
    checked: "2026-11-19",
    note: "Drawn in PJM, which is right. The registry field says NIPSCO/MISO. The orders do not use the name Project Rainier.",
  },
  46: {
    name: "CoreWeave Ellendale ND",
    region: "miso",
    utility: "Montana-Dakota Utilities",
    source: "MDU Resources: Montana-Dakota serves Applied Digital's campus near Ellendale and buys that load from the MISO market",
    sourceUrl: "https://s25.q4cdn.com/697625600/files/doc_news/MDU-Resources-Subsidiary-Receives-Regulatory-Approval-to-Serve-Large-Data-Center-Electric-Load-2023.pdf",
    checked: "2026-11-19",
    note: "Drawn inside the lines for SPP, whose members interleave with MISO's in the Dakotas. The utility's releases name Applied Digital, the campus owner, not CoreWeave.",
  },
  52: {
    name: "Meta Hyperion Phase 2",
    region: "miso",
    utility: "Entergy Louisiana",
    source: "Entergy: Louisiana regulators approved the facilities to serve Meta's data center; Entergy's utilities joined MISO in December 2013",
    sourceUrl: "https://www.entergy.com/news/entergy-louisiana-receives-lpsc-approval-for-major-infrastructure-investments-to-support-metas-data-center-and-improve-reliability",
    checked: "2026-11-19",
    note: "Drawn in MISO, which is right. The registry field names SERC, the reliability region, not the market operator.",
  },
};
