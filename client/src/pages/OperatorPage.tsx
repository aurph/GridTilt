import { useMemo } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, Provenance, PullStat, RuleSection } from "@/components/editorial";
import { fmtGW } from "@/lib/real-gauges";

const OPERATOR_META: Record<string, { name: string; description: string; strategy: string }> = {
  "google": {
    name: "Google",
    description: "Google operates one of the largest hyperscale data center portfolios globally. Major US facilities span Oregon, South Carolina, Nevada, and Virginia. Google contracted with Kairos Power for a fluoride salt-cooled reactor.",
    strategy: "Google favors locations near hydroelectric and renewable power. Their Dalles, Oregon campus uses Columbia River hydropower. Southeast expansion (Georgia, South Carolina) relies on direct utility partnerships.",
  },
  "amazon": {
    name: "Amazon",
    description: "AWS is the largest cloud infrastructure provider. It operates dozens of US data centers. AWS committed $105B in 2025 capex, driven by AI compute demand.",
    strategy: "AWS clusters facilities in Northern Virginia, Oregon, and Ohio. Expansion into Mississippi and Indiana targets lower-cost power. AWS signed nuclear agreements with Talen Energy.",
  },
  "meta": {
    name: "Meta",
    description: "Meta operates hyperscale data centers for AI training with $65B in 2025 capex. Meta issued a 6.6 GW nuclear RFP, the largest corporate nuclear procurement to date.",
    strategy: "Meta concentrates facilities in Iowa, Oregon, and Georgia near renewable sources. The 6.6 GW nuclear RFP marks a shift toward baseload procurement.",
  },
  "microsoft": {
    name: "Microsoft",
    description: "Microsoft Azure has $83B in 2025 capex. Microsoft contracted with Constellation Energy to restart Three Mile Island Unit 1 for dedicated nuclear baseload power.",
    strategy: "Microsoft's data centers span Virginia, Iowa, Arizona, and Texas. The TMI restart provides 835 MW of carbon-free baseload to Azure operations.",
  },
  "oracle": {
    name: "Oracle",
    description: "Oracle Cloud Infrastructure (OCI) is expanding AI data center capacity. Multiple large facilities are under construction. Oracle has partnered with SMR developers for power solutions.",
    strategy: "Oracle targets secondary markets with available power and land. Recent sites in Texas, Mississippi, and Georgia focus on 100+ MW campus designs.",
  },
  "coreweave": {
    name: "CoreWeave",
    description: "CoreWeave is a pure-play AI cloud provider specializing in GPU compute. The company has raised over $12B and is building GPU-dense data centers.",
    strategy: "CoreWeave builds high power density facilities (40+ kW per rack). Sites are concentrated in the Midwest and Northeast near available grid capacity.",
  },
  "xai": {
    name: "xAI",
    description: "xAI is building one of the largest AI training clusters. The Colossus facility in Memphis runs 100,000+ H100 GPUs and consumes over 150 MW.",
    strategy: "xAI prioritizes compute density over geographic diversification. Colossus was built in 119 days using gas turbines while awaiting grid interconnection.",
  },
  "openai": {
    name: "OpenAI",
    description: "OpenAI relies on Microsoft Azure for most of its compute. The Stargate joint venture with SoftBank will build dedicated AI data center campuses.",
    strategy: "Stargate is a $100B+ venture planning dedicated AI campuses across the US. Initial sites target Texas and other power-rich markets.",
  },
};

const ALL_OPERATORS = Object.keys(OPERATOR_META);

/** The slice of /api/datacenters this page reads. */
interface OperatorFacility {
  id: number;
  name: string;
  company: string;
  city: string;
  state: string;
  powerMW: number | null;
  status: string;
  gridOperator: string;
  openDate: string;
}

const STATUS_LABELS: Record<string, string> = {
  operational: "Operational",
  construction: "Under construction",
  announced: "Announced",
};

function fmtPowerMW(mw: number): string {
  return mw >= 1000 ? fmtGW(mw) : `${Math.round(mw).toLocaleString()} MW`;
}

export default function OperatorPage() {
  const { slug } = useParams<{ slug: string }>();
  const operator = slug ? OPERATOR_META[slug] : null;

  // Same facility dataset as the Power map and Today page; react-query
  // dedupes the fetch across pages.
  const { data: facilities, isLoading } = useQuery<OperatorFacility[]>({
    queryKey: ["/api/datacenters"],
    refetchInterval: 900000,
    enabled: !!operator,
  });

  const own = useMemo(() => {
    if (!operator || !facilities) return [];
    return facilities
      .filter((f) => f.company === operator.name)
      .sort((a, b) => (b.powerMW ?? 0) - (a.powerMW ?? 0));
  }, [facilities, operator]);

  const totals = useMemo(() => {
    let mw = 0;
    let operational = 0;
    let construction = 0;
    let announced = 0;
    for (const f of own) {
      if (typeof f.powerMW === "number" && Number.isFinite(f.powerMW)) mw += f.powerMW;
      if (f.status === "operational") operational++;
      else if (f.status === "construction") construction++;
      else if (f.status === "announced") announced++;
    }
    return { mw, operational, construction, announced };
  }, [own]);

  if (!operator) {
    return (
      <PageShell>
        <div className="pt-7 sm:pt-9">
          <h1 className="font-serif font-medium text-[30px] sm:text-[34px] leading-[1.05] tracking-tight text-ink">
            Operator not found
          </h1>
          <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-ink-secondary">
            View the{" "}
            <Link href="/power-map" className="text-ink no-underline hover:text-brand-ink">Power Map</Link>{" "}
            to see all operators.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-7 sm:pt-9 text-[12.5px] text-ink-muted" data-testid="breadcrumb">
        <Link href="/" className="text-[12.5px] text-ink no-underline hover:text-brand-ink">GridTilt</Link>
        <span>·</span>
        <Link href="/power-map" className="text-[12.5px] text-ink no-underline hover:text-brand-ink">Power Map</Link>
        <span>·</span>
        <span className="text-ink font-medium">{operator.name}</span>
      </nav>

      {/* Reference-entry lead: serif name over a plain classification line */}
      <div className="mt-4 pb-4 border-b border-rule">
        <h1 className="font-serif font-medium text-[30px] sm:text-[34px] leading-[1.05] tracking-tight text-ink" data-testid="operator-heading">
          {operator.name}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">
          AI data center operator{own.length > 0 ? ` · ${own.length} tracked US facilities` : ""}
        </p>
        <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-ink-secondary">{operator.description}</p>
      </div>

      {/* Key figures from the facility registry */}
      {isLoading ? (
        <div className="mt-5 flex flex-wrap gap-x-10 gap-y-5 pb-5 border-b border-rule">
          <Skeleton className="h-14 w-32" />
          <Skeleton className="h-14 w-32" />
          <Skeleton className="h-14 w-32" />
        </div>
      ) : own.length > 0 ? (
        <div className="mt-5 pb-5 border-b border-rule" data-testid="operator-key-figures">
          <div className="flex flex-wrap gap-x-10 gap-y-5">
            <PullStat label="Tracked facilities" value={String(own.length)} note="US sites in the registry" />
            <PullStat label="Rated power" value={fmtPowerMW(totals.mw)} note="sum across tracked sites" />
            <PullStat
              label="Operational"
              value={String(totals.operational)}
              note={`${totals.construction} building · ${totals.announced} announced`}
            />
          </div>
        </div>
      ) : null}

      <RuleSection head="Geographic strategy" testId="operator-strategy">
        <p className="max-w-[68ch] text-[15px] leading-relaxed text-ink-secondary">{operator.strategy}</p>
      </RuleSection>

      <RuleSection head="Tracked facilities" testId="operator-facilities">
        {isLoading ? (
          <div className="space-y-2 py-2">
            {Array(4).fill(null).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : own.length === 0 ? (
          <p className="py-6 text-[13px] text-ink-muted text-center">
            No {operator.name} facilities are in the registry yet.
          </p>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th>Facility</th>
                <th>Location</th>
                <th className="hidden sm:table-cell">Grid</th>
                <th className="num">Power</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {own.map((f) => (
                <tr key={f.id} data-testid={`operator-facility-${f.id}`}>
                  <td className="font-medium text-ink">{f.name}</td>
                  <td className="text-ink-secondary">{f.city}, {f.state}</td>
                  <td className="hidden sm:table-cell text-ink-muted">{f.gridOperator}</td>
                  <td className="num">
                    {typeof f.powerMW === "number" && Number.isFinite(f.powerMW)
                      ? `${f.powerMW.toLocaleString()} MW`
                      : "--"}
                  </td>
                  <td className="text-ink-secondary">{STATUS_LABELS[f.status] ?? f.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Provenance source="GridTilt facility registry" />
      </RuleSection>

      <RuleSection head="On the Power Map" testId="operator-map-link">
        <p className="max-w-[68ch] text-[14px] leading-relaxed text-ink-secondary">
          Every tracked {operator.name} data center facility is plotted on the interactive Power Map.
        </p>
        <p className="mt-2">
          <Link
            href={`/power-map?company=${slug}`}
            className="text-[13.5px] font-semibold text-ink no-underline hover:text-brand-ink"
            data-testid="link-filtered-map"
          >
            Open the Power Map filtered to {operator.name} →
          </Link>
        </p>
      </RuleSection>

      <RuleSection head="Other operators" testId="other-operators">
        <p className="text-[13.5px] leading-relaxed">
          {ALL_OPERATORS.filter((o) => o !== slug).map((o, i, arr) => (
            <span key={o}>
              <Link
                href={`/operator/${o}`}
                className="text-ink no-underline hover:text-brand-ink"
                data-testid={`link-operator-${o}`}
              >
                {OPERATOR_META[o].name}
              </Link>
              {i < arr.length - 1 && <span className="text-ink-muted"> · </span>}
            </span>
          ))}
        </p>
      </RuleSection>

      <RuleSection head="Related tools">
        <ul>
          <li className="border-b border-rule">
            <Link href="/power-map" className="block py-2 text-[13.5px] text-ink no-underline hover:text-brand-ink">
              Power Map
            </Link>
          </li>
          <li className="border-b border-rule">
            <Link href="/trade" className="block py-2 text-[13.5px] text-ink no-underline hover:text-brand-ink">
              Scenario Calculator
            </Link>
          </li>
          <li>
            <Link href="/catalysts" className="block py-2 text-[13.5px] text-ink no-underline hover:text-brand-ink">
              Catalyst Tracker
            </Link>
          </li>
        </ul>
      </RuleSection>
    </PageShell>
  );
}
