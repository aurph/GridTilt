import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { MapContainer, TileLayer, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  X, Zap, MapPin, Building2, Calendar, Activity, Network,
  SlidersHorizontal, ChevronDown,
} from "lucide-react";

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
  { id: 1,  name: "Azure Phoenix Mega Campus",      company: "Microsoft", city: "Phoenix",        state: "AZ", lat: 33.4484, lng: -112.074,  powerMW: 600,  status: "construction", annualMWh: 5256000,  gridOperator: "APS/WECC",              openDate: "2026 Q1" },
  { id: 2,  name: "Google Midlothian DC",            company: "Google",    city: "Midlothian",     state: "TX", lat: 32.4827, lng: -96.9939,  powerMW: 480,  status: "construction", annualMWh: 4204800,  gridOperator: "ERCOT",                 openDate: "2025 Q4" },
  { id: 3,  name: "AWS US-East-2 Expansion",         company: "Amazon",    city: "Columbus",       state: "OH", lat: 39.9612, lng: -82.9988,  powerMW: 750,  status: "operational",  annualMWh: 6570000,  gridOperator: "PJM",                   openDate: "2023" },
  { id: 4,  name: "Meta DeKalb AI Campus",           company: "Meta",      city: "DeKalb",         state: "IL", lat: 41.9295, lng: -88.7498,  powerMW: 380,  status: "operational",  annualMWh: 3328800,  gridOperator: "MISO",                  openDate: "2024 Q2" },
  { id: 5,  name: "Microsoft Cheyenne Campus",       company: "Microsoft", city: "Cheyenne",       state: "WY", lat: 41.14,   lng: -104.82,   powerMW: 200,  status: "operational",  annualMWh: 1752000,  gridOperator: "WECC",                  openDate: "2022" },
  { id: 6,  name: "Google Reno DC",                  company: "Google",    city: "Reno",           state: "NV", lat: 39.5296, lng: -119.8138, powerMW: 160,  status: "operational",  annualMWh: 1401600,  gridOperator: "NV Energy/WECC",        openDate: "2023" },
  { id: 7,  name: "Amazon QTS Atlanta",              company: "Amazon",    city: "Atlanta",        state: "GA", lat: 33.749,  lng: -84.388,   powerMW: 420,  status: "operational",  annualMWh: 3679200,  gridOperator: "Southern Co./SERC",     openDate: "2025 Q1" },
  { id: 8,  name: "Meta Gallatin TN Campus",         company: "Meta",      city: "Gallatin",       state: "TN", lat: 36.388,  lng: -86.4458,  powerMW: 300,  status: "operational",  annualMWh: 2628000,  gridOperator: "TVA/SERC",              openDate: "2023" },
  { id: 9,  name: "Google Pryor Creek AI DC",        company: "Google",    city: "Pryor Creek",    state: "OK", lat: 36.308,  lng: -95.317,   powerMW: 550,  status: "construction", annualMWh: 4818000,  gridOperator: "SPP",                   openDate: "2026 Q2" },
  { id: 10, name: "Microsoft Goodyear Campus",       company: "Microsoft", city: "Goodyear",       state: "AZ", lat: 33.4353, lng: -112.358,  powerMW: 400,  status: "announced",    annualMWh: 3504000,  gridOperator: "APS/WECC",              openDate: "2027 Q1" },
  { id: 11, name: "AWS Ashburn HQ Complex",          company: "Amazon",    city: "Ashburn",        state: "VA", lat: 39.09,   lng: -77.52,    powerMW: 900,  status: "operational",  annualMWh: 7884000,  gridOperator: "PJM",                   openDate: "2020" },
  { id: 12, name: "Apple Maiden NC DC",              company: "Apple",     city: "Maiden",         state: "NC", lat: 35.5779, lng: -81.2087,  powerMW: 165,  status: "operational",  annualMWh: 1445400,  gridOperator: "Duke Energy/SERC",      openDate: "2012" },
  { id: 13, name: "Meta Eagle Mountain Campus",      company: "Meta",      city: "Eagle Mountain", state: "UT", lat: 40.3144, lng: -112.0,    powerMW: 520,  status: "operational",  annualMWh: 4555200,  gridOperator: "Rocky Mtn./WECC",       openDate: "2025 Q2" },
  { id: 14, name: "Google Corpus Christi",           company: "Google",    city: "Corpus Christi", state: "TX", lat: 27.8006, lng: -97.3964,  powerMW: 350,  status: "construction", annualMWh: 3066000,  gridOperator: "ERCOT",                 openDate: "2026 Q3" },
  { id: 15, name: "Microsoft Quincy WA",             company: "Microsoft", city: "Quincy",         state: "WA", lat: 47.2343, lng: -119.8526, powerMW: 280,  status: "operational",  annualMWh: 2452800,  gridOperator: "BPA/WECC",              openDate: "2020" },
  { id: 16, name: "Amazon Northlake TX Hub",         company: "Amazon",    city: "Northlake",      state: "TX", lat: 33.0001, lng: -97.2856,  powerMW: 600,  status: "construction", annualMWh: 5256000,  gridOperator: "ERCOT",                 openDate: "2026 Q1" },
  { id: 17, name: "xAI Memphis Colossus Phase 1",   company: "xAI",       city: "Memphis",        state: "TN", lat: 35.1495, lng: -90.049,   powerMW: 200,  status: "operational",  annualMWh: 1752000,  gridOperator: "TVA/SERC",              openDate: "2024 Q3" },
  { id: 18, name: "Stargate Abilene (OpenAI Ph.1)", company: "OpenAI",    city: "Abilene",        state: "TX", lat: 32.4487, lng: -99.7331,  powerMW: 800,  status: "construction", annualMWh: 7008000,  gridOperator: "ERCOT",                 openDate: "2026 Q2" },
  { id: 19, name: "Google Holland MI DC",            company: "Google",    city: "Holland",        state: "MI", lat: 42.7875, lng: -86.1089,  powerMW: 240,  status: "operational",  annualMWh: 2102400,  gridOperator: "MISO",                  openDate: "2021" },
  { id: 20, name: "Microsoft Boydton VA",            company: "Microsoft", city: "Boydton",        state: "VA", lat: 36.6673, lng: -78.3839,  powerMW: 450,  status: "operational",  annualMWh: 3942000,  gridOperator: "PJM",                   openDate: "2019" },
  { id: 21, name: "Amazon Umatilla OR",              company: "Amazon",    city: "Umatilla",       state: "OR", lat: 45.9165, lng: -119.3403, powerMW: 300,  status: "operational",  annualMWh: 2628000,  gridOperator: "BPA/WECC",              openDate: "2022" },
  { id: 22, name: "Meta Papillion NE Campus",        company: "Meta",      city: "Papillion",      state: "NE", lat: 41.1533, lng: -96.0422,  powerMW: 180,  status: "operational",  annualMWh: 1576800,  gridOperator: "SPP",                   openDate: "2023" },
  { id: 23, name: "Google Clarksville TN",           company: "Google",    city: "Clarksville",    state: "TN", lat: 36.5298, lng: -87.3595,  powerMW: 520,  status: "announced",    annualMWh: 4555200,  gridOperator: "TVA/SERC",              openDate: "2027 Q2" },
  { id: 24, name: "Microsoft Mt. Pleasant WI",       company: "Microsoft", city: "Mt. Pleasant",   state: "WI", lat: 42.7094, lng: -87.8895,  powerMW: 320,  status: "announced",    annualMWh: 2803200,  gridOperator: "MISO",                  openDate: "2027 Q3" },
  { id: 25, name: "Oracle Nashville DC",             company: "Oracle",    city: "Nashville",      state: "TN", lat: 36.1627, lng: -86.7816,  powerMW: 150,  status: "operational",  annualMWh: 1314000,  gridOperator: "TVA/SERC",              openDate: "2023" },
  { id: 26, name: "Stargate Abilene Phase 2",        company: "OpenAI",    city: "Abilene",        state: "TX", lat: 32.46,   lng: -99.71,    powerMW: 500,  status: "announced",    annualMWh: 4380000,  gridOperator: "ERCOT",                 openDate: "2027 Q1" },
  { id: 27, name: "CoreWeave Mebane NC",             company: "CoreWeave", city: "Mebane",         state: "NC", lat: 36.10,   lng: -79.27,    powerMW: 300,  status: "construction", annualMWh: 2628000,  gridOperator: "Duke Energy/SERC",      openDate: "2026 Q2" },
  { id: 28, name: "Microsoft Altoona IA Campus",     company: "Microsoft", city: "Altoona",        state: "IA", lat: 41.65,   lng: -93.47,    powerMW: 250,  status: "operational",  annualMWh: 2190000,  gridOperator: "MISO",                  openDate: "2023" },
  { id: 29, name: "Amazon Sterling VA Campus",       company: "Amazon",    city: "Sterling",       state: "VA", lat: 38.97,   lng: -77.39,    powerMW: 650,  status: "operational",  annualMWh: 5694000,  gridOperator: "PJM",                   openDate: "2022" },
  { id: 30, name: "Google Council Bluffs IA",        company: "Google",    city: "Council Bluffs", state: "IA", lat: 41.26,   lng: -95.86,    powerMW: 200,  status: "operational",  annualMWh: 1752000,  gridOperator: "MISO",                  openDate: "2021" },
  { id: 31, name: "xAI Memphis Phase 2",             company: "xAI",       city: "Memphis",        state: "TN", lat: 35.17,   lng: -90.07,    powerMW: 800,  status: "construction", annualMWh: 7008000,  gridOperator: "TVA/SERC",              openDate: "2026 Q4" },
  { id: 32, name: "Microsoft Racine WI Campus",      company: "Microsoft", city: "Racine",         state: "WI", lat: 42.73,   lng: -87.78,    powerMW: 450,  status: "announced",    annualMWh: 3942000,  gridOperator: "MISO",                  openDate: "2027 Q4" },
  { id: 33, name: "Amazon Puget Sound WA",           company: "Amazon",    city: "Seattle",        state: "WA", lat: 47.61,   lng: -122.33,   powerMW: 350,  status: "construction", annualMWh: 3066000,  gridOperator: "BPA/WECC",              openDate: "2026 Q3" },
  { id: 34, name: "CoreWeave / NVIDIA Secaucus NJ",  company: "CoreWeave", city: "Secaucus",       state: "NJ", lat: 40.79,   lng: -74.06,    powerMW: 180,  status: "operational",  annualMWh: 1576800,  gridOperator: "PJM",                   openDate: "2024" },
  { id: 35, name: "Meta Forest City NC",             company: "Meta",      city: "Forest City",    state: "NC", lat: 35.67,   lng: -81.86,    powerMW: 290,  status: "operational",  annualMWh: 2540400,  gridOperator: "Duke Energy/SERC",      openDate: "2022" },
  { id: 36, name: "Google The Dalles OR",            company: "Google",    city: "The Dalles",     state: "OR", lat: 45.5946, lng: -121.1787, powerMW: 300,  status: "operational",  annualMWh: 2628000,  gridOperator: "BPA/WECC",              openDate: "2006" },
  { id: 37, name: "Meta Prineville OR Campus",       company: "Meta",      city: "Prineville",     state: "OR", lat: 44.3010, lng: -120.8347, powerMW: 380,  status: "operational",  annualMWh: 3328800,  gridOperator: "PacifiCorp/WECC",       openDate: "2011" },
  { id: 38, name: "Google Lenoir NC",                company: "Google",    city: "Lenoir",         state: "NC", lat: 35.9135, lng: -81.5440,  powerMW: 220,  status: "operational",  annualMWh: 1927200,  gridOperator: "Duke Energy/SERC",      openDate: "2007" },
  { id: 39, name: "Meta New Albany OH Campus",       company: "Meta",      city: "New Albany",     state: "OH", lat: 40.0814, lng: -82.7874,  powerMW: 360,  status: "operational",  annualMWh: 3153600,  gridOperator: "AEP/PJM",               openDate: "2022" },
  { id: 40, name: "Google Moncks Corner SC",         company: "Google",    city: "Moncks Corner",  state: "SC", lat: 33.1968, lng: -80.0081,  powerMW: 450,  status: "operational",  annualMWh: 3942000,  gridOperator: "Santee Cooper/SERC",    openDate: "2019" },
  { id: 41, name: "Meta Kuna ID Campus",             company: "Meta",      city: "Kuna",           state: "ID", lat: 43.4927, lng: -116.4197, powerMW: 240,  status: "operational",  annualMWh: 2102400,  gridOperator: "Idaho Power/WECC",      openDate: "2012" },
  { id: 42, name: "Nebius Vineland NJ",              company: "Nebius",    city: "Vineland",       state: "NJ", lat: 39.4868, lng: -75.0256,  powerMW: 300,  status: "operational",  annualMWh: 2628000,  gridOperator: "PJM",                   openDate: "2025" },
  { id: 43, name: "Nebius Independence MO",          company: "Nebius",    city: "Independence",   state: "MO", lat: 39.0917, lng: -94.4140,  powerMW: 800,  status: "construction", annualMWh: 7008000,  gridOperator: "MISO/KCP&L",            openDate: "2027 Q1" },
  { id: 44, name: "Meta Hyperion Louisiana",         company: "Meta",      city: "Richland Parish", state: "LA", lat: 32.4680, lng: -91.6100, powerMW: 1000, status: "construction", annualMWh: 8760000,  gridOperator: "Entergy/SERC",          openDate: "2028" },
  { id: 45, name: "AWS Project Rainier",             company: "Amazon",    city: "New Carlisle",   state: "IN", lat: 41.7017, lng: -86.5039,  powerMW: 800,  status: "construction", annualMWh: 7008000,  gridOperator: "NIPSCO/MISO",           openDate: "2026 Q4" },
  { id: 46, name: "CoreWeave Ellendale ND",          company: "CoreWeave", city: "Ellendale",      state: "ND", lat: 46.0026, lng: -98.5274,  powerMW: 400,  status: "construction", annualMWh: 3504000,  gridOperator: "MISO",                  openDate: "2026 Q2" },
  { id: 47, name: "Stargate Santa Teresa NM",        company: "OpenAI",    city: "Santa Teresa",   state: "NM", lat: 31.9176, lng: -106.7118, powerMW: 500,  status: "construction", annualMWh: 4380000,  gridOperator: "El Paso Electric/WECC", openDate: "2027 Q1" },
  { id: 48, name: "AWS Susquehanna PA",              company: "Amazon",    city: "Salem Township", state: "PA", lat: 41.0570, lng: -76.3488,  powerMW: 800,  status: "construction", annualMWh: 7008000,  gridOperator: "PPL/PJM",               openDate: "2026 Q3" },
];

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
  PJM:  { label: "PJM",  reserveMargin: 17.5, aiSignal: "Elevated", dcColor: "rgba(240,165,0,0.12)",   stressColor: "rgba(234,179,8,0.28)",  stressBadgeClass: "bg-yellow-500/20 text-yellow-400", legendColor: "#F0A500" },
  MISO: { label: "MISO", reserveMargin: 13.4, aiSignal: "Critical", dcColor: "rgba(34,197,94,0.08)",   stressColor: "rgba(239,68,68,0.42)",  stressBadgeClass: "bg-red-500/20 text-red-400",       legendColor: "#22c55e" },
  ERCOT:{ label: "ERCOT",reserveMargin: 15.8, aiSignal: "Critical", dcColor: "rgba(239,68,68,0.10)",   stressColor: "rgba(239,68,68,0.32)",  stressBadgeClass: "bg-red-500/20 text-red-400",       legendColor: "#ef4444" },
  WECC: { label: "WECC", reserveMargin: 24.6, aiSignal: "Moderate", dcColor: "rgba(168,85,247,0.08)",  stressColor: "rgba(132,204,22,0.18)", stressBadgeClass: "bg-green-500/20 text-green-400",   legendColor: "#a855f7" },
  SERC: { label: "SERC", reserveMargin: 23.1, aiSignal: "Moderate", dcColor: "rgba(20,184,166,0.08)",  stressColor: "rgba(34,197,94,0.18)",  stressBadgeClass: "bg-green-500/20 text-green-400",   legendColor: "#14b8a6" },
  SPP:  { label: "SPP",  reserveMargin: 27.8, aiSignal: "Low",      dcColor: "rgba(244,63,94,0.07)",   stressColor: "rgba(34,197,94,0.12)", stressBadgeClass: "bg-green-500/15 text-green-500",   legendColor: "#f43f5e" },
  NPCC: { label: "NPCC", reserveMargin: 26.4, aiSignal: "Low",      dcColor: "rgba(148,163,184,0.08)", stressColor: "rgba(34,197,94,0.12)", stressBadgeClass: "bg-green-500/15 text-green-500",   legendColor: "#94a3b8" },
};

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

const companyColors: Record<string, string> = {
  Microsoft: "#0078d4",
  Google:    "#4285f4",
  Amazon:    "#ff9900",
  Meta:      "#1877f2",
  Apple:     "#555555",
  xAI:       "#f0a500",
  OpenAI:    "#10a37f",
  Oracle:    "#c74634",
  CoreWeave: "#7c3aed",
  Nebius:    "#00b4d8",
};

function getStatusBadge(status: DataCenter["status"]) {
  const map = {
    operational:  { label: "Operational",        class: "bg-green-500/15 text-green-400" },
    construction: { label: "Under Construction",  class: "bg-yellow-500/15 text-yellow-400" },
    announced:    { label: "Announced",           class: "bg-slate-500/15 text-slate-400" },
  };
  return map[status];
}

function parseFiltersFromURL(): { companies: string[]; rtos: string[]; capacity: string } {
  try {
    const params = new URLSearchParams(window.location.search);
    return {
      companies: params.get("companies")?.split(",").filter(Boolean) ?? [],
      rtos:      params.get("rtos")?.split(",").filter(Boolean) ?? [],
      capacity:  params.get("capacity") ?? "all",
    };
  } catch {
    return { companies: [], rtos: [], capacity: "all" };
  }
}

function pushFiltersToURL(companies: string[], rtos: string[], capacity: string) {
  try {
    const params = new URLSearchParams();
    if (companies.length) params.set("companies", companies.join(","));
    if (rtos.length) params.set("rtos", rtos.join(","));
    if (capacity !== "all") params.set("capacity", capacity);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  } catch {}
}

type ViewMode = "dc" | "stress";

function pinRadius(powerMW: number): number {
  if (powerMW >= 500) return 10;
  if (powerMW >= 100) return 8;
  return 6;
}

function pinColor(status: DataCenter["status"]): string {
  if (status === "operational") return "#F07800";
  if (status === "construction") return "#F0A500";
  return "rgba(255,255,255,0.6)";
}

function stressColorForRTO(dc: DataCenter): string {
  const rto = gridOpToRTO(dc.gridOperator);
  const cfg = RTO_CONFIG[rto];
  if (!cfg) return "#22c55e";
  if (cfg.aiSignal === "Critical") return "#ef4444";
  if (cfg.aiSignal === "Elevated") return "#eab308";
  if (cfg.aiSignal === "Moderate") return "#22c55e";
  return "#4ade80";
}

function createGlowIcon(dc: DataCenter, passes: boolean, dimmed: boolean, viewMode: ViewMode): L.DivIcon {
  const r = pinRadius(dc.powerMW);
  const color = viewMode === "stress" ? stressColorForRTO(dc) : pinColor(dc.status);
  const size = (r + 12) * 2;
  const center = size / 2;

  const baseOpacity = !passes ? 0.12 : dimmed ? 0.3 : dc.status === "announced" && viewMode === "dc" ? 0.6 : 1;
  const glowOpacity = !passes ? 0 : dimmed ? 0.1 : viewMode === "stress" ? 0.45 : 0.3;

  let animClass = "";
  if (passes && !dimmed && viewMode === "dc") {
    if (dc.status === "operational") animClass = "pin-pulse";
    else if (dc.status === "construction") animClass = "pin-construction";
  }

  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${center}" cy="${center}" r="${r + 8}" fill="${color}" opacity="${glowOpacity}" class="${animClass}-glow" />
    <circle cx="${center}" cy="${center}" r="${r}" fill="${color}" opacity="${baseOpacity}" />
  </svg>`;

  return L.divIcon({
    html: `<div class="pin-wrapper ${animClass}" style="opacity:${baseOpacity}">${svg}</div>`,
    className: "leaflet-pin-icon",
    iconSize: [size, size],
    iconAnchor: [center, center],
  });
}

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

const RTO_MUTED_COLORS: Record<string, string> = {
  PJM: "#7B8FA1",
  MISO: "#6B8E6B",
  ERCOT: "#A18072",
  WECC: "#7B8BA0",
  SERC: "#6B9E9E",
  SPP: "#9B8B7B",
  NPCC: "#8B8B9B",
};

const RTO_STRESS_COLORS: Record<string, string> = {
  PJM: "#eab308",
  MISO: "#ef4444",
  ERCOT: "#ef4444",
  WECC: "#84cc16",
  SERC: "#22c55e",
  SPP: "#4ade80",
  NPCC: "#4ade80",
};

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

function RTORegions({ viewMode }: { viewMode: ViewMode }) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadGeo() {
      try {
        const topoResp = await fetch(GEO_URL);
        const topo = await topoResp.json();
        if (cancelled) return;

        const topojsonModule = await import("topojson-client");
        const geoData = topojsonModule.feature(topo, topo.objects.states) as any;

        const stateNames: Record<string, string> = {};
        if (topo.objects.states.geometries) {
          topo.objects.states.geometries.forEach((g: any) => {
            if (g.properties?.name) stateNames[g.id] = g.properties.name;
          });
        }

        if (layerRef.current) {
          map.removeLayer(layerRef.current);
        }

        const isDC = viewMode === "dc";

        layerRef.current = L.geoJSON(geoData, {
          style: (feature) => {
            const stateId = feature?.id as string;
            const stateName = stateNames[stateId] || feature?.properties?.name || "";
            const rto = STATE_TO_RTO[stateName];
            if (!rto) {
              return { fillColor: "#ffffff", fillOpacity: 0.02, color: "rgba(255,255,255,0.08)", weight: 0.5 };
            }
            const fillColor = isDC ? (RTO_MUTED_COLORS[rto] || "#888") : (RTO_STRESS_COLORS[rto] || "#22c55e");
            const fillOpacity = isDC ? 0.08 : 0.22;
            return {
              fillColor,
              fillOpacity,
              color: "rgba(255,255,255,0.15)",
              weight: 1,
            };
          },
          onEachFeature: (_feature, layer) => {
            layer.on({
              mouseover: (e) => {
                const l = e.target;
                l.setStyle({ fillOpacity: isDC ? 0.18 : 0.32 });
              },
              mouseout: (e) => {
                const l = e.target;
                l.setStyle({ fillOpacity: isDC ? 0.08 : 0.22 });
              },
            });
          },
          interactive: true,
        }).addTo(map);

        layerRef.current.bringToBack();
      } catch (err) {
        console.error("Failed to load GeoJSON:", err);
      }
    }

    loadGeo();

    return () => {
      cancelled = true;
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [map, viewMode]);

  return null;
}

function FacilityLabels({ viewMode, filterCompanies, filterRTOs, filterCapacity }: {
  viewMode: ViewMode;
  filterCompanies: string[];
  filterRTOs: string[];
  filterCapacity: string;
}) {
  const map = useMap();
  const labelsRef = useRef<L.LayerGroup | null>(null);

  const passesFilter = useCallback((dc: DataCenter): boolean => {
    if (filterCompanies.length > 0 && !filterCompanies.includes(dc.company)) return false;
    if (filterRTOs.length > 0 && !filterRTOs.includes(gridOpToRTO(dc.gridOperator))) return false;
    if (filterCapacity === "small" && dc.powerMW >= 100) return false;
    if (filterCapacity === "medium" && (dc.powerMW < 100 || dc.powerMW > 500)) return false;
    if (filterCapacity === "large" && dc.powerMW <= 500) return false;
    return true;
  }, [filterCompanies, filterRTOs, filterCapacity]);

  useEffect(() => {
    function updateLabels() {
      if (labelsRef.current) {
        labelsRef.current.clearLayers();
      } else {
        labelsRef.current = L.layerGroup().addTo(map);
      }

      const zoom = map.getZoom();
      if (zoom < 6 || viewMode !== "dc") return;

      const minMW = zoom >= 8 ? 0 : 500;

      DATA_CENTERS.forEach((dc) => {
        if (!passesFilter(dc)) return;
        if (dc.powerMW < minMW) return;

        const truncName = dc.name.length > 20 ? dc.name.slice(0, 18) + ".." : dc.name;
        const label = L.marker([dc.lat, dc.lng], {
          icon: L.divIcon({
            html: `<div class="map-label">${truncName}</div>`,
            className: "leaflet-label-icon",
            iconSize: [120, 16],
            iconAnchor: [-8, 20],
          }),
          interactive: false,
          zIndexOffset: -10,
        });

        label.addTo(labelsRef.current!);
      });
    }

    updateLabels();
    map.on("zoomend", updateLabels);

    return () => {
      map.off("zoomend", updateLabels);
      if (labelsRef.current) {
        labelsRef.current.clearLayers();
      }
    };
  }, [map, viewMode, passesFilter]);

  return null;
}

function FacilityMarkers({
  viewMode,
  filterCompanies,
  filterRTOs,
  filterCapacity,
  hoveredId,
  setHoveredId,
  selected,
  setSelected,
  setTooltipDC,
  setTooltipPos,
}: {
  viewMode: ViewMode;
  filterCompanies: string[];
  filterRTOs: string[];
  filterCapacity: string;
  hoveredId: number | null;
  setHoveredId: (id: number | null) => void;
  selected: DataCenter | null;
  setSelected: (dc: DataCenter | null) => void;
  setTooltipDC: (dc: DataCenter | null) => void;
  setTooltipPos: (pos: { x: number; y: number } | null) => void;
}) {
  const map = useMap();
  const markersRef = useRef<Record<number, L.Marker>>({});
  const layerRef = useRef<L.LayerGroup | null>(null);

  const passesFilter = useCallback((dc: DataCenter): boolean => {
    if (filterCompanies.length > 0 && !filterCompanies.includes(dc.company)) return false;
    if (filterRTOs.length > 0 && !filterRTOs.includes(gridOpToRTO(dc.gridOperator))) return false;
    if (filterCapacity === "small" && dc.powerMW >= 100) return false;
    if (filterCapacity === "medium" && (dc.powerMW < 100 || dc.powerMW > 500)) return false;
    if (filterCapacity === "large" && dc.powerMW <= 500) return false;
    return true;
  }, [filterCompanies, filterRTOs, filterCapacity]);

  useEffect(() => {
    if (layerRef.current) {
      layerRef.current.clearLayers();
    } else {
      layerRef.current = L.layerGroup().addTo(map);
    }

    const markers: Record<number, L.Marker> = {};

    DATA_CENTERS.forEach((dc) => {
      const passes = passesFilter(dc);
      const dimmed = hoveredId !== null && hoveredId !== dc.id && selected?.id !== dc.id;
      const icon = createGlowIcon(dc, passes, dimmed, viewMode);

      const marker = L.marker([dc.lat, dc.lng], {
        icon,
        interactive: passes,
        zIndexOffset: dc.status === "operational" ? 100 : dc.status === "construction" ? 50 : 0,
      });

      marker.on("mouseover", (e) => {
        if (!passes) return;
        setHoveredId(dc.id);
        setTooltipDC(dc);
        const point = map.latLngToContainerPoint(e.latlng);
        setTooltipPos({ x: point.x, y: point.y });
      });

      marker.on("mouseout", () => {
        setHoveredId(null);
        setTooltipDC(null);
        setTooltipPos(null);
      });

      marker.on("click", (e) => {
        if (!passes) return;
        setSelected(dc);
        setHoveredId(null);
        setTooltipDC(null);
        const point = map.latLngToContainerPoint(e.latlng);
        setTooltipPos({ x: point.x, y: point.y });
      });

      marker.addTo(layerRef.current!);
      markers[dc.id] = marker;
    });

    markersRef.current = markers;

    return () => {
      if (layerRef.current) {
        layerRef.current.clearLayers();
      }
    };
  }, [map, passesFilter, hoveredId, selected, viewMode]);

  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: () => void }) {
  useMapEvents({
    click: () => {
      onMapClick();
    },
  });
  return null;
}

export default function PowerMap() {
  const initialFilters = useMemo(() => parseFiltersFromURL(), []);

  const [selected, setSelected]           = useState<DataCenter | null>(null);
  const [viewMode, setViewMode]           = useState<ViewMode>("dc");
  const [hoveredId, setHoveredId]         = useState<number | null>(null);
  const [tooltipDC, setTooltipDC]         = useState<DataCenter | null>(null);
  const [tooltipPos, setTooltipPos]       = useState<{ x: number; y: number } | null>(null);
  const [filterCompanies, setFilterCompanies] = useState<string[]>(initialFilters.companies);
  const [filterRTOs, setFilterRTOs]       = useState<string[]>(initialFilters.rtos);
  const [filterCapacity, setFilterCapacity]   = useState<string>(initialFilters.capacity);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  function passesFilter(dc: DataCenter): boolean {
    if (filterCompanies.length > 0 && !filterCompanies.includes(dc.company)) return false;
    if (filterRTOs.length > 0 && !filterRTOs.includes(gridOpToRTO(dc.gridOperator))) return false;
    if (filterCapacity === "small"  && dc.powerMW >= 100) return false;
    if (filterCapacity === "medium" && (dc.powerMW < 100 || dc.powerMW > 500)) return false;
    if (filterCapacity === "large"  && dc.powerMW <= 500) return false;
    return true;
  }

  function toggleCompany(c: string) {
    const next = filterCompanies.includes(c)
      ? filterCompanies.filter((x) => x !== c)
      : [...filterCompanies, c];
    setFilterCompanies(next);
    pushFiltersToURL(next, filterRTOs, filterCapacity);
  }

  function toggleRTO(rto: string) {
    const next = filterRTOs.includes(rto)
      ? filterRTOs.filter((x) => x !== rto)
      : [...filterRTOs, rto];
    setFilterRTOs(next);
    pushFiltersToURL(filterCompanies, next, filterCapacity);
  }

  function setCapacity(cap: string) {
    setFilterCapacity(cap);
    pushFiltersToURL(filterCompanies, filterRTOs, cap);
  }

  function clearAllFilters() {
    setFilterCompanies([]);
    setFilterRTOs([]);
    setFilterCapacity("all");
    pushFiltersToURL([], [], "all");
    setMobileFiltersOpen(false);
  }

  function removeCompanyFilter(c: string) {
    const next = filterCompanies.filter((x) => x !== c);
    setFilterCompanies(next);
    pushFiltersToURL(next, filterRTOs, filterCapacity);
  }

  function removeRTOFilter(rto: string) {
    const next = filterRTOs.filter((x) => x !== rto);
    setFilterRTOs(next);
    pushFiltersToURL(filterCompanies, next, filterCapacity);
  }

  function removeCapacityFilter() {
    setFilterCapacity("all");
    pushFiltersToURL(filterCompanies, filterRTOs, "all");
  }

  const activeFilterCount = filterCompanies.length + filterRTOs.length + (filterCapacity !== "all" ? 1 : 0);
  const anyFilterActive = activeFilterCount > 0;

  const filteredCount = useMemo(() => {
    return DATA_CENTERS.filter((dc) => {
      if (filterCompanies.length > 0 && !filterCompanies.includes(dc.company)) return false;
      if (filterRTOs.length > 0 && !filterRTOs.includes(gridOpToRTO(dc.gridOperator))) return false;
      if (filterCapacity === "small"  && dc.powerMW >= 100) return false;
      if (filterCapacity === "medium" && (dc.powerMW < 100 || dc.powerMW > 500)) return false;
      if (filterCapacity === "large"  && dc.powerMW <= 500) return false;
      return true;
    }).length;
  }, [filterCompanies, filterRTOs, filterCapacity]);

  const allCompanies = useMemo(
    () => Array.from(new Set(DATA_CENTERS.map((d) => d.company))).sort(),
    []
  );

  const companyCounts = useMemo(() => {
    const m: Record<string, number> = {};
    DATA_CENTERS.forEach((dc) => { m[dc.company] = (m[dc.company] ?? 0) + 1; });
    return m;
  }, []);

  const rtoCounts = useMemo(() => {
    const m: Record<string, number> = {};
    DATA_CENTERS.forEach((dc) => {
      const rto = gridOpToRTO(dc.gridOperator);
      m[rto] = (m[rto] ?? 0) + 1;
    });
    return m;
  }, []);

  const announced = DATA_CENTERS.filter((d) => d.status === "announced");

  const totalMW  = DATA_CENTERS.reduce((s, d) => s + d.powerMW, 0);
  const totalTWh = (DATA_CENTERS.reduce((s, d) => s + d.annualMWh, 0) / 1_000_000).toFixed(1);
  const opCount  = DATA_CENTERS.filter((d) => d.status === "operational").length;
  const conCount = DATA_CENTERS.filter((d) => d.status === "construction").length;
  const annCount = DATA_CENTERS.filter((d) => d.status === "announced").length;

  const rtoLoadMW = useMemo(() => {
    const m: Record<string, number> = {};
    DATA_CENTERS.forEach((dc) => {
      const rto = gridOpToRTO(dc.gridOperator);
      m[rto] = (m[rto] ?? 0) + dc.powerMW;
    });
    return m;
  }, []);

  const selectedRTO     = selected ? gridOpToRTO(selected.gridOperator) : null;
  const selectedRTOCfg  = selectedRTO ? RTO_CONFIG[selectedRTO] : null;
  const selectedRTOLoad = selectedRTO ? (rtoLoadMW[selectedRTO] ?? 0) : 0;

  const ALL_RTOS = ["PJM", "MISO", "ERCOT", "WECC", "SERC", "SPP", "NPCC"] as const;

  const capacityLabels: Record<string, string> = {
    small: "<100 MW",
    medium: "100-500 MW",
    large: "500+ MW",
  };

  const displayDC = selected || tooltipDC;
  const showTooltip = displayDC && tooltipPos;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <style>{`
        .leaflet-pin-icon {
          background: none !important;
          border: none !important;
        }
        .leaflet-container {
          background: #0E0E0C !important;
          font-family: inherit;
        }
        .leaflet-control-zoom {
          border: none !important;
          margin-bottom: 16px !important;
          margin-right: 16px !important;
        }
        .leaflet-control-zoom a {
          background: rgba(26, 26, 46, 0.9) !important;
          color: rgba(255,255,255,0.7) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          width: 28px !important;
          height: 28px !important;
          line-height: 28px !important;
          font-size: 14px !important;
          backdrop-filter: blur(8px);
        }
        .leaflet-control-zoom a:hover {
          background: rgba(26, 26, 46, 1) !important;
          color: #F07800 !important;
        }
        .leaflet-control-zoom-in {
          border-radius: 6px 6px 0 0 !important;
          border-bottom: none !important;
        }
        .leaflet-control-zoom-out {
          border-radius: 0 0 6px 6px !important;
        }
        .leaflet-control-attribution {
          background: transparent !important;
          color: rgba(255,255,255,0.2) !important;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a {
          color: rgba(255,255,255,0.25) !important;
        }
        .pin-wrapper {
          transition: opacity 0.2s ease-out, transform 0.2s ease-out;
        }
        .pin-wrapper:hover {
          transform: scale(1.3);
          filter: brightness(1.3);
        }
        @keyframes pin-pulse-glow {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.15); opacity: 0.15; }
        }
        @keyframes pin-construction-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .pin-pulse svg circle:first-child {
          animation: pin-pulse-glow 3s ease-in-out infinite;
          transform-origin: center;
        }
        .pin-construction svg circle:first-child {
          stroke-dasharray: 4 3;
          stroke: #F0A500;
          stroke-width: 1;
          fill: none !important;
          animation: pin-construction-rotate 8s linear infinite;
          transform-origin: center;
        }
        .power-map-tooltip {
          animation: tooltip-fade-in 150ms ease-out;
        }
        @keyframes tooltip-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .leaflet-label-icon {
          background: none !important;
          border: none !important;
        }
        .map-label {
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 10px;
          color: #fff;
          background: rgba(0,0,0,0.7);
          padding: 2px 5px;
          border-radius: 3px;
          white-space: nowrap;
          pointer-events: none;
          line-height: 1.3;
        }
        .leaflet-control-zoom {
          border: none !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important;
        }
        .leaflet-control-zoom a {
          background: #1A1917 !important;
          color: rgba(255,255,255,0.7) !important;
          border: 1px solid rgba(255,255,255,0.08) !important;
          width: 28px !important;
          height: 28px !important;
          line-height: 28px !important;
          font-size: 14px !important;
        }
        .leaflet-control-zoom a:hover {
          background: #252420 !important;
          color: #F07800 !important;
        }
        .leaflet-control-attribution {
          background: rgba(0,0,0,0.4) !important;
          color: rgba(255,255,255,0.3) !important;
          font-size: 9px !important;
        }
        .leaflet-control-attribution a {
          color: rgba(255,255,255,0.4) !important;
        }
      `}</style>

      <div className="flex-1 flex flex-col">
        <div
          className="flex-1 relative"
          style={{ minHeight: 520 }}
          ref={mapContainerRef}
        >
          <div className="absolute top-3 left-3 z-[1000] pointer-events-auto" data-testid="stats-overlay">
            <div className="bg-[#1A1917]/90 backdrop-blur-md border border-white/[0.06] rounded-lg px-4 py-3 shadow-xl">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-3.5 w-3.5 text-[#F07800]" />
                <span className="text-xs font-semibold text-white/90 tracking-tight">Power Map</span>
                <span className="text-[10px] font-mono text-white/40">{DATA_CENTERS.length} facilities</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-mono">
                <span className="text-[#F0A500] font-bold">{(totalMW / 1000).toFixed(1)} GW</span>
                <span className="text-white/20">|</span>
                <span className="text-white/50">{totalTWh} TWh/yr</span>
                <span className="text-white/20">|</span>
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#F07800] inline-block" /><span className="text-white/60">{opCount}</span></span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#F0A500] inline-block" /><span className="text-white/60">{conCount}</span></span>
                  <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-white/50 inline-block" /><span className="text-white/60">{annCount}</span></span>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2 pointer-events-auto">
            <div className="flex rounded-md overflow-hidden border border-white/[0.08] text-xs font-mono shadow-lg">
              <button
                className={`px-3 py-1.5 transition-all duration-500 ${viewMode === "dc" ? "bg-[#F07800] text-black font-semibold" : "bg-[#1A1917]/90 text-white/60 hover:text-white/90 backdrop-blur-md"}`}
                onClick={() => setViewMode("dc")}
                data-testid="toggle-dc-locations"
              >
                DC Locations
              </button>
              <button
                className={`px-3 py-1.5 transition-all duration-500 ${viewMode === "stress" ? "bg-[#F07800] text-black font-semibold" : "bg-[#1A1917]/90 text-white/60 hover:text-white/90 backdrop-blur-md"}`}
                onClick={() => setViewMode("stress")}
                data-testid="toggle-grid-stress"
              >
                Grid Stress
              </button>
            </div>

            <button
              onClick={() => {
                const isMobile = window.innerWidth < 768;
                if (isMobile) {
                  setMobileFiltersOpen(true);
                } else {
                  setFiltersExpanded(!filtersExpanded);
                }
              }}
              className="flex items-center gap-2 bg-[#1A1917]/90 backdrop-blur-md border border-white/[0.08] rounded-md px-3 py-1.5 text-xs font-mono text-white/60 hover:text-white/90 transition-colors shadow-lg"
              data-testid="filter-bar-toggle"
            >
              <SlidersHorizontal className="h-3 w-3" />
              <span>Filters</span>
              {anyFilterActive && (
                <span className="bg-[#F07800] text-black text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {activeFilterCount}
                </span>
              )}
              <span className="text-[10px] text-white/40 ml-1">{anyFilterActive ? `${filteredCount}/${DATA_CENTERS.length}` : `${DATA_CENTERS.length}`}</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${filtersExpanded ? "rotate-180" : ""}`} />
            </button>
          </div>

          {filtersExpanded && (
            <div className="absolute top-[88px] right-3 z-[1000] pointer-events-auto" data-testid="filter-panel">
              <div className="bg-[#1A1917]/95 backdrop-blur-md border border-white/[0.08] rounded-lg p-4 shadow-2xl w-[320px] max-h-[60vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-white/80">Filter Facilities</span>
                  {anyFilterActive && (
                    <button onClick={clearAllFilters} className="text-[10px] text-white/40 hover:text-white/70 underline underline-offset-2" data-testid="filter-clear-all">
                      Clear all
                    </button>
                  )}
                </div>

                {anyFilterActive && (
                  <div className="flex flex-wrap gap-1.5 mb-3 pb-3 border-b border-white/[0.06]">
                    {filterCompanies.map((c) => (
                      <Badge key={c} className="bg-[#F07800]/15 text-[#F07800] border-[#F07800]/30 text-[10px] font-mono gap-1 cursor-pointer hover:bg-[#F07800]/25" onClick={() => removeCompanyFilter(c)}>
                        <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: companyColors[c] ?? "#666" }} />
                        {c}
                        <X className="h-2.5 w-2.5" />
                      </Badge>
                    ))}
                    {filterRTOs.map((rto) => (
                      <Badge key={rto} className="bg-[#F07800]/15 text-[#F07800] border-[#F07800]/30 text-[10px] font-mono gap-1 cursor-pointer hover:bg-[#F07800]/25" onClick={() => removeRTOFilter(rto)}>
                        {rto}
                        <X className="h-2.5 w-2.5" />
                      </Badge>
                    ))}
                    {filterCapacity !== "all" && (
                      <Badge className="bg-[#F07800]/15 text-[#F07800] border-[#F07800]/30 text-[10px] font-mono gap-1 cursor-pointer hover:bg-[#F07800]/25" onClick={removeCapacityFilter}>
                        {capacityLabels[filterCapacity]}
                        <X className="h-2.5 w-2.5" />
                      </Badge>
                    )}
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-2">Operator</p>
                    <div className="flex flex-wrap gap-1.5">
                      {allCompanies.map((c) => {
                        const active = filterCompanies.includes(c);
                        const color = companyColors[c] ?? "#666";
                        return (
                          <button
                            key={c}
                            data-testid={`filter-company-${c.toLowerCase().replace(/\s+/g, "-")}`}
                            onClick={() => toggleCompany(c)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-all ${
                              active
                                ? "bg-[#F07800]/20 text-[#F07800] border border-[#F07800]/40"
                                : "bg-white/[0.04] text-white/50 border border-white/[0.06] hover:text-white/80 hover:bg-white/[0.08]"
                            }`}
                          >
                            <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            {c}
                            <span className="text-[9px] opacity-50">({companyCounts[c] ?? 0})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-2">Grid Region</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_RTOS.map((rto) => {
                        const active = filterRTOs.includes(rto);
                        const color = RTO_CONFIG[rto]?.legendColor ?? "#666";
                        return (
                          <button
                            key={rto}
                            data-testid={`filter-rto-${rto.toLowerCase()}`}
                            onClick={() => toggleRTO(rto)}
                            className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-all ${
                              active
                                ? "bg-[#F07800]/20 text-[#F07800] border border-[#F07800]/40"
                                : "bg-white/[0.04] text-white/50 border border-white/[0.06] hover:text-white/80 hover:bg-white/[0.08]"
                            }`}
                          >
                            <div className="h-1.5 w-1.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color, opacity: 0.85 }} />
                            {rto}
                            <span className="text-[9px] opacity-50">({rtoCounts[rto] ?? 0})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-2">Capacity</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { key: "all",    label: "All" },
                        { key: "small",  label: "<100 MW" },
                        { key: "medium", label: "100-500" },
                        { key: "large",  label: "500+ MW" },
                      ].map(({ key, label }) => (
                        <button
                          key={key}
                          data-testid={`filter-capacity-${key}`}
                          onClick={() => setCapacity(key)}
                          className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                            filterCapacity === key
                              ? "bg-[#F07800]/20 text-[#F07800] border border-[#F07800]/40"
                              : "bg-white/[0.04] text-white/50 border border-white/[0.06] hover:text-white/80 hover:bg-white/[0.08]"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewMode === "stress" && (
            <div className="absolute bottom-10 left-3 z-[1000] pointer-events-none">
              <div className="bg-[#1A1917]/90 backdrop-blur-md border border-white/[0.06] rounded-lg px-3 py-2.5 shadow-lg">
                <p className="text-[9px] font-mono text-white/40 uppercase tracking-wider mb-1.5">Grid Stress</p>
                <div className="space-y-1 text-[10px] font-mono text-white/60">
                  <div className="flex items-center gap-1.5"><div className="h-2 w-4 rounded-sm bg-red-500/60" /> Critical (&lt;16%)</div>
                  <div className="flex items-center gap-1.5"><div className="h-2 w-4 rounded-sm bg-orange-500/50" /> Elevated (16-18%)</div>
                  <div className="flex items-center gap-1.5"><div className="h-2 w-4 rounded-sm bg-yellow-500/40" /> Moderate (18-25%)</div>
                  <div className="flex items-center gap-1.5"><div className="h-2 w-4 rounded-sm bg-green-500/30" /> Low (&gt;25%)</div>
                </div>
              </div>
            </div>
          )}

          {viewMode === "dc" && (
            <div className="absolute bottom-3 left-3 z-[1000] pointer-events-none">
              <div className="bg-[#1A1917]/90 backdrop-blur-md border border-white/[0.06] rounded-lg px-3 py-2 shadow-lg">
                <div className="flex items-center gap-3 text-[10px] font-mono text-white/50">
                  <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-[#F07800]" />Operational</div>
                  <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-[#F0A500]" />Construction</div>
                  <div className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-white/50" />Announced</div>
                </div>
              </div>
            </div>
          )}

          <MapContainer
            center={[39.5, -98.5]}
            zoom={4}
            minZoom={3}
            maxZoom={12}
            zoomControl={false}
            attributionControl={true}
            style={{ width: "100%", height: "100%", minHeight: 520, background: "#0E0E0C" }}
            className="rounded-none"
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              subdomains="abcd"
              maxZoom={19}
            />
            <RTORegions viewMode={viewMode} />
            <FacilityMarkers
              viewMode={viewMode}
              filterCompanies={filterCompanies}
              filterRTOs={filterRTOs}
              filterCapacity={filterCapacity}
              hoveredId={hoveredId}
              setHoveredId={setHoveredId}
              selected={selected}
              setSelected={setSelected}
              setTooltipDC={setTooltipDC}
              setTooltipPos={setTooltipPos}
            />
            <FacilityLabels
              viewMode={viewMode}
              filterCompanies={filterCompanies}
              filterRTOs={filterRTOs}
              filterCapacity={filterCapacity}
            />
            <MapClickHandler onMapClick={() => { setSelected(null); setTooltipDC(null); setTooltipPos(null); }} />
            <ZoomControl position="bottomright" />
          </MapContainer>

          {showTooltip && (
            <div
              className="absolute z-[1001] pointer-events-none power-map-tooltip"
              style={{
                left: Math.min(Math.max((tooltipPos?.x ?? 0) + 16, 8), (mapContainerRef.current?.clientWidth ?? 600) - 296),
                top: Math.max((tooltipPos?.y ?? 0) - 180, 8),
              }}
            >
              <div
                className="border rounded-lg shadow-2xl text-xs font-mono min-w-[260px] max-w-[280px] overflow-hidden"
                style={{
                  background: "#1A1917",
                  borderColor: "rgba(240, 120, 0, 0.3)",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                  backdropFilter: "blur(8px)",
                }}
                data-testid="pin-detail-tooltip"
              >
                <div className="px-4 pt-3 pb-2 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-white text-[14px] leading-tight">{displayDC.name}</p>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                      style={{
                        backgroundColor: displayDC.status === "operational" ? "rgba(34,197,94,0.15)" : displayDC.status === "construction" ? "rgba(240,165,0,0.15)" : "rgba(148,163,184,0.15)",
                        color: displayDC.status === "operational" ? "#4ade80" : displayDC.status === "construction" ? "#F0A500" : "#94a3b8",
                      }}
                    >
                      {getStatusBadge(displayDC.status).label}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-[12px]">Operator</span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full" style={{ backgroundColor: companyColors[displayDC.company] ?? "#666" }} />
                      <span className="text-white text-[12px]">{displayDC.company}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-[12px]">Location</span>
                    <span className="text-white text-[12px]">{displayDC.city}, {displayDC.state}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-[12px]">Capacity</span>
                    <span className="text-[#F0A500] font-bold text-[13px]">{displayDC.powerMW} MW</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white/40 text-[12px]">Grid Region</span>
                    <span className="text-white text-[12px]">{gridOpToRTO(displayDC.gridOperator)}</span>
                  </div>
                  {selected && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-white/40 text-[12px]">Annual Power</span>
                        <span className="text-white text-[12px]">{(displayDC.annualMWh / 1_000_000).toFixed(2)} TWh</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-white/40 text-[12px]">Online</span>
                        <span className="text-white text-[12px]">{displayDC.openDate}</span>
                      </div>
                    </>
                  )}
                  <div className="pt-1.5 mt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <a
                      href="/stack"
                      className="text-[11px] text-[#F07800] hover:text-[#F0A500] transition-colors pointer-events-auto"
                      data-testid="link-view-in-stack"
                    >
                      View in The Stack &rarr;
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border px-6 py-4" data-testid="upcoming-projects-section">
        <div className="flex items-center gap-2 mb-3">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-xs font-semibold tracking-wider uppercase text-muted-foreground">Upcoming Projects</h2>
          <span className="text-[10px] font-mono text-muted-foreground/50">Announced facilities not yet built</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {announced.map((dc) => {
            const rto = gridOpToRTO(dc.gridOperator);
            const rtoCfg = RTO_CONFIG[rto];
            const cColor = companyColors[dc.company] ?? "#666";
            return (
              <button
                key={dc.id}
                onClick={() => { setSelected(dc); setTooltipPos(null); }}
                data-testid={`upcoming-card-${dc.id}`}
                className="flex-shrink-0 w-52 rounded-md border border-dashed border-border/70 bg-muted/10 p-3 text-left hover:bg-muted/20 hover:border-border transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cColor }} />
                  <span className="text-[10px] font-mono font-semibold" style={{ color: cColor }}>{dc.company}</span>
                </div>
                <p className="text-xs font-semibold text-foreground leading-tight mb-2">{dc.name}</p>
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                  <span className="text-[#F0A500] font-semibold">{dc.powerMW} MW</span>
                  <span>{dc.openDate}</span>
                </div>
                {rtoCfg && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <div className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: rtoCfg.legendColor, opacity: 0.8 }} />
                    <span className="text-[9px] font-mono text-muted-foreground/70">{rto}</span>
                    <span className="text-[9px] font-mono text-muted-foreground/50 ml-auto">{dc.city}, {dc.state}</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

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

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-[#1A1917] border-t border-white/[0.08] rounded-t-xl p-5 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-white/60" />
                <span className="font-semibold text-sm text-white">Filters</span>
                {anyFilterActive && (
                  <span className="text-[10px] font-mono text-[#F07800]">{filteredCount} of {DATA_CENTERS.length}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {anyFilterActive && (
                  <button onClick={clearAllFilters} className="text-xs text-white/40 border border-white/[0.1] rounded px-2 py-1">
                    Clear all
                  </button>
                )}
                <button onClick={() => setMobileFiltersOpen(false)} className="p-1.5 rounded hover:bg-white/10">
                  <X className="h-4 w-4 text-white/60" />
                </button>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-2">Operator</p>
                <div className="flex flex-wrap gap-2">
                  {allCompanies.map((c) => {
                    const active = filterCompanies.includes(c);
                    const color = companyColors[c] ?? "#666";
                    return (
                      <button
                        key={c}
                        onClick={() => toggleCompany(c)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                          active ? "bg-[#F07800]/20 text-[#F07800] border border-[#F07800]/40" : "bg-white/[0.04] text-white/50 border border-white/[0.06]"
                        }`}
                      >
                        <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                        {c} ({companyCounts[c] ?? 0})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-2">Grid Region</p>
                <div className="flex flex-wrap gap-2">
                  {ALL_RTOS.map((rto) => {
                    const active = filterRTOs.includes(rto);
                    const color = RTO_CONFIG[rto]?.legendColor ?? "#666";
                    return (
                      <button
                        key={rto}
                        onClick={() => toggleRTO(rto)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
                          active ? "bg-[#F07800]/20 text-[#F07800] border border-[#F07800]/40" : "bg-white/[0.04] text-white/50 border border-white/[0.06]"
                        }`}
                      >
                        <div className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: color, opacity: 0.85 }} />
                        {rto} ({rtoCounts[rto] ?? 0})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider mb-2">Capacity</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "all",    label: "All Sizes" },
                    { key: "small",  label: "<100 MW" },
                    { key: "medium", label: "100-500 MW" },
                    { key: "large",  label: "500+ MW" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setCapacity(key)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        filterCapacity === key ? "bg-[#F07800]/20 text-[#F07800] border border-[#F07800]/40" : "bg-white/[0.04] text-white/50 border border-white/[0.06]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={() => setMobileFiltersOpen(false)}
              className="w-full mt-5 py-2.5 rounded-md bg-[#F07800] text-black text-sm font-semibold"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
