import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Zap, MapPin, Building2, Calendar, Activity, Globe, Network } from "lucide-react";

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
  { id: 1,  name: "Azure Phoenix Mega Campus",      company: "Microsoft", city: "Phoenix",        state: "AZ", lat: 33.4484, lng: -112.074,  powerMW: 600, status: "construction", annualMWh: 5256000,  gridOperator: "APS/WECC",          openDate: "2026 Q1" },
  { id: 2,  name: "Google Midlothian DC",            company: "Google",    city: "Midlothian",     state: "TX", lat: 32.4827, lng: -96.9939,  powerMW: 480, status: "construction", annualMWh: 4204800,  gridOperator: "ERCOT",             openDate: "2025 Q4" },
  { id: 3,  name: "AWS US-East-2 Expansion",         company: "Amazon",    city: "Columbus",       state: "OH", lat: 39.9612, lng: -82.9988,  powerMW: 750, status: "operational",  annualMWh: 6570000,  gridOperator: "PJM",               openDate: "2023" },
  { id: 4,  name: "Meta DeKalb AI Campus",           company: "Meta",      city: "DeKalb",         state: "IL", lat: 41.9295, lng: -88.7498,  powerMW: 380, status: "operational",  annualMWh: 3328800,  gridOperator: "MISO",              openDate: "2024 Q2" },
  { id: 5,  name: "Microsoft Cheyenne Campus",       company: "Microsoft", city: "Cheyenne",       state: "WY", lat: 41.14,   lng: -104.82,   powerMW: 200, status: "operational",  annualMWh: 1752000,  gridOperator: "WECC",              openDate: "2022" },
  { id: 6,  name: "Google Reno DC",                  company: "Google",    city: "Reno",           state: "NV", lat: 39.5296, lng: -119.8138, powerMW: 160, status: "operational",  annualMWh: 1401600,  gridOperator: "NV Energy/WECC",    openDate: "2023" },
  { id: 7,  name: "Amazon QTS Atlanta",              company: "Amazon",    city: "Atlanta",        state: "GA", lat: 33.749,  lng: -84.388,   powerMW: 420, status: "operational",  annualMWh: 3679200,  gridOperator: "Southern Co./SERC", openDate: "2025 Q1" },
  { id: 8,  name: "Meta Gallatin TN Campus",         company: "Meta",      city: "Gallatin",       state: "TN", lat: 36.388,  lng: -86.4458,  powerMW: 300, status: "operational",  annualMWh: 2628000,  gridOperator: "TVA/SERC",          openDate: "2023" },
  { id: 9,  name: "Google Pryor Creek AI DC",        company: "Google",    city: "Pryor Creek",    state: "OK", lat: 36.308,  lng: -95.317,   powerMW: 550, status: "construction", annualMWh: 4818000,  gridOperator: "SPP",               openDate: "2026 Q2" },
  { id: 10, name: "Microsoft Goodyear Campus",       company: "Microsoft", city: "Goodyear",       state: "AZ", lat: 33.4353, lng: -112.358,  powerMW: 400, status: "announced",   annualMWh: 3504000,  gridOperator: "APS/WECC",          openDate: "2027 Q1" },
  { id: 11, name: "AWS Ashburn HQ Complex",          company: "Amazon",    city: "Ashburn",        state: "VA", lat: 39.0438, lng: -77.4874,  powerMW: 900, status: "operational",  annualMWh: 7884000,  gridOperator: "PJM",               openDate: "2020" },
  { id: 12, name: "Apple Maiden NC DC",              company: "Apple",     city: "Maiden",         state: "NC", lat: 35.5779, lng: -81.2087,  powerMW: 165, status: "operational",  annualMWh: 1445400,  gridOperator: "Duke Energy/SERC",  openDate: "2012" },
  { id: 13, name: "Meta Eagle Mountain Campus",      company: "Meta",      city: "Eagle Mountain", state: "UT", lat: 40.3144, lng: -112.0,    powerMW: 520, status: "operational",  annualMWh: 4555200,  gridOperator: "Rocky Mtn./WECC",   openDate: "2025 Q2" },
  { id: 14, name: "Google Corpus Christi",           company: "Google",    city: "Corpus Christi", state: "TX", lat: 27.8006, lng: -97.3964,  powerMW: 350, status: "construction", annualMWh: 3066000,  gridOperator: "ERCOT",             openDate: "2026 Q3" },
  { id: 15, name: "Microsoft Quincy WA",             company: "Microsoft", city: "Quincy",         state: "WA", lat: 47.2343, lng: -119.8526, powerMW: 280, status: "operational",  annualMWh: 2452800,  gridOperator: "BPA/WECC",          openDate: "2020" },
  { id: 16, name: "Amazon Northlake TX Hub",         company: "Amazon",    city: "Northlake",      state: "TX", lat: 33.0001, lng: -97.2856,  powerMW: 600, status: "construction", annualMWh: 5256000,  gridOperator: "ERCOT",             openDate: "2026 Q1" },
  { id: 17, name: "xAI Memphis Colossus Phase 1",   company: "xAI",       city: "Memphis",        state: "TN", lat: 35.1495, lng: -90.049,   powerMW: 200, status: "operational",  annualMWh: 1752000,  gridOperator: "TVA/SERC",          openDate: "2024 Q3" },
  { id: 18, name: "Stargate Abilene (OpenAI Ph.1)", company: "OpenAI",    city: "Abilene",        state: "TX", lat: 32.4487, lng: -99.7331,  powerMW: 800, status: "construction", annualMWh: 7008000,  gridOperator: "ERCOT",             openDate: "2026 Q2" },
  { id: 19, name: "Google Holland MI DC",            company: "Google",    city: "Holland",        state: "MI", lat: 42.7875, lng: -86.1089,  powerMW: 240, status: "operational",  annualMWh: 2102400,  gridOperator: "MISO",              openDate: "2021" },
  { id: 20, name: "Microsoft Boydton VA",            company: "Microsoft", city: "Boydton",        state: "VA", lat: 36.6673, lng: -78.3839,  powerMW: 450, status: "operational",  annualMWh: 3942000,  gridOperator: "PJM",               openDate: "2019" },
  { id: 21, name: "Amazon Umatilla OR",              company: "Amazon",    city: "Umatilla",       state: "OR", lat: 45.9165, lng: -119.3403, powerMW: 300, status: "operational",  annualMWh: 2628000,  gridOperator: "BPA/WECC",          openDate: "2022" },
  { id: 22, name: "Meta Papillion NE Campus",        company: "Meta",      city: "Papillion",      state: "NE", lat: 41.1533, lng: -96.0422,  powerMW: 180, status: "operational",  annualMWh: 1576800,  gridOperator: "SPP",               openDate: "2023" },
  { id: 23, name: "Google Clarksville TN",           company: "Google",    city: "Clarksville",    state: "TN", lat: 36.5298, lng: -87.3595,  powerMW: 520, status: "announced",   annualMWh: 4555200,  gridOperator: "TVA/SERC",          openDate: "2027 Q2" },
  { id: 24, name: "Microsoft Mt. Pleasant WI",       company: "Microsoft", city: "Mt. Pleasant",   state: "WI", lat: 42.7094, lng: -87.8895,  powerMW: 320, status: "announced",   annualMWh: 2803200,  gridOperator: "MISO",              openDate: "2027 Q3" },
  { id: 25, name: "Oracle Nashville DC",             company: "Oracle",    city: "Nashville",      state: "TN", lat: 36.1627, lng: -86.7816,  powerMW: 150, status: "operational",  annualMWh: 1314000,  gridOperator: "TVA/SERC",          openDate: "2023" },
  { id: 26, name: "Stargate Abilene Phase 2",        company: "OpenAI",    city: "Abilene",        state: "TX", lat: 32.46,   lng: -99.71,    powerMW: 500, status: "announced",   annualMWh: 4380000,  gridOperator: "ERCOT",             openDate: "2027 Q1" },
  { id: 27, name: "CoreWeave Mebane NC",             company: "CoreWeave", city: "Mebane",         state: "NC", lat: 36.10,   lng: -79.27,    powerMW: 300, status: "construction", annualMWh: 2628000,  gridOperator: "Duke Energy/SERC",  openDate: "2026 Q2" },
  { id: 28, name: "Microsoft Altoona IA Campus",     company: "Microsoft", city: "Altoona",        state: "IA", lat: 41.65,   lng: -93.47,    powerMW: 250, status: "operational",  annualMWh: 2190000,  gridOperator: "MISO",              openDate: "2023" },
  { id: 29, name: "Amazon Sterling VA Campus",       company: "Amazon",    city: "Sterling",       state: "VA", lat: 39.00,   lng: -77.43,    powerMW: 650, status: "operational",  annualMWh: 5694000,  gridOperator: "PJM",               openDate: "2022" },
  { id: 30, name: "Google Council Bluffs IA",        company: "Google",    city: "Council Bluffs", state: "IA", lat: 41.26,   lng: -95.86,    powerMW: 200, status: "operational",  annualMWh: 1752000,  gridOperator: "MISO",              openDate: "2021" },
  { id: 31, name: "xAI Memphis Phase 2",             company: "xAI",       city: "Memphis",        state: "TN", lat: 35.17,   lng: -90.07,    powerMW: 800, status: "construction", annualMWh: 7008000,  gridOperator: "TVA/SERC",          openDate: "2026 Q4" },
  { id: 32, name: "Microsoft Racine WI Campus",      company: "Microsoft", city: "Racine",         state: "WI", lat: 42.73,   lng: -87.78,    powerMW: 450, status: "announced",   annualMWh: 3942000,  gridOperator: "MISO",              openDate: "2027 Q4" },
  { id: 33, name: "Amazon Puget Sound WA",           company: "Amazon",    city: "Seattle",        state: "WA", lat: 47.61,   lng: -122.33,   powerMW: 350, status: "construction", annualMWh: 3066000,  gridOperator: "BPA/WECC",          openDate: "2026 Q3" },
  { id: 34, name: "CoreWeave / NVIDIA Secaucus NJ",  company: "CoreWeave", city: "Secaucus",       state: "NJ", lat: 40.79,   lng: -74.06,    powerMW: 180, status: "operational",  annualMWh: 1576800,  gridOperator: "PJM",               openDate: "2024" },
  { id: 35, name: "Meta Forest City NC",             company: "Meta",      city: "Forest City",    state: "NC", lat: 35.67,   lng: -81.86,    powerMW: 290, status: "operational",  annualMWh: 2540400,  gridOperator: "Duke Energy/SERC",  openDate: "2022" },
  { id: 36, name: "Google The Dalles OR",            company: "Google",    city: "The Dalles",     state: "OR", lat: 45.5946, lng: -121.1787, powerMW: 300, status: "operational",  annualMWh: 2628000,  gridOperator: "BPA/WECC",          openDate: "2006" },
  { id: 37, name: "Meta Prineville OR Campus",       company: "Meta",      city: "Prineville",     state: "OR", lat: 44.3010, lng: -120.8347, powerMW: 380, status: "operational",  annualMWh: 3328800,  gridOperator: "PacifiCorp/WECC",   openDate: "2011" },
  { id: 38, name: "Google Lenoir NC",                company: "Google",    city: "Lenoir",         state: "NC", lat: 35.9135, lng: -81.5440,  powerMW: 220, status: "operational",  annualMWh: 1927200,  gridOperator: "Duke Energy/SERC",  openDate: "2007" },
  { id: 39, name: "Meta New Albany OH Campus",       company: "Meta",      city: "New Albany",     state: "OH", lat: 40.0814, lng: -82.7874,  powerMW: 360, status: "operational",  annualMWh: 3153600,  gridOperator: "AEP/PJM",           openDate: "2022" },
  { id: 40, name: "Google Moncks Corner SC",         company: "Google",    city: "Moncks Corner",  state: "SC", lat: 33.1968, lng: -80.0081,  powerMW: 450, status: "operational",  annualMWh: 3942000,  gridOperator: "Santee Cooper/SERC", openDate: "2019" },
  { id: 41, name: "Meta Kuna ID Campus",             company: "Meta",      city: "Kuna",           state: "ID", lat: 43.4927, lng: -116.4197, powerMW: 240, status: "operational",  annualMWh: 2102400,  gridOperator: "Idaho Power/WECC",  openDate: "2012" },
];

const STATE_TO_RTO: Record<string, string> = {
  Maine: "NPCC", Vermont: "NPCC", "New Hampshire": "NPCC",
  Massachusetts: "NPCC", Connecticut: "NPCC", "Rhode Island": "NPCC", "New York": "NPCC",
  "New Jersey": "PJM", Delaware: "PJM", Maryland: "PJM",
  Pennsylvania: "PJM", Ohio: "PJM", "West Virginia": "PJM", Virginia: "PJM", Kentucky: "PJM",
  Michigan: "MISO", Indiana: "MISO", Illinois: "MISO", Wisconsin: "MISO",
  Minnesota: "MISO", Iowa: "MISO", Missouri: "MISO",
  Arkansas: "MISO", Louisiana: "MISO", Mississippi: "MISO",
  "North Dakota": "MISO", "South Dakota": "MISO", Montana: "MISO",
  Texas: "ERCOT",
  Tennessee: "SERC", "North Carolina": "SERC", "South Carolina": "SERC",
  Georgia: "SERC", Alabama: "SERC", Florida: "SERC",
  Nebraska: "SPP", Kansas: "SPP", Oklahoma: "SPP",
  Washington: "WECC", Oregon: "WECC", California: "WECC",
  Nevada: "WECC", Idaho: "WECC", Utah: "WECC", Colorado: "WECC",
  Arizona: "WECC", "New Mexico": "WECC", Wyoming: "WECC",
  Alaska: "WECC", Hawaii: "WECC",
};

interface RTOConfig {
  label: string;
  reserveMargin: number;
  aiSignal: "Critical" | "Elevated" | "Moderate" | "Low";
  dcColor: string;
  stressColor: string;
  stressBadgeClass: string;
  legendColor: string;
}

const RTO_CONFIG: Record<string, RTOConfig> = {
  PJM:  { label: "PJM",      reserveMargin: 17.5, aiSignal: "Elevated", dcColor: "rgba(240,165,0,0.13)",   stressColor: "rgba(234,179,8,0.28)",   stressBadgeClass: "bg-yellow-500/20 text-yellow-400", legendColor: "#F0A500" },
  MISO: { label: "MISO",     reserveMargin: 13.4, aiSignal: "Critical", dcColor: "rgba(34,197,94,0.10)",   stressColor: "rgba(239,68,68,0.42)",   stressBadgeClass: "bg-red-500/20 text-red-400",    legendColor: "#22c55e" },
  ERCOT:{ label: "ERCOT",    reserveMargin: 15.8, aiSignal: "Critical", dcColor: "rgba(239,68,68,0.13)",   stressColor: "rgba(239,68,68,0.32)",   stressBadgeClass: "bg-red-500/20 text-red-400",    legendColor: "#ef4444" },
  WECC: { label: "WECC",     reserveMargin: 24.6, aiSignal: "Moderate", dcColor: "rgba(168,85,247,0.11)",  stressColor: "rgba(132,204,22,0.18)",  stressBadgeClass: "bg-green-500/20 text-green-400",legendColor: "#a855f7" },
  SERC: { label: "SERC",     reserveMargin: 23.1, aiSignal: "Moderate", dcColor: "rgba(20,184,166,0.11)",  stressColor: "rgba(34,197,94,0.18)",   stressBadgeClass: "bg-green-500/20 text-green-400",legendColor: "#14b8a6" },
  SPP:  { label: "SPP",      reserveMargin: 27.8, aiSignal: "Low",      dcColor: "rgba(244,63,94,0.10)",   stressColor: "rgba(34,197,94,0.12)",   stressBadgeClass: "bg-green-500/15 text-green-500",legendColor: "#f43f5e" },
  NPCC: { label: "NPCC",     reserveMargin: 26.4, aiSignal: "Low",      dcColor: "rgba(148,163,184,0.11)", stressColor: "rgba(34,197,94,0.12)",   stressBadgeClass: "bg-green-500/15 text-green-500",legendColor: "#94a3b8" },
};

function gridOpToRTO(op: string): string {
  const o = op.toLowerCase();
  if (o.includes("pjm")) return "PJM";
  if (o.includes("miso")) return "MISO";
  if (o.includes("ercot")) return "ERCOT";
  if (o.includes("tva") || o.includes("southern") || o.includes("duke") || o.includes("serc") || o.includes("dominion")) return "SERC";
  if (o.includes("spp") || o.includes("seci")) return "SPP";
  if (o.includes("bpa") || o.includes("wecc") || o.includes("nv energy") || o.includes("rocky") ||
      o.includes("aps") || o.includes("srp") || o.includes("westconnect") || o.includes("caiso")) return "WECC";
  if (o.includes("npcc") || o.includes("iso-ne") || o.includes("nyiso")) return "NPCC";
  return "WECC";
}

const companyColors: Record<string, string> = {
  Microsoft: "#0078d4",
  Google: "#4285f4",
  Amazon: "#ff9900",
  Meta: "#1877f2",
  Apple: "#555",
  xAI: "#f0a500",
  OpenAI: "#10a37f",
  Oracle: "#c74634",
  CoreWeave: "#7c3aed",
};

function getDotColor(powerMW: number) {
  if (powerMW < 100) return "#22c55e";
  if (powerMW <= 500) return "#eab308";
  return "#ef4444";
}

function getStatusBadge(status: DataCenter["status"]) {
  const map = {
    operational:  { label: "Operational",        class: "bg-green-500/15 text-green-400" },
    construction: { label: "Under Construction",  class: "bg-yellow-500/15 text-yellow-400" },
    announced:    { label: "Announced",           class: "bg-slate-500/15 text-slate-400" },
  };
  return map[status];
}

type ViewMode = "dc" | "stress";

export default function PowerMap() {
  const [selected, setSelected] = useState<DataCenter | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("dc");

  const companies = ["all", ...Array.from(new Set(DATA_CENTERS.map((d) => d.company))).sort()];
  const filtered = filter === "all" ? DATA_CENTERS : DATA_CENTERS.filter((d) => d.company === filter);

  const totalMW  = DATA_CENTERS.reduce((s, d) => s + d.powerMW, 0);
  const totalTWh = (DATA_CENTERS.reduce((s, d) => s + d.annualMWh, 0) / 1_000_000).toFixed(1);
  const opCount    = DATA_CENTERS.filter((d) => d.status === "operational").length;
  const conCount   = DATA_CENTERS.filter((d) => d.status === "construction").length;
  const annCount   = DATA_CENTERS.filter((d) => d.status === "announced").length;

  const rtoLoadMW = useMemo(() => {
    const m: Record<string, number> = {};
    DATA_CENTERS.forEach((dc) => {
      const rto = gridOpToRTO(dc.gridOperator);
      m[rto] = (m[rto] ?? 0) + dc.powerMW;
    });
    return m;
  }, []);

  function getStateColor(stateName: string): string {
    const rto = STATE_TO_RTO[stateName];
    if (!rto || !RTO_CONFIG[rto]) return "rgba(255,255,255,0.02)";
    return viewMode === "dc" ? RTO_CONFIG[rto].dcColor : RTO_CONFIG[rto].stressColor;
  }

  function getStateHover(stateName: string): string {
    const rto = STATE_TO_RTO[stateName];
    if (!rto || !RTO_CONFIG[rto]) return "rgba(255,255,255,0.06)";
    const base = viewMode === "dc" ? RTO_CONFIG[rto].dcColor : RTO_CONFIG[rto].stressColor;
    return base.replace(/[\d.]+\)$/, (m) => String(Math.min(parseFloat(m) * 2.2, 0.55)) + ")");
  }

  const selectedRTO = selected ? gridOpToRTO(selected.gridOperator) : null;
  const selectedRTOCfg = selectedRTO ? RTO_CONFIG[selectedRTO] : null;
  const selectedRTOLoad = selectedRTO ? (rtoLoadMW[selectedRTO] ?? 0) : 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="grid-bg border-b border-border px-6 py-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Power Map</h1>
              <span className="text-[10px] font-mono tracking-wider px-2 py-0.5 rounded border border-border bg-muted/30 text-muted-foreground">
                US COVERAGE
              </span>
            </div>
            <p className="text-muted-foreground text-sm">
              Active and planned AI data centers by power draw. {DATA_CENTERS.length} facilities across all major grid regions.
            </p>
          </div>

          {/* Size legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-green-500" />
              <span className="text-muted-foreground">&lt;100 MW</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-yellow-500" />
              <span className="text-muted-foreground">100-500 MW</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-muted-foreground">&gt;500 MW</span>
            </div>
          </div>
        </div>

        {/* Summary stats */}
        <div className="flex flex-wrap gap-x-5 gap-y-2 mt-3 text-sm">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-[#F0A500]" />
            <span className="text-muted-foreground">Total capacity:</span>
            <span className="font-semibold font-mono text-foreground">{(totalMW / 1000).toFixed(1)} GW</span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Annual draw:</span>
            <span className="font-semibold font-mono text-foreground">{totalTWh} TWh/yr</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground border border-border/60 rounded px-2 py-0.5 bg-muted/20">
            <span className="text-green-400">{opCount} operational</span>
            <span className="opacity-40">/</span>
            <span className="text-yellow-400">{conCount} construction</span>
            <span className="opacity-40">/</span>
            <span className="text-slate-400">{annCount} announced</span>
          </div>
        </div>

        {/* RTO legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
          <span className="text-[10px] font-mono text-muted-foreground/60 tracking-wider uppercase">Grid Regions:</span>
          {Object.entries(RTO_CONFIG).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: cfg.legendColor, opacity: 0.8 }} />
              <span className="text-[11px] text-muted-foreground">{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Map area */}
        <div className="flex-1 relative" style={{ minHeight: 420 }}>
          {/* Company filter */}
          <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-1.5 max-w-[calc(100%-120px)]">
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

          {/* View mode toggle */}
          <div className="absolute top-4 right-4 z-10 flex rounded-md overflow-hidden border border-border text-xs font-mono">
            <button
              className={`px-3 py-1.5 transition-colors ${viewMode === "dc" ? "bg-[#F0A500] text-black font-semibold" : "bg-card text-muted-foreground hover:text-foreground"}`}
              onClick={() => setViewMode("dc")}
              data-testid="toggle-dc-locations"
            >
              DC Locations
            </button>
            <button
              className={`px-3 py-1.5 transition-colors ${viewMode === "stress" ? "bg-[#F0A500] text-black font-semibold" : "bg-card text-muted-foreground hover:text-foreground"}`}
              onClick={() => setViewMode("stress")}
              data-testid="toggle-grid-stress"
            >
              Grid Stress
            </button>
          </div>

          {viewMode === "stress" && (
            <div className="absolute bottom-10 left-4 z-10 text-[10px] font-mono text-muted-foreground/70 flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5"><div className="h-2 w-4 rounded-sm bg-red-500/60" /> Critical (&lt;16% reserve)</div>
              <div className="flex items-center gap-1.5"><div className="h-2 w-4 rounded-sm bg-orange-500/50" /> Elevated (16-18%)</div>
              <div className="flex items-center gap-1.5"><div className="h-2 w-4 rounded-sm bg-yellow-500/40" /> Moderate (18-25%)</div>
              <div className="flex items-center gap-1.5"><div className="h-2 w-4 rounded-sm bg-green-500/30" /> Low (&gt;25%)</div>
            </div>
          )}

          <ComposableMap
            projection="geoAlbersUsa"
            style={{ width: "100%", height: "100%", minHeight: 420 }}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const name = geo.properties.name as string;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      fill={getStateColor(name)}
                      stroke="rgba(255,255,255,0.12)"
                      strokeWidth={0.5}
                      style={{
                        default: { outline: "none" },
                        hover: { outline: "none", fill: getStateHover(name) },
                        pressed: { outline: "none" },
                      }}
                    />
                  );
                })
              }
            </Geographies>

            {filtered.map((dc) => {
              const r = viewMode === "stress"
                ? Math.sqrt(dc.powerMW / 30) + 2
                : Math.sqrt(dc.powerMW / 30) + 4;
              const opacity = viewMode === "stress" ? 0.5 : (selected?.id === dc.id ? 1 : 0.78);
              return (
                <Marker
                  key={dc.id}
                  coordinates={[dc.lng, dc.lat]}
                  onClick={() => setSelected(dc)}
                >
                  <circle
                    r={r}
                    fill={getDotColor(dc.powerMW)}
                    fillOpacity={opacity}
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth={1}
                    style={{ cursor: "pointer" }}
                  />
                  {selected?.id === dc.id && (
                    <circle
                      r={r + 5}
                      fill="none"
                      stroke={getDotColor(dc.powerMW)}
                      strokeWidth={1.5}
                      opacity={0.5}
                    />
                  )}
                </Marker>
              );
            })}
          </ComposableMap>

          <div className="absolute bottom-3 left-4">
            <p className="text-xs text-muted-foreground">Click a dot to view facility details. Dot size = power draw.</p>
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
                    backgroundColor: `${companyColors[selected.company] ?? "#666"}22`,
                    color: companyColors[selected.company] ?? "#999",
                    border: `1px solid ${companyColors[selected.company] ?? "#666"}44`,
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
                    <p className="text-sm font-bold font-mono text-[#F0A500]">{selected.powerMW} MW</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Activity className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Est. Annual Power</p>
                    <p className="text-sm font-bold font-mono text-foreground">{(selected.annualMWh / 1_000_000).toFixed(2)} TWh/yr</p>
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

              {/* Grid Context block */}
              {selectedRTOCfg && selectedRTO && (
                <div className="rounded-md p-3 border border-border bg-muted/20 space-y-2" data-testid="grid-context-block">
                  <div className="flex items-center gap-2 mb-1">
                    <Network className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground tracking-wide uppercase">Grid Context</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: selectedRTOCfg.legendColor }} />
                      <span className="text-xs font-mono text-foreground">{selectedRTO}</span>
                    </div>
                    <Badge className={selectedRTOCfg.stressBadgeClass + " text-[10px]"}>
                      {selectedRTOCfg.aiSignal}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <div>
                      <p className="text-muted-foreground">Reserve Margin</p>
                      <p className="font-mono font-semibold text-foreground">{selectedRTOCfg.reserveMargin}%</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">AI Load in RTO</p>
                      <p className="font-mono font-semibold text-foreground">{selectedRTOLoad.toLocaleString()} MW</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-md p-3 border border-border bg-muted/20">
                <p className="text-xs text-muted-foreground mb-1">Power Classification</p>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: getDotColor(selected.powerMW) }} />
                  <p className="text-sm font-medium text-foreground">
                    {selected.powerMW < 100 ? "Light Load (<100 MW)" : selected.powerMW <= 500 ? "Medium Load (100-500 MW)" : "Heavy Load (>500 MW)"}
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
              <p className="text-xs text-muted-foreground/50 mt-2 flex items-center justify-center gap-1">
                <Globe className="h-3 w-3" />
                International coverage expanding to Europe and Southeast Asia
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Grid Operator Stress Table */}
      <div className="border-t border-border px-6 py-4" data-testid="grid-stress-table">
        <div className="flex items-center gap-2 mb-3">
          <Network className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Grid Operator Load Analysis</h2>
          <span className="text-[10px] font-mono text-muted-foreground/50">Reserve margins: NERC LTRA 2025 (2026 projections)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-left text-muted-foreground/60 font-normal pb-2 pr-6">RTO / ISO</th>
                <th className="text-right text-muted-foreground/60 font-normal pb-2 pr-6">Tracked AI Load</th>
                <th className="text-right text-muted-foreground/60 font-normal pb-2 pr-6">Reserve Margin</th>
                <th className="text-left text-muted-foreground/60 font-normal pb-2 pr-6">AI Load Signal</th>
                <th className="text-left text-muted-foreground/60 font-normal pb-2">Stress</th>
              </tr>
            </thead>
            <tbody>
              {(["ERCOT", "MISO", "PJM", "SERC", "WECC", "SPP", "NPCC"] as const).map((rto) => {
                const cfg = RTO_CONFIG[rto];
                const loadMW = rtoLoadMW[rto] ?? 0;
                return (
                  <tr key={rto} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                    <td className="py-2 pr-6">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-sm" style={{ backgroundColor: cfg.legendColor, opacity: 0.8 }} />
                        <span className="text-foreground font-semibold">{rto}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-6 text-right text-foreground">{loadMW.toLocaleString()} MW</td>
                    <td className="py-2 pr-6 text-right">
                      <span className={cfg.reserveMargin < 16 ? "text-red-400" : cfg.reserveMargin < 19 ? "text-yellow-400" : "text-green-400"}>
                        {cfg.reserveMargin}%
                      </span>
                    </td>
                    <td className="py-2 pr-6 text-muted-foreground">{cfg.aiSignal}</td>
                    <td className="py-2">
                      <Badge className={cfg.stressBadgeClass + " text-[10px] font-mono"}>
                        {cfg.aiSignal}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
