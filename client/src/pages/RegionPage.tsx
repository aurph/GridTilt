import { useParams, Link } from "wouter";
import { PageShell, Provenance, PullStat, RuleSection } from "@/components/editorial";
import { RTO_CONFIG, RTO_SOURCE_NOTE } from "@/data/rto-config";

const REGION_META: Record<string, { name: string; fullName: string; states: string; description: string }> = {
  "pjm": {
    name: "PJM", fullName: "PJM Interconnection",
    states: "PA, NJ, DE, MD, VA, WV, OH, IN, IL, MI, KY, NC, TN, DC",
    description: "PJM is the largest electricity market in North America, serving 65 million customers across 13 states. It hosts the highest concentration of hyperscaler data centers in the US, primarily in Northern Virginia (Data Center Alley). PJM capacity auction clearing prices hit record levels in 2025 at $270/MW-day, driven by AI data center load additions outpacing new generation.",
  },
  "ercot": {
    name: "ERCOT", fullName: "Electric Reliability Council of Texas",
    states: "TX (most of state)",
    description: "ERCOT operates the isolated Texas grid serving 26 million customers. Texas has attracted significant data center investment due to low electricity costs, land availability, and minimal regulatory overhead. EIA projects a 79% wholesale price increase in ERCOT by 2027 due to data center demand growth.",
  },
  "miso": {
    name: "MISO", fullName: "Midcontinent Independent System Operator",
    states: "ND, SD, NE, MN, IA, WI, IL, IN, MI, AR, MS, LA, TX (part)",
    description: "MISO manages one of the most capacity-constrained grids in the US, with reserve margins dropping to 13.4% per NERC's latest assessment. The region serves a growing concentration of hyperscaler data centers, particularly in Iowa and Illinois.",
  },
  "wecc": {
    name: "WECC", fullName: "Western Electricity Coordinating Council",
    states: "WA, OR, CA, NV, AZ, UT, CO, WY, MT, ID, NM",
    description: "WECC covers the western interconnection, including major data center markets in Oregon (The Dalles), Nevada, and Arizona. Google, Meta, and Microsoft have significant facility presence in the Pacific Northwest due to hydroelectric power availability.",
  },
  "serc": {
    name: "SERC", fullName: "SERC Reliability Corporation",
    states: "VA, NC, SC, GA, AL, FL, TN, MS",
    description: "SERC covers the southeastern US, a growing data center market driven by lower land costs and expanding utility partnerships. Duke Energy and Southern Company are actively negotiating AI data center power agreements in this region.",
  },
  "spp": {
    name: "SPP", fullName: "Southwest Power Pool",
    states: "KS, OK, NE, NM, TX (panhandle), AR, MO, ND, SD, MT, WY, IA, MN, LA",
    description: "SPP manages the grid across the south-central plains states. While not yet a major data center hub, SPP's abundant wind resources and available land are attracting interest from hyperscalers seeking renewable-powered facilities.",
  },
  "npcc": {
    name: "NPCC", fullName: "Northeast Power Coordinating Council",
    states: "NY, CT, MA, ME, NH, RI, VT",
    description: "NPCC covers the northeastern US and coordinates with ISO-NE and NYISO. The region has limited data center expansion due to high electricity costs and constrained transmission, but hosts critical financial services and enterprise computing infrastructure.",
  },
};

const ALL_REGIONS = Object.keys(REGION_META);

export default function RegionPage() {
  const { slug } = useParams<{ slug: string }>();
  const region = slug ? REGION_META[slug] : null;
  const rto = slug ? RTO_CONFIG[slug.toUpperCase()] : undefined;

  if (!region) {
    return (
      <PageShell>
        <div className="pt-7 sm:pt-9">
          <h1 className="font-serif font-medium text-[30px] sm:text-[34px] leading-[1.05] tracking-tight text-ink">
            Region not found
          </h1>
          <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-ink-secondary">
            View the{" "}
            <Link href="/power-map" className="text-brand-ink no-underline hover:text-ink">Power Map</Link>{" "}
            to see all grid regions.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-7 sm:pt-9 text-[12.5px] text-ink-muted" data-testid="breadcrumb">
        <Link href="/" className="text-[12.5px] text-brand-ink no-underline hover:text-ink">GridTilt</Link>
        <span>·</span>
        <Link href="/power-map" className="text-[12.5px] text-brand-ink no-underline hover:text-ink">Power Map</Link>
        <span>·</span>
        <span className="text-ink font-medium">{region.name}</span>
      </nav>

      {/* Reference-entry lead: serif name over a plain classification line */}
      <div className="mt-4 pb-4 border-b border-rule">
        <h1 className="font-serif font-medium text-[30px] sm:text-[34px] leading-[1.05] tracking-tight text-ink" data-testid="region-heading">
          {region.fullName}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">
          {region.name} · North American grid region
        </p>
        <p className="mt-1 text-[12.5px] text-ink-muted">Coverage: {region.states}</p>
        <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-ink-secondary">{region.description}</p>
      </div>

      {/* Key figures */}
      {rto && (
        <div className="mt-5 pb-5 border-b border-rule">
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            <PullStat
              label="Projected reserve margin"
              value={`${rto.reserveMargin.toFixed(1)}%`}
              note="2026 projection"
            />
            <PullStat
              label="AI-load signal"
              value={rto.aiSignal}
              note="GridTilt read on new large-load headroom"
            />
          </div>
          <Provenance source={RTO_SOURCE_NOTE} />
        </div>
      )}

      <RuleSection head="On the Power Map" testId="region-map-link">
        <p className="max-w-[68ch] text-[14px] leading-relaxed text-ink-secondary">
          Every tracked data center facility in the {region.name} region is plotted on the interactive Power Map.
        </p>
        <p className="mt-2">
          <Link
            href={`/power-map?region=${slug}`}
            className="text-[13.5px] font-semibold text-brand-ink no-underline hover:text-ink"
            data-testid="link-filtered-map"
          >
            Open the Power Map filtered to {region.name} →
          </Link>
        </p>
      </RuleSection>

      <RuleSection head="Other grid regions" testId="related-regions">
        <p className="text-[13.5px] leading-relaxed">
          {ALL_REGIONS.filter((r) => r !== slug).map((r, i, arr) => (
            <span key={r}>
              <Link
                href={`/region/${r}`}
                className="text-brand-ink no-underline hover:text-ink"
                data-testid={`link-region-${r}`}
              >
                {REGION_META[r].name}
              </Link>
              {i < arr.length - 1 && <span className="text-ink-muted"> · </span>}
            </span>
          ))}
        </p>
      </RuleSection>

      <RuleSection head="Related tools">
        <ul>
          <li className="border-b border-rule">
            <Link href="/power-map" className="block py-2 text-[13.5px] text-brand-ink no-underline hover:text-ink">
              Power Map
            </Link>
          </li>
          <li className="border-b border-rule">
            <Link href="/trade" className="block py-2 text-[13.5px] text-brand-ink no-underline hover:text-ink">
              Scenario Calculator
            </Link>
          </li>
          <li>
            <Link href="/stack" className="block py-2 text-[13.5px] text-brand-ink no-underline hover:text-ink">
              The Stack
            </Link>
          </li>
        </ul>
      </RuleSection>
    </PageShell>
  );
}
