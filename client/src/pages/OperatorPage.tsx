import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Building2, TrendingUp, TrendingDown, Zap } from "lucide-react";

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

// Slugs here match OPERATOR_META keys; values are the exact `company` string
// used in server/data/datacenters.json (title case, "xAI"/"CoreWeave" casing).
const SLUG_TO_COMPANY: Record<string, string> = {
  google: "Google", amazon: "Amazon", meta: "Meta", microsoft: "Microsoft",
  oracle: "Oracle", coreweave: "CoreWeave", xai: "xAI", openai: "OpenAI",
};

// Only the four operators GridTilt tracks as public equities get a stock
// cross-link; CoreWeave, xAI, and OpenAI stay untracked rather than guessing.
const SLUG_TO_TICKER: Record<string, string> = {
  google: "GOOGL", amazon: "AMZN", meta: "META", microsoft: "MSFT",
};

interface Datacenter {
  id: number;
  name: string;
  company: string;
  city: string;
  state: string;
  powerMW: number;
  status: "operational" | "construction" | "announced";
  gridOperator: string;
  openDate: string;
}

interface StackRow {
  ticker: string; name: string; price: number; change: number;
  changePercent: number | null; pe: number | null; revenueGrowth: number | null;
  marketCapDisplay?: string;
}
interface StackData { [key: string]: StackRow[] }

// Mirrors PowerMap.tsx's gridOpToRTO exactly (each page re-declares its own
// copy per house convention).
function gridOpToRTO(op: string): string {
  const o = op.toLowerCase();
  if (o.includes("pjm") || o.includes("ppl") || o.includes("aep")) return "PJM";
  if (o.includes("miso") || o.includes("nipsco") || o.includes("kcp")) return "MISO";
  if (o.includes("ercot")) return "ERCOT";
  if (o.includes("tva") || o.includes("southern") || o.includes("duke") || o.includes("serc") ||
      o.includes("dominion") || o.includes("entergy") || o.includes("santee")) return "SERC";
  if (o.includes("spp") || o.includes("seci")) return "SPP";
  if (o.includes("bpa") || o.includes("wecc") || o.includes("nv energy") || o.includes("rocky") ||
      o.includes("aps") || o.includes("srp") || o.includes("westconnect") || o.includes("caiso") ||
      o.includes("pacificorp") || o.includes("idaho power") || o.includes("el paso")) return "WECC";
  if (o.includes("npcc") || o.includes("iso-ne") || o.includes("nyiso")) return "NPCC";
  return "WECC";
}

const STATUS_BADGE: Record<Datacenter["status"], { label: string; className: string }> = {
  operational: { label: "Operational", className: "bg-positive-deep/15 text-positive" },
  construction: { label: "Construction", className: "bg-warning/15 text-warning" },
  announced: { label: "Announced", className: "bg-muted text-muted-foreground" },
};

export default function OperatorPage() {
  const { slug } = useParams<{ slug: string }>();
  const operator = slug ? OPERATOR_META[slug] : null;
  const company = slug ? SLUG_TO_COMPANY[slug] : undefined;
  const ticker = slug ? SLUG_TO_TICKER[slug] : undefined;

  const { data: datacenters, isLoading } = useQuery<Datacenter[]>({
    queryKey: ["/api/datacenters"],
  });

  const { data: stackData } = useQuery<StackData>({
    queryKey: ["/api/stack", "1D"],
    queryFn: () => fetch("/api/stack?timeframe=1D").then((r) => r.json()),
    enabled: !!ticker,
    refetchInterval: 900000,
  });

  if (!operator) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6">
        <Card className="p-8 border-card-border text-center">
          <AlertTriangle className="h-8 w-8 text-negative mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-2">Operator Not Found</h1>
          <p className="text-sm text-muted-foreground">
            <Link href="/power-map" className="text-brand">View Power</Link> to see all operators.
          </p>
        </Card>
      </div>
    );
  }

  const all = datacenters ?? [];
  const facilities = all.filter((d) => d.company === company);
  const sorted = [...facilities].sort((a, b) => b.powerMW - a.powerMW);
  const trackedMW = facilities.filter((d) => d.status !== "announced").reduce((t, d) => t + d.powerMW, 0);
  const announcedMW = facilities.filter((d) => d.status === "announced").reduce((t, d) => t + d.powerMW, 0);
  const statusCounts = facilities.reduce(
    (acc, d) => ({ ...acc, [d.status]: (acc[d.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  const gridRegions = Array.from(new Set(facilities.map((d) => gridOpToRTO(d.gridOperator)))).sort();
  const largest = sorted[0] ?? null;

  const companyCounts: Record<string, number> = {};
  for (const d of all) companyCounts[d.company] = (companyCounts[d.company] ?? 0) + 1;

  const stockRow = ticker ? stackData?.compute?.find((s) => s.ticker === ticker) : undefined;
  const stockHasChg = typeof stockRow?.changePercent === "number";
  const stockUp = stockHasChg && (stockRow!.changePercent as number) >= 0;

  return (
    <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 space-y-6">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="breadcrumb">
        <Link href="/" className="hover:text-foreground">GridTilt</Link>
        <span>/</span>
        <Link href="/power-map" className="hover:text-foreground">Power</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{operator.name}</span>
      </nav>

      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="h-5 w-5 text-brand" />
            <h1 className="text-2xl font-bold" data-testid="operator-heading">{operator.name} AI Data Centers</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">{operator.description}</p>
        </div>
        {ticker && (
          <Link href={`/stock/${ticker}`} data-testid="link-operator-ticker">
            <Card className="p-3 border-card-border hover:border-brand/40 transition-colors min-w-[140px]">
              <p className="text-10 text-muted-foreground mb-0.5">Public Markets</p>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-brand">${ticker}</span>
                {stockRow && (
                  <>
                    <span className="font-mono text-sm">${stockRow.price.toFixed(2)}</span>
                    {stockHasChg ? (
                      <Badge className={`text-10 font-mono ${stockUp ? "bg-positive-deep/15 text-positive" : "bg-negative-deep/15 text-negative"}`}>
                        {stockUp ? <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> : <TrendingDown className="h-2.5 w-2.5 mr-0.5" />}
                        {stockUp ? "+" : ""}{(stockRow.changePercent as number).toFixed(2)}%
                      </Badge>
                    ) : (
                      <Badge className="text-10 font-mono bg-muted text-muted-foreground">--</Badge>
                    )}
                  </>
                )}
              </div>
            </Card>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4 border-card-border" data-testid="stat-facility-count">
          <p className="text-[11px] text-muted-foreground mb-1">Tracked Facilities</p>
          {isLoading ? <Skeleton className="h-7 w-12" /> : (
            <p className="text-xl font-bold font-mono text-foreground">{facilities.length}</p>
          )}
        </Card>
        <Card className="p-4 border-card-border" data-testid="stat-tracked-capacity">
          <p className="text-[11px] text-muted-foreground mb-1">Tracked Capacity</p>
          {isLoading ? <Skeleton className="h-7 w-16" /> : (
            <p className="text-xl font-bold font-mono text-brand-2" title="operational + construction; announced excluded">
              {(trackedMW / 1000).toFixed(1)} GW
            </p>
          )}
        </Card>
        <Card className="p-4 border-card-border" data-testid="stat-grid-regions">
          <p className="text-[11px] text-muted-foreground mb-1">Grid Regions</p>
          {isLoading ? <Skeleton className="h-7 w-10" /> : (
            <p className="text-xl font-bold font-mono text-foreground">{gridRegions.length || "N/A"}</p>
          )}
        </Card>
        <Card className="p-4 border-card-border" data-testid="stat-largest-facility">
          <p className="text-[11px] text-muted-foreground mb-1">Largest Facility</p>
          {isLoading ? <Skeleton className="h-7 w-20" /> : (
            <p className="text-sm font-bold font-mono text-foreground truncate" title={largest?.name}>
              {largest ? `${largest.powerMW.toLocaleString()} MW` : "N/A"}
            </p>
          )}
        </Card>
      </div>

      <Card className="p-5 border-card-border" data-testid="operator-strategy">
        <h2 className="text-[13px] font-semibold text-foreground mb-3">Geographic Strategy</h2>
        <p className="text-sm text-muted-foreground">{operator.strategy}</p>
      </Card>

      <Card className="p-5 border-card-border" data-testid="operator-facilities">
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-[13px] font-semibold text-foreground">Tracked Facilities</h2>
          {facilities.length > 0 && (
            <span className="text-10 text-muted-foreground">
              {statusCounts.operational ?? 0} operational &middot; {statusCounts.construction ?? 0} under construction
              {statusCounts.announced ? ` · ${statusCounts.announced} announced (+${(announcedMW / 1000).toFixed(1)} GW, excluded above)` : ""}
            </span>
          )}
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4" data-testid="operator-facilities-empty">
            No facilities for {operator.name} in the tracked dataset yet.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-10 text-muted-foreground border-b border-border">
                  <th className="font-medium py-1.5 px-1">Facility</th>
                  <th className="font-medium py-1.5 px-1">Location</th>
                  <th className="font-medium py-1.5 px-1">Grid</th>
                  <th className="font-medium py-1.5 px-1 text-right">Power</th>
                  <th className="font-medium py-1.5 px-1 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((d) => {
                  const badge = STATUS_BADGE[d.status];
                  return (
                    <tr key={d.id} className="border-b border-border/50 last:border-0" data-testid={`operator-facility-${d.id}`}>
                      <td className="py-2 px-1 font-medium text-foreground">{d.name}</td>
                      <td className="py-2 px-1 text-muted-foreground whitespace-nowrap">{d.city}, {d.state}</td>
                      <td className="py-2 px-1 text-muted-foreground font-mono whitespace-nowrap">{gridOpToRTO(d.gridOperator)}</td>
                      <td className="py-2 px-1 text-right font-mono text-foreground whitespace-nowrap">{d.powerMW.toLocaleString()} MW</td>
                      <td className="py-2 px-1 text-right">
                        <Badge className={`text-10 font-mono ${badge.className}`}>{badge.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5 border-card-border" data-testid="operator-map-link">
        <h2 className="text-[13px] font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-brand" /> Interactive Map
        </h2>
        <p className="text-sm text-muted-foreground mb-3">
          View every {operator.name} facility plotted on the interactive Power map.
        </p>
        <Link
          href={`/power-map?companies=${encodeURIComponent(company ?? operator.name)}`}
          className="inline-flex items-center gap-1.5 text-sm text-brand hover:text-brand-2 font-medium"
          data-testid="link-filtered-map"
        >
          Open Power filtered to {operator.name}
        </Link>
      </Card>

      <Card className="p-5 border-card-border" data-testid="other-operators">
        <h2 className="text-[13px] font-semibold text-foreground mb-3">Other Operators</h2>
        <div className="flex flex-wrap gap-2">
          {ALL_OPERATORS.filter((o) => o !== slug).map((o) => (
            <Link key={o} href={`/operator/${o}`}>
              <Badge className="bg-muted/50 text-muted-foreground hover:bg-muted/70 cursor-pointer" data-testid={`link-operator-${o}`}>
                {OPERATOR_META[o].name}
                {!isLoading && <span className="opacity-50 ml-1">{companyCounts[SLUG_TO_COMPANY[o]] ?? 0}</span>}
              </Badge>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="p-5 border-card-border">
        <h2 className="text-[13px] font-semibold text-foreground mb-3">Related Tools</h2>
        <div className="space-y-2 text-sm">
          <Link href="/power-map" className="block text-brand hover:text-brand-2">Power</Link>
          <Link href="/analyze?tab=scenario" className="block text-brand hover:text-brand-2">Analyze</Link>
          <Link href="/catalysts" className="block text-brand hover:text-brand-2">Catalyst Tracker</Link>
        </div>
      </Card>
    </div>
  );
}
