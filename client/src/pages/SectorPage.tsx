import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, Provenance, PullStat, RuleSection } from "@/components/editorial";

const SECTOR_META: Record<string, { key: string; name: string; description: string; related: string[] }> = {
  "nuclear-power": {
    key: "nuclear", name: "Nuclear Power",
    description: "Nuclear generators provide 24/7 baseload for AI data centers. CEG, VST, and TLN own the existing fleet. Oklo and NuScale are developing SMRs.",
    related: ["uranium", "utilities"],
  },
  "uranium": {
    key: "uranium", name: "Uranium & Fuel Cycle",
    description: "Every nuclear reactor requires enriched uranium fuel. Nuclear restarts are raising demand against constrained supply. Cameco, NexGen, and UEC are the primary Western miners.",
    related: ["nuclear-power", "etf-benchmarks"],
  },
  "compute": {
    key: "compute", name: "Compute",
    description: "GPU and semiconductor companies powering AI training and inference. NVIDIA holds 80%+ market share in AI accelerators. Each GPU requires power infrastructure to operate.",
    related: ["power-hardware", "data-center-reits"],
  },
  "power-hardware": {
    key: "powerHardware", name: "Power Hardware",
    description: "Manufacturers of transformers, switchgear, cooling, and PDUs for data centers. GE Vernova, Eaton, and Vertiv have multi-year backlogs.",
    related: ["construction-epc", "utilities"],
  },
  "utilities": {
    key: "utilities", name: "Utilities",
    description: "Regulated and merchant utilities supplying grid power to data centers. NextEra, Dominion, and Southern Company are signing long-term PPAs. Grid queue times exceed 4 years.",
    related: ["nuclear-power", "power-hardware"],
  },
  "data-center-reits": {
    key: "dataCenters", name: "Data Center REITs",
    description: "REITs that own and operate data center facilities. Equinix and Digital Realty hold most US colocation capacity. IREN operates AI-focused compute facilities.",
    related: ["compute", "construction-epc"],
  },
  "construction-epc": {
    key: "construction", name: "Construction & EPC",
    description: "Firms building data centers and grid infrastructure. Quanta, EMCOR, and MasTec have record backlogs from data center and transmission projects.",
    related: ["power-hardware", "utilities"],
  },
  "etf-benchmarks": {
    key: "etfsBenchmarks", name: "ETF Benchmarks",
    description: "ETFs tracking uranium, nuclear, grid, and technology sectors. URA and URNM cover uranium miners. GRID and PAVE cover grid and construction.",
    related: ["uranium", "compute"],
  },
};

const SECTOR_SLUG_LABELS: Record<string, string> = {};
for (const [slug, meta] of Object.entries(SECTOR_META)) {
  SECTOR_SLUG_LABELS[slug] = meta.name;
}

interface StackData {
  [key: string]: Array<{
    ticker: string; name: string; price: number; change: number;
    changePercent: number; pe: number | null; revenueGrowth: number | null;
    marketCapDisplay?: string;
  }>;
}

/** Signed percent with a true minus sign, never a hyphen. */
function fmtSignedPct(v: number): string {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`;
}

export default function SectorPage() {
  const { slug } = useParams<{ slug: string }>();
  const sector = slug ? SECTOR_META[slug] : null;

  const { data: stackData, isLoading } = useQuery<StackData>({
    queryKey: ["/api/stack", "1D"],
    queryFn: () => fetch("/api/stack?timeframe=1D").then((r) => r.json()),
    refetchInterval: 900000,
  });

  if (!sector) {
    return (
      <PageShell>
        <div className="pt-7 sm:pt-9">
          <h1 className="font-serif font-medium text-[30px] sm:text-[34px] leading-[1.05] tracking-tight text-ink">
            Sector not found
          </h1>
          <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-ink-secondary">
            Browse{" "}
            <Link href="/stack" className="text-brand-ink no-underline hover:text-ink">The Stack</Link>{" "}
            to see all sectors.
          </p>
        </div>
      </PageShell>
    );
  }

  const stocks = stackData?.[sector.key] || [];
  const avgChange = stocks.length > 0
    ? stocks.reduce((s, st) => s + (st.changePercent || 0), 0) / stocks.length
    : 0;
  const best = stocks.length > 0 ? [...stocks].sort((a, b) => b.changePercent - a.changePercent)[0] : null;
  const worst = stocks.length > 0 ? [...stocks].sort((a, b) => a.changePercent - b.changePercent)[0] : null;

  return (
    <PageShell>
      <nav className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-7 sm:pt-9 text-[12.5px] text-ink-muted" data-testid="breadcrumb">
        <Link href="/" className="text-[12.5px] text-brand-ink no-underline hover:text-ink">GridTilt</Link>
        <span>·</span>
        <Link href="/stack" className="text-[12.5px] text-brand-ink no-underline hover:text-ink">The Stack</Link>
        <span>·</span>
        <span className="text-ink font-medium">{sector.name}</span>
      </nav>

      {/* Reference-entry lead: serif name over a plain classification line */}
      <div className="mt-4 pb-4 border-b border-rule">
        <h1 className="font-serif font-medium text-[30px] sm:text-[34px] leading-[1.05] tracking-tight text-ink" data-testid="sector-heading">
          {sector.name}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-muted">
          Equity sector · The Stack{stocks.length > 0 ? ` · ${stocks.length} tracked companies` : ""}
        </p>
        <p className="mt-3 max-w-[68ch] text-[15px] leading-relaxed text-ink-secondary">{sector.description}</p>
      </div>

      {/* Key figures */}
      <div className="mt-5 flex flex-wrap gap-x-10 gap-y-5 pb-5 border-b border-rule">
        <PullStat
          testId="stat-avg-change"
          label="Average move today"
          value={stocks.length > 0 ? fmtSignedPct(avgChange) : "--"}
          note={stocks.length > 0 ? `across ${stocks.length} stocks` : undefined}
        />
        <PullStat
          testId="stat-best"
          label="Best performer"
          value={best ? best.ticker : "--"}
          delta={
            best && (
              <span className={`text-[13px] font-semibold tnum ${best.changePercent >= 0 ? "text-positive" : "text-negative"}`}>
                {fmtSignedPct(best.changePercent)}
              </span>
            )
          }
        />
        <PullStat
          testId="stat-worst"
          label="Worst performer"
          value={worst ? worst.ticker : "--"}
          delta={
            worst && (
              <span className={`text-[13px] font-semibold tnum ${worst.changePercent >= 0 ? "text-positive" : "text-negative"}`}>
                {fmtSignedPct(worst.changePercent)}
              </span>
            )
          }
        />
      </div>

      <RuleSection
        head={`Companies in ${sector.name}`}
        aside={stocks.length > 0 ? <span className="tnum">{stocks.length} tracked</span> : undefined}
      >
        {isLoading ? (
          <div className="space-y-2 py-2">
            {Array(5).fill(null).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-3 w-32 flex-1" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : stocks.length === 0 ? (
          <p className="py-6 text-[13px] text-ink-muted text-center">No stock data available.</p>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Company</th>
                <th className="num">Price</th>
                <th className="num">Today</th>
                <th className="num hidden sm:table-cell">P/E</th>
                <th className="num hidden md:table-cell">Mkt cap</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((s) => {
                const up = s.changePercent >= 0;
                return (
                  <tr key={s.ticker} className="row-link" data-testid={`stock-card-${s.ticker}`}>
                    <td className="shrink font-semibold">
                      <Link href={`/stock/${s.ticker}`} className="text-ink no-underline hover:text-brand-ink">{s.ticker}</Link>
                    </td>
                    <td className="text-ink-secondary">{s.name}</td>
                    <td className="num">${s.price.toFixed(2)}</td>
                    <td className={`num font-semibold ${up ? "text-positive" : "text-negative"}`}>
                      {fmtSignedPct(s.changePercent)}
                    </td>
                    <td className="num hidden sm:table-cell text-ink-secondary">{s.pe != null ? s.pe.toFixed(1) : "--"}</td>
                    <td className="num hidden md:table-cell text-ink-secondary">{s.marketCapDisplay || "--"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Provenance source="Yahoo Finance" extra="quotes may be delayed" />
      </RuleSection>

      <RuleSection head="Related sectors" testId="related-sectors">
        <p className="text-[13.5px] leading-relaxed">
          {sector.related.map((r) => (
            <span key={r}>
              <Link
                href={`/sector/${r}`}
                className="text-brand-ink no-underline hover:text-ink"
                data-testid={`link-sector-${r}`}
              >
                {SECTOR_SLUG_LABELS[r] || r}
              </Link>
              <span className="text-ink-muted"> · </span>
            </span>
          ))}
          <Link href="/stack" className="text-brand-ink no-underline hover:text-ink">
            All sectors →
          </Link>
        </p>
      </RuleSection>
    </PageShell>
  );
}
