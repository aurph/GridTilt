import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";

const SECTOR_META: Record<string, { key: string; name: string; description: string; related: string[] }> = {
  "nuclear-power": {
    key: "nuclear", name: "Nuclear Power",
    description: "Nuclear generators provide the 24/7 baseload power AI data centers require. Constellation Energy, Vistra, and Talen own the existing fleet. Oklo and NuScale are building next-generation SMRs. This sector benefits directly from hyperscaler power purchase agreements and nuclear restart policies.",
    related: ["uranium", "utilities"],
  },
  "uranium": {
    key: "uranium", name: "Uranium & Fuel Cycle",
    description: "Every nuclear reactor requires enriched uranium fuel. As AI-driven nuclear restarts and new builds accelerate, uranium demand is rising against constrained supply. Cameco, NexGen, and Uranium Energy Corp are the primary Western miners.",
    related: ["nuclear-power", "etf-benchmarks"],
  },
  "compute": {
    key: "compute", name: "Compute",
    description: "GPU and semiconductor companies building the silicon that drives AI training and inference. NVIDIA dominates with 80%+ market share in AI accelerators. Every GPU sold eventually requires power infrastructure to operate.",
    related: ["power-hardware", "data-center-reits"],
  },
  "power-hardware": {
    key: "powerHardware", name: "Power Hardware",
    description: "Electrical equipment manufacturers supplying transformers, switchgear, cooling systems, and power distribution units for data centers. GE Vernova, Eaton, and Vertiv are seeing multi-year backlogs as data center construction accelerates.",
    related: ["construction-epc", "utilities"],
  },
  "utilities": {
    key: "utilities", name: "Utilities",
    description: "Regulated and merchant utilities providing grid power to data center clusters. NextEra, Dominion, and Southern Company are negotiating long-term power purchase agreements with hyperscalers. Grid interconnection queues are 4+ years.",
    related: ["nuclear-power", "power-hardware"],
  },
  "data-center-reits": {
    key: "dataCenters", name: "Data Center REITs",
    description: "Real estate investment trusts owning and operating the physical facilities where AI compute runs. Equinix and Digital Realty control the majority of US colocation capacity. IREN is a pure-play AI compute facility operator.",
    related: ["compute", "construction-epc"],
  },
  "construction-epc": {
    key: "construction", name: "Construction & EPC",
    description: "Engineering, procurement, and construction firms building data centers and grid infrastructure. Quanta Services, EMCOR, and MasTec are seeing record backlogs driven by both data center and transmission line construction.",
    related: ["power-hardware", "utilities"],
  },
  "etf-benchmarks": {
    key: "etfsBenchmarks", name: "ETF Benchmarks",
    description: "Exchange-traded funds benchmarking exposure to uranium, nuclear, grid infrastructure, and technology sectors. URA and URNM track uranium miners. GRID and PAVE track grid and infrastructure construction.",
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
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-2">Sector Not Found</h1>
          <p className="text-sm text-muted-foreground">
            <Link href="/stack" className="text-[#F07800]">Browse The Stack</Link> to see all sectors.
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
        <Link href="/stack" className="hover:text-foreground">The Stack</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{sector.name}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold mb-2" data-testid="sector-heading">{sector.name}</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">{sector.description}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 border-card-border text-center" data-testid="stat-avg-change">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Avg Change</p>
          <p className={`text-xl font-bold font-mono ${avgChange >= 0 ? "text-green-400" : "text-red-400"}`}>
            {avgChange >= 0 ? "+" : ""}{avgChange.toFixed(2)}%
          </p>
        </Card>
        <Card className="p-4 border-card-border text-center" data-testid="stat-best">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Best Performer</p>
          <p className="text-sm font-bold font-mono text-green-400">{best ? `${best.ticker} +${best.changePercent.toFixed(2)}%` : "N/A"}</p>
        </Card>
        <Card className="p-4 border-card-border text-center" data-testid="stat-worst">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Worst Performer</p>
          <p className="text-sm font-bold font-mono text-red-400">{worst ? `${worst.ticker} ${worst.changePercent.toFixed(2)}%` : "N/A"}</p>
        </Card>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
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
                        <Badge className={`text-xs font-mono ${up ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
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
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Related Sectors</h2>
        <div className="flex flex-wrap gap-2">
          {sector.related.map((r) => (
            <Link key={r} href={`/sector/${r}`}>
              <Badge className="bg-[#F07800]/15 text-[#F07800] border-[#F07800]/25 hover:bg-[#F07800]/25 cursor-pointer" data-testid={`link-sector-${r}`}>
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
