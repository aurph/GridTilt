import { useParams, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, MapPin } from "lucide-react";

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

  if (!region) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <Card className="p-8 border-card-border text-center">
          <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-3" />
          <h1 className="text-lg font-semibold mb-2">Region Not Found</h1>
          <p className="text-sm text-muted-foreground">
            <Link href="/power-map" className="text-[#F07800]">View the Power Map</Link> to see all grid regions.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="breadcrumb">
        <Link href="/" className="hover:text-foreground">GridTilt</Link>
        <span>/</span>
        <Link href="/power-map" className="hover:text-foreground">Power Map</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{region.name}</span>
      </nav>

      <div>
        <div className="flex items-center gap-3 mb-2">
          <MapPin className="h-5 w-5 text-[#F07800]" />
          <h1 className="text-2xl font-bold" data-testid="region-heading">{region.fullName} ({region.name})</h1>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Coverage: {region.states}</p>
        <p className="text-sm text-muted-foreground max-w-3xl">{region.description}</p>
      </div>

      <Card className="p-5 border-card-border" data-testid="region-map-link">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Interactive Map</h2>
        <p className="text-sm text-muted-foreground mb-3">
          View all data center facilities in the {region.name} region on the interactive Power Map.
        </p>
        <Link
          href={`/power-map?region=${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#F07800] hover:text-[#F0A500] font-medium"
          data-testid="link-filtered-map"
        >
          Open Power Map filtered to {region.name}
        </Link>
      </Card>

      <Card className="p-5 border-card-border" data-testid="related-regions">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Other Grid Regions</h2>
        <div className="flex flex-wrap gap-2">
          {ALL_REGIONS.filter((r) => r !== slug).map((r) => (
            <Link key={r} href={`/region/${r}`}>
              <Badge className="bg-muted/50 text-muted-foreground hover:bg-muted/70 cursor-pointer" data-testid={`link-region-${r}`}>
                {REGION_META[r].name}
              </Badge>
            </Link>
          ))}
        </div>
      </Card>

      <Card className="p-5 border-card-border">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Related Tools</h2>
        <div className="space-y-2 text-sm">
          <Link href="/power-map" className="block text-[#F07800] hover:text-[#F0A500]">Power Map</Link>
          <Link href="/trade" className="block text-[#F07800] hover:text-[#F0A500]">Scenario Calculator</Link>
          <Link href="/stack" className="block text-[#F07800] hover:text-[#F0A500]">The Stack</Link>
        </div>
      </Card>
    </div>
  );
}
