import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

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
      <div className="max-w-5xl mx-auto p-6">
        <Card className="p-8 border-card-border text-center">
          <AlertTriangle className="h-8 w-8 text-negative mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-2">Sector Not Found</h1>
          <p className="text-sm text-muted-foreground">
            <Link href="/stack" className="text-brand">Browse Equities</Link> to see all sectors.
          </p>
        </Card>
      </div>
    );
  }

  const stocks = stackData?.[sector.key] || [];
  const avgChange = stocks.length > 0
    ? stocks.reduce((s, st) => s + (st.changePercent || 0), 0) / stocks.length
    : 0;
  const best = stocks.length > 0 ? [...stocks].sort((a, b) => b.changePercent - a.changePercent)[0] : null;
  const worst = stocks.length > 0 ? [...stocks].sort((a, b) => a.changePercent - b.changePercent)[0] : null;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="breadcrumb">
        <Link href="/" className="hover:text-foreground">GridTilt</Link>
        <span>/</span>
        <Link href="/stack" className="hover:text-foreground">Equities</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{sector.name}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold mb-2" data-testid="sector-heading">{sector.name}</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">{sector.description}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 border-card-border text-center" data-testid="stat-avg-change">
          <p className="text-[11px] text-muted-foreground mb-1">Avg Change</p>
          <p className={`text-xl font-bold font-mono ${avgChange >= 0 ? "text-positive" : "text-negative"}`}>
            {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}%
          </p>
        </Card>
        <Card className="p-4 border-card-border text-center" data-testid="stat-best">
          <p className="text-[11px] text-muted-foreground mb-1">Best Performer</p>
          <p className="text-sm font-bold font-mono text-positive">{best ? `${best.ticker} +${best.changePercent.toFixed(2)}%` : "N/A"}</p>
        </Card>
        <Card className="p-4 border-card-border text-center" data-testid="stat-worst">
          <p className="text-[11px] text-muted-foreground mb-1">Worst Performer</p>
          <p className="text-sm font-bold font-mono text-negative">{worst ? `${worst.ticker} ${worst.changePercent.toFixed(2)}%` : "N/A"}</p>
        </Card>
      </div>

      <div>
        <h2 className="text-[13px] font-semibold text-foreground mb-3">
          {stocks.length} Stocks in {sector.name}
        </h2>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stocks.map((s) => {
              const up = s.changePercent >= 0;
              return (
                <Link key={s.ticker} href={`/stock/${s.ticker}`}>
                  <Card className="p-4 border-card-border hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer" data-testid={`stock-card-${s.ticker}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="font-bold text-sm font-mono">{s.ticker}</span>
                        <p className="text-xs text-muted-foreground truncate max-w-[140px]">{s.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-sm font-mono">${s.price.toFixed(2)}</p>
                        <Badge className={`text-xs font-mono ${up ? "bg-positive-deep/15 text-positive" : "bg-negative-deep/15 text-negative"}`}>
                          {up ? <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> : <TrendingDown className="h-2.5 w-2.5 mr-0.5" />}
                          {up ? "+" : ""}{s.changePercent.toFixed(2)}%
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>P/E: {s.pe?.toFixed(1) || "N/A"}</span>
                      {s.marketCapDisplay && <span>{s.marketCapDisplay}</span>}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <Card className="p-5 border-card-border" data-testid="related-sectors">
        <h2 className="text-[13px] font-semibold text-foreground mb-3">Related Sectors</h2>
        <div className="flex flex-wrap gap-2">
          {sector.related.map((r) => (
            <Link key={r} href={`/sector/${r}`}>
              <Badge className="bg-brand/15 text-brand border-brand/25 hover:bg-brand/25 cursor-pointer" data-testid={`link-sector-${r}`}>
                {SECTOR_SLUG_LABELS[r] || r}
              </Badge>
            </Link>
          ))}
          <Link href="/stack">
            <Badge className="bg-muted/50 text-muted-foreground hover:bg-muted/70 cursor-pointer">View All Sectors</Badge>
          </Link>
        </div>
      </Card>
    </div>
  );
}
