import { useState } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { X, Info, Zap, MapPin, Building2, Calendar, Activity } from "lucide-react";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

interface DataCenter {
  id: number;
  name: string;
  company: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  powerMW: number;
  status: "operational" | "construction" | "announced";
  annualMWh: number;
  gridOperator: string;
  openDate: string;
}

const DATA_CENTERS: DataCenter[] = [
  { id: 1, name: "Azure Phoenix Mega Campus", company: "Microsoft", city: "Phoenix", state: "AZ", lat: 33.4484, lng: -112.074, powerMW: 600, status: "construction", annualMWh: 5256000, gridOperator: "APS / SRP", openDate: "2026 Q1" },
  { id: 2, name: "Google Midlothian DC", company: "Google", city: "Midlothian", state: "TX", lat: 32.4827, lng: -96.9939, powerMW: 480, status: "construction", annualMWh: 4204800, gridOperator: "ERCOT", openDate: "2025 Q3" },
  { id: 3, name: "AWS US-East-2 Expansion", company: "Amazon", city: "Columbus", state: "OH", lat: 39.9612, lng: -82.9988, powerMW: 750, status: "operational", annualMWh: 6570000, gridOperator: "PJM", openDate: "2023" },
  { id: 4, name: "Meta DeKalb AI Campus", company: "Meta", city: "DeKalb", state: "IL", lat: 41.9295, lng: -88.7498, powerMW: 380, status: "operational", annualMWh: 3328800, gridOperator: "MISO", openDate: "2024 Q2" },
  { id: 5, name: "Microsoft Cheyenne Campus", company: "Microsoft", city: "Cheyenne", state: "WY", lat: 41.14, lng: -104.82, powerMW: 200, status: "operational", annualMWh: 1752000, gridOperator: "WestConnect", openDate: "2022" },
  { id: 6, name: "Google Changchun-Reno DC", company: "Google", city: "Reno", state: "NV", lat: 39.5296, lng: -119.8138, powerMW: 160, status: "operational", annualMWh: 1401600, gridOperator: "NV Energy", openDate: "2023" },
  { id: 7, name: "Amazon QTS Atlanta", company: "Amazon", city: "Atlanta", state: "GA", lat: 33.749, lng: -84.388, powerMW: 420, status: "construction", annualMWh: 3679200, gridOperator: "Southern Co.", openDate: "2025 Q4" },
  { id: 8, name: "Meta Gallatin TN Campus", company: "Meta", city: "Gallatin", state: "TN", lat: 36.388, lng: -86.4458, powerMW: 300, status: "operational", annualMWh: 2628000, gridOperator: "TVA", openDate: "2023" },
  { id: 9, name: "Google Pryor Creek AI DC", company: "Google", city: "Pryor Creek", state: "OK", lat: 36.308, lng: -95.317, powerMW: 550, status: "construction", annualMWh: 4818000, gridOperator: "SECI", openDate: "2026 Q2" },
  { id: 10, name: "Microsoft Goodyear Campus", company: "Microsoft", city: "Goodyear", state: "AZ", lat: 33.4353, lng: -112.358, powerMW: 400, status: "announced", annualMWh: 3504000, gridOperator: "APS", openDate: "2027 Q1" },
  { id: 11, name: "AWS Virginia HQ Complex", company: "Amazon", city: "Ashburn", state: "VA", lat: 39.0438, lng: -77.4874, powerMW: 900, status: "operational", annualMWh: 7884000, gridOperator: "PJM", openDate: "2020" },
  { id: 12, name: "Apple Maiden NC DC", company: "Apple", city: "Maiden", state: "NC", lat: 35.5779, lng: -81.2087, powerMW: 165, status: "operational", annualMWh: 1445400, gridOperator: "Duke Energy", openDate: "2012" },
  { id: 13, name: "Meta Eagle Mountain Campus", company: "Meta", city: "Eagle Mountain", state: "UT", lat: 40.3144, lng: -112.0, powerMW: 520, status: "construction", annualMWh: 4555200, gridOperator: "Rocky Mtn. Power", openDate: "2025 Q2" },
  { id: 14, name: "Google Corpus Christi", company: "Google", city: "Corpus Christi", state: "TX", lat: 27.8006, lng: -97.3964, powerMW: 350, status: "construction", annualMWh: 3066000, gridOperator: "ERCOT", openDate: "2026 Q3" },
  { id: 15, name: "Microsoft Quincy WA", company: "Microsoft", city: "Quincy", state: "WA", lat: 47.2343, lng: -119.8526, powerMW: 280, status: "operational", annualMWh: 2452800, gridOperator: "BPA", openDate: "2020" },
  { id: 16, name: "Amazon Northlake TX Hub", company: "Amazon", city: "Northlake", state: "TX", lat: 33.0001, lng: -97.2856, powerMW: 600, status: "construction", annualMWh: 5256000, gridOperator: "ERCOT", openDate: "2026 Q1" },
  { id: 17, name: "xAI Memphis Colossus", company: "xAI", city: "Memphis", state: "TN", lat: 35.1495, lng: -90.0490, powerMW: 200, status: "operational", annualMWh: 1752000, gridOperator: "TVA", openDate: "2024 Q3" },
  { id: 18, name: "OpenAI / CoreWeave Abilene", company: "OpenAI", city: "Abilene", state: "TX", lat: 32.4487, lng: -99.7331, powerMW: 800, status: "construction", annualMWh: 7008000, gridOperator: "ERCOT", openDate: "2026 Q2" },
  { id: 19, name: "Google Holland MI DC", company: "Google", city: "Holland", state: "MI", lat: 42.7875, lng: -86.1089, powerMW: 240, status: "operational", annualMWh: 2102400, gridOperator: "MISO", openDate: "2021" },
  { id: 20, name: "Microsoft Boydton VA", company: "Microsoft", city: "Boydton", state: "VA", lat: 36.6673, lng: -78.3839, powerMW: 450, status: "operational", annualMWh: 3942000, gridOperator: "PJM", openDate: "2019" },
  { id: 21, name: "Amazon Umatilla OR", company: "Amazon", city: "Umatilla", state: "OR", lat: 45.9165, lng: -119.3403, powerMW: 300, status: "operational", annualMWh: 2628000, gridOperator: "BPA", openDate: "2022" },
  { id: 22, name: "Meta Papillion NE Campus", company: "Meta", city: "Papillion", state: "NE", lat: 41.1533, lng: -96.0422, powerMW: 180, status: "operational", annualMWh: 1576800, gridOperator: "MISO", openDate: "2023" },
  { id: 23, name: "Google Clarksville TN", company: "Google", city: "Clarksville", state: "TN", lat: 36.5298, lng: -87.3595, powerMW: 520, status: "announced", annualMWh: 4555200, gridOperator: "TVA", openDate: "2027 Q2" },
  { id: 24, name: "Microsoft Mt. Pleasant WI", company: "Microsoft", city: "Mt. Pleasant", state: "WI", lat: 42.7094, lng: -87.8895, powerMW: 320, status: "announced", annualMWh: 2803200, gridOperator: "MISO", openDate: "2027 Q3" },
  { id: 25, name: "Oracle Nashville DC", company: "Oracle", city: "Nashville", state: "TN", lat: 36.1627, lng: -86.7816, powerMW: 150, status: "operational", annualMWh: 1314000, gridOperator: "TVA", openDate: "2023" },
];

const companyColors: Record<string, string> = {
  Microsoft: "#0078d4",
  Google: "#4285f4",
  Amazon: "#ff9900",
  Meta: "#1877f2",
  Apple: "#555",
  xAI: "#f0a500",
  OpenAI: "#10a37f",
  Oracle: "#c74634",
};

function getDotColor(powerMW: number) {
  if (powerMW < 100) return "#22c55e";
  if (powerMW <= 500) return "#eab308";
  return "#ef4444";
}

function getStatusBadge(status: DataCenter["status"]) {
  const map = {
    operational: { label: "Operational", class: "bg-green-500/15 text-green-400" },
    construction: { label: "Under Construction", class: "bg-yellow-500/15 text-yellow-400" },
    announced: { label: "Announced", class: "bg-blue-500/15 text-blue-400" },
  };
  return map[status];
}

export default function PowerMap() {
  const [selected, setSelected] = useState<DataCenter | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const companies = ["all", ...Array.from(new Set(DATA_CENTERS.map((d) => d.company)))];
  const filtered = filter === "all" ? DATA_CENTERS : DATA_CENTERS.filter((d) => d.company === filter);

  const totalMW = DATA_CENTERS.reduce((s, d) => s + d.powerMW, 0);
  const totalTWh = (DATA_CENTERS.reduce((s, d) => s + d.annualMWh, 0) / 1_000_000).toFixed(1);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="grid-bg border-b border-border px-6 py-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Power Map</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Announced & operating data centers by power draw. {DATA_CENTERS.length} locations tracked.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-muted-foreground">&lt;100 MW</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-yellow-500" />
              <span className="text-muted-foreground">100–500 MW</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-muted-foreground">&gt;500 MW</span>
            </div>
          </div>
        </div>

        {/* Summary stats */}
        <div className="flex flex-wrap gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#F0A500]" />
            <span className="text-muted-foreground">Total capacity:</span>
            <span className="font-semibold text-foreground">{(totalMW / 1000).toFixed(1)} GW</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[#1E90FF]" />
            <span className="text-muted-foreground">Annual consumption:</span>
            <span className="font-semibold text-foreground">{totalTWh} TWh/yr</span>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Equivalent to powering</span>
            <span className="font-semibold text-foreground">{Math.round(parseFloat(totalTWh) * 1000 / 10.5)}M homes</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Map area */}
        <div className="flex-1 relative" style={{ minHeight: 400 }}>
          {/* Company filter */}
          <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-1.5">
            {companies.map((c) => (
              <Button
                key={c}
                size="sm"
                variant={filter === c ? "default" : "secondary"}
                className="h-7 text-xs px-2.5"
                onClick={() => setFilter(c)}
                data-testid={`filter-${c}`}
              >
                {c === "all" ? "All" : c}
              </Button>
            ))}
          </div>

          <ComposableMap
            projection="geoAlbersUsa"
            style={{ width: "100%", height: "100%", minHeight: 400 }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="rgba(30, 144, 255, 0.05)"
                    stroke="rgba(30, 144, 255, 0.15)"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: "rgba(30, 144, 255, 0.1)" },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>

            {filtered.map((dc) => (
              <Marker
                key={dc.id}
                coordinates={[dc.lng, dc.lat]}
                onClick={() => setSelected(dc)}
              >
                <circle
                  r={Math.sqrt(dc.powerMW / 30) + 4}
                  fill={getDotColor(dc.powerMW)}
                  fillOpacity={0.85}
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth={1}
                  style={{ cursor: "pointer", transition: "all 0.2s" }}
                  className={selected?.id === dc.id ? "opacity-100" : "opacity-75 hover:opacity-100"}
                />
                {selected?.id === dc.id && (
                  <circle
                    r={Math.sqrt(dc.powerMW / 30) + 8}
                    fill="none"
                    stroke={getDotColor(dc.powerMW)}
                    strokeWidth={1.5}
                    opacity={0.5}
                  />
                )}
              </Marker>
            ))}
          </ComposableMap>

          <div className="absolute bottom-3 left-4 right-4">
            <p className="text-xs text-muted-foreground text-center">
              Click a dot to view facility details. Dot size = power draw.
            </p>
          </div>
        </div>

        {/* Sidebar panel */}
        {selected ? (
          <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-border bg-card/60 animate-slide-in-right" data-testid="datacenter-sidebar">
            <div className="p-5 border-b border-border flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Selected Facility</p>
                <h3 className="font-semibold text-foreground leading-tight">{selected.name}</h3>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setSelected(null)} data-testid="button-close-sidebar">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  className="text-xs"
                  style={{
                    backgroundColor: `${companyColors[selected.company] ?? "#666"}20`,
                    color: companyColors[selected.company] ?? "#999",
                    border: `1px solid ${companyColors[selected.company] ?? "#666"}40`,
                  }}
                >
                  {selected.company}
                </Badge>
                <Badge className={getStatusBadge(selected.status).class + " text-xs"}>
                  {getStatusBadge(selected.status).label}
                </Badge>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm font-medium text-foreground">{selected.city}, {selected.state}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Zap className="h-4 w-4 text-[#F0A500] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Planned Capacity</p>
                    <p className="text-sm font-bold text-[#F0A500]">{selected.powerMW} MW</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Activity className="h-4 w-4 text-[#1E90FF] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Est. Annual Power</p>
                    <p className="text-sm font-bold text-[#1E90FF]">{(selected.annualMWh / 1_000_000).toFixed(2)} TWh/yr</p>
                    <p className="text-xs text-muted-foreground">{Math.round(selected.annualMWh / 10500).toLocaleString()} homes equivalent</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Grid Operator</p>
                    <p className="text-sm font-medium text-foreground">{selected.gridOperator}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Online Date</p>
                    <p className="text-sm font-medium text-foreground">{selected.openDate}</p>
                  </div>
                </div>
              </div>

              {/* Power classification */}
              <div className="rounded-md p-3 border border-border bg-muted/20">
                <p className="text-xs text-muted-foreground mb-1">Power Classification</p>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: getDotColor(selected.powerMW) }} />
                  <p className="text-sm font-medium text-foreground">
                    {selected.powerMW < 100 ? "Light Load (<100 MW)" : selected.powerMW <= 500 ? "Medium Load (100–500 MW)" : "Heavy Load (>500 MW)"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden lg:flex w-80 border-l border-border items-center justify-center p-8 text-center">
            <div>
              <MapPin className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Click a dot on the map to view facility details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
