import { Link } from "wouter";
import { PageShell, PageTitle, RuleSection } from "@/components/editorial";

/**
 * The accountability page: what GridTilt is, who makes it, where every
 * number comes from, and what is not covered. Plain statements only.
 */

const DATASETS: Array<{ name: string; source: string; cadence: string; gaps: string }> = [
  {
    name: "Facility registry",
    source: "Public filings, local reporting, company announcements; curated by hand",
    cadence: "Reviewed continuously",
    gaps: "Facilities under 400 MW; sites outside the US",
  },
  {
    name: "Cluster registry",
    source: "Per-row cited sources; estimates flagged with a dagger",
    cadence: "Reviewed continuously",
    gaps: "GPU counts unless an operator disclosed them; clusters outside the US",
  },
  {
    name: "Power deals",
    source: "Company and utility announcements",
    cadence: "As deals are announced",
    gaps: "Private deals with undisclosed terms",
  },
  {
    name: "Interconnection queue",
    source: "LBNL Queued Up, plus curated additions",
    cadence: "LBNL editions plus curation between them",
    gaps: "Projects that have not entered a queue",
  },
  {
    name: "GPU rental index",
    source: "Public neocloud and marketplace listings, blended; ranges shown",
    cadence: "Roughly weekly",
    gaps: "Reserved and contract pricing; negotiated rates",
  },
  {
    name: "Market data",
    source: "Yahoo Finance",
    cadence: "Every 10 to 15 minutes in trading hours; may be delayed",
    gaps: "Anything beyond price, P/E, and revenue growth",
  },
  {
    name: "Grid demand",
    source: "EIA (hourly), FRED (monthly)",
    cadence: "Hourly and monthly with the source",
    gaps: "Distribution-level and behind-the-meter data",
  },
  {
    name: "Reserve margins",
    source: "NERC Long-Term Reliability Assessment",
    cadence: "With each NERC edition",
    gaps: "Seasonal and short-term margins",
  },
  {
    name: "Headlines",
    source: "Eight industry feeds",
    cadence: "Continuous",
    gaps: "Paywalled reporting",
  },
];

export default function About() {
  return (
    <PageShell>
      <div className="max-w-3xl mx-auto">
        <PageTitle title="About GridTilt" testId="about-header" />

        <div className="max-w-[68ch] space-y-4 text-[15px] leading-[1.7] text-ink-secondary">
          <p>
            GridTilt tracks the American power grid as data centers reshape it: what is being
            built, where the electricity comes from, which companies are involved, and what it
            means for the people who pay for the grid.
          </p>
          <p>
            It is researched, built, and maintained by one person,{" "}
            <span className="text-ink font-semibold">Jack Schwartz</span>. It is not affiliated
            with, or funded by, any company it covers. The dashboard is free.
          </p>
        </div>

        <RuleSection head="Where the numbers come from" testId="about-datasets">
          <div className="overflow-x-auto">
            <table className="print-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Dataset</th>
                  <th>Source</th>
                  <th>Updated</th>
                  <th>Not covered</th>
                </tr>
              </thead>
              <tbody>
                {DATASETS.map((d) => (
                  <tr key={d.name}>
                    <td className="shrink font-semibold text-ink">{d.name}</td>
                    <td className="text-ink-secondary">{d.source}</td>
                    <td className="text-ink-secondary">{d.cadence}</td>
                    <td className="text-ink-muted">{d.gaps}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 max-w-[68ch] text-[13px] leading-relaxed text-ink-muted">
            Every chart and table carries a source line. Estimated values are marked with an
            ochre dagger (†). When a source fails, the page says the data is unavailable instead
            of showing an invented number. Cluster methodology in full:{" "}
            <Link href="/compute-frontier/methodology" className="text-ink underline decoration-rule-strong underline-offset-2 hover:text-brand-ink">
              how the registry is built
            </Link>
            .
          </p>
        </RuleSection>

        <RuleSection head="What GridTilt is not" testId="about-limits">
          <ul className="max-w-[68ch] space-y-2 text-[14.5px] leading-relaxed text-ink-secondary">
            <li className="flex gap-2.5">
              <span className="tilt-glyph mt-1.5 shrink-0" aria-hidden />
              Not investment advice. Market figures are context for the infrastructure story,
              and quotes may be delayed.
            </li>
            <li className="flex gap-2.5">
              <span className="tilt-glyph mt-1.5 shrink-0" aria-hidden />
              Not exhaustive. Coverage floors are stated on each page; small facilities and
              non-US projects are out of scope today.
            </li>
            <li className="flex gap-2.5">
              <span className="tilt-glyph mt-1.5 shrink-0" aria-hidden />
              Not real time. Each dataset updates on the cadence above, and each page shows when
              it last did.
            </li>
          </ul>
        </RuleSection>

        <RuleSection head="Corrections" testId="about-corrections">
          <p className="max-w-[68ch] text-[14.5px] leading-relaxed text-ink-secondary">
            If a number here is wrong, say so:{" "}
            <a
              href="https://x.com/gridtilt"
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink underline decoration-rule-strong underline-offset-2 hover:text-brand-ink"
            >
              @gridtilt
            </a>
            . Corrections ship fast and are noted where they land.
          </p>
        </RuleSection>
      </div>
    </PageShell>
  );
}
