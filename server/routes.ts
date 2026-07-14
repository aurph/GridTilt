import type { Express, Request, Response } from "express";
import { type Server } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import rateLimit from "express-rate-limit";
import RSSParser from "rss-parser";
import {
  runDatacenterIngestion,
  startDatacenterIngesterSchedule,
  loadPending as loadPendingDatacenters,
  approvePending as approvePendingDatacenter,
  rejectPending as rejectPendingDatacenter,
} from "./datacenter-ingester";
import {
  BASE_URL,
  SITEMAP_STATIC_PAGES,
  SITEMAP_SECTOR_SLUGS,
  SITEMAP_REGION_SLUGS,
  SITEMAP_OPERATOR_SLUGS,
  SITEMAP_CLUSTER_SLUGS,
} from "./seo";
import {
  computeAiPowerIndex,
  computeGridStress,
  computeNpi,
  computeNpiMomentum,
} from "./indices";
import { recordDailyIndexValues, readIndexHistory } from "./index-history";
import { getElectricityOutputMonthly, getHourlyDemandUS48 } from "./physical";
import { computeClusterMetrics, type ClusterLite } from "./clusters";
import { computeGpuIndex } from "./gpu-index";
import { hasTodayLiveSnapshot, latestLiveByModel, recordDailyLivePrices, recordedByModel } from "./gpu-history";
import { fetchLivePrices } from "./gpu-live";
import { getUraniumCorrelation } from "./uranium-correlation";
import { renderWeeklyEmail, weeklyDateLabel } from "./weekly-digest";
import { fractionToPercent, getCachedFundamentals, refreshFundamentalsIfStale } from "./fundamentals";
import { computeDealMetrics, type DealProject } from "./deals";
import { composeBrief, renderBriefText, type BriefInput } from "./brief";
import { computeGpuEconomics, TRAINING_PRESETS } from "./gpu-economics";
import {
  buildBuildoutTweet,
  buildGpuRentalTweet,
  buildClusterSpotlightTweet,
  buildGridBacklogTweet,
  buildPowerMixTweet,
  buildTopMoversTweet,
  buildCatalystTweet,
  ensureTweetLength,
} from "./social-format";

interface SupplyChainStage {
  name: string;
  tagline: string;
  color: string;
  bottleneckStatus: "Tightening" | "Bottlenecked" | "Flowing";
  bottleneckDetail: string;
  keyMetric: string;
  tickers: string[];
}
const SUPPLY_CHAIN_STAGES: Record<string, SupplyChainStage> = JSON.parse(
  readFileSync(join(process.cwd(), "server", "data", "supply-chain-stages.json"), "utf-8"),
);

// Known company data for portfolio scoring
const COMPANY_DATABASE: Record<string, {
  name: string;
  primarySegment: string;
  sectors: { Compute: number; Infrastructure: number; Power: number; Cooling: number; Grid: number };
  explanation: string;
}> = {
  NVDA: { name: "NVIDIA Corporation", primarySegment: "Compute", sectors: { Compute: 95, Infrastructure: 20, Power: 10, Cooling: 15, Grid: 5 }, explanation: "H100/B200 GPUs power most major AI training clusters. About 70% of datacenter revenue comes from AI workloads." },
  AMD: { name: "Advanced Micro Devices", primarySegment: "Compute", sectors: { Compute: 72, Infrastructure: 15, Power: 8, Cooling: 12, Grid: 5 }, explanation: "MI300X competes with NVIDIA in AI inference. Growing datacenter GPU business." },
  TSM: { name: "Taiwan Semiconductor Mfg", primarySegment: "Compute", sectors: { Compute: 88, Infrastructure: 15, Power: 12, Cooling: 18, Grid: 8 }, explanation: "Manufactures most advanced AI chips (NVDA, AMD, Apple, Google TPUs). Primary foundry for AI compute silicon." },
  INTC: { name: "Intel Corporation", primarySegment: "Compute", sectors: { Compute: 45, Infrastructure: 20, Power: 5, Cooling: 10, Grid: 5 }, explanation: "Gaudi AI accelerators and Xeon datacenter CPUs. Moderate AI exposure; NVDA dominates GPU training." },
  MU: { name: "Micron Technology", primarySegment: "Compute", sectors: { Compute: 60, Infrastructure: 15, Power: 5, Cooling: 8, Grid: 3 }, explanation: "HBM is required for AI accelerators. Micron's HBM3E supplies memory for GPU systems." },
  EQIX: { name: "Equinix Inc", primarySegment: "Infrastructure", sectors: { Compute: 15, Infrastructure: 97, Power: 30, Cooling: 45, Grid: 25 }, explanation: "Largest colocation data center REIT. 100% of revenue from physical DC infrastructure." },
  DLR: { name: "Digital Realty Trust", primarySegment: "Infrastructure", sectors: { Compute: 10, Infrastructure: 95, Power: 28, Cooling: 42, Grid: 22 }, explanation: "Major DC REIT with hyperscaler-focused campuses. Growing power capacity agreements with cloud providers." },
  VRT: { name: "Vertiv Holdings", primarySegment: "Cooling", sectors: { Compute: 10, Infrastructure: 35, Power: 20, Cooling: 90, Grid: 30 }, explanation: "DC thermal management and power infrastructure. Cooling and power systems for AI datacenters." },
  IREN: { name: "IREN Limited", primarySegment: "Infrastructure", sectors: { Compute: 25, Infrastructure: 75, Power: 40, Cooling: 30, Grid: 20 }, explanation: "AI cloud and Bitcoin mining company expanding GPU-as-a-Service. Building out DC infrastructure." },
  AMT: { name: "American Tower Corporation", primarySegment: "Infrastructure", sectors: { Compute: 5, Infrastructure: 45, Power: 15, Cooling: 10, Grid: 20 }, explanation: "Telecom tower REIT with edge data center exposure. Indirect beneficiary through edge compute." },
  CEG: { name: "Constellation Energy", primarySegment: "Power", sectors: { Compute: 5, Infrastructure: 15, Power: 90, Cooling: 5, Grid: 35 }, explanation: "Largest US nuclear operator. Contracted to restart TMI Unit 1 for Microsoft. 13-plant nuclear fleet." },
  VST: { name: "Vistra Corp", primarySegment: "Power", sectors: { Compute: 5, Infrastructure: 10, Power: 78, Cooling: 5, Grid: 30 }, explanation: "Largest competitive US power generator. Nuclear and gas assets with DC power supply exposure." },
  ETR: { name: "Entergy Corporation", primarySegment: "Power", sectors: { Compute: 3, Infrastructure: 10, Power: 65, Cooling: 5, Grid: 28 }, explanation: "Southeast utility with nuclear fleet. Growing DC power supply contracts in its territory." },
  NEE: { name: "NextEra Energy", primarySegment: "Power", sectors: { Compute: 3, Infrastructure: 12, Power: 70, Cooling: 5, Grid: 40 }, explanation: "Largest renewable energy company. Signing PPAs with DC operators for dedicated capacity." },
  CCJ: { name: "Cameco Corporation", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 82, Cooling: 2, Grid: 15 }, explanation: "Largest publicly-traded uranium miner. High direct uranium spot price exposure among large-caps." },
  NXE: { name: "NexGen Energy", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 78, Cooling: 2, Grid: 10 }, explanation: "Development-stage uranium miner. Rook I project in Saskatchewan holds high-grade deposits." },
  URA: { name: "Global X Uranium ETF", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 80, Cooling: 2, Grid: 12 }, explanation: "ETF holding uranium miners and nuclear equipment companies. Broad uranium sector exposure." },
  MSFT: { name: "Microsoft Corporation", primarySegment: "Compute", sectors: { Compute: 65, Infrastructure: 40, Power: 25, Cooling: 20, Grid: 10 }, explanation: "Azure AI cloud consumes significant DC power. Signed the TMI nuclear restart deal." },
  GOOGL: { name: "Alphabet Inc", primarySegment: "Compute", sectors: { Compute: 60, Infrastructure: 45, Power: 22, Cooling: 20, Grid: 12 }, explanation: "DeepMind and TPU infrastructure require large power capacity. Signed the first commercial SMR contract." },
  AMZN: { name: "Amazon.com Inc", primarySegment: "Infrastructure", sectors: { Compute: 55, Infrastructure: 50, Power: 20, Cooling: 18, Grid: 12 }, explanation: "AWS is the largest cloud provider. AI capex is driving DC expansion across the US." },
  META: { name: "Meta Platforms Inc", primarySegment: "Compute", sectors: { Compute: 58, Infrastructure: 42, Power: 18, Cooling: 15, Grid: 10 }, explanation: "Llama models and recommendation systems run on custom DC infrastructure. Consumes about 4 GW globally." },
  AAPL: { name: "Apple Inc", primarySegment: "Compute", sectors: { Compute: 30, Infrastructure: 10, Power: 8, Cooling: 5, Grid: 3 }, explanation: "Apple Intelligence runs mostly on-device. Limited DC power infrastructure exposure." },
  TSLA: { name: "Tesla Inc", primarySegment: "ETF", sectors: { Compute: 25, Infrastructure: 5, Power: 15, Cooling: 5, Grid: 45 }, explanation: "Megapack energy storage used in utility-scale projects including DC backup. Dojo is a compute asset." },
  ETN: { name: "Eaton Corporation", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 20, Power: 20, Cooling: 35, Grid: 78 }, explanation: "Switchgear, transformers, and UPS connecting grid to DC rack. $9.5B Boyd Thermal acquisition added cooling." },
  SMCI: { name: "Super Micro Computer", primarySegment: "Compute", sectors: { Compute: 82, Infrastructure: 30, Power: 8, Cooling: 45, Grid: 5 }, explanation: "AI server manufacturer building rack-scale systems for NVIDIA GPUs." },
  SPY: { name: "SPDR S&P 500 ETF", primarySegment: "ETF", sectors: { Compute: 25, Infrastructure: 15, Power: 12, Cooling: 10, Grid: 10 }, explanation: "Broad market ETF. AI exposure via NVDA, MSFT, AMZN, GOOGL (~30% combined weight)." },
  QQQ: { name: "Invesco QQQ Trust", primarySegment: "ETF", sectors: { Compute: 45, Infrastructure: 20, Power: 10, Cooling: 12, Grid: 8 }, explanation: "Nasdaq-100 ETF, about 50% in mega-cap tech. Significant AI/compute exposure." },
  XLU: { name: "Utilities Select SPDR ETF", primarySegment: "ETF", sectors: { Compute: 2, Infrastructure: 5, Power: 72, Cooling: 3, Grid: 40 }, explanation: "Utility sector ETF. DC operators are signing long-term PPAs with utilities in this basket." },
  XLK: { name: "Technology Select SPDR ETF", primarySegment: "ETF", sectors: { Compute: 70, Infrastructure: 25, Power: 8, Cooling: 12, Grid: 5 }, explanation: "Technology sector ETF with semiconductor and cloud infrastructure holdings." },
  // Nuclear Operators & Generators
  TLN:  { name: "Talen Energy Corporation", primarySegment: "Nuclear", sectors: { Compute: 8, Infrastructure: 12, Power: 88, Cooling: 3, Grid: 32 }, explanation: "Susquehanna nuclear plant with direct Amazon BTM co-location deal. Clear AI power supply beneficiary." },
  NRG:  { name: "NRG Energy Inc", primarySegment: "Nuclear", sectors: { Compute: 4, Infrastructure: 8, Power: 70, Cooling: 3, Grid: 28 }, explanation: "Competitive power generator with nuclear fleet. Growing DC power contracts for dispatchable capacity." },
  // Uranium Mining & Fuel Cycle
  UEC:  { name: "Uranium Energy Corp", primarySegment: "Uranium", sectors: { Compute: 2, Infrastructure: 3, Power: 80, Cooling: 2, Grid: 8 }, explanation: "US-focused uranium miner using ISR production. Hub-and-spoke model as a low-cost domestic supplier." },
  LEU:  { name: "Centrus Energy Corp", primarySegment: "Uranium", sectors: { Compute: 3, Infrastructure: 5, Power: 88, Cooling: 2, Grid: 12 }, explanation: "Only US company licensed to produce HALEU for advanced reactors and SMRs. Key domestic fuel cycle node." },
  UUUU: { name: "Energy Fuels Inc", primarySegment: "Uranium", sectors: { Compute: 2, Infrastructure: 3, Power: 78, Cooling: 2, Grid: 8 }, explanation: "US uranium and rare earth producer. White Mesa Mill is the only operating conventional US uranium mill." },
  DNN:  { name: "Denison Mines Corp", primarySegment: "Uranium", sectors: { Compute: 2, Infrastructure: 3, Power: 75, Cooling: 2, Grid: 8 }, explanation: "Canadian uranium developer. Wheeler River ISR project in the Athabasca Basin targets low-cost production." },
  PALAF:{ name: "Paladin Energy Ltd", primarySegment: "Uranium", sectors: { Compute: 2, Infrastructure: 3, Power: 76, Cooling: 2, Grid: 8 }, explanation: "Australian uranium producer. Langer Heinrich mine in Namibia restarted production in 2024." },
  // SMR & Advanced Nuclear
  OKLO: { name: "Oklo Inc", primarySegment: "SMR", sectors: { Compute: 10, Infrastructure: 18, Power: 90, Cooling: 5, Grid: 35 }, explanation: "Advanced fission company with 14 GW customer pipeline. Received FERC approval for Aurora powerhouse design." },
  BWXT: { name: "BWX Technologies Inc", primarySegment: "SMR", sectors: { Compute: 5, Infrastructure: 10, Power: 82, Cooling: 5, Grid: 25 }, explanation: "Sole manufacturer of US naval nuclear reactors. $7.4B backlog with expanding commercial SMR business." },
  SMR:  { name: "NuScale Power Corp", primarySegment: "SMR", sectors: { Compute: 8, Infrastructure: 12, Power: 88, Cooling: 5, Grid: 30 }, explanation: "Only NRC-certified SMR design in the US. VOYGR plant expected ~2030 (est.). Expanding internationally." },
  // Power Hardware & Electrical Equipment
  GEV:  { name: "GE Vernova Inc", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 12, Power: 38, Cooling: 8, Grid: 88 }, explanation: "Gas turbines indicate DC buildout pace. BWRX-300 SMR adds nuclear optionality. $41-42B revenue guidance for 2026." },
  NVT:  { name: "nVent Electric PLC", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 22, Power: 18, Cooling: 75, Grid: 65 }, explanation: "High-density power distribution and enclosures for AI racks. 65% organic order growth from liquid cooling." },
  CARR: { name: "Carrier Global Corp", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 15, Power: 10, Cooling: 70, Grid: 20 }, explanation: "DC cooling systems and precision HVAC. Exposure to thermal management for high-density AI compute." },
  ABB:  { name: "ABB Ltd", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 18, Power: 22, Cooling: 25, Grid: 80 }, explanation: "Power distribution, automation, and electrification. Major DC power supplier with grid switchgear." },
  EMR:  { name: "Emerson Electric Co", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 18, Power: 15, Cooling: 30, Grid: 60 }, explanation: "Automation and power management for DCs. AspenTech software in energy infrastructure." },
  HUBB: { name: "Hubbell Inc", primarySegment: "PowerHardware", sectors: { Compute: 3, Infrastructure: 12, Power: 15, Cooling: 10, Grid: 72 }, explanation: "Electrical products for utility and commercial markets. Beneficiary of grid expansion for DC campuses." },
  JCI:  { name: "Johnson Controls Int'l", primarySegment: "PowerHardware", sectors: { Compute: 3, Infrastructure: 12, Power: 8, Cooling: 65, Grid: 30 }, explanation: "Building automation and HVAC including DC cooling. Retrofit demand from facilities upgrading for AI density." },
  SIEGY:{ name: "Siemens Energy AG", primarySegment: "PowerHardware", sectors: { Compute: 4, Infrastructure: 10, Power: 32, Cooling: 8, Grid: 82 }, explanation: "Gas turbines competing with GEV for DC power orders. Transformer production at capacity." },
  BKR:  { name: "Baker Hughes Co", primarySegment: "PowerHardware", sectors: { Compute: 3, Infrastructure: 8, Power: 30, Cooling: 5, Grid: 55 }, explanation: "Gas turbine technology and LNG equipment. Growing from DC on-site gas generation demand." },
  // Utilities (AI Load Beneficiaries)
  D:    { name: "Dominion Energy Inc", primarySegment: "Utilities", sectors: { Compute: 5, Infrastructure: 15, Power: 78, Cooling: 5, Grid: 42 }, explanation: "Serves Northern Virginia (70% of US internet traffic). 40-47 GW of DC capacity in contract discussions." },
  SO:   { name: "Southern Company", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 12, Power: 72, Cooling: 4, Grid: 38 }, explanation: "Georgia hub for Southeast DC growth. Vogtle units 3-4 provide 24/7 baseload. 50+ GW interconnection pipeline." },
  DUK:  { name: "Duke Energy Corp", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 10, Power: 70, Cooling: 4, Grid: 36 }, explanation: "Carolinas and Southeast utility. Growing DC interconnection requests in its territory." },
  AEP:  { name: "American Electric Power", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 10, Power: 68, Cooling: 4, Grid: 42 }, explanation: "Major PJM utility. 40 GW of new DC interconnection requests filed in its territory." },
  XEL:  { name: "Xcel Energy Inc", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 8, Power: 65, Cooling: 3, Grid: 35 }, explanation: "Midwest utility in Minnesota and Colorado. Microsoft and Google targeting its service territory." },
  EVRG: { name: "Evergy Inc", primarySegment: "Utilities", sectors: { Compute: 2, Infrastructure: 7, Power: 62, Cooling: 3, Grid: 30 }, explanation: "Kansas/Missouri utility with growing DC interest. Favorable land and power costs in its territory." },
  PPL:  { name: "PPL Corporation", primarySegment: "Utilities", sectors: { Compute: 2, Infrastructure: 8, Power: 60, Cooling: 3, Grid: 30 }, explanation: "Mid-Atlantic and Kentucky utility with PJM exposure. Transmission assets near DC clusters." },
  PCG:  { name: "PG&E Corp", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 10, Power: 65, Cooling: 4, Grid: 35 }, explanation: "California utility serving Silicon Valley DC campuses. Grid investment needed for load growth." },
  // Construction & EPC (Infrastructure Builders)
  PWR:  { name: "Quanta Services Inc", primarySegment: "Construction", sectors: { Compute: 5, Infrastructure: 28, Power: 12, Cooling: 8, Grid: 88 }, explanation: "Largest electrical utility contractor in North America. Builds transmission and substations connecting DC campuses." },
  EME:  { name: "EMCOR Group Inc", primarySegment: "Construction", sectors: { Compute: 5, Infrastructure: 35, Power: 10, Cooling: 38, Grid: 65 }, explanation: "Electrical and mechanical DC infrastructure. $4.3B RPO in network segment. Record backlog from DC construction." },
  MTZ:  { name: "MasTec Inc", primarySegment: "Construction", sectors: { Compute: 3, Infrastructure: 25, Power: 10, Cooling: 12, Grid: 70 }, explanation: "Infrastructure builder with growing DC revenue. Builds electrical backbone connecting AI facilities to grid." },
  STRL: { name: "Sterling Infrastructure Inc", primarySegment: "Construction", sectors: { Compute: 5, Infrastructure: 30, Power: 8, Cooling: 10, Grid: 60 }, explanation: "DC site development with 125% YoY revenue growth. Builds foundations and civil infrastructure for campuses." },
  FLR:  { name: "Fluor Corporation", primarySegment: "Construction", sectors: { Compute: 3, Infrastructure: 20, Power: 15, Cooling: 8, Grid: 55 }, explanation: "Engineering and construction for energy infrastructure. Power generation and grid projects." },
  PRIM: { name: "Primoris Services Corp", primarySegment: "Construction", sectors: { Compute: 2, Infrastructure: 18, Power: 10, Cooling: 5, Grid: 68 }, explanation: "Utility infrastructure and power delivery. Growing grid expansion exposure from DC load growth." },
  // Sector ETFs (Benchmarks)
  URNM: { name: "Sprott Uranium Miners ETF", primarySegment: "ETF", sectors: { Compute: 2, Infrastructure: 3, Power: 82, Cooling: 2, Grid: 10 }, explanation: "Pure-play uranium miners ETF. No dilution from utilities or equipment. High-beta uranium exposure." },
  DTCR: { name: "Global X Data Center ETF", primarySegment: "ETF", sectors: { Compute: 15, Infrastructure: 85, Power: 25, Cooling: 35, Grid: 22 }, explanation: "DC and digital infrastructure ETF. Tracks REITs, operators, and tech companies in DC infrastructure." },
  GRID: { name: "First Trust Nasdaq Smart Grid ETF", primarySegment: "ETF", sectors: { Compute: 3, Infrastructure: 15, Power: 22, Cooling: 5, Grid: 85 }, explanation: "Grid infrastructure ETF. Hardware, software, and utility companies modernizing the electrical grid." },
  PAVE: { name: "Global X US Infrastructure ETF", primarySegment: "ETF", sectors: { Compute: 3, Infrastructure: 30, Power: 12, Cooling: 8, Grid: 60 }, explanation: "US infrastructure ETF. Tracks construction and materials companies in DC and grid buildout." },
  // Raw Materials - Mining & Metals
  FCX:  { name: "Freeport-McMoRan Inc", primarySegment: "RawMaterials", sectors: { Compute: 3, Infrastructure: 10, Power: 8, Cooling: 5, Grid: 45 }, explanation: "Largest publicly traded copper producer. Copper is used in every DC power system and grid interconnection." },
  SCCO: { name: "Southern Copper Corp", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 8, Power: 7, Cooling: 4, Grid: 42 }, explanation: "Major copper miner in Mexico and Peru. Copper demand growing from DC electrification and grid expansion." },
  TECK: { name: "Teck Resources Ltd", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 8, Power: 6, Cooling: 3, Grid: 38 }, explanation: "Transitioning to pure-play copper after selling coal. Copper exposure tied to grid buildout." },
  HBM:  { name: "Hudbay Minerals Inc", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 6, Power: 5, Cooling: 3, Grid: 35 }, explanation: "Mid-tier copper and gold miner in Peru, Manitoba, and Arizona. Copper Flat expansion adds supply." },
  NUE:  { name: "Nucor Corporation", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 25, Power: 5, Cooling: 3, Grid: 30 }, explanation: "Largest North American steel producer using electric arc furnaces. Structural steel for DC construction." },
  STLD: { name: "Steel Dynamics Inc", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 22, Power: 4, Cooling: 3, Grid: 28 }, explanation: "Electric arc furnace steelmaker. Structural steel and rebar volumes from DC campus construction." },
  CLF:  { name: "Cleveland-Cliffs Inc", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 20, Power: 4, Cooling: 3, Grid: 25 }, explanation: "Largest North American flat-rolled steel producer. Supplies steel for DC shells and grid infrastructure." },
  X:    { name: "United States Steel Corp", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 18, Power: 4, Cooling: 3, Grid: 24 }, explanation: "Integrated steel producer. Plate and structural products for DC and grid projects." },
  MP:   { name: "MP Materials Corp", primarySegment: "RawMaterials", sectors: { Compute: 5, Infrastructure: 8, Power: 10, Cooling: 3, Grid: 20 }, explanation: "Only integrated Western Hemisphere rare earth operation. Rare earths used in wind turbine and EV magnets." },
  BHP:  { name: "BHP Group Ltd", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 12, Power: 8, Cooling: 3, Grid: 40 }, explanation: "Largest mining company by market cap. Major copper producer with electrification and grid exposure." },
  RIO:  { name: "Rio Tinto Group", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 12, Power: 7, Cooling: 3, Grid: 38 }, explanation: "Global miner with copper and aluminum production. Both metals used in DC electrical infrastructure." },
  VALE: { name: "Vale S.A.", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 10, Power: 6, Cooling: 3, Grid: 35 }, explanation: "Largest nickel producer and major copper producer. Nickel used in DC battery backup systems." },
  COPX: { name: "Global X Copper Miners ETF", primarySegment: "ETF", sectors: { Compute: 2, Infrastructure: 8, Power: 6, Cooling: 3, Grid: 42 }, explanation: "Global copper miners ETF. Exposure to copper demand from DC electrification and grid expansion." },
  // Raw Materials - Natural Gas
  AR:   { name: "Antero Resources Corp", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 5, Power: 55, Cooling: 2, Grid: 15 }, explanation: "Appalachian gas producer. Gas-fired generation serves as bridge fuel for DC power." },
  EQT:  { name: "EQT Corporation", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 5, Power: 58, Cooling: 2, Grid: 18 }, explanation: "Largest US natural gas producer. DC operators signing long-term gas supply agreements." },
  RRC:  { name: "Range Resources Corp", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 5, Power: 52, Cooling: 2, Grid: 14 }, explanation: "Appalachian gas and NGL producer. Benefits from gas demand for DC power in PJM." },
  SWN:  { name: "Southwestern Energy Co", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 5, Power: 50, Cooling: 2, Grid: 14 }, explanation: "Gas producer in Appalachia and Haynesville. DC power generation drives demand growth." },
  LNG:  { name: "Cheniere Energy Inc", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 8, Power: 48, Cooling: 2, Grid: 20 }, explanation: "Largest US LNG exporter. Domestic gas price support indirectly affects DC power costs." },
  // Renewable Generation
  FSLR: { name: "First Solar Inc", primarySegment: "Renewables", sectors: { Compute: 3, Infrastructure: 12, Power: 65, Cooling: 3, Grid: 30 }, explanation: "Largest US solar panel manufacturer. Hyperscalers signing solar PPAs for DC operations." },
  ENPH: { name: "Enphase Energy Inc", primarySegment: "Renewables", sectors: { Compute: 3, Infrastructure: 8, Power: 55, Cooling: 3, Grid: 25 }, explanation: "Microinverter technology for solar. Distributed generation supports DC renewable targets." },
  SEDG: { name: "SolarEdge Technologies", primarySegment: "Renewables", sectors: { Compute: 3, Infrastructure: 8, Power: 52, Cooling: 3, Grid: 22 }, explanation: "Solar inverter and power optimizer manufacturer. Feeds grids facing DC load growth." },
  AES:  { name: "AES Corporation", primarySegment: "Renewables", sectors: { Compute: 3, Infrastructure: 15, Power: 68, Cooling: 4, Grid: 35 }, explanation: "Global power company with large renewable portfolio. Multi-GW PPAs with Google and Microsoft." },
  // Transmission & Grid Hardware
  WIRE: { name: "Encore Wire Corp", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 15, Power: 10, Cooling: 3, Grid: 72 }, explanation: "Copper and aluminum wire manufacturer. Every DC needs copper wiring from grid interconnection to rack." },
  GNRC: { name: "Generac Holdings Inc", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 12, Power: 20, Cooling: 3, Grid: 55 }, explanation: "Backup power generator manufacturer. Commercial/industrial segment growing from DC demand." },
  AYI:  { name: "Acuity Brands Inc", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 10, Power: 5, Cooling: 3, Grid: 45 }, explanation: "Intelligent lighting and building management. DC facilities need advanced electrical controls." },
  AOS:  { name: "A.O. Smith Corporation", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 8, Power: 8, Cooling: 35, Grid: 30 }, explanation: "Water heating and treatment technology. DC cooling uses water-based thermal management systems." },
  IDA:  { name: "IDACORP Inc", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 10, Power: 60, Cooling: 3, Grid: 45 }, explanation: "Idaho utility with hydroelectric generation. Meta and others targeting Idaho for low-cost clean power." },
  // Crypto/AI DC Operators
  CLSK: { name: "CleanSpark Inc", primarySegment: "CryptoAIDC", sectors: { Compute: 20, Infrastructure: 60, Power: 35, Cooling: 25, Grid: 15 }, explanation: "Bitcoin miner pivoting excess capacity toward AI/HPC hosting. Growing DC infrastructure." },
  MARA: { name: "MARA Holdings Inc", primarySegment: "CryptoAIDC", sectors: { Compute: 18, Infrastructure: 55, Power: 30, Cooling: 22, Grid: 12 }, explanation: "Largest public Bitcoin miner by hash rate. Exploring AI/HPC hosting for DC infrastructure." },
  // Additional Compute (AI Networking & Servers)
  AVGO: { name: "Broadcom Inc", primarySegment: "Compute", sectors: { Compute: 75, Infrastructure: 20, Power: 8, Cooling: 10, Grid: 5 }, explanation: "Custom AI accelerators (Google TPU, ASICs) and networking silicon. Key DC interconnect supplier." },
  DELL: { name: "Dell Technologies Inc", primarySegment: "Compute", sectors: { Compute: 55, Infrastructure: 35, Power: 8, Cooling: 15, Grid: 5 }, explanation: "PowerEdge AI server line. Growing AI infrastructure revenue from enterprise compute buildout." },
  ANET: { name: "Arista Networks Inc", primarySegment: "Compute", sectors: { Compute: 40, Infrastructure: 30, Power: 5, Cooling: 8, Grid: 5 }, explanation: "DC networking switches and software. Dominates cloud provider network deployments." },
  MRVL: { name: "Marvell Technology Inc", primarySegment: "Compute", sectors: { Compute: 65, Infrastructure: 18, Power: 5, Cooling: 8, Grid: 5 }, explanation: "Custom AI accelerator and DC networking silicon. Electro-optics for hyperscaler infrastructure." },
};

function scorePortfolioTicker(ticker: string) {
  const known = COMPANY_DATABASE[ticker.toUpperCase()];
  if (known) {
    const sectors = known.sectors;
    const score = Math.round(
      sectors.Compute * 0.3 +
      sectors.Infrastructure * 0.25 +
      sectors.Power * 0.25 +
      sectors.Cooling * 0.1 +
      sectors.Grid * 0.1
    );
    return {
      ticker: ticker.toUpperCase(),
      name: known.name,
      score: Math.min(score, 100),
      sectors,
      primarySegment: known.primarySegment,
      explanation: known.explanation,
    };
  }

  return {
    ticker: ticker.toUpperCase(),
    name: `${ticker.toUpperCase()} (Unknown)`,
    score: 8,
    sectors: { Compute: 10, Infrastructure: 5, Power: 5, Cooling: 5, Grid: 5 },
    primarySegment: "Other",
    explanation: "No direct AI power infrastructure exposure identified. May have indirect benefits from broader technology adoption.",
  };
}

// Yahoo chart() options keyed to the requested timeframe.
// Returns intraday for 1D, hourly for 5D, daily for 1M.
function chartOptsForTimeframe(tf: string) {
  const period2 = new Date();
  if (tf === "1M") {
    const period1 = new Date(period2.getTime() - 35 * 24 * 60 * 60 * 1000);
    return { period1, period2, interval: "1d" as const };
  }
  if (tf === "5D") {
    const period1 = new Date(period2.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { period1, period2, interval: "1h" as const };
  }
  // 1D default — last two days of 5m bars (covers the most recent session)
  const period1 = new Date(period2.getTime() - 2 * 24 * 60 * 60 * 1000);
  return { period1, period2, interval: "5m" as const };
}

// Static market data (fallback when Yahoo Finance is unavailable)
const STATIC_MARKET_DATA: Record<string, {
  price: number; change: number; changePercent: number; pe: number | null;
  revenueGrowth: number | null; name: string; powerMW?: number; vs_sp500?: number; marketCapDisplay?: string;
}> = {
  NVDA: { name: "NVIDIA Corporation", price: 178.00, change: 0.00, changePercent: 0.00, pe: 36.3, revenueGrowth: 122.4, vs_sp500: 145.2, marketCapDisplay: "$4.3T" },
  TSM:  { name: "Taiwan Semiconductor Mfg", price: 345.00, change: 0.00, changePercent: 0.00, pe: 32.6, revenueGrowth: 38.9, vs_sp500: 72.4, marketCapDisplay: "$1.8T" },
  AMD:  { name: "Advanced Micro Devices", price: 189.00, change: 0.00, changePercent: 0.00, pe: 72.6, revenueGrowth: 17.4, vs_sp500: 22.1, marketCapDisplay: "$305B" },
  MU:   { name: "Micron Technology", price: 376.00, change: 0.00, changePercent: 0.00, pe: 35.8, revenueGrowth: 84.7, vs_sp500: 38.9, marketCapDisplay: "$415B" },
  INTC: { name: "Intel Corporation", price: 21.47, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: -2.1, vs_sp500: -48.2, marketCapDisplay: "$90B" },
  EQIX: { name: "Equinix Inc", price: 955.00, change: 0.00, changePercent: 0.00, pe: 69.5, revenueGrowth: 9.8, powerMW: 1200, vs_sp500: 18.5, marketCapDisplay: "$85B" },
  DLR:  { name: "Digital Realty Trust", price: 175.00, change: 0.00, changePercent: 0.00, pe: 49.0, revenueGrowth: 11.2, powerMW: 850, vs_sp500: 15.3, marketCapDisplay: "$48B" },
  VRT:  { name: "Vertiv Holdings", price: 235.00, change: 0.00, changePercent: 0.00, pe: 69.1, revenueGrowth: 19.8, powerMW: 600, vs_sp500: 142.3, marketCapDisplay: "$88B" },
  IREN: { name: "IREN Limited", price: 37.75, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: 127.8, powerMW: 1400, vs_sp500: 85.4, marketCapDisplay: "$10B" },
  AMT:  { name: "American Tower Corp", price: 194.56, change: 0.00, changePercent: 0.00, pe: 45.2, revenueGrowth: 5.1, powerMW: 120, vs_sp500: -4.2, marketCapDisplay: "$40B" },
  CEG:  { name: "Constellation Energy", price: 315.00, change: 0.00, changePercent: 0.00, pe: 42.6, revenueGrowth: 32.1, marketCapDisplay: "$75B" },
  VST:  { name: "Vistra Corp", price: 154.00, change: 0.00, changePercent: 0.00, pe: 55.7, revenueGrowth: 68.4, marketCapDisplay: "$40B" },
  ETR:  { name: "Entergy Corporation", price: 82.50, change: 0.00, changePercent: 0.00, pe: 19.1, revenueGrowth: 7.2 },
  NEE:  { name: "NextEra Energy", price: 74.80, change: 0.00, changePercent: 0.00, pe: 22.8, revenueGrowth: 9.4 },
  CCJ:  { name: "Cameco Corporation", price: 113.00, change: 0.00, changePercent: 0.00, pe: 114.2, revenueGrowth: 35.7, marketCapDisplay: "$50B" },
  NXE:  { name: "NexGen Energy", price: 11.84, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$5.4B" },
  URA:  { name: "Global X Uranium ETF", price: 27.14, change: 0.87, changePercent: 3.31, pe: null, revenueGrowth: null },
  NLR:  { name: "VanEck Uranium+Nuclear ETF", price: 67.84, change: 0.54, changePercent: 0.80, pe: null, revenueGrowth: null, marketCapDisplay: "$1.1B" },
  // Compute (previously missing from static)
  MSFT: { name: "Microsoft Corporation", price: 385.00, change: 0.00, changePercent: 0.00, pe: 34.5, revenueGrowth: 16.8, marketCapDisplay: "$2.9T" },
  GOOGL:{ name: "Alphabet Inc", price: 168.00, change: 0.00, changePercent: 0.00, pe: 22.4, revenueGrowth: 15.2, marketCapDisplay: "$2.1T" },
  META: { name: "Meta Platforms Inc", price: 596.00, change: 0.00, changePercent: 0.00, pe: 28.1, revenueGrowth: 21.4, marketCapDisplay: "$1.5T" },
  AAPL: { name: "Apple Inc", price: 248.00, change: 0.00, changePercent: 0.00, pe: 32.8, revenueGrowth: 4.1, marketCapDisplay: "$3.8T" },
  AMZN: { name: "Amazon.com Inc", price: 202.00, change: 0.00, changePercent: 0.00, pe: 38.6, revenueGrowth: 11.2, marketCapDisplay: "$2.2T" },
  SMCI: { name: "Super Micro Computer", price: 44.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: 58.3, marketCapDisplay: "$25B" },
  TSLA: { name: "Tesla Inc", price: 285.00, change: 0.00, changePercent: 0.00, pe: 110.2, revenueGrowth: 8.4, marketCapDisplay: "$915B" },
  // ETFs (previously missing)
  QQQ:  { name: "Invesco QQQ Trust", price: 478.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$215B" },
  XLK:  { name: "Technology Select SPDR ETF", price: 222.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$72B" },
  SPY:  { name: "SPDR S&P 500 ETF", price: 562.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$572B" },
  // Nuclear Operators
  TLN:  { name: "Talen Energy Corporation", price: 242.00, change: 0.00, changePercent: 0.00, pe: 18.4, revenueGrowth: 42.1, marketCapDisplay: "$7.1B" },
  NRG:  { name: "NRG Energy Inc", price: 112.00, change: 0.00, changePercent: 0.00, pe: 24.6, revenueGrowth: 12.8, marketCapDisplay: "$14B" },
  // Uranium & Fuel Cycle
  UEC:  { name: "Uranium Energy Corp", price: 7.60, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$3.5B" },
  LEU:  { name: "Centrus Energy Corp", price: 72.00, change: 0.00, changePercent: 0.00, pe: 14.2, revenueGrowth: 8.5, marketCapDisplay: "$820M" },
  UUUU: { name: "Energy Fuels Inc", price: 6.55, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$1.1B" },
  DNN:  { name: "Denison Mines Corp", price: 2.48, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$1.6B" },
  PALAF:{ name: "Paladin Energy Ltd", price: 2.82, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$2.0B" },
  // SMR & Advanced Nuclear
  OKLO: { name: "Oklo Inc", price: 52.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$5.8B" },
  BWXT: { name: "BWX Technologies Inc", price: 116.00, change: 0.00, changePercent: 0.00, pe: 38.2, revenueGrowth: 10.4, marketCapDisplay: "$8.0B" },
  SMR:  { name: "NuScale Power Corp", price: 14.50, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$480M" },
  // Power Hardware
  GEV:  { name: "GE Vernova Inc", price: 352.00, change: 0.00, changePercent: 0.00, pe: 68.4, revenueGrowth: 15.2, marketCapDisplay: "$96B" },
  ETN:  { name: "Eaton Corporation plc", price: 398.00, change: 0.00, changePercent: 0.00, pe: 39.1, revenueGrowth: 9.0, marketCapDisplay: "$155B" },
  NVT:  { name: "nVent Electric PLC", price: 88.00, change: 0.00, changePercent: 0.00, pe: 24.8, revenueGrowth: 22.4, marketCapDisplay: "$14B" },
  CARR: { name: "Carrier Global Corp", price: 74.00, change: 0.00, changePercent: 0.00, pe: 26.2, revenueGrowth: 9.8, marketCapDisplay: "$62B" },
  ABB:  { name: "ABB Ltd", price: 56.00, change: 0.00, changePercent: 0.00, pe: 28.4, revenueGrowth: 8.2, marketCapDisplay: "$120B" },
  EMR:  { name: "Emerson Electric Co", price: 126.00, change: 0.00, changePercent: 0.00, pe: 28.8, revenueGrowth: 7.4, marketCapDisplay: "$36B" },
  HUBB: { name: "Hubbell Inc", price: 388.00, change: 0.00, changePercent: 0.00, pe: 22.6, revenueGrowth: 8.8, marketCapDisplay: "$21B" },
  JCI:  { name: "Johnson Controls Int'l", price: 66.00, change: 0.00, changePercent: 0.00, pe: 22.4, revenueGrowth: 6.2, marketCapDisplay: "$44B" },
  SIEGY:{ name: "Siemens Energy AG", price: 48.00, change: 0.00, changePercent: 0.00, pe: 32.8, revenueGrowth: 18.4, marketCapDisplay: "$60B" },
  BKR:  { name: "Baker Hughes Co", price: 41.00, change: 0.00, changePercent: 0.00, pe: 21.4, revenueGrowth: 8.8, marketCapDisplay: "$40B" },
  // Utilities
  D:    { name: "Dominion Energy Inc", price: 55.00, change: 0.00, changePercent: 0.00, pe: 18.6, revenueGrowth: 4.8, marketCapDisplay: "$47B" },
  SO:   { name: "Southern Company", price: 92.00, change: 0.00, changePercent: 0.00, pe: 20.4, revenueGrowth: 6.2, marketCapDisplay: "$103B" },
  DUK:  { name: "Duke Energy Corp", price: 118.00, change: 0.00, changePercent: 0.00, pe: 19.8, revenueGrowth: 4.4, marketCapDisplay: "$92B" },
  AEP:  { name: "American Electric Power", price: 108.00, change: 0.00, changePercent: 0.00, pe: 18.2, revenueGrowth: 7.4, marketCapDisplay: "$58B" },
  XEL:  { name: "Xcel Energy Inc", price: 78.00, change: 0.00, changePercent: 0.00, pe: 18.8, revenueGrowth: 5.8, marketCapDisplay: "$42B" },
  EVRG: { name: "Evergy Inc", price: 61.00, change: 0.00, changePercent: 0.00, pe: 16.4, revenueGrowth: 4.2, marketCapDisplay: "$9.0B" },
  PPL:  { name: "PPL Corporation", price: 34.00, change: 0.00, changePercent: 0.00, pe: 17.8, revenueGrowth: 5.4, marketCapDisplay: "$24B" },
  PCG:  { name: "PG&E Corp", price: 20.00, change: 0.00, changePercent: 0.00, pe: 15.8, revenueGrowth: 8.8, marketCapDisplay: "$53B" },
  // Construction & EPC
  PWR:  { name: "Quanta Services Inc", price: 312.00, change: 0.00, changePercent: 0.00, pe: 50.4, revenueGrowth: 18.4, marketCapDisplay: "$45B" },
  EME:  { name: "EMCOR Group Inc", price: 382.00, change: 0.00, changePercent: 0.00, pe: 24.6, revenueGrowth: 14.8, marketCapDisplay: "$16B" },
  MTZ:  { name: "MasTec Inc", price: 182.00, change: 0.00, changePercent: 0.00, pe: 42.4, revenueGrowth: 22.4, marketCapDisplay: "$14B" },
  STRL: { name: "Sterling Infrastructure Inc", price: 178.00, change: 0.00, changePercent: 0.00, pe: 26.8, revenueGrowth: 42.8, marketCapDisplay: "$5.1B" },
  FLR:  { name: "Fluor Corporation", price: 44.00, change: 0.00, changePercent: 0.00, pe: 28.4, revenueGrowth: 10.2, marketCapDisplay: "$7.2B" },
  PRIM: { name: "Primoris Services Corp", price: 54.00, change: 0.00, changePercent: 0.00, pe: 18.6, revenueGrowth: 12.4, marketCapDisplay: "$3.0B" },
  J:    { name: "Jacobs Solutions Inc", price: 130.00, change: 0.00, changePercent: 0.00, pe: 22.5, revenueGrowth: 6.8, marketCapDisplay: "$16.2B" },
  ACM:  { name: "AECOM", price: 105.00, change: 0.00, changePercent: 0.00, pe: 24.1, revenueGrowth: 8.3, marketCapDisplay: "$14.5B" },
  USAR: { name: "USA Rare Earth LLC", price: 4.50, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$450M" },
  // Sector ETF Benchmarks
  XLU:  { name: "Utilities Select SPDR ETF", price: 85.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$14B" },
  URNM: { name: "Sprott Uranium Miners ETF", price: 51.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null },
  DTCR: { name: "Global X Data Center ETF", price: 27.50, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null },
  GRID: { name: "First Trust Nasdaq Smart Grid ETF", price: 104.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null },
  PAVE: { name: "Global X US Infrastructure ETF", price: 37.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null },
  // Raw Materials - Mining & Metals
  FCX:  { name: "Freeport-McMoRan Inc", price: 44.00, change: 0.00, changePercent: 0.00, pe: 22.4, revenueGrowth: 12.8, marketCapDisplay: "$63B" },
  SCCO: { name: "Southern Copper Corp", price: 98.00, change: 0.00, changePercent: 0.00, pe: 28.6, revenueGrowth: 18.4, marketCapDisplay: "$76B" },
  TECK: { name: "Teck Resources Ltd", price: 42.00, change: 0.00, changePercent: 0.00, pe: 14.8, revenueGrowth: 8.2, marketCapDisplay: "$22B" },
  HBM:  { name: "Hudbay Minerals Inc", price: 8.50, change: 0.00, changePercent: 0.00, pe: 12.4, revenueGrowth: 15.6, marketCapDisplay: "$3.4B" },
  NUE:  { name: "Nucor Corporation", price: 142.00, change: 0.00, changePercent: 0.00, pe: 11.2, revenueGrowth: -8.4, marketCapDisplay: "$33B" },
  STLD: { name: "Steel Dynamics Inc", price: 118.00, change: 0.00, changePercent: 0.00, pe: 9.8, revenueGrowth: -6.2, marketCapDisplay: "$18B" },
  CLF:  { name: "Cleveland-Cliffs Inc", price: 14.50, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: -12.4, marketCapDisplay: "$7.2B" },
  X:    { name: "United States Steel Corp", price: 38.00, change: 0.00, changePercent: 0.00, pe: 18.6, revenueGrowth: -4.8, marketCapDisplay: "$8.5B" },
  MP:   { name: "MP Materials Corp", price: 18.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: 22.4, marketCapDisplay: "$3.0B" },
  BHP:  { name: "BHP Group Ltd", price: 56.00, change: 0.00, changePercent: 0.00, pe: 18.2, revenueGrowth: 4.8, marketCapDisplay: "$140B" },
  RIO:  { name: "Rio Tinto Group", price: 64.00, change: 0.00, changePercent: 0.00, pe: 9.4, revenueGrowth: 2.8, marketCapDisplay: "$105B" },
  VALE: { name: "Vale S.A.", price: 10.50, change: 0.00, changePercent: 0.00, pe: 5.8, revenueGrowth: -2.4, marketCapDisplay: "$45B" },
  COPX: { name: "Global X Copper Miners ETF", price: 42.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: null, marketCapDisplay: "$2.8B" },
  // Raw Materials - Natural Gas
  AR:   { name: "Antero Resources Corp", price: 32.00, change: 0.00, changePercent: 0.00, pe: 8.4, revenueGrowth: 28.6, marketCapDisplay: "$9.2B" },
  EQT:  { name: "EQT Corporation", price: 42.00, change: 0.00, changePercent: 0.00, pe: 14.8, revenueGrowth: 32.4, marketCapDisplay: "$22B" },
  RRC:  { name: "Range Resources Corp", price: 34.00, change: 0.00, changePercent: 0.00, pe: 10.2, revenueGrowth: 18.8, marketCapDisplay: "$8.0B" },
  SWN:  { name: "Southwestern Energy Co", price: 6.80, change: 0.00, changePercent: 0.00, pe: 8.6, revenueGrowth: 22.4, marketCapDisplay: "$7.5B" },
  LNG:  { name: "Cheniere Energy Inc", price: 198.00, change: 0.00, changePercent: 0.00, pe: 12.8, revenueGrowth: 8.4, marketCapDisplay: "$45B" },
  // Renewable Generation
  FSLR: { name: "First Solar Inc", price: 178.00, change: 0.00, changePercent: 0.00, pe: 16.4, revenueGrowth: 28.2, marketCapDisplay: "$19B" },
  ENPH: { name: "Enphase Energy Inc", price: 68.00, change: 0.00, changePercent: 0.00, pe: 32.8, revenueGrowth: -18.4, marketCapDisplay: "$9.2B" },
  SEDG: { name: "SolarEdge Technologies", price: 16.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: -42.8, marketCapDisplay: "$920M" },
  AES:  { name: "AES Corporation", price: 18.00, change: 0.00, changePercent: 0.00, pe: 8.4, revenueGrowth: 4.8, marketCapDisplay: "$12B" },
  // Transmission & Grid Hardware
  WIRE: { name: "Encore Wire Corp", price: 312.00, change: 0.00, changePercent: 0.00, pe: 18.6, revenueGrowth: 14.8, marketCapDisplay: "$6.2B" },
  GNRC: { name: "Generac Holdings Inc", price: 148.00, change: 0.00, changePercent: 0.00, pe: 24.2, revenueGrowth: 8.4, marketCapDisplay: "$9.0B" },
  AYI:  { name: "Acuity Brands Inc", price: 268.00, change: 0.00, changePercent: 0.00, pe: 22.8, revenueGrowth: 6.2, marketCapDisplay: "$8.5B" },
  AOS:  { name: "A.O. Smith Corporation", price: 82.00, change: 0.00, changePercent: 0.00, pe: 20.4, revenueGrowth: 4.8, marketCapDisplay: "$11B" },
  IDA:  { name: "IDACORP Inc", price: 108.00, change: 0.00, changePercent: 0.00, pe: 21.6, revenueGrowth: 6.8, marketCapDisplay: "$5.8B" },
  // Crypto/AI DC Operators
  CLSK: { name: "CleanSpark Inc", price: 12.50, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: 145.2, marketCapDisplay: "$3.2B" },
  MARA: { name: "MARA Holdings Inc", price: 18.00, change: 0.00, changePercent: 0.00, pe: null, revenueGrowth: 78.4, marketCapDisplay: "$5.5B" },
  // Additional Compute
  AVGO: { name: "Broadcom Inc", price: 178.00, change: 0.00, changePercent: 0.00, pe: 32.4, revenueGrowth: 44.2, marketCapDisplay: "$830B" },
  DELL: { name: "Dell Technologies Inc", price: 112.00, change: 0.00, changePercent: 0.00, pe: 18.6, revenueGrowth: 12.8, marketCapDisplay: "$78B" },
  ANET: { name: "Arista Networks Inc", price: 82.00, change: 0.00, changePercent: 0.00, pe: 38.4, revenueGrowth: 24.6, marketCapDisplay: "$105B" },
  MRVL: { name: "Marvell Technology Inc", price: 88.00, change: 0.00, changePercent: 0.00, pe: 48.2, revenueGrowth: 18.4, marketCapDisplay: "$76B" },
};

// Nuclear Power Index (NPI) base prices and all index formulas live in
// server/indices.ts (pure, unit-tested, shared with the backtest script).

// ─── Auto-derived market constants ─────────────────────────────────────────
// URANIUM_SPOT and SMR_POLICY_SCORE were hardcoded values that drifted out of
// date. They are now derived at request time:
//   - Uranium spot: loaded from server/data/market-constants.json, which the
//     news scanner auto-updates when it detects $XX/lb in headlines from
//     Cameco PR, World Nuclear News, etc. Admin override available.
//   - SMR policy score: counted from active nuclear-PPA projects in the
//     backlog. Score rises automatically as new PPAs land in the dataset.
const MARKET_CONSTANTS_FILE = join(process.cwd(), "server", "data", "market-constants.json");

interface MarketConstants {
  uraniumSpotUsdPerLb: number;
  uraniumSpotAsOf: string;
  uraniumSpotSource: string;
  lastUpdated: string;
}

function loadMarketConstants(): MarketConstants {
  try {
    return JSON.parse(readFileSync(MARKET_CONSTANTS_FILE, "utf-8"));
  } catch {
    // Last-resort defaults if file is missing/corrupt
    return {
      uraniumSpotUsdPerLb: 92.0,
      uraniumSpotAsOf: "fallback baseline",
      uraniumSpotSource: "in-code default",
      lastUpdated: "1970-01-01",
    };
  }
}

function saveMarketConstants(m: MarketConstants): void {
  m.lastUpdated = new Date().toISOString().slice(0, 10);
  writeFileSync(MARKET_CONSTANTS_FILE, JSON.stringify(m, null, 2) + "\n");
}

// Derive SMR policy score from the backlog. Score scales with the count of
// active hyperscaler-grade nuclear PPAs we're tracking. Anchored so the
// score moves slowly and stays in the 6.5-9.5 range under normal conditions.
function deriveSmrPolicyScore(): number {
  try {
    const dataPath = join(process.cwd(), "server", "data", "interconnection-queue.json");
    const data = JSON.parse(readFileSync(dataPath, "utf-8")) as BacklogDataset;
    const nuclearActive = data.projects.filter((p) =>
      p.type === "nuclear" &&
      p.status === "active" &&
      (p.category === "ppa" || p.category === "generation") &&
      p.dcRelevant
    );
    // 5.0 baseline + 0.3 per active nuclear-PPA, capped at 9.5.
    // Tuned so current dataset (~9 nuclear PPAs) yields ~7.7, close to the
    // historical 7.8 anchor — preserves NPI continuity.
    return Math.min(9.5, 5.0 + 0.3 * nuclearActive.length);
  } catch {
    return 7.0;  // conservative fallback
  }
}

function calculateCorrelation(xs: number[], ys: number[]) {
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  const num = xs.reduce((s, v, i) => s + (v - meanX) * (ys[i] - meanY), 0);
  const denX = Math.sqrt(xs.reduce((s, v) => s + Math.pow(v - meanX, 2), 0));
  const denY = Math.sqrt(ys.reduce((s, v) => s + Math.pow(v - meanY, 2), 0));
  return num / (denX * denY);
}

// ─── Stack + Top-Movers cache (10-min TTL per timeframe) ───────────────────
const stackCache: Record<string, { data: Record<string, any>; timestamp: number }> = {};
const STACK_CACHE_TTL = 10 * 60 * 1000;

// All tickers tracked across every Stack layer
const STACK_TICKERS = {
  compute:            ["NVDA", "TSM", "AMD", "MU", "MSFT", "GOOGL", "META", "AAPL", "SMCI", "AMZN", "INTC", "AVGO", "DELL", "ANET", "MRVL"],
  nuclear:            ["CEG", "VST", "TLN", "NRG", "OKLO", "BWXT", "SMR"],
  uranium:            ["CCJ", "UEC", "LEU", "UUUU", "DNN", "NXE", "PALAF"],
  powerHardware:      ["GEV", "ETN", "VRT", "NVT", "CARR", "ABB", "EMR", "HUBB", "JCI", "SIEGY", "BKR"],
  utilities:          ["NEE", "D", "SO", "DUK", "AEP", "XEL", "EVRG", "PPL", "PCG", "ETR"],
  dataCenters:        ["EQIX", "DLR", "AMT", "IREN"],
  construction:       ["PWR", "EME", "MTZ", "STRL", "FLR", "PRIM"],
  rawMaterialsMining: ["FCX", "SCCO", "TECK", "HBM", "NUE", "STLD", "CLF", "X", "MP", "BHP", "RIO", "VALE", "COPX"],
  rawMaterialsNatGas: ["AR", "EQT", "RRC", "SWN", "LNG"],
  renewableGeneration:["FSLR", "ENPH", "SEDG", "AES"],
  transmissionGrid:   ["WIRE", "GNRC", "AYI", "AOS", "IDA"],
  cryptoAIDC:         ["CLSK", "MARA"],
  etfsBenchmarks:     ["URA", "URNM", "NLR", "DTCR", "GRID", "XLU", "PAVE", "QQQ", "XLK", "SPY", "TSLA"],
};
const ALL_STACK_TICKERS = Object.values(STACK_TICKERS).flat();

// Fetch live quote + real historical sparkline for every tracked ticker.
// Falls through to STATIC_MARKET_DATA on per-ticker Yahoo failure, with
// sparkline left empty (UI shows nothing rather than fabricated data).
async function getCachedStockData(timeframe: string): Promise<Record<string, any>> {
  const cacheKey = timeframe;
  const now = Date.now();
  const cached = stackCache[cacheKey];
  if (cached && now - cached.timestamp < STACK_CACHE_TTL) {
    return cached.data;
  }

  const stockData: Record<string, any> = {};
  try {
    const YahooFinanceClass = (await import("yahoo-finance2")).default;
    const yahooFinance = new YahooFinanceClass({ suppressNotices: ["yahooSurvey"] });
    const chartOpts = chartOptsForTimeframe(timeframe);

    // Real revenue growth, refreshed daily in the background (non-blocking,
    // single-flight). Until the first sweep lands, the field serves null -
    // the UI's defined em-dash state - never a months-stale curated number.
    refreshFundamentalsIfStale(ALL_STACK_TICKERS, async (ticker) => {
      const qs = await yahooFinance.quoteSummary(ticker, { modules: ["financialData"] });
      return fractionToPercent((qs as any)?.financialData?.revenueGrowth);
    });
    const fundamentals = getCachedFundamentals();

    const [quotes, charts] = await Promise.all([
      Promise.all(ALL_STACK_TICKERS.map((t) => yahooFinance.quote(t).catch(() => null))),
      Promise.all(ALL_STACK_TICKERS.map((t) => yahooFinance.chart(t, chartOpts).catch(() => null))),
    ]);

    quotes.forEach((r, i) => {
      if (r?.regularMarketPrice) {
        const ticker = ALL_STACK_TICKERS[i];
        const staticData = STATIC_MARKET_DATA[ticker];
        // Write-through fallback cache: keep STATIC_MARKET_DATA current so
        // a future Yahoo throttle returns prices < 10 min stale instead of
        // months stale. Only price/change/changePercent are written.
        if (staticData) {
          staticData.price = r.regularMarketPrice;
          if (r.regularMarketChange != null) staticData.change = r.regularMarketChange;
          if (r.regularMarketChangePercent != null) staticData.changePercent = r.regularMarketChangePercent;
        }
        const closes = (charts[i]?.quotes ?? [])
          .map((q: any) => q.close)
          .filter((c: any): c is number => typeof c === "number");
        stockData[ticker] = {
          ticker,
          name: r.longName || r.shortName || staticData?.name || ticker,
          price: r.regularMarketPrice,
          change: r.regularMarketChange ?? 0,
          changePercent: r.regularMarketChangePercent ?? 0,
          pe: r.trailingPE ?? staticData?.pe ?? null,
          revenueGrowth: fundamentals[ticker]?.revenueGrowth ?? null,
          sparkline: closes,
          powerMW: staticData?.powerMW,
          vs_sp500: staticData?.vs_sp500,
          marketCapDisplay: staticData?.marketCapDisplay,
          // Passthroughs from the same quote call (no extra fetches): numeric
          // cap for honest treemap sizing, market state for pre/post badges,
          // prior close for the sparkline reference line.
          marketCap: r.marketCap ?? null,
          marketState: r.marketState ?? null,
          previousClose: r.regularMarketPreviousClose ?? null,
        };
      }
    });
  } catch {
    // fall through to static-only
  }

  for (const ticker of ALL_STACK_TICKERS) {
    if (!stockData[ticker]) {
      const s = STATIC_MARKET_DATA[ticker];
      if (s) {
        // Yahoo failed for this ticker. Emit null for change/changePercent so
        // the UI can render "--" instead of a fake "+0.00%" that looks live.
        stockData[ticker] = {
          ticker,
          ...s,
          change: null,
          changePercent: null,
          stale: true,
          sparkline: [],
          marketCap: null,
          marketState: null,
          previousClose: null,
        };
      }
    }
  }

  stackCache[cacheKey] = { data: stockData, timestamp: now };
  return stockData;
}

// Weekly closes for the uranium correlation module (1y, 1wk interval).
async function fetchWeeklyCloses(ticker: string): Promise<Array<{ t: number; close: number }>> {
  const YahooFinanceClass = (await import("yahoo-finance2")).default;
  const yahooFinance = new YahooFinanceClass({ suppressNotices: ["yahooSurvey"] });
  const chart = await yahooFinance.chart(ticker, {
    period1: new Date(Date.now() - 370 * 86_400_000),
    interval: "1wk",
  });
  return (chart.quotes ?? [])
    .filter((q: any) => typeof q.close === "number" && q.date)
    .map((q: any) => ({ t: new Date(q.date).getTime(), close: q.close as number }));
}

// ─── News cache (1-hour TTL) ────────────────────────────────────────────────
interface NewsItem { headline: string; source: string; url: string; publishedAt: string; }
let newsCache: { items: NewsItem[]; timestamp: number } | null = null;
const EARNINGS_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
let earningsCache: { items: any[]; timestamp: number } | null = null;
const NEWS_CACHE_TTL = 60 * 60 * 1000; // 1 hour - safe for RSS and NewsData.io

// RSS feeds: AI infrastructure, power grid, nuclear, datacenters
const RSS_FEEDS: Array<{ url: string; sourceName: string }> = [
  { url: "https://www.utilitydive.com/feeds/news/", sourceName: "Utility Dive" },
  { url: "https://www.datacenterdynamics.com/en/rss/", sourceName: "DCD" },
  { url: "https://www.world-nuclear-news.org/rss", sourceName: "World Nuclear News" },
  { url: "https://www.power-eng.com/feed/", sourceName: "Power Engineering" },
  { url: "https://www.powermag.com/feed/", sourceName: "Power Magazine" },
  { url: "https://www.latitudemedia.com/feed", sourceName: "Latitude Media" },
  { url: "https://www.energy.gov/rss.xml", sourceName: "DOE" },
  { url: "https://www.eia.gov/rss/todayinenergy.xml", sourceName: "EIA" },
];

async function fetchRSSNews(): Promise<NewsItem[]> {
  const parser = new RSSParser({ timeout: 5000 });
  const allItems: NewsItem[] = [];

  await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, sourceName }) => {
      try {
        const feed = await parser.parseURL(url);
        for (const item of feed.items ?? []) {
          const title = (item.title ?? "").trim();
          const desc = item.contentSnippet ?? item.content ?? "";
          if (!title || !isNewsRelevant(title + " " + desc)) continue;
          if (/^sponsored:/i.test(title)) continue;
          const rawSource = feed.title ? feed.title.replace(/\s*\|.*$/, "").replace(/\s*-\s.*$/, "").trim() : sourceName;
          allItems.push({
            headline: title,
            source: rawSource || sourceName,
            url: item.link ?? item.guid ?? "#",
            publishedAt: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
          });
        }
      } catch (_e) {
        // Feed failed - skip silently
      }
    })
  );

  // Sort newest first, filter to last 7 days, deduplicate by headline prefix
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  allItems.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const seen = new Set<string>();
  return allItems.filter((item) => {
    const pubTime = new Date(item.publishedAt).getTime();
    if (Number.isNaN(pubTime) || pubTime < sevenDaysAgo) return false;
    const key = item.headline.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}

// ─── Backlog news-driven auto-refresh ──────────────────────────────────────
// Patterns to detect when an article reports an updated headline figure for
// PJM, ERCOT, MISO, or the overall US queue. Each pattern captures a GW or
// project-count number. Matches are sanity-checked against the current value
// before being applied. Less-confident matches go to a review queue.

interface BacklogUpdatePattern {
  field: keyof BacklogDataset["headline"];
  asOfField?: keyof BacklogDataset["headline"];
  unit: "GW" | "projects" | "percent";
  // Regex must capture the number in group 1
  regex: RegExp;
  // Sanity: new value must be within ±this fraction of current. 1.0 = ±100%
  sanityRange: number;
  // Optional minimum match score (e.g. require certain words present)
  contextHints?: string[];
  label: string;
}

const BACKLOG_PATTERNS: BacklogUpdatePattern[] = [
  {
    field: "pjmReopenedGW",
    asOfField: "pjmReopenedAsOf",
    unit: "GW",
    regex: /\bPJM(?:'s|s)?\s+(?:reopened\s+|new\s+|transition\s+|cycle\s+\d+\s+)?(?:queue|interconnection\s+queue)\b[^\.]{0,80}?(\d{2,4}(?:\.\d+)?)\s*GW\b/i,
    sanityRange: 0.6,
    contextHints: ["queue", "interconnection"],
    label: "PJM reopened queue total GW",
  },
  {
    field: "pjmReopenedProjects",
    asOfField: "pjmReopenedAsOf",
    unit: "projects",
    regex: /\bPJM\b[^\.]{0,80}?(\d{2,5})\s+(?:active\s+)?(?:projects|requests)\b/i,
    sanityRange: 0.8,
    contextHints: ["queue"],
    label: "PJM project count",
  },
  {
    field: "ercotLargeLoadGW",
    asOfField: "ercotLargeLoadAsOf",
    unit: "GW",
    regex: /\bERCOT(?:'s)?\s+(?:large[- ]load|datacenter|data[- ]center)[^\.]{0,80}?(\d{2,4}(?:\.\d+)?)\s*GW\b/i,
    sanityRange: 1.5,
    contextHints: ["ERCOT", "large"],
    label: "ERCOT large-load queue GW",
  },
  {
    field: "queueOverallGW",
    asOfField: "queueOverallAsOf",
    unit: "GW",
    regex: /(?:U\.?S\.?|nationwide|national|active)\s+(?:interconnection\s+)?queue[^\.]{0,80}?([\d,]{3,5})\s*GW\b/i,
    sanityRange: 0.6,
    contextHints: ["queue"],
    label: "US overall queue GW",
  },
  {
    field: "queueOverallProjects",
    asOfField: "queueOverallAsOf",
    unit: "projects",
    regex: /([\d,]{3,6})\s+(?:active\s+)?(?:projects|requests)\s+(?:actively\s+)?(?:seeking|in\s+the\s+queue|in\s+US\s+interconnection)/i,
    sanityRange: 0.6,
    contextHints: ["queue", "interconnection"],
    label: "US overall queue projects",
  },
  {
    field: "dominionContractedGW",
    asOfField: "dominionAsOf",
    unit: "GW",
    regex: /\bDominion(?:'s|\s+Energy)?\s+[^\.]{0,80}?(\d{2,3}(?:\.\d+)?)\s*GW\s+(?:contracted|in\s+contracts|under\s+contract|of\s+data\s+center)/i,
    sanityRange: 0.5,
    contextHints: ["data center", "contract"],
    label: "Dominion contracted DC GW",
  },
  {
    field: "stargateAbileneGW",
    unit: "GW",
    regex: /\bStargate\b[^\.]{0,40}?Abilene[^\.]{0,80}?(\d{1,2}(?:\.\d+)?)\s*GW\b/i,
    sanityRange: 1.0,
    contextHints: ["Stargate"],
    label: "Stargate Abilene capacity GW",
  },
];

const AUTO_UPDATE_LOG = join(process.cwd(), "server", "data", "backlog-auto-updates.json");

interface BacklogAutoUpdateEntry {
  timestamp: string;
  field: string;
  oldValue: number | string | null;
  newValue: number | string;
  source: string;
  sourceUrl: string;
  articleHeadline: string;
  articleDate: string;
  pattern: string;
  status: "applied" | "pending-review" | "rejected-sanity" | "rejected-stale";
  reason?: string;
}

function loadAutoUpdateLog(): BacklogAutoUpdateEntry[] {
  try {
    if (existsSync(AUTO_UPDATE_LOG)) {
      return JSON.parse(readFileSync(AUTO_UPDATE_LOG, "utf-8"));
    }
  } catch { /* ignore */ }
  return [];
}

function appendAutoUpdateLog(entry: BacklogAutoUpdateEntry): void {
  const log = loadAutoUpdateLog();
  log.push(entry);
  // Bounded to last 500 entries
  const trimmed = log.length > 500 ? log.slice(-500) : log;
  writeFileSync(AUTO_UPDATE_LOG, JSON.stringify(trimmed, null, 2) + "\n");
}

// Returns a count of applied + flagged updates after one pass.
async function scanNewsForBacklogUpdates(news: NewsItem[]): Promise<{ applied: number; flagged: number; checked: number }> {
  const filePath = join(process.cwd(), "server", "data", "interconnection-queue.json");
  let data: BacklogDataset;
  try {
    data = JSON.parse(readFileSync(filePath, "utf-8")) as BacklogDataset;
  } catch (e) {
    console.error("Backlog scanner: could not load dataset:", e);
    return { applied: 0, flagged: 0, checked: 0 };
  }

  let applied = 0;
  let flagged = 0;
  let checked = 0;
  const now = Date.now();
  const NINETY_DAYS_MS = 90 * 86400000;

  for (const pattern of BACKLOG_PATTERNS) {
    // Best candidate = most recent article whose headline matches and passes hints
    let best: { article: NewsItem; capture: string } | null = null;
    let bestTs = 0;
    for (const article of news) {
      const ts = new Date(article.publishedAt).getTime();
      if (!Number.isFinite(ts) || now - ts > NINETY_DAYS_MS) continue;
      const m = article.headline.match(pattern.regex);
      if (!m) continue;
      // Context hint check: at least one hint must appear in the headline
      if (pattern.contextHints && pattern.contextHints.length > 0) {
        const lower = article.headline.toLowerCase();
        const hit = pattern.contextHints.some((h) => lower.includes(h.toLowerCase()));
        if (!hit) continue;
      }
      if (ts > bestTs) {
        bestTs = ts;
        best = { article, capture: m[1] };
      }
    }
    if (!best) continue;
    checked += 1;

    const newValueNum = parseFloat(best.capture.replace(/,/g, ""));
    if (!Number.isFinite(newValueNum)) continue;
    const currentValue = (data.headline as any)[pattern.field];
    const currentNum = typeof currentValue === "number" ? currentValue : null;

    // Sanity range: only auto-apply if within configured range of current.
    let withinRange = true;
    if (currentNum != null && currentNum > 0) {
      const lower = currentNum * (1 - pattern.sanityRange);
      const upper = currentNum * (1 + pattern.sanityRange);
      withinRange = newValueNum >= lower && newValueNum <= upper;
    }

    // If the article's timestamp is older than what we likely have, skip.
    // (We don't have machine-parsable asOf dates; this is a coarse check.)
    const articleDate = new Date(best.article.publishedAt).toISOString().slice(0, 10);

    if (currentNum != null && newValueNum === currentNum) {
      // No-op — number matches what we have. Skip silently.
      continue;
    }

    if (withinRange) {
      // Auto-apply.
      (data.headline as any)[pattern.field] = newValueNum;
      if (pattern.asOfField) {
        const sourceLabel = best.article.source ? ` (${best.article.source} ${articleDate})` : ` (${articleDate})`;
        (data.headline as any)[pattern.asOfField] = `Auto-updated from news${sourceLabel}`;
      }
      appendAutoUpdateLog({
        timestamp: new Date().toISOString(),
        field: String(pattern.field),
        oldValue: currentNum,
        newValue: newValueNum,
        source: best.article.source,
        sourceUrl: best.article.url,
        articleHeadline: best.article.headline,
        articleDate,
        pattern: pattern.label,
        status: "applied",
      });
      applied += 1;
    } else {
      // Out of sanity range — flag for review.
      appendAutoUpdateLog({
        timestamp: new Date().toISOString(),
        field: String(pattern.field),
        oldValue: currentNum,
        newValue: newValueNum,
        source: best.article.source,
        sourceUrl: best.article.url,
        articleHeadline: best.article.headline,
        articleDate,
        pattern: pattern.label,
        status: "pending-review",
        reason: `outside ±${(pattern.sanityRange * 100).toFixed(0)}% sanity range of ${currentNum}`,
      });
      flagged += 1;
    }
  }

  if (applied > 0) {
    data.lastRefreshed = new Date().toISOString().slice(0, 10);
    writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  }

  return { applied, flagged, checked };
}

// Scan news for uranium U3O8 spot price mentions. Patterns match articles
// where a fresh spot price is quoted, e.g., Cameco PR, World Nuclear News,
// trade press. Updates server/data/market-constants.json on confident match.
const URANIUM_PATTERNS: RegExp[] = [
  /U(?:3O8|₃O₈)\s+spot[^.]{0,30}?\$(\d{2,3}(?:\.\d{1,2})?)\s*\/?\s*lb/i,
  /uranium\s+spot[^.]{0,30}?\$(\d{2,3}(?:\.\d{1,2})?)\s*\/?\s*lb/i,
  /\$(\d{2,3}(?:\.\d{1,2})?)\s*\/?\s*lb[^.]{0,30}?(?:uranium|U3O8|U₃O₈)/i,
];

async function scanNewsForMarketConstants(news: NewsItem[]): Promise<{ uraniumApplied: boolean; latestQuote: number | null }> {
  const mc = loadMarketConstants();
  const now = Date.now();
  const NINETY_DAYS_MS = 90 * 86400000;
  let bestPrice: number | null = null;
  let bestArticle: NewsItem | null = null;
  let bestTs = 0;
  for (const article of news) {
    const ts = new Date(article.publishedAt).getTime();
    if (!Number.isFinite(ts) || now - ts > NINETY_DAYS_MS) continue;
    for (const re of URANIUM_PATTERNS) {
      const m = article.headline.match(re);
      if (!m) continue;
      const v = parseFloat(m[1]);
      if (!Number.isFinite(v) || v < 30 || v > 250) continue;  // sanity: U3O8 has ranged ~$30-$110 in recent history; widened band
      if (ts > bestTs) {
        bestTs = ts;
        bestPrice = v;
        bestArticle = article;
        break;
      }
    }
  }
  if (bestPrice == null || bestArticle == null) return { uraniumApplied: false, latestQuote: null };

  // Sanity: only apply if within ±40% of current (uranium can swing fast but
  // multi-times moves are usually quote misreads).
  const current = mc.uraniumSpotUsdPerLb;
  const withinRange = bestPrice >= current * 0.6 && bestPrice <= current * 1.6;
  if (bestPrice === current) return { uraniumApplied: false, latestQuote: bestPrice };

  const articleDate = new Date(bestArticle.publishedAt).toISOString().slice(0, 10);
  if (withinRange) {
    appendAutoUpdateLog({
      timestamp: new Date().toISOString(),
      field: "uraniumSpotUsdPerLb",
      oldValue: current,
      newValue: bestPrice,
      source: bestArticle.source,
      sourceUrl: bestArticle.url,
      articleHeadline: bestArticle.headline,
      articleDate,
      pattern: "uranium spot price",
      status: "applied",
    });
    mc.uraniumSpotUsdPerLb = bestPrice;
    mc.uraniumSpotAsOf = `Auto-updated from ${bestArticle.source} ${articleDate}`;
    saveMarketConstants(mc);
    return { uraniumApplied: true, latestQuote: bestPrice };
  } else {
    appendAutoUpdateLog({
      timestamp: new Date().toISOString(),
      field: "uraniumSpotUsdPerLb",
      oldValue: current,
      newValue: bestPrice,
      source: bestArticle.source,
      sourceUrl: bestArticle.url,
      articleHeadline: bestArticle.headline,
      articleDate,
      pattern: "uranium spot price",
      status: "pending-review",
      reason: `outside ±40% sanity range of ${current}`,
    });
    return { uraniumApplied: false, latestQuote: bestPrice };
  }
}

// Rate-limit LBNL check to once per 24 hours regardless of news refresh cadence.
let lastLbnlCheckTs = 0;
function maybeCheckLbnlEdition(): void {
  const now = Date.now();
  if (now - lastLbnlCheckTs < 24 * 60 * 60 * 1000) return;
  lastLbnlCheckTs = now;
  checkLbnlEdition().catch((e) => console.error("LBNL check error:", e));
}

// LBNL annual edition detector. Fetches their landing page, looks for the
// "YYYY Edition" string. If newer than what we have on file, logs a flag.
async function checkLbnlEdition(): Promise<{ currentEdition: string | null; latestEdition: string | null; newer: boolean }> {
  try {
    const res = await fetch("https://emp.lbl.gov/queues", {
      headers: { "User-Agent": "GridTilt-Bot/1.0 (gridtilt.com)" },
    });
    if (!res.ok) return { currentEdition: null, latestEdition: null, newer: false };
    const html = await res.text();
    const m = html.match(/Queued Up:?\s*(\d{4})\s+Edition/i);
    if (!m) return { currentEdition: null, latestEdition: null, newer: false };
    const latestYear = parseInt(m[1], 10);

    const dataPath = join(process.cwd(), "server", "data", "interconnection-queue.json");
    const data = JSON.parse(readFileSync(dataPath, "utf-8")) as BacklogDataset;
    const currentMatch = data.headline.queueOverallAsOf.match(/(\d{4})/);
    const currentYear = currentMatch ? parseInt(currentMatch[1], 10) : 0;

    const newer = latestYear > currentYear;
    if (newer) {
      appendAutoUpdateLog({
        timestamp: new Date().toISOString(),
        field: "queueOverallAsOf",
        oldValue: data.headline.queueOverallAsOf,
        newValue: `Queued Up ${latestYear} Edition (manual ingest required)`,
        source: "LBNL",
        sourceUrl: "https://emp.lbl.gov/queues",
        articleHeadline: m[0],
        articleDate: new Date().toISOString().slice(0, 10),
        pattern: "LBNL annual edition detection",
        status: "pending-review",
        reason: "LBNL XLSX ingest is not automated; run a manual refresh against the new edition",
      });
    }
    return {
      currentEdition: currentMatch ? currentMatch[1] : null,
      latestEdition: m[1],
      newer,
    };
  } catch (e: any) {
    console.error("LBNL check error:", e?.message);
    return { currentEdition: null, latestEdition: null, newer: false };
  }
}

const NEWS_KEYWORDS = [
  "data center", "datacenter", "hyperscaler", "AI infrastructure", "power grid",
  "nuclear energy", "nuclear restart", "uranium", "grid stress", "interconnection",
  "transformer shortage", "GE Vernova", "Vertiv", "Eaton", "Constellation Energy",
  "PJM", "ERCOT", "MISO", "WECC", "utility earnings", "power demand", "megawatt",
  "gigawatt", "behind-the-meter", "cooling system", "Quanta Services", "NuScale",
  "SMR", "grid modernization", "energy transition", "electricity demand",
  "baseload power", "capacity auction", "power purchase agreement", "nuclear plant",
  "uranium mining", "Cameco", "Vistra", "NextEra", "Dominion Energy", "Duke Energy",
  "data centre", "AI power", "clean energy", "renewable energy",
  "substation", "transmission line", "power plant", "natural gas generation",
  "grid infrastructure", "electric utility", "grid reliability", "load growth",
  "generation capacity", "power sector", "energy storage", "battery storage",
  "solar farm", "wind farm", "offshore wind", "onshore wind", "FERC",
  "grid expansion", "energy infrastructure", "power supply", "electric grid",
  "gas turbine", "combined cycle", "peaker plant", "dispatchable",
  "hollow core fiber", "fiber optic", "low latency",
];

function isNewsRelevant(headline: string): boolean {
  const lower = headline.toLowerCase();
  return NEWS_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

// ─── Interconnection queue dataset shape (LBNL Queued Up + curated) ────────

interface BacklogProject {
  id: string;
  projectName: string;
  sponsor: string;
  capacityMW: number;
  type: "nuclear" | "gas" | "solar" | "wind" | "storage" | "hybrid" | "load" | "other";
  iso: string;
  state: string;
  status: "active" | "withdrawn" | "operational";
  category: "generation" | "load" | "ppa" | "aggregate" | "regulatory";
  expectedOnline: string | null;
  offtaker?: string | null;
  dcRelevant: boolean;
  sources?: string[];
  notes?: string;
}
interface BacklogDataset {
  lastRefreshed: string;
  headline: {
    trackedProjects: number;
    trackedCapacityGW: number;
    queueOverallGW: number;
    queueOverallProjects: number;
    medianWaitMonths: number;
    historicalWithdrawalPct: number;
    queueOverallAsOf: string;
    queueOverallSourceUrl: string;
    ercotLargeLoadGW: number;
    ercotLargeLoadDataCenterPct: number;
    ercotLargeLoadAsOf: string;
    pjmReopenedGW: number;
    pjmReopenedProjects: number;
    pjmReopenedAsOf: string;
    dominionContractedGW: number;
    dominionAsOf: string;
    duke5yrGenAddGW: number;
    metaHyperionGW: number;
    stargateAbileneGW: number;
  };
  projects: BacklogProject[];
}
// Old name kept as alias so any existing imports still work
type QueueDataset = BacklogDataset;

// ─── OG image renderer (shared by /api/og and the X media upload path) ─────

interface OgStat { label: string; value: string }
interface OgCard {
  title: string;
  subtitle: string;
  stats: OgStat[];
}

async function liveIndicesStats(): Promise<OgStat[]> {
  try {
    const k = await computeKpis();
    return [
      { label: "AI Demand", value: k.aiPowerIndex.toFixed(0) },
      { label: "Nuclear (NPI)", value: k.npiValue.toFixed(0) },
      { label: "Grid Stress", value: k.gridStress.toFixed(0) },
    ];
  } catch {
    return [
      { label: "AI Demand", value: "—" },
      { label: "Nuclear (NPI)", value: "—" },
      { label: "Grid Stress", value: "—" },
    ];
  }
}

// Per-template OG card content. Pulled from the same data sources the tweet
// composers use, so the card and the tweet text stay in sync.
async function ogCardForTemplate(template: string): Promise<OgCard> {
  // ── Daily rotation cards (real data, matched to the tweet copy) ──
  if (template === "buildout") {
    const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "clusters.json"), "utf-8"));
    const m = computeClusterMetrics((root.clusters ?? []) as ClusterLite[]);
    return {
      title: "the AI buildout, tracked",
      subtitle: "named US AI compute clusters",
      stats: [
        { label: "Clusters", value: String(m.clusterCount) },
        { label: "Planned", value: `${Math.round(m.totalPlannedMW / 1000)} GW` },
        { label: "Operators", value: String(m.concentration.operatorCount) },
      ],
    };
  }
  if (template === "gpu_rental") {
    const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "gpu-rental-prices.json"), "utf-8"));
    const g = computeGpuIndex(root.models ?? [], new Date().toISOString().slice(0, 10));
    const by = Object.fromEntries(g.rows.map((r) => [r.model, r]));
    const px = (n?: number) => (n == null ? "n/a" : Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
    return {
      title: "GPU rental prices",
      subtitle: "on-demand, blended $/GPU-hr",
      stats: [
        { label: "H100", value: px(by.H100?.current) },
        { label: "H200", value: px(by.H200?.current) },
        { label: "GB200", value: px(by.GB200?.current) },
      ],
    };
  }
  if (template === "cluster_spotlight") {
    const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "clusters.json"), "utf-8"));
    const clusters = (root.clusters ?? []) as Array<any>;
    const eligible = clusters
      .filter((c) => (c.plannedPowerMW ?? 0) >= 500 && c.name)
      .sort((a, b) => (b.plannedPowerMW ?? 0) - (a.plannedPowerMW ?? 0));
    if (eligible.length) {
      const c = eligible[Math.floor(Date.now() / (7 * 86_400_000)) % eligible.length];
      const name = String(c.name).replace(/\s*\([^)]*\)\s*$/, "").trim();
      const city = c.location?.city as string | undefined;
      const state = c.location?.state as string | undefined;
      const loc = city && state ? (name.includes(city) ? state : `${city}, ${state}`) : (state ?? c.gridRegion ?? "");
      const g = (c.plannedPowerMW ?? 0) / 1000;
      return {
        title: name,
        subtitle: loc ? `${loc} · AI compute cluster` : "AI compute cluster",
        stats: [
          { label: "Planned", value: `${Number.isInteger(g) ? g : g.toFixed(1)} GW` },
          { label: "Operator", value: (c.operator as string) ?? "n/a" },
          { label: "Region", value: (c.gridRegion as string) ?? state ?? "n/a" },
        ],
      };
    }
    return { title: "Compute Frontier", subtitle: "AI superclusters by GPUs and power", stats: await computeFrontierOgStats() };
  }
  if (template === "grid_backlog") {
    try {
      const data = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "interconnection-queue.json"), "utf-8")) as BacklogDataset;
      const h = data.headline;
      return {
        title: "the grid is the bottleneck",
        subtitle: "US interconnection backlog",
        stats: [
          { label: "Total queue", value: `${h.queueOverallGW.toLocaleString()} GW` },
          { label: "Median wait", value: `${h.medianWaitMonths} mo` },
          { label: "ERCOT large-load", value: `${h.ercotLargeLoadGW} GW` },
        ],
      };
    } catch {
      return { title: "the grid is the bottleneck", subtitle: "US interconnection backlog", stats: [] };
    }
  }
  if (template === "power_mix") {
    const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "clusters.json"), "utf-8"));
    const m = computeClusterMetrics((root.clusters ?? []) as ClusterLite[]);
    return {
      title: "how the buildout gets power",
      subtitle: "planned AI compute by source",
      stats: m.byEnergySource.slice(0, 3).map((b) => ({ label: b.source, value: `${Math.round(b.plannedMW / 1000)} GW` })),
    };
  }
  if (template === "tilt_status") {
    return { title: "today's market gauges", subtitle: "ai demand · nuclear · grid stress", stats: await liveIndicesStats() };
  }
  if (template === "top_movers") {
    const sd = await getCachedStockData("1D");
    const movers = (Object.values(sd) as any[])
      .filter((s) => s && typeof s.changePercent === "number")
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 3);
    return {
      title: "today's biggest moves",
      subtitle: "ai infrastructure equities",
      stats: movers.map((s) => ({ label: `$${s.ticker}`, value: `${s.changePercent >= 0 ? "+" : ""}${s.changePercent.toFixed(2)}%` })),
    };
  }
  if (template === "npi_update") {
    const k = await computeKpis();
    return {
      title: "nuclear power index",
      subtitle: `${k.npiValue.toFixed(0)} (baseline 100, jan 2024)`,
      stats: [
        { label: "VST", value: `${k.constituents.vstPerf >= 1 ? "+" : ""}${((k.constituents.vstPerf - 1) * 100).toFixed(0)}%` },
        { label: "CEG", value: `${k.constituents.cegPerf >= 1 ? "+" : ""}${((k.constituents.cegPerf - 1) * 100).toFixed(0)}%` },
        { label: "CCJ", value: `${k.constituents.ccjPerf >= 1 ? "+" : ""}${((k.constituents.ccjPerf - 1) * 100).toFixed(0)}%` },
      ],
    };
  }
  if (template === "queue_update") {
    try {
      const filePath = join(process.cwd(), "server", "data", "interconnection-queue.json");
      const raw = readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw) as BacklogDataset;
      const h = data.headline;
      return {
        title: "us interconnection backlog",
        subtitle: `tracking ${h.trackedProjects} named projects · ${h.trackedCapacityGW} GW`,
        stats: [
          { label: "Total queue (GW)", value: h.queueOverallGW.toLocaleString() },
          { label: "Median wait", value: `${h.medianWaitMonths} mo` },
          { label: "Withdrawal", value: `${h.historicalWithdrawalPct}%` },
        ],
      };
    } catch {
      return { title: "us interconnection backlog", subtitle: "every named power project we can verify", stats: [] };
    }
  }
  if (template === "catalyst_preview") {
    return { title: "this week's catalysts", subtitle: "earnings · regulatory · policy", stats: await liveIndicesStats() };
  }
  // Fallback
  return { title: "gridtilt", subtitle: "ai power infrastructure", stats: await liveIndicesStats() };
}

async function renderOgPng(card: OgCard): Promise<Buffer> {
  const satori = (await import("satori")).default;
  const { Resvg } = await import("@resvg/resvg-js");
  const fontData = readFileSync(join(process.cwd(), "server", "fonts", "Inter-Regular.ttf"));

  const svg = await satori(
    {
      type: "div",
      props: {
        style: {
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px",
          background: "linear-gradient(135deg, #121110 0%, #1a1917 50%, #121110 100%)",
          fontFamily: "Inter, sans-serif",
          color: "#ffffff",
        },
        children: [
          {
            type: "div",
            props: {
              style: { display: "flex", flexDirection: "column", gap: "16px" },
              children: [
                {
                  type: "div",
                  props: {
                    style: { display: "flex", alignItems: "center", gap: "12px" },
                    children: [
                      { type: "div", props: { style: { width: "8px", height: "32px", backgroundColor: "#F07800", borderRadius: "4px" } } },
                      { type: "div", props: { style: { fontSize: "28px", fontWeight: "700", color: "#F07800", letterSpacing: "2px" }, children: "GRIDTILT" } },
                    ],
                  },
                },
                { type: "div", props: { style: { fontSize: "52px", fontWeight: "800", lineHeight: "1.1", maxWidth: "900px" }, children: card.title } },
                { type: "div", props: { style: { fontSize: "24px", color: "#9ca3af", maxWidth: "900px" }, children: card.subtitle } },
              ],
            },
          },
          {
            type: "div",
            props: {
              style: { display: "flex", justifyContent: "space-between", alignItems: "flex-end" },
              children: [
                {
                  type: "div",
                  props: {
                    style: { display: "flex", gap: "40px" },
                    children: card.stats.map((s) => ({
                      type: "div",
                      props: {
                        style: { display: "flex", flexDirection: "column", gap: "4px" },
                        children: [
                          { type: "div", props: { style: { fontSize: "14px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "2px" }, children: s.label } },
                          { type: "div", props: { style: { fontSize: "40px", fontWeight: "700", color: "#F0A500", fontFamily: "monospace" }, children: s.value } },
                        ],
                      },
                    })),
                  },
                },
                { type: "div", props: { style: { fontSize: "18px", color: "#6b7280" }, children: "gridtilt.com" } },
              ],
            },
          },
        ],
      },
    } as unknown as Parameters<typeof satori>[0],
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Inter", data: fontData, weight: 400, style: "normal" as const }],
    },
  );

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
  return Buffer.from(resvg.render().asPng());
}

// ─── X (Twitter) OAuth 1.0a posting client ──────────────────────────────────
// Hand-rolled signer. No third-party SDK. Uses Node crypto + fetch.

function pctEncode(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function buildOAuth1Header(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  accessToken: string,
  accessTokenSecret: string,
): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  // X /2/tweets uses a JSON body, which is NOT included in the signature.
  // Only the OAuth params are signed for this endpoint.
  const sortedKeys = Object.keys(oauthParams).sort();
  const paramString = sortedKeys
    .map((k) => `${pctEncode(k)}=${pctEncode(oauthParams[k])}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    pctEncode(url),
    pctEncode(paramString),
  ].join("&");

  const signingKey = `${pctEncode(consumerSecret)}&${pctEncode(accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

  const headerParams: Record<string, string> = { ...oauthParams, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(headerParams)
      .sort()
      .map((k) => `${pctEncode(k)}="${pctEncode(headerParams[k])}"`)
      .join(", ")
  );
}

interface XPostResult {
  ok: boolean;
  id?: string;
  text?: string;
  error?: string;
  dryRun?: boolean;
}

// Upload a PNG to X via the v1.1 media endpoint. Returns the media_id_string
// that /2/tweets accepts. OAuth 1.0a, but the multipart body is NOT part of
// the signature base string (oauth params + URL + method only).
async function xUploadMedia(pngBuf: Buffer): Promise<string | null> {
  // Same kill switch as xPostTweet: no writes to X (not even a media upload)
  // unless posting is explicitly enabled.
  if (process.env.X_POSTING_ENABLED !== "true") return null;
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return null;
  }

  const url = "https://upload.twitter.com/1.1/media/upload.json";
  const authHeader = buildOAuth1Header(
    "POST",
    url,
    consumerKey,
    consumerSecret,
    accessToken,
    accessTokenSecret,
  );

  try {
    const form = new FormData();
    // Use Blob; X expects raw bytes in the `media` field for simple upload
    form.append("media", new Blob([pngBuf], { type: "image/png" }), "card.png");
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: authHeader },
      body: form as any,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("X media upload failed:", res.status, errText.slice(0, 300));
      return null;
    }
    const data = (await res.json()) as any;
    return data?.media_id_string ?? null;
  } catch (e: any) {
    console.error("X media upload error:", e?.message);
    return null;
  }
}

async function xPostTweet(text: string, mediaIds?: string[]): Promise<XPostResult> {
  // Master kill switch. Live X posting is OFF unless X_POSTING_ENABLED === "true",
  // even when credentials are present. This is the safe default so the daily cron,
  // a stray scheduler, or a fresh deploy can never post on its own. To post again,
  // a human must deliberately set X_POSTING_ENABLED=true.
  if (process.env.X_POSTING_ENABLED !== "true") {
    return { ok: true, text, dryRun: true };
  }

  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return { ok: true, text, dryRun: true };
  }

  const url = "https://api.x.com/2/tweets";
  const authHeader = buildOAuth1Header(
    "POST",
    url,
    consumerKey,
    consumerSecret,
    accessToken,
    accessTokenSecret,
  );

  const body: any = { text };
  if (mediaIds && mediaIds.length > 0) {
    body.media = { media_ids: mediaIds };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, text, error: `X API ${res.status}: ${errText.slice(0, 300)}` };
    }
    const data = (await res.json()) as any;
    return { ok: true, id: data?.data?.id, text };
  } catch (e: any) {
    return { ok: false, text, error: e?.message ?? "unknown" };
  }
}

interface XDeleteResult {
  ok: boolean;
  id: string;
  deleted?: boolean;
  error?: string;
  dryRun?: boolean;
}

async function xDeleteTweet(id: string): Promise<XDeleteResult> {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    return { ok: true, id, dryRun: true };
  }

  const url = `https://api.x.com/2/tweets/${encodeURIComponent(id)}`;
  const authHeader = buildOAuth1Header(
    "DELETE",
    url,
    consumerKey,
    consumerSecret,
    accessToken,
    accessTokenSecret,
  );

  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: authHeader },
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { ok: false, id, error: `X API ${res.status}: ${errText.slice(0, 300)}` };
    }
    const data = (await res.json()) as any;
    return { ok: true, id, deleted: !!data?.data?.deleted };
  } catch (e: any) {
    return { ok: false, id, error: e?.message ?? "unknown" };
  }
}

const SOCIAL_LOG_FILE = join(process.cwd(), "server", "data", "social-log.json");

interface SocialLogEntry {
  timestamp: string;
  platform: "twitter";
  text: string;
  ok: boolean;
  id?: string;
  error?: string;
  dryRun?: boolean;
  template?: string;
  trigger?: "cron" | "manual";
}

function appendSocialLog(entry: SocialLogEntry): void {
  let log: SocialLogEntry[] = [];
  try {
    if (existsSync(SOCIAL_LOG_FILE)) {
      log = JSON.parse(readFileSync(SOCIAL_LOG_FILE, "utf-8"));
    }
  } catch {
    log = [];
  }
  log.push(entry);
  // Keep the last 500 entries to bound file size
  if (log.length > 500) log = log.slice(-500);
  writeFileSync(SOCIAL_LOG_FILE, JSON.stringify(log, null, 2));
}

// ─── KPI computation (shared by /api/kpis and the cron composer) ────────────

interface KpiResult {
  aiPowerIndex: number;
  npiValue: number;
  gridStress: number;
  smrPolicyScore: number;
  npiBaseDate: string;
  source: "live" | "static";
  asOf: string;
  constituents: {
    nvdaChange: number; tsmChange: number; eqixChange: number; muChange: number;
    cegPerf: number; vstPerf: number; ccjPerf: number; nlrPerf: number;
    uPerf: number; policyPerf: number; npiPolicyMultiplier: number; npiMomentum: number;
    vstChange: number; cegChange: number;
  };
}

async function computeKpis(): Promise<KpiResult> {
  let nvdaChange = 2.86, tsmChange = 1.62, muChange = 2.03, eqixChange = 1.40;
  let cegChange = 3.18, vstChange = 2.44, ccjChange = 3.10, neeChange = -0.39;
  let cegPrice = STATIC_MARKET_DATA.CEG.price;
  let vstPrice = STATIC_MARKET_DATA.VST.price;
  let ccjPrice = STATIC_MARKET_DATA.CCJ.price;
  let nlrPrice = STATIC_MARKET_DATA.NLR.price;

  // Track how many quotes returned live data so the response can honestly
  // label itself as live vs static fallback (Yahoo throttles intermittently).
  let liveQuoteCount = 0;
  let yahooBlockThrew = false;

  try {
    const YahooFinanceClass = (await import("yahoo-finance2")).default;
    const yahooFinance = new YahooFinanceClass({ suppressNotices: ["yahooSurvey"] });
    const quotes = await Promise.all([
      yahooFinance.quote("NVDA").catch(() => null),
      yahooFinance.quote("TSM").catch(() => null),
      yahooFinance.quote("MU").catch(() => null),
      yahooFinance.quote("EQIX").catch(() => null),
      yahooFinance.quote("CEG").catch(() => null),
      yahooFinance.quote("VST").catch(() => null),
      yahooFinance.quote("CCJ").catch(() => null),
      yahooFinance.quote("NLR").catch(() => null),
      yahooFinance.quote("NEE").catch(() => null),
    ]);
    // Heartbeat: count only quotes that returned a fresh change percentage.
    // Yahoo often returns a stale-cached regularMarketPrice while
    // regularMarketChangePercent is null on a throttle, which would otherwise
    // let us label "live" while the index momentum values fell back to
    // STATIC_MARKET_DATA. Tighten the heartbeat to changePercent specifically.
    quotes.forEach((q) => {
      if (q?.regularMarketChangePercent != null) liveQuoteCount++;
    });
    if (quotes[0]?.regularMarketChangePercent != null) nvdaChange = quotes[0].regularMarketChangePercent;
    if (quotes[1]?.regularMarketChangePercent != null) tsmChange = quotes[1].regularMarketChangePercent;
    if (quotes[2]?.regularMarketChangePercent != null) muChange = quotes[2].regularMarketChangePercent;
    if (quotes[3]?.regularMarketChangePercent != null) eqixChange = quotes[3].regularMarketChangePercent;
    if (quotes[4]?.regularMarketChangePercent != null) cegChange = quotes[4].regularMarketChangePercent;
    if (quotes[5]?.regularMarketChangePercent != null) vstChange = quotes[5].regularMarketChangePercent;
    if (quotes[6]?.regularMarketChangePercent != null) ccjChange = quotes[6].regularMarketChangePercent;
    if (quotes[8]?.regularMarketChangePercent != null) neeChange = quotes[8].regularMarketChangePercent;
    if (quotes[4]?.regularMarketPrice != null) cegPrice = quotes[4].regularMarketPrice;
    if (quotes[5]?.regularMarketPrice != null) vstPrice = quotes[5].regularMarketPrice;
    if (quotes[6]?.regularMarketPrice != null) ccjPrice = quotes[6].regularMarketPrice;
    if (quotes[7]?.regularMarketPrice != null) nlrPrice = quotes[7].regularMarketPrice;
  } catch {
    yahooBlockThrew = true;
  }

  const source: "live" | "static" = yahooBlockThrew || liveQuoteCount < 5 ? "static" : "live";

  // Auto-derived market constants
  const mc = loadMarketConstants();
  const uraniumSpot = mc.uraniumSpotUsdPerLb;
  const smrPolicyScore = deriveSmrPolicyScore();

  // All formulas live in server/indices.ts (pure + unit-tested; the
  // historical backtest reconstructs series with these same functions).
  const npi = computeNpi({ cegPrice, vstPrice, ccjPrice, nlrPrice, uraniumSpot, smrPolicyScore });
  const { npiValue, cegPerf, vstPerf, ccjPerf, nlrPerf, uPerf, policyPerf, npiPolicyMultiplier } = npi;
  const npiMomentum = computeNpiMomentum({ cegChange, vstChange, ccjChange, neeChange });

  const aiPowerIndex = computeAiPowerIndex({ nvdaChange, tsmChange, eqixChange, muChange });
  const gridStress = computeGridStress({ vstChange, cegChange, eqixChange });

  return {
    aiPowerIndex: parseFloat(aiPowerIndex.toFixed(1)),
    npiValue,
    gridStress: parseFloat(gridStress.toFixed(1)),
    smrPolicyScore: parseFloat(smrPolicyScore.toFixed(2)),
    npiBaseDate: "Jan 1, 2024",
    source,
    asOf: new Date().toISOString(),
    constituents: {
      nvdaChange: parseFloat(nvdaChange.toFixed(2)),
      tsmChange: parseFloat(tsmChange.toFixed(2)),
      eqixChange: parseFloat(eqixChange.toFixed(2)),
      muChange: parseFloat(muChange.toFixed(2)),
      cegPerf: parseFloat(cegPerf.toFixed(3)),
      vstPerf: parseFloat(vstPerf.toFixed(3)),
      ccjPerf: parseFloat(ccjPerf.toFixed(3)),
      nlrPerf: parseFloat(nlrPerf.toFixed(3)),
      uPerf: parseFloat(uPerf.toFixed(3)),
      policyPerf: parseFloat(policyPerf.toFixed(3)),
      npiPolicyMultiplier: parseFloat(npiPolicyMultiplier.toFixed(3)),
      npiMomentum: parseFloat(npiMomentum.toFixed(2)),
      vstChange: parseFloat(vstChange.toFixed(2)),
      cegChange: parseFloat(cegChange.toFixed(2)),
    },
  };
}

// Simple status label used by /api/export/daily. Most surfaces don't show
// this word any more (the tilt-status tweet drops it). Kept narrow so the
// export endpoint has a stable shape.
function deriveTiltStatus(k: KpiResult): "elevated" | "tracking baseline" | "easing" {
  if (k.aiPowerIndex > 78 && k.gridStress > 70 && k.npiValue > 130) return "elevated";
  if (k.aiPowerIndex < 68 && k.gridStress < 55) return "easing";
  return "tracking baseline";
}

// ─── Tweet composers ───────────────────────────────────────────────────────
// All copy is built by pure, unit-tested formatters in server/social-format.ts
// (voice rules documented there). These wrappers only gather live data, so
// the exact text the cron ships is locked by tests instead of vibes.

// Map every tracked ticker back to a short sector label for inline tagging.
const SECTOR_TAG: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  const labels: Record<string, string> = {
    compute: "compute",
    nuclear: "nuclear",
    uranium: "uranium",
    powerHardware: "power hardware",
    utilities: "utility",
    dataCenters: "dc reit",
    construction: "construction",
    rawMaterialsMining: "mining",
    rawMaterialsNatGas: "nat gas",
    renewableGeneration: "solar/renewables",
    transmissionGrid: "grid hardware",
    cryptoAIDC: "ai hosting",
    etfsBenchmarks: "etf",
  };
  for (const [key, tickers] of Object.entries(STACK_TICKERS)) {
    for (const t of tickers) m[t] = labels[key] ?? key;
  }
  return m;
})();

// Strip parenthetical vendor names from an energySource string and normalize.
// "gas (Entergy) + grid" -> "gas + grid".
function cleanEnergy(s?: string): string {
  return (s ?? "").replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

async function composeBuildoutTweet(): Promise<string> {
  const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "clusters.json"), "utf-8"));
  const m = computeClusterMetrics((root.clusters ?? []) as ClusterLite[]);
  return buildBuildoutTweet({
    clusterCount: m.clusterCount,
    plannedGW: Math.round(m.totalPlannedMW / 1000),
    operationalGW: Math.round(m.operationalMW / 1000),
    operatorCount: m.concentration.operatorCount,
  });
}

async function composeGpuRentalTweet(): Promise<string> {
  const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "gpu-rental-prices.json"), "utf-8"));
  const today = new Date().toISOString().slice(0, 10);
  const g = computeGpuIndex(root.models ?? [], today);
  const byModel = Object.fromEntries(g.rows.map((r) => [r.model, r]));
  // Biggest 1Y mover (by absolute change) among models with a 1Y figure.
  const mover = g.rows
    .filter((r) => r.changes.y1 != null)
    .sort((a, b) => Math.abs(b.changes.y1 as number) - Math.abs(a.changes.y1 as number))[0];
  return buildGpuRentalTweet({
    h100: byModel.H100?.current ?? 0,
    h200: byModel.H200?.current ?? 0,
    gb200: byModel.GB200?.current ?? 0,
    moverModel: mover?.model ?? "A100",
    moverChangePct: (mover?.changes.y1 as number) ?? 0,
  });
}

async function composeTopMoversTweet(): Promise<string> {
  const stockData = await getCachedStockData("1D");
  const movers = (Object.values(stockData) as any[])
    .filter((s) => s && typeof s.changePercent === "number")
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 4)
    .map((s) => ({ ticker: s.ticker, changePercent: s.changePercent, tag: SECTOR_TAG[s.ticker] }));
  return buildTopMoversTweet(movers);
}

async function composeGridBacklogTweet(): Promise<string> {
  try {
    const filePath = join(process.cwd(), "server", "data", "interconnection-queue.json");
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as BacklogDataset;
    const h = data.headline;
    return buildGridBacklogTweet(h ? {
      queueOverallGW: h.queueOverallGW,
      medianWaitMonths: h.medianWaitMonths,
      ercotLargeLoadGW: h.ercotLargeLoadGW,
      ercotLargeLoadDataCenterPct: h.ercotLargeLoadDataCenterPct,
    } : null);
  } catch {
    return buildGridBacklogTweet(null);
  }
}

const TIER1_EARNINGS = new Set(["NVDA", "MSFT", "GOOGL", "META", "AMZN", "TSM", "AMD", "AAPL"]);

async function composeCatalystPreviewTweet(): Promise<string> {
  // The dashboard's calendar merges live earnings dates with the curated
  // policy catalysts; the tweet previews the SAME merged week, otherwise it
  // says "quiet docket" while the calendar shows earnings (the old bug).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const endStr = new Date(today.getTime() + 7 * 86400000).toISOString().split("T")[0];

  // Earnings side: module-scope cache, refreshed by the dispatch handlers
  // right before this composer runs (refreshEarningsCache is route-scoped).
  const seen = new Set<string>();
  const earnings: { date: string; title: string; tier1: boolean }[] = [];
  for (const item of earningsCache?.items ?? []) {
    const ticker = item.tickers?.[0];
    if (!ticker || seen.has(ticker)) continue;
    if (!item.date || item.date < todayStr || item.date > endStr) continue;
    seen.add(ticker);
    earnings.push({ date: item.date, title: `${ticker} earnings`, tier1: TIER1_EARNINGS.has(ticker) });
  }

  // Curated policy/catalyst side.
  let manual: { date: string; title: string; tier1: boolean }[] = [];
  try {
    const filePath = join(process.cwd(), "server", "data", "catalysts.json");
    const catalysts = JSON.parse(readFileSync(filePath, "utf-8")) as any[];
    manual = catalysts
      .filter((c) => typeof c.date === "string" && c.date >= todayStr && c.date <= endStr)
      .map((c) => ({
        date: c.date,
        title: c.title,
        tier1: Array.isArray(c.tickers) && c.tickers.some((t: string) => TIER1_EARNINGS.has(t)),
      }));
  } catch {
    // curated file is optional; earnings alone still make a post
  }

  const upcoming = [...earnings, ...manual].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 4);
  return buildCatalystTweet(upcoming);
}

// Pick a different real cluster each week (deterministic by week) among sizable
// clusters with a known name, so the Wednesday spotlight stays fresh.
async function composeClusterSpotlightTweet(): Promise<string> {
  const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "clusters.json"), "utf-8"));
  const clusters = (root.clusters ?? []) as Array<any>;
  const m = computeClusterMetrics(clusters as ClusterLite[]);
  const eligible = clusters
    .filter((c) => (c.plannedPowerMW ?? 0) >= 500 && c.name)
    .sort((a, b) => (b.plannedPowerMW ?? 0) - (a.plannedPowerMW ?? 0));
  if (eligible.length === 0) return composeBuildoutTweet();

  const weekIdx = Math.floor(Date.now() / (7 * 86_400_000));
  const c = eligible[weekIdx % eligible.length];
  const name = String(c.name).replace(/\s*\([^)]*\)\s*$/, "").trim();
  const city = c.location?.city as string | undefined;
  const state = c.location?.state as string | undefined;
  // Avoid "Stargate Milam County, Milam County, TX" when the name already
  // carries the place: if the name includes the city, show just the state.
  let loc = "";
  if (city && state) loc = name.includes(city) ? state : `${city}, ${state}`;
  else if (state) loc = state;
  else loc = (c.gridRegion as string) ?? "";
  return buildClusterSpotlightTweet({
    name,
    plannedGW: (c.plannedPowerMW ?? 0) / 1000,
    location: loc,
    energy: cleanEnergy(c.energySource),
    clusterCount: m.clusterCount,
  });
}

async function composePowerMixTweet(): Promise<string> {
  const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "clusters.json"), "utf-8"));
  const m = computeClusterMetrics((root.clusters ?? []) as ClusterLite[]);
  const top = m.byEnergySource[0];
  const next = m.byEnergySource[1];
  return buildPowerMixTweet({
    topSource: top?.source ?? "grid",
    topGW: Math.round((top?.plannedMW ?? 0) / 1000),
    nextSource: next?.source ?? "on-site gas",
    nextGW: Math.round((next?.plannedMW ?? 0) / 1000),
    linkedDealCount: m.linkedDealCount,
  });
}

// OG-card stats for the Compute Frontier pages (clusters, planned + operational GW).
async function computeFrontierOgStats(): Promise<Array<{ label: string; value: string }>> {
  try {
    const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "clusters.json"), "utf-8"));
    const m = computeClusterMetrics((root.clusters ?? []) as ClusterLite[]);
    return [
      { label: "Clusters", value: String(m.clusterCount) },
      { label: "Planned", value: `${(m.totalPlannedMW / 1000).toFixed(1)} GW` },
      { label: "Operational", value: `${(m.operationalMW / 1000).toFixed(1)} GW` },
    ];
  } catch {
    return [];
  }
}

const ROTATING_TEMPLATES: Record<number, { name: string; compose: () => Promise<string> }> = {
  1: { name: "buildout",          compose: composeBuildoutTweet },         // Mon
  2: { name: "gpu_rental",        compose: composeGpuRentalTweet },        // Tue
  3: { name: "cluster_spotlight", compose: composeClusterSpotlightTweet }, // Wed
  4: { name: "grid_backlog",      compose: composeGridBacklogTweet },      // Thu
  5: { name: "power_mix",         compose: composePowerMixTweet },         // Fri
};

// On-demand templates: composable via /api/social/generate for a dry run, but
// deliberately NOT in the Mon-Fri auto-posting rotation above. These pull live
// market/earnings data and are kept for manual use.
const ON_DEMAND_TEMPLATES: Record<string, () => Promise<string>> = {
  top_movers: composeTopMoversTweet,
  catalyst_preview: composeCatalystPreviewTweet,
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ─── Per-route rate limiters ──────────────────────────────────────────
  // The global 120 req/min/IP cap on /api/* is set in server/index.ts.
  // These are tighter, per-surface limits layered on top.

  // 5 successful subscribe attempts per IP per hour. Email signups are the
  // most spam-prone surface; tighten aggressively.
  const subscribeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many subscribe attempts. Try again later." },
  });

  // 10 unsubscribe requests per IP per minute. The token is HMAC-SHA256 so
  // brute force is infeasible on its own; this is defense in depth against
  // someone spamming the endpoint to slow the server down.
  const unsubscribeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many unsubscribe requests. Try again later." },
  });

  // 5 FAILED admin auth attempts per IP per minute (skipSuccessfulRequests).
  // Legit admins who already have the key are unaffected; brute force
  // attackers without it get throttled fast.
  const adminAuthFailureLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many failed authentication attempts. Try again later." },
  });
  // Apply to every admin-only path prefix. Newsletter routes are admin-gated
  // too even though they don't live under /api/admin/.
  app.use("/api/admin/", adminAuthFailureLimiter);
  app.use("/api/newsletter/", adminAuthFailureLimiter);

  // KPI endpoint - three composite indicators
  // Methodology lives in server/indices.ts. Both this route and the daily
  // tweet cron call the same function so the public dashboard and the social
  // post can never drift on what "today's numbers" are.
  app.get("/api/kpis", async (_req, res) => {
    const kpis = await computeKpis();
    recordDailyIndexValues(kpis);
    res.json(kpis);
  });

  // Public daily gauge history: the committed seed is reconstructed from
  // public prices (npm run backtest:indices); live values append in place.
  // Powers transparency and saves anyone re-deriving the series.
  app.get("/api/index-history", (_req, res) => {
    res.json(readIndexHistory());
  });

  // Physical electricity data (see server/physical.ts). The monthly output
  // series is the one the index validation study correlates against.
  app.get("/api/physical/electricity-output", async (_req, res) => {
    try {
      res.json(await getElectricityOutputMonthly());
    } catch {
      res.status(502).json({ error: "Upstream FRED fetch failed. Try again later." });
    }
  });
  app.get("/api/physical/load-hourly", async (_req, res) => {
    try {
      const result = await getHourlyDemandUS48();
      if (!result.configured) return res.status(503).json(result);
      res.json(result);
    } catch {
      res.status(502).json({ error: "Upstream EIA fetch failed. Try again later." });
    }
  });

  // Stack endpoint - 8 layers, 10-min cache
  app.get("/api/stack", async (req, res) => {
    try {
      // Allowlist the timeframe and cache on the normalized value: an
      // arbitrary query string would be a permanent cache miss fanning out
      // ~200 Yahoo calls per request (SEC-3).
      const ALLOWED_TIMEFRAMES = ["1D", "5D", "1M"];
      const requested = (req.query.timeframe as string) || "1D";
      const timeframe = ALLOWED_TIMEFRAMES.includes(requested) ? requested : "1D";
      const stockData = await getCachedStockData(timeframe);

      // Real weekly correlation (SRUUF physical-uranium proxy vs CCJ/CEG),
      // 24h cache; null on failure - the client shows unavailable, never
      // invented dots. This replaced the last fabricated dataset in the app.
      const corr = await getUraniumCorrelation(fetchWeeklyCloses);

      // Fundamentals overlay at response time: the stock cache (10 min) can
      // predate the daily fundamentals sweep, so revenue growth is applied
      // fresh here instead of being baked into the cached rows.
      const fundamentalsNow = getCachedFundamentals();
      const rowFor = (t: string) => {
        const st = stockData[t];
        return st ? { ...st, revenueGrowth: fundamentalsNow[t]?.revenueGrowth ?? null } : st;
      };

      res.json({
        compute:             STACK_TICKERS.compute.map((t) => rowFor(t)).filter(Boolean),
        nuclear:             STACK_TICKERS.nuclear.map((t) => rowFor(t)).filter(Boolean),
        uranium:             STACK_TICKERS.uranium.map((t) => rowFor(t)).filter(Boolean),
        powerHardware:       STACK_TICKERS.powerHardware.map((t) => rowFor(t)).filter(Boolean),
        utilities:           STACK_TICKERS.utilities.map((t) => rowFor(t)).filter(Boolean),
        dataCenters:         STACK_TICKERS.dataCenters.map((t) => rowFor(t)).filter(Boolean),
        construction:        STACK_TICKERS.construction.map((t) => rowFor(t)).filter(Boolean),
        rawMaterialsMining:  STACK_TICKERS.rawMaterialsMining.map((t) => rowFor(t)).filter(Boolean),
        rawMaterialsNatGas:  STACK_TICKERS.rawMaterialsNatGas.map((t) => rowFor(t)).filter(Boolean),
        renewableGeneration: STACK_TICKERS.renewableGeneration.map((t) => rowFor(t)).filter(Boolean),
        transmissionGrid:    STACK_TICKERS.transmissionGrid.map((t) => rowFor(t)).filter(Boolean),
        cryptoAIDC:          STACK_TICKERS.cryptoAIDC.map((t) => rowFor(t)).filter(Boolean),
        etfsBenchmarks:      STACK_TICKERS.etfsBenchmarks.map((t) => rowFor(t)).filter(Boolean),
        correlation: corr?.ccjPairs ?? [],
        correlationCoeff: corr?.ccjR !== null && corr?.ccjR !== undefined ? parseFloat(corr.ccjR.toFixed(3)) : null,
        cegCorrelationCoeff: corr?.cegR !== null && corr?.cegR !== undefined ? parseFloat(corr.cegR.toFixed(3)) : null,
        correlationMeta: corr ? { weeks: corr.weeks, proxyTicker: corr.proxyTicker, asOf: corr.asOf } : null,
      });
    } catch (error) {
      console.error("Stack error:", error);
      res.status(500).json({ error: "Failed to fetch stack data" });
    }
  });

  // Top Movers endpoint - top 5 by absolute % change across all stack tickers
  app.get("/api/top-movers", async (_req, res) => {
    try {
      const stockData = await getCachedStockData("1D");

      // Determine sector for each ticker
      const sectorMap: Record<string, string> = {};
      Object.entries(STACK_TICKERS).forEach(([sector, tickers]) => {
        tickers.forEach((t) => { sectorMap[t] = sector; });
      });

      const allStocks = Object.values(stockData) as any[];
      const sorted = allStocks.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
      const topMovers = sorted.slice(0, 5).map((s) => ({
        ...s,
        sector: sectorMap[s.ticker] ?? "other",
      }));

      res.json(topMovers);
    } catch (error) {
      console.error("Top movers error:", error);
      res.status(500).json({ error: "Failed to fetch top movers" });
    }
  });

  // Sector Pulse endpoint - avg % change per layer
  app.get("/api/sector-pulse", async (_req, res) => {
    try {
      const stockData = await getCachedStockData("1D");

      const SECTOR_LABELS: Record<string, string> = {
        compute: "Compute", nuclear: "Nuclear", uranium: "Uranium",
        powerHardware: "Power HW", utilities: "Utilities",
        dataCenters: "Data Ctrs", construction: "Constr.",
        rawMaterialsMining: "Mining", rawMaterialsNatGas: "Nat Gas",
        renewableGeneration: "Renewables", transmissionGrid: "Grid HW",
        cryptoAIDC: "Crypto DC", etfsBenchmarks: "ETFs",
      };

      const pulse = Object.entries(STACK_TICKERS).map(([key, tickers]) => {
        const changes = tickers
          .map((t) => stockData[t]?.changePercent)
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
        const avg = changes.length > 0 ? changes.reduce((s, v) => s + v, 0) / changes.length : 0;
        return { sector: key, label: SECTOR_LABELS[key] ?? key, avgChange: parseFloat(avg.toFixed(2)) };
      });

      res.json(pulse);
    } catch (error) {
      console.error("Sector pulse error:", error);
      res.status(500).json({ error: "Failed to compute sector pulse" });
    }
  });

  app.get("/api/supply-chain", async (_req, res) => {
    try {
      const stockData = await getCachedStockData("1D");

      const stages = Object.entries(SUPPLY_CHAIN_STAGES).map(([key, stage]) => {
        const stocks = stage.tickers
          .map((t) => stockData[t])
          .filter(Boolean);
        // Exclude stale/null changePercent values so a Yahoo throttle on a few
        // tickers doesn't pull the stage average toward zero.
        const liveChanges = stocks
          .map((st) => st.changePercent)
          .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
        const avgChange = liveChanges.length > 0
          ? parseFloat((liveChanges.reduce((s, v) => s + v, 0) / liveChanges.length).toFixed(2))
          : 0;
        return {
          key,
          name: stage.name,
          tagline: stage.tagline,
          color: stage.color,
          companyCount: stocks.length,
          avgChange,
          bottleneckStatus: stage.bottleneckStatus,
          bottleneckDetail: stage.bottleneckDetail,
          keyMetric: stage.keyMetric,
          stocks: stocks.map((s) => ({
            ticker: s.ticker,
            name: s.name,
            price: s.price,
            change: s.change,
            changePercent: s.changePercent,
            marketCapDisplay: s.marketCapDisplay,
            stale: s.stale ?? false,
          })),
        };
      });

      const tightest = stages.find((s) => s.bottleneckStatus === "Bottlenecked");
      res.json({ stages, tightestBottleneck: tightest?.name ?? "Transmission" });
    } catch (error) {
      console.error("Supply chain error:", error);
      res.status(500).json({ error: "Failed to fetch supply chain data" });
    }
  });

  // ─── Interconnection Backlog (LBNL aggregates + verified named projects) ──
  // Public, no auth. Returns the full project list plus aggregate summary
  // stats. Data is a sample of the Lawrence Berkeley National Lab "Queued Up"
  // dataset, hand-curated to AI-power-relevant projects. Annual refresh from
  // emp.lbl.gov/queues. Schema documented in the JSON file's top-level keys.
  app.get("/api/queue", (_req, res) => {
    try {
      const filePath = join(process.cwd(), "server", "data", "interconnection-queue.json");
      const raw = readFileSync(filePath, "utf-8");
      const data = JSON.parse(raw) as BacklogDataset;
      res.json(data);
    } catch (error) {
      console.error("Backlog endpoint error:", error);
      res.status(500).json({ error: "Failed to load interconnection backlog" });
    }
  });

  // Hyperscaler capex aggregate for the homepage explainer. Public.
  app.get("/api/hyperscaler-capex", (_req, res) => {
    try {
      const filePath = join(process.cwd(), "server", "data", "hyperscaler-capex.json");
      const raw = readFileSync(filePath, "utf-8");
      res.json(JSON.parse(raw));
    } catch (error) {
      console.error("Hyperscaler capex endpoint error:", error);
      res.status(500).json({ error: "Failed to load hyperscaler capex" });
    }
  });

  const SUBSCRIBERS_FILE = join(process.cwd(), "server", "data", "subscribers.json");
  interface Subscriber {
    email: string;
    subscribedAt: string;
    intent?: string;
    context?: string;
  }

  function loadSubscribers(): Subscriber[] {
    try {
      if (existsSync(SUBSCRIBERS_FILE)) {
        return JSON.parse(readFileSync(SUBSCRIBERS_FILE, "utf8"));
      }
    } catch {}
    return [];
  }

  function saveSubscribers(subs: Subscriber[]) {
    writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subs, null, 2));
  }

  const UNSUB_TOKEN_SECRET: string =
    process.env.UNSUB_TOKEN_SECRET ??
    (() => {
      throw new Error(
        "UNSUB_TOKEN_SECRET env var is required. Generate one with: openssl rand -hex 32",
      );
    })();
  function makeUnsubToken(email: string): string {
    return createHmac("sha256", UNSUB_TOKEN_SECRET).update(email).digest("hex");
  }
  function safeEqualStr(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
  }
  function requireAdmin(req: Request, res: Response): boolean {
    const expected = process.env.ADMIN_API_KEY;
    if (!expected) {
      res.status(503).json({ error: "Admin API not configured" });
      return false;
    }
    const provided = req.headers["x-admin-key"];
    if (typeof provided !== "string" || !safeEqualStr(provided, expected)) {
      res.status(401).json({ error: "Unauthorized" });
      return false;
    }
    return true;
  }

  app.post("/api/subscribe", subscribeLimiter, async (req: Request, res) => {
    try {
      const { email, intent, context } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "That doesn't look like an email" });
      }

      const subscribers = loadSubscribers();
      const normalizedEmail = email.toLowerCase().trim();
      const trimmedIntent =
        typeof intent === "string" && intent.trim() ? intent.trim().slice(0, 500) : null;
      const trimmedContext =
        typeof context === "string" && context.trim() ? context.trim().slice(0, 64) : null;

      const existing = subscribers.find((s) => s.email === normalizedEmail);
      if (existing) {
        // Merge new segmentation fields onto the existing record so we don't
        // silently drop a returning subscriber's answer (e.g., they were on the
        // dashboard waitlist last month, today they filled the BuildYourOwn
        // textarea on /). Preserve a prior intent rather than overwrite it;
        // always refresh context (most-recent surface is the most useful tag).
        let mutated = false;
        if (trimmedIntent && !existing.intent) {
          existing.intent = trimmedIntent;
          mutated = true;
        }
        if (trimmedContext && existing.context !== trimmedContext) {
          existing.context = trimmedContext;
          mutated = true;
        }
        if (mutated) saveSubscribers(subscribers);
        return res.json({ message: "You're already on the list", status: "exists" });
      }

      const record: Subscriber = {
        email: normalizedEmail,
        subscribedAt: new Date().toISOString(),
      };
      if (trimmedIntent) record.intent = trimmedIntent;
      if (trimmedContext) record.context = trimmedContext;
      subscribers.push(record);
      saveSubscribers(subscribers);

      if (process.env.RESEND_API_KEY) {
        try {
          const resendRes = await fetch("https://api.resend.com/audiences", {
            method: "GET",
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          });
          const audiences = await resendRes.json();
          const audienceId = audiences?.data?.[0]?.id;
          if (audienceId) {
            await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              },
              body: JSON.stringify({ email: normalizedEmail }),
            });
          }
        } catch (e) {
          console.error("Resend sync error:", e);
        }
      }

      res.json({ message: "You're in", status: "subscribed" });
    } catch (error) {
      console.error("Subscribe error:", error);
      res.status(500).json({ error: "Something went wrong, try again" });
    }
  });

  app.get("/api/unsubscribe", unsubscribeLimiter, (req, res) => {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).send("Invalid unsubscribe link");
    }

    const subscribers = loadSubscribers();
    const remaining = subscribers.filter((s) => !safeEqualStr(makeUnsubToken(s.email), token));

    if (remaining.length < subscribers.length) {
      saveSubscribers(remaining);
      return res.send(`
        <html><head><title>Unsubscribed</title><style>body{background:#0d0d14;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
        .card{text-align:center;padding:2rem;}.check{color:#22c55e;font-size:3rem;}</style></head>
        <body><div class="card"><div class="check">&#10003;</div><h2>Unsubscribed</h2><p style="color:#888;">You've been removed from the GridTilt mailing list.</p></div></body></html>
      `);
    }

    res.send(`
      <html><head><title>Unsubscribe</title><style>body{background:#0d0d14;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
      .card{text-align:center;padding:2rem;}</style></head>
      <body><div class="card"><h2>Not Found</h2><p style="color:#888;">This email was not found in our subscriber list.</p></div></body></html>
    `);
  });

  app.get("/api/newsletter/preview", async (req, res) => {
    if (!requireAdmin(req, res)) return; // SEC-1: leaked subscriber count when public
    try {
      // The weekly digest renders from the same composed Brief the site
      // shows, plus the measured gauges and the day's movers.
      const brief = composeBrief(buildBriefInput());

      let stockData: Record<string, any> = {};
      try {
        const cached = stackCache["1D"];
        if (cached) stockData = cached.data;
      } catch {}
      const movers = Object.values(stockData)
        .filter((s: any) => typeof s?.changePercent === "number" && s.changePercent !== 0)
        .sort((a: any, b: any) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, 5)
        .map((s: any) => ({ ticker: s.ticker, name: s.name, changePercent: s.changePercent }));

      // Tracked power from the facility dataset, same >=400 MW floor and
      // operational+construction definition as the dashboard.
      let trackedGW: number | null = null;
      let constructionGW: number | null = null;
      try {
        const dcs = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "datacenters.json"), "utf-8")) as Array<{ powerMW: number; status: string }>;
        const tracked = dcs.filter((d) => typeof d.powerMW === "number" && d.powerMW >= 400);
        const opMW = tracked.filter((d) => d.status === "operational").reduce((t, d) => t + d.powerMW, 0);
        const conMW = tracked.filter((d) => d.status === "construction").reduce((t, d) => t + d.powerMW, 0);
        trackedGW = (opMW + conMW) / 1000;
        constructionGW = conMW / 1000;
      } catch {}

      const gi = computeGpuIndex(readGpuRoot().models ?? [], easternDay(), recordedByModel());

      const html = renderWeeklyEmail({
        brief,
        movers,
        trackedGW,
        constructionGW,
        fleetAvg: gi.fleetAvg || null,
        fleetAvg1yChange: gi.fleetAvg1yChange,
        tightestRTO: { label: "MISO", marginPct: 13.4 }, // NERC LTRA 2025; mirror of client data/rto-config
        dateLabel: weeklyDateLabel(new Date()),
        siteUrl: BASE_URL,
      });

      res.type("html").send(html);
    } catch (error) {
      console.error("Newsletter preview error:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  let lastNewsletterSendMs = 0;
  try {
    const marker = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "newsletter-log.json"), "utf-8"));
    if (typeof marker?.lastSendMs === "number") lastNewsletterSendMs = marker.lastSendMs;
  } catch {}

  app.post("/api/newsletter/send", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    // Weekly cadence guard: a misfired cron must not double-send. Bypass
    // with {"force": true} for deliberate re-sends.
    const SIX_DAYS = 6 * 24 * 60 * 60 * 1000;
    if (Date.now() - lastNewsletterSendMs < SIX_DAYS && req.body?.force !== true) {
      return res.status(409).json({
        error: "Newsletter already sent within the past 6 days. Pass {\"force\": true} to override.",
        lastSend: new Date(lastNewsletterSendMs).toISOString(),
      });
    }

    if (!process.env.RESEND_API_KEY) {
      return res.status(400).json({ error: "RESEND_API_KEY not configured" });
    }

    try {
      const subscribers = loadSubscribers();
      if (subscribers.length === 0) {
        return res.json({ message: "No subscribers", sent: 0 });
      }

      const previewUrl = `http://localhost:${process.env.PORT || 5000}/api/newsletter/preview`;
      // Preview is admin-gated (SEC-1); forward the server's own key on the
      // internal call so the send path keeps working.
      const previewRes = await fetch(previewUrl, {
        headers: { "x-admin-key": process.env.ADMIN_API_KEY || "" },
      });
      const htmlTemplate = await previewRes.text();

      let sent = 0;
      let errors = 0;
      for (const sub of subscribers) {
        const token = makeUnsubToken(sub.email);
        const personalizedHtml = htmlTemplate.replace(
          "token=PREVIEW",
          `token=${token}`
        );

        try {
          const sendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: "GridTilt <brief@gridtilt.com>",
              to: sub.email,
              subject: `The GridTilt Weekly · ${weeklyDateLabel(new Date())}`,
              html: personalizedHtml,
            }),
          });
          if (sendRes.ok) {
            sent++;
          } else {
            errors++;
          }
        } catch {
          errors++;
        }
      }

      if (sent > 0) {
        lastNewsletterSendMs = Date.now();
        try {
          writeFileSync(join(process.cwd(), "server", "data", "newsletter-log.json"), JSON.stringify({ lastSendMs: lastNewsletterSendMs, sent }, null, 2) + "\n", "utf-8");
        } catch {}
      }
      res.json({ message: `Newsletter sent`, sent, errors, total: subscribers.length });
    } catch (error) {
      console.error("Newsletter send error:", error);
      res.status(500).json({ error: "Failed to send newsletter" });
    }
  });

  app.get("/api/admin/subscribers", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const subscribers = loadSubscribers();
    res.json({ count: subscribers.length, subscribers });
  });

  app.delete("/api/admin/subscribers/:email", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const emailToRemove = decodeURIComponent(req.params.email).toLowerCase();
    const subscribers = loadSubscribers();
    const remaining = subscribers.filter((s) => s.email !== emailToRemove);
    saveSubscribers(remaining);
    res.json({ message: "Removed", count: remaining.length });
  });

  async function refreshEarningsCache(): Promise<any[]> {
    const now = Date.now();
    if (earningsCache && (now - earningsCache.timestamp) < EARNINGS_CACHE_TTL) {
      return earningsCache.items;
    }

    const results: any[] = [];
    let idCounter = 1000;

    try {
      const YahooFinanceClass = (await import("yahoo-finance2")).default;
      const yahooFinance = new YahooFinanceClass({ suppressNotices: ["yahooSurvey"] });

      // Pull both calendarEvents (for date arrays) and quote (for post-earnings-aware
      // earningsTimestampStart/End + last-reported earningsTimestamp). Yahoo's
      // calendarEvents.earningsDate[0] lags after a company reports — it can still
      // show the just-passed date for ~a week. quote().earningsTimestamp tells us
      // the LAST earnings, so we can detect and discard stale calendarEvents dates.
      const [summaries, quotes] = await Promise.all([
        Promise.all(
          ALL_STACK_TICKERS.map((ticker) =>
            yahooFinance.quoteSummary(ticker, { modules: ["calendarEvents"] }).catch(() => null)
          )
        ),
        Promise.all(
          ALL_STACK_TICKERS.map((ticker) =>
            yahooFinance.quote(ticker).catch(() => null)
          )
        ),
      ]);

      // Cutoff: only count dates from today onward. (Anything strictly earlier
      // than today has already happened — we never want to show it as upcoming.)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayMs = today.getTime();

      summaries.forEach((summary, i) => {
        const ticker = ALL_STACK_TICKERS[i];
        const quote: any = quotes[i];

        // yahoo-finance2 may return these as Date objects, numbers (sec or ms),
        // or strings — normalize to ms-since-epoch, returning 0 if unparseable.
        const toMs = (v: any): number => {
          if (v == null) return 0;
          if (v instanceof Date) return v.getTime();
          if (typeof v === "number") return v < 1e12 ? v * 1000 : v; // seconds → ms
          const t = new Date(v).getTime();
          return isNaN(t) ? 0 : t;
        };

        // Gather every "next earnings" hint Yahoo gives us across both endpoints
        // and pick the soonest one that's today or later. Yahoo is inconsistent:
        // for some tickers `earningsTimestamp` is the LAST report, for others
        // it's the NEXT one, so we just treat any positive timestamp as a
        // candidate and let the "today or later" filter do the work. Better to
        // show a date that's a few days stale post-earnings than to drop the
        // ticker entirely.
        const candidates: number[] = [];
        const earningsDateArr = summary?.calendarEvents?.earnings?.earningsDate ?? [];
        for (const d of earningsDateArr) {
          const t = toMs(d);
          if (t > 0) candidates.push(t);
        }
        for (const k of ["earningsTimestampStart", "earningsTimestampEnd", "earningsTimestamp"] as const) {
          const t = toMs(quote?.[k]);
          if (t > 0) candidates.push(t);
        }

        const valid = candidates.filter((t) => t >= todayMs);
        if (valid.length === 0) return; // no future date — skip
        const nextMs = Math.min(...valid);

        const d = new Date(nextMs);
        const dateStr = d.toISOString().slice(0, 10);
        const staticData = STATIC_MARKET_DATA[ticker];
        const name = staticData?.name ?? ticker;
        results.push({
          id: idCounter++,
          date: dateStr,
          title: `${ticker}: ${name} Earnings`,
          category: "Earnings",
          thesisImpact: `Watch for AI/datacenter demand commentary, power consumption guidance, and forward revenue outlook from ${name}.`,
          tickers: [ticker],
        });
      });
    } catch (_e) {
      // Yahoo Finance failed
    }

    const seen = new Set<string>();
    const deduped = results.filter((item) => {
      const key = item.tickers[0];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length > 0) {
      earningsCache = { items: deduped, timestamp: now };
    }
    return deduped;
  }

  refreshEarningsCache().catch(() => {});

  // Earnings calendar endpoint - upcoming earnings dates for all stack tickers (4h cache)
  app.get("/api/earnings-calendar", async (_req, res) => {
    try {
      const items = await refreshEarningsCache();
      res.json(items);
    } catch (error) {
      console.error("Earnings calendar error:", error);
      res.json([]);
    }
  });

  // Portfolio scoring endpoint
  app.post("/api/portfolio-score", async (req, res) => {
    try {
      const { tickers } = req.body;
      if (!Array.isArray(tickers) || tickers.length === 0) {
        return res.status(400).json({ error: "tickers must be a non-empty array" });
      }

      const results = tickers.slice(0, 15).map((ticker: string) =>
        scorePortfolioTicker(ticker.trim().toUpperCase())
      );

      res.json({ results });
    } catch (error) {
      console.error("Portfolio score error:", error);
      res.status(500).json({ error: "Failed to score portfolio" });
    }
  });

  // Live news endpoint - priority: 1) NewsData.io  2) RSS feeds  3) empty array
  app.get("/api/news", async (_req, res) => {
    try {
      const now = Date.now();
      if (newsCache && (now - newsCache.timestamp) < NEWS_CACHE_TTL) {
        return res.json(newsCache.items);
      }

      // Priority 1: NewsData.io (if key configured)
      const apiKey = process.env.NEWSDATA_API_KEY;
      if (apiKey) {
        try {
          const url = `https://newsdata.io/api/1/latest?apikey=${apiKey}&q=data+center+OR+nuclear+energy+OR+power+grid+OR+AI+infrastructure+OR+uranium&language=en&category=business,technology`;
          const resp = await fetch(url);
          if (resp.ok) {
            const json = await resp.json() as any;
            const articles = (json.results ?? []) as any[];
            const items: NewsItem[] = articles
              .filter((a: any) => isNewsRelevant((a.title ?? "") + " " + (a.description ?? "")))
              .slice(0, 30)
              .map((a: any) => ({
                headline: a.title ?? "",
                source: a.source_id ?? a.source_name ?? "NewsData",
                url: a.link ?? "#",
                publishedAt: a.pubDate ?? new Date().toISOString(),
              }));
            if (items.length > 0) {
              newsCache = { items, timestamp: now };
              // News-driven dataset writes (backlog + market-constant scanners,
              // LBNL check) run only from authenticated /api/admin/scan-news-now.
              // A public GET must never persist state (SEC-4).
              return res.json(items);
            }
          }
        } catch (_e) {
          // Fall through to RSS
        }
      }

      // Priority 2: RSS feeds - live, no API key required, updates hourly
      try {
        const rssItems = await fetchRSSNews();
        if (rssItems.length >= 3) {
          newsCache = { items: rssItems, timestamp: now };
          // Scanners run only via authenticated /api/admin/scan-news-now (SEC-4).
          return res.json(rssItems);
        }
      } catch (_e) {
        // No more sources available
      }

      res.json([]);
    } catch (error) {
      console.error("News error:", error);
      res.json([]);
    }
  });

  // Catalysts: manual thesis catalysts from config.
  // sortDate is used only for display ordering; dateLabel shows the actual expected timeframe.
  // All events listed are real, verifiable regulatory/market proceedings.
  // Past-dated entries are filtered out server-side so a forgotten catalyst
  // never lingers on the calendar (same contract as the earnings path).
  function loadManualCatalysts(): any[] {
    try {
      const filePath = join(process.cwd(), "server", "data", "catalysts.json");
      const raw = readFileSync(filePath, "utf-8");
      const todayStr = new Date().toISOString().split('T')[0];
      return JSON.parse(raw)
        .filter((c: any) => typeof c.date === "string" && c.date >= todayStr)
        .map((c: any) => ({
          id: c.id?.toString() ?? c.title,
          category: c.category,
          title: c.title,
          description: c.thesisImpact || '',
          dateLabel: new Date(c.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" }),
          sortDate: c.date,
          affectedTickers: c.tickers || [],
          affectedSectors: [],
        }));
    } catch {
      return [];
    }
  }

  // Earnings dates based on each company's historical reporting week.
  // Fiscal quarter designations are verified from each company's fiscal year calendar.
  // Exact day may shift by ±1 week; dates represent the typical reporting week.
  // Companies we display on the marquee even when their earnings date is
  // not yet confirmed by Yahoo. This is METADATA ONLY (company name + BMO/AMC
  // hint). Dates come exclusively from live Yahoo calendarEvents. If Yahoo
  // doesn't have a future date for a ticker, we don't put it on the calendar.
  // No fake fallback dates. Ever. (Past bug: hardcoded next-earnings dates
  // went stale and showed NVDA at +8 days when it had reported earlier today.)
  const EARNINGS_TICKER_META: Record<string, { company: string; timeHint: string }> = {
    TSM:   { company: 'Taiwan Semiconductor',     timeHint: 'BMO' },
    GOOGL: { company: 'Alphabet',                  timeHint: 'AMC' },
    META:  { company: 'Meta Platforms',            timeHint: 'AMC' },
    MSFT:  { company: 'Microsoft',                 timeHint: 'AMC' },
    AAPL:  { company: 'Apple',                     timeHint: 'AMC' },
    AMZN:  { company: 'Amazon',                    timeHint: 'AMC' },
    AMD:   { company: 'Advanced Micro Devices',    timeHint: 'AMC' },
    NVDA:  { company: 'NVIDIA',                    timeHint: 'AMC' },
  };

  const STAGE_MAP: Record<string, string> = {
    CCJ: 'Raw Materials', UEC: 'Raw Materials', NXE: 'Raw Materials', DNN: 'Raw Materials',
    UUUU: 'Raw Materials', LEU: 'Raw Materials', FCX: 'Raw Materials', SCCO: 'Raw Materials',
    TECK: 'Raw Materials', HBM: 'Raw Materials', NUE: 'Raw Materials', STLD: 'Raw Materials',
    CLF: 'Raw Materials', X: 'Raw Materials', MP: 'Raw Materials', USAR: 'Raw Materials', BHP: 'Raw Materials',
    RIO: 'Raw Materials', VALE: 'Raw Materials', AR: 'Raw Materials', EQT: 'Raw Materials',
    RRC: 'Raw Materials', SWN: 'Raw Materials', LNG: 'Raw Materials',
    CEG: 'Generation', VST: 'Generation', TLN: 'Generation', NRG: 'Generation',
    GEV: 'Generation', SIEGY: 'Generation', BKR: 'Generation', SMR: 'Generation',
    OKLO: 'Generation', BWXT: 'Generation', NEE: 'Generation', AES: 'Generation',
    FSLR: 'Generation', ENPH: 'Generation', SEDG: 'Generation', SO: 'Generation',
    DUK: 'Generation', AEP: 'Generation',
    ETN: 'Transmission', ABB: 'Transmission', PWR: 'Transmission', EMR: 'Transmission',
    HUBB: 'Transmission', AYI: 'Transmission', WIRE: 'Transmission', GNRC: 'Transmission',
    IDA: 'Transmission', NVT: 'Transmission',
    VRT: 'Distribution', CARR: 'Distribution', JCI: 'Distribution', EME: 'Distribution',
    MTZ: 'Distribution', STRL: 'Distribution', FLR: 'Distribution', J: 'Distribution', ACM: 'Distribution', PRIM: 'Distribution',
    EQIX: 'End Use', DLR: 'End Use', AMT: 'End Use', NVDA: 'End Use', AMD: 'End Use',
    AVGO: 'End Use', TSM: 'End Use', MU: 'End Use', INTC: 'End Use', SMCI: 'End Use',
    META: 'End Use', AMZN: 'End Use', MSFT: 'End Use', GOOGL: 'End Use', AAPL: 'End Use',
    IREN: 'End Use', CLSK: 'End Use', MARA: 'End Use',
  };

  const STAGE_COLORS_MAP: Record<string, string> = {
    'Raw Materials': '#C87533', 'Generation': '#F07800', 'Transmission': '#D4A843',
    'Distribution': '#B8860B', 'End Use': '#F0A500',
  };

  function getEarningsData() {
    const todayStr = new Date().toISOString().split('T')[0];

    // Single source of truth: Yahoo Finance calendarEvents. No date seeds.
    if (!earningsCache?.items) return [];

    const seen = new Set<string>();
    const allEntries: Array<{ ticker: string; company: string; date: string; time: string; quarter: string }> = [];

    for (const item of earningsCache.items) {
      const ticker = item.tickers?.[0];
      if (!ticker || seen.has(ticker)) continue;
      if (!item.date || item.date < todayStr) continue;  // strict: must be today or future
      const meta = EARNINGS_TICKER_META[ticker];
      const staticData = STATIC_MARKET_DATA[ticker];
      allEntries.push({
        ticker,
        company: meta?.company ?? staticData?.name ?? ticker,
        date: item.date,
        time: meta?.timeHint ?? '',
        quarter: '',  // intentionally blank; we don't want to claim a quarter we can't verify
      });
      seen.add(ticker);
    }

    const filtered = allEntries.filter(e => e.date >= todayStr);
    return filtered.map(e => ({
      ...e,
      stage: STAGE_MAP[e.ticker] || 'End Use',
      stageColor: STAGE_COLORS_MAP[STAGE_MAP[e.ticker] || 'End Use'],
    }));
  }

  app.get("/api/catalysts/earnings", async (_req, res) => {
    await refreshEarningsCache().catch(() => {});
    const items = getEarningsData();
    res.json({ earnings: items });
  });

  app.get("/api/catalysts/manual", (_req, res) => {
    res.json(loadManualCatalysts());
  });

  app.get("/api/catalysts/all", async (_req, res) => {
    await refreshEarningsCache().catch(() => {});
    const earnings = getEarningsData();
    const earningsFormatted = earnings.map((e: any) => ({
      id: `earnings-${e.ticker}-${e.date}`,
      type: 'earnings' as const,
      date: e.date,
      sortDate: e.date,
      ticker: e.ticker,
      company: e.company,
      time: e.time,
      quarter: e.quarter,
      stage: e.stage,
      stageColor: e.stageColor,
    }));

    const manualCatalysts = loadManualCatalysts();
    const manualFormatted = manualCatalysts.map(c => ({
      id: c.id,
      type: 'catalyst' as const,
      date: c.sortDate,
      sortDate: c.sortDate,
      category: c.category,
      title: c.title,
      description: c.description,
      dateLabel: c.dateLabel,
      affectedTickers: c.affectedTickers,
      affectedSectors: c.affectedSectors,
    }));

    const merged = [...earningsFormatted, ...manualFormatted].sort(
      (a, b) => new Date(a.sortDate).getTime() - new Date(b.sortDate).getTime()
    );

    res.json({ items: merged });
  });

  // ─── Datacenters: JSON-backed registry of hyperscale sites ──────────────
  const datacentersPath = join(process.cwd(), "server", "data", "datacenters.json");

  type Datacenter = {
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
  };

  function loadDatacenters(): Datacenter[] {
    try {
      if (!existsSync(datacentersPath)) return [];
      return JSON.parse(readFileSync(datacentersPath, "utf-8")) as Datacenter[];
    } catch (err) {
      console.error("Datacenters read error:", err);
      return [];
    }
  }

  function saveDatacenters(list: Datacenter[]): void {
    writeFileSync(datacentersPath, JSON.stringify(list, null, 2) + "\n", "utf-8");
  }

  function validateDatacenter(body: any): { ok: true; value: Omit<Datacenter, "id"> } | { ok: false; error: string } {
    const required = ["name", "company", "city", "state", "lat", "lng", "powerMW", "status", "annualMWh", "gridOperator", "openDate"];
    for (const k of required) {
      if (body[k] === undefined || body[k] === null) return { ok: false, error: `Missing field: ${k}` };
    }
    const validStatus = ["operational", "construction", "announced"];
    if (!validStatus.includes(body.status)) return { ok: false, error: "Invalid status" };
    const num = (n: any) => typeof n === "number" && Number.isFinite(n);
    if (!num(body.lat) || !num(body.lng) || !num(body.powerMW) || !num(body.annualMWh)) {
      return { ok: false, error: "lat, lng, powerMW, annualMWh must be numbers" };
    }
    if (body.powerMW < 400) {
      return { ok: false, error: "powerMW must be >= 400 (hyperscale threshold)" };
    }
    return {
      ok: true,
      value: {
        name: String(body.name),
        company: String(body.company),
        city: String(body.city),
        state: String(body.state),
        lat: body.lat,
        lng: body.lng,
        powerMW: body.powerMW,
        status: body.status,
        annualMWh: body.annualMWh,
        gridOperator: String(body.gridOperator),
        openDate: String(body.openDate),
      },
    };
  }

  app.get("/api/datacenters", (_req, res) => {
    res.json(loadDatacenters());
  });

  app.post("/api/admin/datacenters", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const parsed = validateDatacenter(req.body);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const list = loadDatacenters();

    const dup = list.find(
      (d) =>
        d.name.toLowerCase() === parsed.value.name.toLowerCase() ||
        (Math.abs(d.lat - parsed.value.lat) < 0.01 &&
          Math.abs(d.lng - parsed.value.lng) < 0.01 &&
          d.company.toLowerCase() === parsed.value.company.toLowerCase()),
    );
    if (dup) return res.status(409).json({ error: "Datacenter already exists", id: dup.id });

    const nextId = list.reduce((m, d) => Math.max(m, d.id), 0) + 1;
    const created: Datacenter = { id: nextId, ...parsed.value };
    list.push(created);
    saveDatacenters(list);
    res.status(201).json(created);
  });

  app.delete("/api/admin/datacenters/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const list = loadDatacenters();
    const next = list.filter((d) => d.id !== id);
    if (next.length === list.length) return res.status(404).json({ error: "Not found" });
    saveDatacenters(next);
    res.json({ removed: id });
  });

  // ─── Datacenter ingester (auto-discovery from public RSS) ───────────────
  app.get("/api/admin/datacenters/pending", (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json(loadPendingDatacenters());
  });

  app.post("/api/admin/datacenters/ingest", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const result = await runDatacenterIngestion();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Ingest failed", detail: String(err?.message ?? err) });
    }
  });

  app.post("/api/admin/datacenters/pending/:id/approve", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const result = approvePendingDatacenter(id);
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.status(201).json(result.approved);
  });

  app.delete("/api/admin/datacenters/pending/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });
    const removed = rejectPendingDatacenter(id);
    if (!removed) return res.status(404).json({ error: "Not found" });
    res.json({ removed: id });
  });

  startDatacenterIngesterSchedule();

  app.get("/api/catalysts", (_req, res) => {
    try {
      const filePath = join(process.cwd(), "server", "data", "catalysts.json");
      const raw = readFileSync(filePath, "utf-8");
      const catalysts = JSON.parse(raw);
      const sorted = catalysts.sort((a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      res.json(sorted);
    } catch (error) {
      console.error("Catalysts read error:", error);
      res.json([]);
    }
  });

  // ─── SEO: Sitemap.xml ───────────────────────────────────────────────────
  app.get("/sitemap.xml", (_req, res) => {
    const today = new Date().toISOString().split("T")[0];
    const urls: Array<{ loc: string; priority: string; changefreq: string }> = [];

    for (const p of SITEMAP_STATIC_PAGES) {
      urls.push({
        loc: `${BASE_URL}${p === "/" ? "" : p}`,
        priority: "1.0",
        changefreq: "daily",
      });
    }

    for (const ticker of ALL_STACK_TICKERS) {
      urls.push({
        loc: `${BASE_URL}/stock/${ticker}`,
        priority: "0.8",
        changefreq: "daily",
      });
    }

    for (const slug of SITEMAP_SECTOR_SLUGS) {
      urls.push({
        loc: `${BASE_URL}/sector/${slug}`,
        priority: "0.7",
        changefreq: "weekly",
      });
    }

    for (const slug of SITEMAP_REGION_SLUGS) {
      urls.push({
        loc: `${BASE_URL}/region/${slug}`,
        priority: "0.7",
        changefreq: "weekly",
      });
    }

    for (const slug of SITEMAP_OPERATOR_SLUGS) {
      urls.push({
        loc: `${BASE_URL}/operator/${slug}`,
        priority: "0.7",
        changefreq: "weekly",
      });
    }

    for (const slug of SITEMAP_CLUSTER_SLUGS) {
      urls.push({
        loc: `${BASE_URL}/compute-frontier/${slug}`,
        priority: "0.7",
        changefreq: "weekly",
      });
    }

    try {
      const blogPath = join(process.cwd(), "content", "blog", "articles.json");
      const blogRaw = readFileSync(blogPath, "utf-8");
      const blogArticles = JSON.parse(blogRaw);
      for (const article of blogArticles) {
        urls.push({
          loc: `${BASE_URL}/blog/${article.slug}`,
          priority: "0.6",
          changefreq: "monthly",
        });
      }
    } catch {}

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;
    res.set("Content-Type", "application/xml").send(xml);
  });

  // ─── SEO: Robots.txt ───────────────────────────────────────────────────
  app.get("/robots.txt", (_req, res) => {
    res.set("Content-Type", "text/plain").send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/
Sitemap: ${BASE_URL}/sitemap.xml
`);
  });

  // ─── SEO: humans.txt ───────────────────────────────────────────────────
  app.get("/humans.txt", (_req, res) => {
    res.set("Content-Type", "text/plain").send(`Built by Jack Schwartz (@aurph)
Site: gridtilt.com
Twitter: @gridtilt
`);
  });

  // ─── SEO: security.txt ─────────────────────────────────────────────────
  app.get("/.well-known/security.txt", (_req, res) => {
    res.set("Content-Type", "text/plain").send(`Contact: mailto:jack@gridtilt.com
Preferred-Languages: en
`);
  });

  // ─── SEO: Dynamic OG Image Generation ──────────────────────────────────
  app.get("/api/og", async (req, res) => {
    try {
      const page = (req.query.page as string) || "home";
      const ticker = req.query.ticker as string | undefined;
      const name = req.query.name as string | undefined;
      const template = req.query.template as string | undefined;

      let card: OgCard;
      if (template) {
        card = await ogCardForTemplate(template);
      } else if (ticker) {
        const companyInfo = COMPANY_DATABASE[ticker.toUpperCase()];
        card = {
          title: companyInfo ? `${companyInfo.name} ($${ticker.toUpperCase()})` : `$${ticker.toUpperCase()}`,
          subtitle: companyInfo ? `${companyInfo.primarySegment} Sector` : "AI Power Thesis Analysis",
          stats: [{ label: "Sector", value: companyInfo?.primarySegment || "Unknown" }],
        };
      } else if (page === "stack") {
        card = { title: "60+ AI Power Stocks", subtitle: "Live Data Across 8 Sectors", stats: await liveIndicesStats() };
      } else if (page === "power-map") {
        card = { title: "US AI Data Center Map", subtitle: "Filter by operator, region, and capacity (\u2265 400 MW)", stats: await liveIndicesStats() };
      } else if (page === "compute-frontier" && name) {
        card = { title: name, subtitle: "AI Supercluster \u00b7 GridTilt", stats: await computeFrontierOgStats() };
      } else if (page === "compute-frontier") {
        card = { title: "Compute Frontier", subtitle: "AI superclusters by GPUs and power", stats: await computeFrontierOgStats() };
      } else if (page === "supply-chain") {
        card = { title: "AI Power Supply Chain", subtitle: "5 systems, 20 sub-systems, silicon to substation", stats: await liveIndicesStats() };
      } else if (page === "queue") {
        card = await ogCardForTemplate("queue_update");
      } else if (page === "trade") {
        card = { title: "AI Power Scenario Calculator", subtitle: "Model demand, capex, and LPT requirements through 2030", stats: await liveIndicesStats() };
      } else if (page === "portfolio") {
        card = { title: "AI Power Thesis Score", subtitle: "Rate any portfolio against the AI power buildout", stats: await liveIndicesStats() };
      } else if (page === "catalysts") {
        card = { title: "Catalyst Calendar", subtitle: "Earnings, policy, and regulatory events for AI power", stats: await liveIndicesStats() };
      } else if (page === "blog" && name) {
        card = { title: name, subtitle: "GridTilt Analysis", stats: await liveIndicesStats() };
      } else if (page === "blog") {
        card = { title: "GridTilt Analysis", subtitle: "Research on the AI power infrastructure thesis", stats: await liveIndicesStats() };
      } else if (page === "subscribe") {
        card = { title: "Get the Tilt", subtitle: "Weekly AI power market intel, in your inbox", stats: await liveIndicesStats() };
      } else if (page === "sector" && name) {
        card = { title: `${name} Sector`, subtitle: "AI Power Infrastructure Stocks", stats: await liveIndicesStats() };
      } else if (page === "region" && name) {
        card = { title: `${name} Grid Region`, subtitle: "AI Data Center Locations", stats: await liveIndicesStats() };
      } else if (page === "operator" && name) {
        card = { title: `${name} AI Data Centers`, subtitle: "Locations and Capacity", stats: await liveIndicesStats() };
      } else {
        // home (default)
        card = { title: "The grid is tilting.", subtitle: "AI power infrastructure dashboard", stats: await liveIndicesStats() };
      }

      const png = await renderOgPng(card);
      res.set({
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=600, s-maxage=600",  // 10 min so live stats stay fresh
      }).send(png);
    } catch (error) {
      console.error("OG image generation error:", error);
      res.status(500).json({ error: "Failed to generate OG image" });
    }
  });

  // ─── SEO: Manifest.json (PWA) ──────────────────────────────────────────
  app.get("/manifest.json", (_req, res) => {
    res.json({
      name: "GridTilt \u2014 AI Power Infrastructure Dashboard",
      short_name: "GridTilt",
      description: "Track the AI power buildout",
      start_url: "/overview",
      display: "standalone",
      background_color: "#121110",
      theme_color: "#F07800",
      icons: [
        { src: "/favicon-logo.png", sizes: "192x192", type: "image/png" },
        { src: "/favicon-logo.png", sizes: "512x512", type: "image/png" },
      ],
    });
  });

  // ─── SEO: URL Redirects ─────────────────────────────────────────────────
  app.get("/stocks", (_req, res) => res.redirect(301, "/stack"));
  app.get("/map", (_req, res) => res.redirect(301, "/power-map"));
  app.get("/calculator", (_req, res) => res.redirect(301, "/trade"));
  app.get("/score", (_req, res) => res.redirect(301, "/portfolio"));
  app.get("/catalyst-tracker", (_req, res) => res.redirect(301, "/catalysts"));
  app.get("/the-stack", (_req, res) => res.redirect(301, "/stack"));
  // Consolidation (Plan B): folded tools 301 into their host tool's tab
  app.get("/gpu-economics", (_req, res) => res.redirect(301, "/neocloud-intel?tab=economics"));
  app.get("/power-deals", (_req, res) => res.redirect(301, "/power-map?tab=deals"));
  app.get("/queue", (_req, res) => res.redirect(301, "/power-map?tab=queue"));
  app.get("/brief", (_req, res) => res.redirect(301, "/blog"));
  app.get("/portfolio", (_req, res) => res.redirect(301, "/analyze?tab=portfolio"));
  app.get("/trade", (_req, res) => res.redirect(301, "/analyze?tab=scenario"));
  app.get("/supply-chain", (_req, res) => res.redirect(301, "/stack?view=flow"));
  app.get("/thesis-calculator", (_req, res) => res.redirect(301, "/trade"));
  app.get("/portfolio-overlay", (_req, res) => res.redirect(301, "/portfolio"));

  // ─── Content Export APIs ────────────────────────────────────────────────
  // Admin-gated so scheduled cron is the only caller. The shape is stable so
  // we can wire other automations against it later (LinkedIn, Bluesky, etc).
  app.get("/api/export/daily", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const kpis = await computeKpis();
      const stockData = await getCachedStockData("1D");
      const topMovers = (Object.values(stockData) as any[])
        .filter((s) => s && typeof s.changePercent === "number")
        .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, 5)
        .map((s) => ({
          ticker: s.ticker,
          name: s.name,
          change_pct: parseFloat(s.changePercent.toFixed(2)),
        }));

      res.json({
        date: new Date().toISOString().split("T")[0],
        tilt_status: deriveTiltStatus(kpis).toLowerCase(),
        indices: {
          ai_demand: kpis.aiPowerIndex,
          nuclear_power: kpis.npiValue,
          grid_stress: kpis.gridStress,
        },
        top_movers: topMovers,
      });
    } catch (error) {
      console.error("Daily export error:", error);
      res.status(500).json({ error: "Failed to generate daily export" });
    }
  });

  // Compose a tweet from a named template without posting. Use this to preview
  // copy before scheduling. Returns the text + the template that was picked.
  app.post("/api/social/generate", async (req, res) => {
    if (!requireAdmin(req, res)) return; // SEC-2: was public
    const { template } = req.body || {};
    const dayIdx = new Date().getDay();
    const onDemand = template && ON_DEMAND_TEMPLATES[template]
      ? { name: template, compose: ON_DEMAND_TEMPLATES[template] }
      : undefined;
    const picked = template
      ? (Object.values(ROTATING_TEMPLATES).find((t) => t.name === template) ?? onDemand)
      : ROTATING_TEMPLATES[dayIdx];
    if (!picked) {
      return res.status(400).json({
        error: "Unknown template",
        available: Array.from(new Set([
          ...Object.values(ROTATING_TEMPLATES).map((t) => t.name),
          ...Object.keys(ON_DEMAND_TEMPLATES),
        ])),
      });
    }
    try {
      // The catalyst composer reads the module-scope earnings cache;
      // refresh it here because refreshEarningsCache is route-scoped.
      if (picked.name === "catalyst_preview") await refreshEarningsCache().catch(() => {});
      const text = ensureTweetLength(await picked.compose());
      res.json({ template: picked.name, text, length: text.length });
    } catch (error: any) {
      console.error("Social generate error:", error);
      res.status(500).json({ error: error?.message ?? "compose failed" });
    }
  });

  // Cron-triggered daily tweet. Picks template by day of week, composes from
  // live data, posts to X. Logs every attempt (success or dry-run) to
  // server/data/social-log.json so we can audit what shipped.
  app.post("/api/admin/cron/daily-tweet", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const dayIdx = new Date().getDay();
    const picked = ROTATING_TEMPLATES[dayIdx];
    if (!picked) {
      return res.json({ skipped: true, reason: "no template for weekend", dayIdx });
    }
    try {
      // Same cache pre-refresh as /api/social/generate (see note there).
      if (picked.name === "catalyst_preview") await refreshEarningsCache().catch(() => {});
      const text = ensureTweetLength(await picked.compose());

      // Render the template's matching OG image and attach it. If the upload
      // fails (X throttling, OAuth issue), still post the text — the link card
      // will fall back to the page's og:image meta.
      let mediaIds: string[] | undefined;
      try {
        const card = await ogCardForTemplate(picked.name);
        const png = await renderOgPng(card);
        const mediaId = await xUploadMedia(png);
        if (mediaId) mediaIds = [mediaId];
      } catch (mediaErr: any) {
        console.error("OG media upload skipped:", mediaErr?.message);
      }

      const result = await xPostTweet(text, mediaIds);
      appendSocialLog({
        timestamp: new Date().toISOString(),
        platform: "twitter",
        text,
        ok: result.ok,
        id: result.id,
        error: result.error,
        dryRun: result.dryRun,
        template: picked.name,
        trigger: "cron",
      });
      res.json({ template: picked.name, mediaAttached: !!mediaIds, ...result });
    } catch (error: any) {
      console.error("Daily tweet cron error:", error);
      appendSocialLog({
        timestamp: new Date().toISOString(),
        platform: "twitter",
        text: "(compose failed)",
        ok: false,
        error: error?.message ?? "unknown",
        template: picked.name,
        trigger: "cron",
      });
      res.status(500).json({ error: error?.message ?? "cron failed" });
    }
  });

  // Manual post. Body: { text, template? }. When template is provided, the
  // matching OG image is generated and attached. Without it, text-only post.
  app.post("/api/admin/post-now", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { text, template } = req.body || {};
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "text body field is required" });
    }
    const trimmed = ensureTweetLength(text.trim());

    let mediaIds: string[] | undefined;
    if (template && typeof template === "string") {
      try {
        const card = await ogCardForTemplate(template);
        const png = await renderOgPng(card);
        const mediaId = await xUploadMedia(png);
        if (mediaId) mediaIds = [mediaId];
      } catch (mediaErr: any) {
        console.error("OG media upload skipped:", mediaErr?.message);
      }
    }

    const result = await xPostTweet(trimmed, mediaIds);
    appendSocialLog({
      timestamp: new Date().toISOString(),
      platform: "twitter",
      text: trimmed,
      ok: result.ok,
      id: result.id,
      error: result.error,
      dryRun: result.dryRun,
      template,
      trigger: "manual",
    });
    res.json({ ...result, mediaAttached: !!mediaIds });
  });

  // Delete a tweet by id. Use for removing diagnostics or mistakes.
  // DELETE /api/admin/tweet/:id with x-admin-key header.
  app.delete("/api/admin/tweet/:id", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    if (!id || !/^\d+$/.test(id)) {
      return res.status(400).json({ error: "valid numeric tweet id required" });
    }
    const result = await xDeleteTweet(id);
    appendSocialLog({
      timestamp: new Date().toISOString(),
      platform: "twitter",
      text: `(delete tweet ${id})`,
      ok: result.ok,
      id: result.id,
      error: result.error,
      dryRun: result.dryRun,
      trigger: "manual",
    });
    res.json(result);
  });

  // Read-only view of the last N posts (for sanity checking from a browser).
  app.get("/api/admin/social-log", (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 500);
      const raw = existsSync(SOCIAL_LOG_FILE) ? readFileSync(SOCIAL_LOG_FILE, "utf-8") : "[]";
      const log = JSON.parse(raw) as SocialLogEntry[];
      res.json(log.slice(-limit).reverse());
    } catch {
      res.json([]);
    }
  });

  // ─── Backlog admin (project add + headline patch) ───────────────────────
  // These let you keep the interconnection-backlog dataset fresh from anywhere
  // without a redeploy. Both routes write to server/data/interconnection-queue.json
  // atomically (read, mutate, write) and bump lastRefreshed.

  const BACKLOG_FILE = join(process.cwd(), "server", "data", "interconnection-queue.json");

  function loadBacklog(): BacklogDataset {
    const raw = readFileSync(BACKLOG_FILE, "utf-8");
    return JSON.parse(raw) as BacklogDataset;
  }
  function saveBacklog(data: BacklogDataset): void {
    data.lastRefreshed = new Date().toISOString().slice(0, 10);
    writeFileSync(BACKLOG_FILE, JSON.stringify(data, null, 2) + "\n");
  }
  function slugify(s: string): string {
    return s.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
  }

  // POST /api/admin/add-backlog-project
  // Body: { projectName, sponsor, capacityMW, type, iso, state, category,
  //         expectedOnline?, offtaker?, dcRelevant?, status?, sources?, notes? }
  // Behavior: appends a new project, or updates an existing one if `id` is
  // supplied and matches. Returns the saved project + new project count.
  app.post("/api/admin/add-backlog-project", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const b = req.body || {};
    const required = ["projectName", "sponsor", "capacityMW", "type", "iso", "state", "category"];
    for (const k of required) {
      if (b[k] === undefined || b[k] === null || b[k] === "") {
        return res.status(400).json({ error: `missing required field: ${k}` });
      }
    }
    if (typeof b.capacityMW !== "number") {
      return res.status(400).json({ error: "capacityMW must be a number" });
    }
    const validTypes = ["nuclear", "gas", "solar", "wind", "storage", "hybrid", "load", "other"];
    if (!validTypes.includes(b.type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
    }
    const validCategories = ["generation", "load", "ppa", "aggregate", "regulatory"];
    if (!validCategories.includes(b.category)) {
      return res.status(400).json({ error: `category must be one of: ${validCategories.join(", ")}` });
    }
    const validStatuses = ["active", "withdrawn", "operational"];
    const status = b.status ?? "active";
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(", ")}` });
    }

    try {
      const data = loadBacklog();
      const id = (b.id && typeof b.id === "string") ? b.id : slugify(b.projectName);
      const project: BacklogProject = {
        id,
        projectName: b.projectName,
        sponsor: b.sponsor,
        capacityMW: b.capacityMW,
        type: b.type,
        iso: b.iso,
        state: b.state,
        status,
        category: b.category,
        expectedOnline: b.expectedOnline ?? null,
        offtaker: b.offtaker ?? null,
        dcRelevant: b.dcRelevant === true,
        sources: Array.isArray(b.sources) ? b.sources : undefined,
        notes: typeof b.notes === "string" ? b.notes : undefined,
      };

      const idx = data.projects.findIndex((p) => p.id === id);
      const action = idx >= 0 ? "updated" : "added";
      if (idx >= 0) data.projects[idx] = project;
      else data.projects.push(project);

      // Refresh tracked headline counts off the projects array.
      const nonAggregate = data.projects.filter((p) => p.category !== "aggregate");
      data.headline.trackedProjects = nonAggregate.length;
      data.headline.trackedCapacityGW = parseFloat(
        (nonAggregate.reduce((s, p) => s + (p.capacityMW || 0), 0) / 1000).toFixed(1)
      );

      saveBacklog(data);
      res.json({
        action,
        project,
        trackedProjects: data.headline.trackedProjects,
        trackedCapacityGW: data.headline.trackedCapacityGW,
      });
    } catch (e: any) {
      console.error("add-backlog-project error:", e);
      res.status(500).json({ error: e?.message ?? "save failed" });
    }
  });

  // DELETE /api/admin/backlog-project/:id
  app.delete("/api/admin/backlog-project/:id", (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const data = loadBacklog();
      const before = data.projects.length;
      data.projects = data.projects.filter((p) => p.id !== req.params.id);
      if (data.projects.length === before) {
        return res.status(404).json({ error: "no project with that id" });
      }
      const nonAggregate = data.projects.filter((p) => p.category !== "aggregate");
      data.headline.trackedProjects = nonAggregate.length;
      data.headline.trackedCapacityGW = parseFloat(
        (nonAggregate.reduce((s, p) => s + (p.capacityMW || 0), 0) / 1000).toFixed(1)
      );
      saveBacklog(data);
      res.json({ removed: req.params.id, trackedProjects: data.headline.trackedProjects });
    } catch (e: any) {
      console.error("delete-backlog-project error:", e);
      res.status(500).json({ error: e?.message ?? "delete failed" });
    }
  });

  // GET /api/admin/backlog-auto-updates[?limit=N&status=applied|pending-review|all]
  app.get("/api/admin/backlog-auto-updates", (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const limit = Math.min(parseInt((req.query.limit as string) || "100", 10), 500);
      const status = (req.query.status as string) || "all";
      const log = loadAutoUpdateLog();
      const filtered = status === "all" ? log : log.filter((e) => e.status === status);
      res.json(filtered.slice(-limit).reverse());
    } catch {
      res.json([]);
    }
  });

  // POST /api/admin/scan-news-now — manually trigger a backlog news scan.
  // Useful for testing or after manually refreshing the news cache.
  app.post("/api/admin/scan-news-now", async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
      const items = newsCache?.items ?? [];
      if (items.length === 0) {
        return res.json({ ran: false, reason: "news cache empty; refresh /api/news first" });
      }
      const result = await scanNewsForBacklogUpdates(items);
      const uranium = await scanNewsForMarketConstants(items);
      const lbnl = await checkLbnlEdition();
      lastLbnlCheckTs = Date.now();
      res.json({ ran: true, ...result, uranium, lbnl });
    } catch (e: any) {
      res.status(500).json({ error: e?.message ?? "scan failed" });
    }
  });

  // POST /api/admin/update-backlog-headlines
  // Body is a partial object of headline fields you want to overwrite,
  // plus optional `asOfFields` to update the matching asOf-style fields.
  // Example:
  //   { "pjmReopenedGW": 271, "pjmReopenedProjects": 845,
  //     "pjmReopenedAsOf": "PJM Cycle 1 update, June 2026" }
  app.post("/api/admin/update-backlog-headlines", (req, res) => {
    if (!requireAdmin(req, res)) return;
    const patch = req.body || {};
    if (typeof patch !== "object" || Array.isArray(patch)) {
      return res.status(400).json({ error: "body must be an object of headline keys" });
    }
    try {
      const data = loadBacklog();
      const allowed = new Set<keyof BacklogDataset["headline"]>([
        "trackedProjects", "trackedCapacityGW",
        "queueOverallGW", "queueOverallProjects",
        "medianWaitMonths", "historicalWithdrawalPct",
        "queueOverallAsOf", "queueOverallSourceUrl",
        "ercotLargeLoadGW", "ercotLargeLoadDataCenterPct", "ercotLargeLoadAsOf",
        "pjmReopenedGW", "pjmReopenedProjects", "pjmReopenedAsOf",
        "dominionContractedGW", "dominionAsOf",
        "duke5yrGenAddGW", "metaHyperionGW", "stargateAbileneGW",
      ]);
      const applied: Record<string, any> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (allowed.has(k as any)) {
          (data.headline as any)[k] = v;
          applied[k] = v;
        }
      }
      if (Object.keys(applied).length === 0) {
        return res.status(400).json({ error: "no allowed headline fields in body", allowed: Array.from(allowed) });
      }
      saveBacklog(data);
      res.json({ applied, lastRefreshed: data.lastRefreshed });
    } catch (e: any) {
      console.error("update-backlog-headlines error:", e);
      res.status(500).json({ error: e?.message ?? "save failed" });
    }
  });

  // ─── RSS Feeds ──────────────────────────────────────────────────────────
  app.get("/feed.xml", async (_req, res) => {
    try {
      const filePath = join(process.cwd(), "content", "blog", "articles.json");
      const raw = readFileSync(filePath, "utf-8");
      const articles = JSON.parse(raw);
      articles.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const items = articles.map((a: any) => `    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${BASE_URL}/blog/${a.slug}</link>
      <description>${escapeXml(a.description)}</description>
      <pubDate>${new Date(a.date).toUTCString()}</pubDate>
      <guid>${BASE_URL}/blog/${a.slug}</guid>
    </item>`).join("\n");

      res.set("Content-Type", "application/rss+xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>GridTilt Analysis</title>
    <link>${BASE_URL}/blog</link>
    <description>Research and analysis on the AI power infrastructure thesis</description>
    <language>en-us</language>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`);
    } catch (error) {
      console.error("Blog RSS error:", error);
      res.status(500).send("Error generating RSS feed");
    }
  });

  app.get("/catalysts/rss.xml", (_req, res) => {
    try {
      const filePath = join(process.cwd(), "server", "data", "catalysts.json");
      const raw = readFileSync(filePath, "utf-8");
      const catalysts = JSON.parse(raw);
      const sorted = catalysts.sort((a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const items = sorted.map((c: any) => `    <item>
      <title>${escapeXml(c.title)}</title>
      <description>${escapeXml(c.thesisImpact)}</description>
      <pubDate>${new Date(c.date).toUTCString()}</pubDate>
      <guid>${BASE_URL}/catalysts#${c.id}</guid>
      <category>${escapeXml(c.category)}</category>
    </item>`).join("\n");

      res.set("Content-Type", "application/rss+xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>GridTilt Catalyst Tracker</title>
    <link>${BASE_URL}/catalysts</link>
    <description>Upcoming earnings, regulatory decisions, and policy events for AI infrastructure stocks</description>
    <language>en-us</language>
    <atom:link href="${BASE_URL}/catalysts/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`);
    } catch (error) {
      console.error("Catalysts RSS error:", error);
      res.status(500).send("Error generating RSS feed");
    }
  });

  app.get("/news/rss.xml", async (_req, res) => {
    try {
      const items = newsCache?.items || [];
      const rssItems = items.map((n) => `    <item>
      <title>${escapeXml(n.headline)}</title>
      <link>${escapeXml(n.url)}</link>
      <description>${escapeXml(n.headline)} via ${escapeXml(n.source)}</description>
      <pubDate>${new Date(n.publishedAt).toUTCString()}</pubDate>
      <source url="${escapeXml(n.url)}">${escapeXml(n.source)}</source>
      <guid>${escapeXml(n.url)}</guid>
    </item>`).join("\n");

      res.set("Content-Type", "application/rss+xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>GridTilt AI Infrastructure News</title>
    <link>${BASE_URL}</link>
    <description>Curated news feed for AI power infrastructure and data center developments</description>
    <language>en-us</language>
    <atom:link href="${BASE_URL}/news/rss.xml" rel="self" type="application/rss+xml" />
${rssItems}
  </channel>
</rss>`);
    } catch (error) {
      console.error("News RSS error:", error);
      res.status(500).send("Error generating RSS feed");
    }
  });

  // ─── Stock Data API (for programmatic pages) ───────────────────────────
  app.get("/api/stock/:ticker", async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const companyInfo = COMPANY_DATABASE[ticker];
    if (!companyInfo) {
      return res.status(404).json({ error: "Ticker not found" });
    }

    let layerKey = "";
    for (const [key, tickers] of Object.entries(STACK_TICKERS)) {
      if (tickers.includes(ticker)) {
        layerKey = key;
        break;
      }
    }

    const cached = stackCache["1D"];
    // stackCache stores a flat { TICKER: stockObject } dict.
    const stockData: any = cached?.data?.[ticker] ?? null;

    const sectorStocks = layerKey ? STACK_TICKERS[layerKey as keyof typeof STACK_TICKERS] : [];
    const relatedTickers = sectorStocks.filter((t) => t !== ticker).slice(0, 6);

    const catalystsPath = join(process.cwd(), "server", "data", "catalysts.json");
    let relatedCatalysts: any[] = [];
    try {
      const raw = readFileSync(catalystsPath, "utf-8");
      relatedCatalysts = JSON.parse(raw)
        .filter((c: any) => c.tickers?.includes(ticker))
        .slice(0, 5);
    } catch {}

    const score = computeThesisScore(companyInfo);

    res.json({
      ticker,
      name: companyInfo.name,
      primarySegment: companyInfo.primarySegment,
      sectors: companyInfo.sectors,
      explanation: companyInfo.explanation,
      thesisScore: score,
      layerKey,
      stockData,
      relatedTickers,
      relatedCatalysts,
    });
  });

  // ─── Sector/Region/Operator metadata endpoints ─────────────────────────
  app.get("/api/sectors", (_req, res) => {
    const sectorLabels: Record<string, string> = {
      compute: "Compute", nuclear: "Nuclear Power", uranium: "Uranium & Fuel Cycle",
      powerHardware: "Power Hardware", utilities: "Utilities", dataCenters: "Data Center REITs",
      construction: "Construction & EPC", etfsBenchmarks: "ETF Benchmarks",
    };
    const sectors = Object.entries(STACK_TICKERS).map(([key, tickers]) => ({
      key,
      name: sectorLabels[key] || key,
      tickerCount: tickers.length,
      tickers,
    }));
    res.json(sectors);
  });

  // ─── Blog API ────────────────────────────────────────────────────────
  app.get("/api/blog", (_req, res) => {
    try {
      const filePath = join(process.cwd(), "content", "blog", "articles.json");
      const raw = readFileSync(filePath, "utf-8");
      const articles = JSON.parse(raw).map((a: any) => ({
        slug: a.slug,
        title: a.title,
        description: a.description,
        date: a.date,
        keywords: a.keywords,
      }));
      articles.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      res.json(articles);
    } catch (error) {
      console.error("Blog index error:", error);
      res.json([]);
    }
  });

  app.get("/api/blog/:slug", (req, res) => {
    try {
      const filePath = join(process.cwd(), "content", "blog", "articles.json");
      const raw = readFileSync(filePath, "utf-8");
      const articles = JSON.parse(raw);
      const article = articles.find((a: any) => a.slug === req.params.slug);
      if (!article) {
        return res.status(404).json({ error: "Article not found" });
      }
      res.json(article);
    } catch (error) {
      console.error("Blog post error:", error);
      res.status(500).json({ error: "Failed to load article" });
    }
  });

  // ─── Compute Frontier: AI supercluster tracker ──────────────────────────
  // Thin wrappers over the pure server/clusters.ts module. The dataset is read
  // at request time (same pattern as every other dataset). The power-needed-
  // vs-power-secured join lives here because it is the only place that reads
  // two datasets (clusters + the tracked nuclear-for-AI deals).
  const CLUSTERS_FILE = join(process.cwd(), "server", "data", "clusters.json");

  function readClusterRoot(): { clusters: any[]; lastRefreshed?: string } {
    return JSON.parse(readFileSync(CLUSTERS_FILE, "utf-8"));
  }

  // For each cluster with a linkedDeal, join to the tracked nuclear deal so the
  // page can compare planned compute power against the nuclear power secured.
  // Firmness is optional (older datasets omit it); we default to "tracked".
  function computePowerSecured(clusters: any[]) {
    let deals: any[] = [];
    try {
      const queuePath = join(process.cwd(), "server", "data", "interconnection-queue.json");
      deals = (JSON.parse(readFileSync(queuePath, "utf-8")).projects as any[]) ?? [];
    } catch {
      /* deals are optional; the cluster list still renders without them */
    }
    const dealById = new Map<string, any>(deals.map((d): [string, any] => [d.id, d]));
    const withDeal = clusters.filter((c) => c.linkedDeal);
    const byDeal = new Map<string, { id: string; projectName: string; capacityMW: number; firmness: string; clusterIds: string[] }>();
    for (const c of withDeal) {
      const d = dealById.get(c.linkedDeal);
      if (!d) continue;
      const entry =
        byDeal.get(d.id) ?? {
          id: d.id,
          projectName: d.projectName,
          capacityMW: d.capacityMW ?? 0,
          firmness: d.firmness ?? "tracked",
          clusterIds: [] as string[],
        };
      entry.clusterIds.push(c.id);
      byDeal.set(d.id, entry);
    }
    const dealList = Array.from(byDeal.values());
    return {
      clustersWithDeal: withDeal.length,
      plannedMWWithDeal: withDeal.reduce((a, c) => a + (c.plannedPowerMW || 0), 0),
      totalPlannedMW: clusters.reduce((a, c) => a + (c.plannedPowerMW || 0), 0),
      securedMW: dealList.reduce((a, d) => a + d.capacityMW, 0),
      signedSecuredMW: dealList.filter((d) => d.firmness === "signed").reduce((a, d) => a + d.capacityMW, 0),
      deals: dealList,
    };
  }

  app.get("/api/clusters", (_req, res) => {
    try {
      res.json(readClusterRoot().clusters ?? []);
    } catch (err) {
      console.error("Clusters read error:", err);
      res.status(500).json({ error: "Failed to load clusters" });
    }
  });

  // Registered before /:id so "metrics" is not captured as an id.
  app.get("/api/clusters/metrics", (_req, res) => {
    try {
      const root = readClusterRoot();
      const clusters = root.clusters ?? [];
      res.json({
        ...computeClusterMetrics(clusters as ClusterLite[]),
        powerSecured: computePowerSecured(clusters),
        lastRefreshed: root.lastRefreshed ?? null,
      });
    } catch (err) {
      console.error("Clusters metrics error:", err);
      res.status(500).json({ error: "Failed to compute cluster metrics" });
    }
  });

  app.get("/api/clusters/:id", (req, res) => {
    try {
      const cluster = (readClusterRoot().clusters ?? []).find((c) => c.id === req.params.id);
      if (!cluster) return res.status(404).json({ error: "Cluster not found" });
      res.json(cluster);
    } catch (err) {
      console.error("Cluster read error:", err);
      res.status(500).json({ error: "Failed to load cluster" });
    }
  });

  // ─── Neocloud Intel: GPU rental price index ─────────────────────────────
  // Thin wrappers over the pure server/gpu-index.ts module. The curated prices
  // carry sparse sourced anchors; the metrics endpoint records today's blended
  // price (once per day) so the chart accrues a real series going forward, then
  // merges anchors + recorded points to compute period changes.
  const GPU_PRICES_FILE = join(process.cwd(), "server", "data", "gpu-rental-prices.json");

  function readGpuRoot(): { models: any[]; lastRefreshed?: string; unit?: string; methodology?: string } {
    return JSON.parse(readFileSync(GPU_PRICES_FILE, "utf-8"));
  }

  function easternDay(): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  }

  app.get("/api/gpu-prices", (_req, res) => {
    try {
      res.json(readGpuRoot());
    } catch (err) {
      console.error("GPU prices read error:", err);
      res.status(500).json({ error: "Failed to load GPU prices" });
    }
  });

  // Live sweep guard: at most one in flight, retried on the next request
  // after a failure. Request-driven (not a timer) so it works on autoscale.
  let gpuLiveSweepInFlight = false;
  app.get("/api/gpu-prices/metrics", (_req, res) => {
    try {
      const root = readGpuRoot();
      const models = root.models ?? [];

      // First request of the Eastern day kicks off the live sweep in the
      // background; the response never waits on provider APIs.
      if (!hasTodayLiveSnapshot() && !gpuLiveSweepInFlight) {
        gpuLiveSweepInFlight = true;
        fetchLivePrices(models.map((m: any) => ({ model: m.model, currentUsdPerHr: m.currentUsdPerHr })))
          .then((live) => {
            recordDailyLivePrices(live);
            const n = Object.keys(live).length;
            if (n > 0) console.log(`gpu-live: recorded ${n} live model prices`);
          })
          .catch((e) => console.error("gpu-live sweep failed:", e))
          .finally(() => {
            gpuLiveSweepInFlight = false;
          });
      }

      // Fresh live observations (<=2 Eastern days old) are the served price;
      // the est. flag drops because the number is observed, not estimated.
      const live = latestLiveByModel();
      const served = models.map((m: any) => {
        const l = live[m.model];
        if (l && l.ageDays <= 2) {
          return {
            ...m,
            currentUsdPerHr: l.price,
            estimated: (m.estimated ?? []).filter((f: string) => f !== "currentUsdPerHr"),
            liveSources: l.sources,
            liveDate: l.date,
          };
        }
        return m;
      });

      const metrics = computeGpuIndex(served, easternDay(), recordedByModel());
      const rows = metrics.rows.map((r) => {
        const src = served.find((m: any) => m.model === r.model);
        return { ...r, liveSources: src?.liveSources ?? null, liveDate: src?.liveDate ?? null };
      });
      res.json({ ...metrics, rows, unit: root.unit ?? null, methodology: root.methodology ?? null, lastRefreshed: root.lastRefreshed ?? null });
    } catch (err) {
      console.error("GPU metrics error:", err);
      res.status(500).json({ error: "Failed to compute GPU index" });
    }
  });

  // AI power deals: corporate power procurement for AI, from the queue dataset.
  app.get("/api/deals/metrics", (_req, res) => {
    try {
      const filePath = join(process.cwd(), "server", "data", "interconnection-queue.json");
      const root = JSON.parse(readFileSync(filePath, "utf-8"));
      const metrics = computeDealMetrics((root.projects ?? []) as DealProject[]);
      res.json({ ...metrics, lastRefreshed: root.lastRefreshed ?? null });
    } catch (err) {
      console.error("Deals metrics error:", err);
      res.status(500).json({ error: "Failed to compute deals" });
    }
  });

  // GPU economics: rental cost over time + cost-per-compute + training presets.
  app.get("/api/gpu-economics", (_req, res) => {
    try {
      const root = readGpuRoot();
      const models = (root.models ?? []).map((m: any) => ({
        model: m.model,
        vendor: m.vendor,
        currentUsdPerHr: m.currentUsdPerHr,
        tflopsBf16: m.tflopsBf16 ?? 0,
      }));
      res.json({
        rows: computeGpuEconomics(models),
        trainingPresets: TRAINING_PRESETS,
        lastRefreshed: root.lastRefreshed ?? null,
      });
    } catch (err) {
      console.error("GPU economics error:", err);
      res.status(500).json({ error: "Failed to compute GPU economics" });
    }
  });

  // Weekly Buildout Brief: one synthesized read across every module.
  function buildBriefInput(): BriefInput {
    const cwd = process.cwd();
    const clustersRoot = JSON.parse(readFileSync(join(cwd, "server", "data", "clusters.json"), "utf-8"));
    const clusters = (clustersRoot.clusters ?? []) as ClusterLite[];
    const cm = computeClusterMetrics(clusters);
    const biggest = [...clusters].sort((a, b) => (b.plannedPowerMW ?? 0) - (a.plannedPowerMW ?? 0))[0] as any;

    const gpuRoot = readGpuRoot();
    const gi = computeGpuIndex(gpuRoot.models ?? [], easternDay());
    const byModel = Object.fromEntries(gi.rows.map((r) => [r.model, r]));
    const mover = gi.rows.filter((r) => r.changes.y1 != null).sort((a, b) => Math.abs(b.changes.y1 as number) - Math.abs(a.changes.y1 as number))[0];
    const cheapest = [...gi.rows].sort((a, b) => a.current - b.current)[0];

    const queueRoot = JSON.parse(readFileSync(join(cwd, "server", "data", "interconnection-queue.json"), "utf-8"));
    const qh = queueRoot.headline;
    const dm = computeDealMetrics((queueRoot.projects ?? []) as DealProject[]);

    const input: BriefInput = {
      asOf: easternDay(),
      compute: {
        clusterCount: cm.clusterCount,
        plannedGW: Math.round(cm.totalPlannedMW / 1000),
        operationalGW: Math.round(cm.operationalMW / 1000),
        operatorCount: cm.concentration.operatorCount,
        topOperator: cm.concentration.topOperator,
        topOperatorSharePct: cm.concentration.topOperatorPlannedShare * 100,
        biggestName: biggest ? String(biggest.name).replace(/\s*\([^)]*\)\s*$/, "").trim() : null,
        biggestGW: biggest ? (biggest.plannedPowerMW ?? 0) / 1000 : 0,
      },
      gpu: {
        fleetAvg: gi.fleetAvg,
        fleetAvg1yChange: gi.fleetAvg1yChange,
        h100: byModel.H100?.current ?? 0,
        gb200: byModel.GB200?.current ?? 0,
        moverModel: mover?.model ?? "A100",
        moverChangePct: (mover?.changes.y1 as number) ?? 0,
        cheapestModel: cheapest?.model ?? "A100",
        cheapestPrice: cheapest?.current ?? 0,
      },
      grid: { queueGW: qh.queueOverallGW, medianWaitMonths: qh.medianWaitMonths, ercotGW: qh.ercotLargeLoadGW },
      deals: {
        dealCount: dm.dealCount,
        contractedGW: +(dm.totalContractedMW / 1000).toFixed(1),
        topBuyer: dm.topBuyer,
        topBuyerGW: +((dm.byOfftaker[0]?.mw ?? 0) / 1000).toFixed(1),
        topType: dm.byType[0]?.key ?? null,
        topTypeGW: +((dm.byType[0]?.mw ?? 0) / 1000).toFixed(1),
      },
    };
    return input;
  }

  app.get("/api/brief", (_req, res) => {
    try {
      const brief = composeBrief(buildBriefInput());
      res.json({ ...brief, text: renderBriefText(brief) });
    } catch (err) {
      console.error("Brief error:", err);
      res.status(500).json({ error: "Failed to build brief" });
    }
  });

  return httpServer;
}

function computeThesisScore(company: { sectors: { Compute: number; Infrastructure: number; Power: number; Cooling: number; Grid: number } }): number {
  const { Compute, Infrastructure, Power, Cooling, Grid } = company.sectors;
  return Math.round((Compute * 0.25 + Infrastructure * 0.25 + Power * 0.2 + Cooling * 0.15 + Grid * 0.15));
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
