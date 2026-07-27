import { type ReactNode } from "react";
import { Link } from "wouter";
import { PageShell, PageTitle } from "@/components/editorial";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-[24px] font-medium leading-tight text-ink mb-3">{title}</h2>
      <div className="text-[15px] leading-relaxed text-ink-secondary space-y-3">{children}</div>
    </section>
  );
}

export default function ComputeFrontierMethodology() {
  return (
    <PageShell>
      <PageTitle
        title="Compute Frontier methodology"
        dek="How the supercluster data is built, what is sourced, what is estimated, and exactly how each headline number is computed."
        right={
          <Link href="/compute-frontier" className="text-[12.5px] font-semibold text-ink no-underline hover:text-brand-ink" data-testid="cfm-back">
            ← Compute Frontier
          </Link>
        }
        testId="cfm-header"
      />

      <article className="max-w-[68ch]">
        <Section title="What this tracks">
          <p>
            Compute Frontier is a registry of named AI training and inference superclusters in the US. It is the compute
            layer that sits alongside the Power Map (campuses by power footprint), the Backlog (grid interconnection),
            and the Stack (equities). For each cluster it records the operator, the status, the location and grid region,
            the chip type, the accelerator count where disclosed, the power rated today and planned at full build-out,
            the energy source, and the nuclear deal that feeds it where one applies.
          </p>
          <p>The registry is tracked, not exhaustive. It grows as clusters are announced and as estimates are replaced by disclosures.</p>
        </Section>

        <Section title="Sourced versus estimated">
          <p>
            Data integrity is the point of the project, so the data is explicit about what is known. Each cluster carries
            a list of the fields whose values are GridTilt estimates or announced targets that have not been built yet.
            Those values render with an ochre dagger (<span className="text-warning font-semibold">†</span>). Everything
            else is taken from a cited source, and every cluster lists its own source links.
          </p>
          <p>
            GPU and accelerator counts appear only where an operator has actually disclosed one. Where no count has been
            published the field reads as not disclosed rather than a guess. Power is reported in megawatts at the
            precision the source gives, with no invented decimals.
          </p>
        </Section>

        <Section title="How the numbers are computed">
          <p>The headline metrics are deterministic functions of the dataset, unit-tested in the repo:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li><span className="text-ink font-medium">Operational power</span> sums the rated MW of clusters whose status is operational. <span className="text-ink font-medium">Planned power</span> sums plannedPowerMW across all clusters.</li>
            <li><span className="text-ink font-medium">Tracked GPUs</span> sums disclosed accelerator counts only, and reports how many clusters contributed.</li>
            <li><span className="text-ink font-medium">GPUs per MW</span> divides total disclosed GPUs by the rated MW of only the clusters that disclosed GPUs, so a GPU-less cluster cannot dilute the ratio. It is null when no cluster discloses both.</li>
            <li><span className="text-ink font-medium">Concentration</span> is the Herfindahl index of operator shares of planned MW (1.0 means one operator owns the whole buildout, lower means more distributed), plus the leading operator and its share. This is the "who controls the frontier" measure.</li>
          </ul>
        </Section>

        <Section title="Power needed versus power secured">
          <p>
            Where a cluster's power is served by a nuclear-for-AI deal GridTilt already tracks, the cluster links to that
            deal by its id, and the deal's contracted capacity is rolled up against the planned compute power. Firmness
            (signed versus proposed) is shown where the deal carries it. Most clusters run on the grid or on-site gas and
            carry no nuclear link, which the data states plainly rather than implying coverage that does not exist. Linked
            deals point to the <Link href="/queue" className="text-ink no-underline hover:text-brand-ink">Backlog</Link> page.
          </p>
        </Section>

        <Section title="Sources">
          <p>
            Built from public announcements and trade press: company press releases and newsrooms, Reuters, CNBC, Tom's
            Hardware, Data Center Dynamics, SemiAnalysis, TechCrunch, Data Center Frontier, utility and SEC filings, and
            operator data-center pages. Larger clusters were checked against multiple sources. No proprietary feeds and no
            paywalled scraping. Per-cluster links live in each entry and on its detail page.
          </p>
        </Section>

        <Section title="Limitations">
          <ul className="list-disc pl-5 space-y-2">
            <li>The registry is a curated sample of the largest, clearly AI-specific clusters, not a census of every facility.</li>
            <li>Forward power and GPU targets are announcements, not guarantees; they are flagged as estimates and will move.</li>
            <li>A cluster appearing here and on the Power Map is intentional; the two views answer different questions.</li>
          </ul>
        </Section>

        <p className="mt-8 text-[12.5px] text-ink-muted">
          Back to the <Link href="/compute-frontier" className="text-ink no-underline hover:text-brand-ink">Compute Frontier</Link>.
        </p>
      </article>
    </PageShell>
  );
}
