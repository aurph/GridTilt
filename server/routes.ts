import type { Express, Request } from "express";
import { type Server } from "http";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createHash, createHmac } from "crypto";
import RSSParser from "rss-parser";
import {
  BASE_URL,
  SITEMAP_STATIC_PAGES,
  SITEMAP_SECTOR_SLUGS,
  SITEMAP_REGION_SLUGS,
  SITEMAP_OPERATOR_SLUGS,
} from "./seo";

// Known company data for portfolio scoring
const COMPANY_DATABASE: Record<string, {
  name: string;
  primarySegment: string;
  sectors: { Compute: number; Infrastructure: number; Power: number; Cooling: number; Grid: number };
  explanation: string;
}> = {
  NVDA: { name: "NVIDIA Corporation", primarySegment: "Compute", sectors: { Compute: 95, Infrastructure: 20, Power: 10, Cooling: 15, Grid: 5 }, explanation: "NVIDIA's H100/B200 GPUs power virtually every major AI training cluster. Approximately 70% of datacenter revenue comes directly from AI workloads." },
  AMD: { name: "Advanced Micro Devices", primarySegment: "Compute", sectors: { Compute: 72, Infrastructure: 15, Power: 8, Cooling: 12, Grid: 5 }, explanation: "AMD's MI300X competes directly with NVIDIA in AI inference. Growing datacenter GPU business with significant AI exposure." },
  TSM: { name: "Taiwan Semiconductor Mfg", primarySegment: "Compute", sectors: { Compute: 88, Infrastructure: 15, Power: 12, Cooling: 18, Grid: 8 }, explanation: "TSMC manufactures virtually all advanced AI chips (NVDA, AMD, Apple, Google TPUs). The irreplaceable foundry at the base of the AI compute stack." },
  INTC: { name: "Intel Corporation", primarySegment: "Compute", sectors: { Compute: 45, Infrastructure: 20, Power: 5, Cooling: 10, Grid: 5 }, explanation: "Intel's Gaudi AI accelerators and Xeon datacenter CPUs provide moderate AI exposure, though NVDA dominates GPU training." },
  MU: { name: "Micron Technology", primarySegment: "Compute", sectors: { Compute: 60, Infrastructure: 15, Power: 5, Cooling: 8, Grid: 3 }, explanation: "High Bandwidth Memory (HBM) is critical for AI accelerators. Micron's HBM3E is a direct AI infrastructure play." },
  EQIX: { name: "Equinix Inc", primarySegment: "Infrastructure", sectors: { Compute: 15, Infrastructure: 97, Power: 30, Cooling: 45, Grid: 25 }, explanation: "World's largest colocation data center REIT. 100% of revenue tied to physical infrastructure that AI workloads run on." },
  DLR: { name: "Digital Realty Trust", primarySegment: "Infrastructure", sectors: { Compute: 10, Infrastructure: 95, Power: 28, Cooling: 42, Grid: 22 }, explanation: "Major datacenter REIT with hyperscaler-focused campuses. Growing power capacity agreements with AI cloud providers." },
  VRT: { name: "Vertiv Holdings", primarySegment: "Cooling", sectors: { Compute: 10, Infrastructure: 35, Power: 20, Cooling: 90, Grid: 30 }, explanation: "Critical datacenter thermal management and power infrastructure. Every AI datacenter needs Vertiv cooling and power systems. Fastest organic revenue growth in the sector." },
  IREN: { name: "IREN Limited", primarySegment: "Infrastructure", sectors: { Compute: 25, Infrastructure: 75, Power: 40, Cooling: 30, Grid: 20 }, explanation: "AI cloud and Bitcoin mining company pivoting to GPU-as-a-Service. Significant AI datacenter infrastructure buildout." },
  AMT: { name: "American Tower Corporation", primarySegment: "Infrastructure", sectors: { Compute: 5, Infrastructure: 45, Power: 15, Cooling: 10, Grid: 20 }, explanation: "Telecom tower REIT with edge data center exposure. Indirect AI beneficiary through edge compute infrastructure." },
  CEG: { name: "Constellation Energy", primarySegment: "Power", sectors: { Compute: 5, Infrastructure: 15, Power: 90, Cooling: 5, Grid: 35 }, explanation: "Largest US nuclear operator. Signed landmark deal to restart Three Mile Island for Microsoft. Pure-play nuclear renaissance stock." },
  VST: { name: "Vistra Corp", primarySegment: "Power", sectors: { Compute: 5, Infrastructure: 10, Power: 78, Cooling: 5, Grid: 30 }, explanation: "Largest competitive power generator in the US with nuclear and natural gas assets. Significant AI datacenter power supply exposure." },
  ETR: { name: "Entergy Corporation", primarySegment: "Power", sectors: { Compute: 3, Infrastructure: 10, Power: 65, Cooling: 5, Grid: 28 }, explanation: "Regional utility with nuclear fleet and growing datacenter power supply contracts in the Southeast US." },
  NEE: { name: "NextEra Energy", primarySegment: "Power", sectors: { Compute: 3, Infrastructure: 12, Power: 70, Cooling: 5, Grid: 40 }, explanation: "World's largest renewable energy company. Growing power purchase agreements with datacenter operators for dedicated capacity." },
  CCJ: { name: "Cameco Corporation", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 82, Cooling: 2, Grid: 15 }, explanation: "World's largest publicly-traded uranium miner. As nuclear demand grows for AI power, uranium supply tightens. Cameco has the highest direct uranium spot price beta of any large-cap." },
  NXE: { name: "NexGen Energy", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 78, Cooling: 2, Grid: 10 }, explanation: "Development-stage uranium miner holding the Rook I project in Saskatchewan's Athabasca Basin, the world's highest-grade uranium deposit. Speculative but high-upside nuclear renaissance play." },
  URA: { name: "Global X Uranium ETF", primarySegment: "Power", sectors: { Compute: 2, Infrastructure: 5, Power: 80, Cooling: 2, Grid: 12 }, explanation: "ETF holding uranium miners and nuclear equipment companies. Broad exposure to the nuclear renaissance driven by AI power demand." },
  MSFT: { name: "Microsoft Corporation", primarySegment: "Compute", sectors: { Compute: 65, Infrastructure: 40, Power: 25, Cooling: 20, Grid: 10 }, explanation: "Azure's AI cloud is a massive datacenter power consumer. Microsoft signed the Three Mile Island nuclear restart deal directly." },
  GOOGL: { name: "Alphabet Inc", primarySegment: "Compute", sectors: { Compute: 60, Infrastructure: 45, Power: 22, Cooling: 20, Grid: 12 }, explanation: "Google DeepMind and TPU infrastructure require enormous power. Google signed the first commercial SMR contract." },
  AMZN: { name: "Amazon.com Inc", primarySegment: "Infrastructure", sectors: { Compute: 55, Infrastructure: 50, Power: 20, Cooling: 18, Grid: 12 }, explanation: "AWS is the world's largest cloud provider. Amazon's AI capex is driving massive datacenter expansion across the US." },
  META: { name: "Meta Platforms Inc", primarySegment: "Compute", sectors: { Compute: 58, Infrastructure: 42, Power: 18, Cooling: 15, Grid: 10 }, explanation: "Meta's AI Llama models and recommendation systems run on massive custom datacenter infrastructure consuming approximately 4 GW globally." },
  AAPL: { name: "Apple Inc", primarySegment: "Compute", sectors: { Compute: 30, Infrastructure: 10, Power: 8, Cooling: 5, Grid: 3 }, explanation: "Apple Intelligence runs mostly on-device, reducing AI datacenter exposure. Limited direct power infrastructure play." },
  TSLA: { name: "Tesla Inc", primarySegment: "ETF", sectors: { Compute: 25, Infrastructure: 5, Power: 15, Cooling: 5, Grid: 45 }, explanation: "Tesla's Megapack energy storage is used in utility-scale projects including datacenter backup power. Dojo supercomputer is a compute play." },
  ETN: { name: "Eaton Corporation", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 20, Power: 20, Cooling: 35, Grid: 78 }, explanation: "Global leader in switchgear, transformers, and UPS systems connecting grid to data center rack. $9.5B Boyd Thermal acquisition for cooling. Running at maximum production capacity." },
  SMCI: { name: "Super Micro Computer", primarySegment: "Compute", sectors: { Compute: 82, Infrastructure: 30, Power: 8, Cooling: 45, Grid: 5 }, explanation: "AI server manufacturer. Builds the rack-scale systems that house NVIDIA GPUs. Direct datacenter compute infrastructure play." },
  SPY: { name: "SPDR S&P 500 ETF", primarySegment: "ETF", sectors: { Compute: 25, Infrastructure: 15, Power: 12, Cooling: 10, Grid: 10 }, explanation: "Broad market ETF. AI power exposure comes from NVDA, MSFT, AMZN, GOOGL weightings (~30% combined). Diversified play." },
  QQQ: { name: "Invesco QQQ Trust", primarySegment: "ETF", sectors: { Compute: 45, Infrastructure: 20, Power: 10, Cooling: 12, Grid: 8 }, explanation: "Nasdaq-100 ETF with approximately 50% in mega-cap tech. Heavy AI/compute exposure through NVDA, MSFT, AMZN, GOOGL, META." },
  XLU: { name: "Utilities Select SPDR ETF", primarySegment: "ETF", sectors: { Compute: 2, Infrastructure: 5, Power: 72, Cooling: 3, Grid: 40 }, explanation: "Utility sector ETF. Growing AI tailwind as datacenters sign long-term power purchase agreements with utilities." },
  XLK: { name: "Technology Select SPDR ETF", primarySegment: "ETF", sectors: { Compute: 70, Infrastructure: 25, Power: 8, Cooling: 12, Grid: 5 }, explanation: "Technology sector ETF. High AI exposure through semiconductor and cloud infrastructure holdings." },
  // Nuclear Operators & Generators
  TLN:  { name: "Talen Energy Corporation", primarySegment: "Nuclear", sectors: { Compute: 8, Infrastructure: 12, Power: 88, Cooling: 3, Grid: 32 }, explanation: "Susquehanna nuclear plant + direct Amazon/AWS behind-the-meter co-location deal. One of the clearest structural AI power beneficiaries in the sector." },
  NRG:  { name: "NRG Energy Inc", primarySegment: "Nuclear", sectors: { Compute: 4, Infrastructure: 8, Power: 70, Cooling: 3, Grid: 28 }, explanation: "Diversified competitive power generator with nuclear fleet. Growing data center power contracts as hyperscalers seek dedicated dispatchable capacity." },
  // Uranium Mining & Fuel Cycle
  UEC:  { name: "Uranium Energy Corp", primarySegment: "Uranium", sectors: { Compute: 2, Infrastructure: 3, Power: 80, Cooling: 2, Grid: 8 }, explanation: "US-focused uranium miner using in-situ recovery (ISR) production. Hub-and-spoke model positions it as a low-cost domestic uranium supplier for the nuclear renaissance." },
  LEU:  { name: "Centrus Energy Corp", primarySegment: "Uranium", sectors: { Compute: 3, Infrastructure: 5, Power: 88, Cooling: 2, Grid: 12 }, explanation: "Only US company licensed to produce HALEU (High-Assay Low-Enriched Uranium) for advanced reactors and SMRs. A critical chokepoint in the domestic nuclear fuel cycle." },
  UUUU: { name: "Energy Fuels Inc", primarySegment: "Uranium", sectors: { Compute: 2, Infrastructure: 3, Power: 78, Cooling: 2, Grid: 8 }, explanation: "US uranium and rare earth producer. White Mesa Mill is the only operating conventional uranium mill in the US. Domestic supply chain play for nuclear renaissance." },
  DNN:  { name: "Denison Mines Corp", primarySegment: "Uranium", sectors: { Compute: 2, Infrastructure: 3, Power: 75, Cooling: 2, Grid: 8 }, explanation: "Canadian uranium developer with Wheeler River project in the Athabasca Basin. In-situ recovery technology could make it one of the lowest-cost uranium producers globally." },
  PALAF:{ name: "Paladin Energy Ltd", primarySegment: "Uranium", sectors: { Compute: 2, Infrastructure: 3, Power: 76, Cooling: 2, Grid: 8 }, explanation: "Australian uranium producer. Langer Heinrich mine in Namibia restarted production in 2024 after a 7-year care-and-maintenance period, adding new supply to a tight market." },
  // SMR & Advanced Nuclear
  OKLO: { name: "Oklo Inc", primarySegment: "SMR", sectors: { Compute: 10, Infrastructure: 18, Power: 90, Cooling: 5, Grid: 35 }, explanation: "14 GW customer pipeline, primarily hyperscalers and data centers. Sam Altman-backed advanced fission company. Received FERC approval for Aurora powerhouse design." },
  BWXT: { name: "BWX Technologies Inc", primarySegment: "SMR", sectors: { Compute: 5, Infrastructure: 10, Power: 82, Cooling: 5, Grid: 25 }, explanation: "Sole manufacturer of US naval nuclear reactors. $7.4B backlog. Critical nuclear manufacturing infrastructure with expanding commercial SMR business." },
  SMR:  { name: "NuScale Power Corp", primarySegment: "SMR", sectors: { Compute: 8, Infrastructure: 12, Power: 88, Cooling: 5, Grid: 30 }, explanation: "Only NRC-certified small modular reactor design in the US. VOYGR SMR plant expected ~2030. Expanding internationally with European utility partnerships." },
  // Power Hardware & Electrical Equipment
  GEV:  { name: "GE Vernova Inc", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 12, Power: 38, Cooling: 8, Grid: 88 }, explanation: "Gas turbines are the leading indicator of data center buildout pace. $200B projected backlog by 2028. BWRX-300 SMR development adds nuclear optionality. $41-42B revenue guidance for 2026." },
  NVT:  { name: "nVent Electric PLC", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 22, Power: 18, Cooling: 75, Grid: 65 }, explanation: "High-density power distribution and enclosures for AI GPU workloads. 65% organic order growth from liquid cooling products. Direct picks-and-shovels play on AI rack density." },
  CARR: { name: "Carrier Global Corp", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 15, Power: 10, Cooling: 70, Grid: 20 }, explanation: "Data center cooling systems. Building HVAC and precision cooling crossover business. Meaningful exposure to the thermal management challenge of high-density AI compute clusters." },
  ABB:  { name: "ABB Ltd", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 18, Power: 22, Cooling: 25, Grid: 80 }, explanation: "Global power distribution, automation, and electrification leader. Major data center power supplier. Grid automation and switchgear positioned for the AI-driven capex cycle." },
  EMR:  { name: "Emerson Electric Co", primarySegment: "PowerHardware", sectors: { Compute: 5, Infrastructure: 18, Power: 15, Cooling: 30, Grid: 60 }, explanation: "Automation and power management systems for data centers. AspenTech software embedded in critical energy infrastructure. Industrial automation exposure to the AI buildout." },
  HUBB: { name: "Hubbell Inc", primarySegment: "PowerHardware", sectors: { Compute: 3, Infrastructure: 12, Power: 15, Cooling: 10, Grid: 72 }, explanation: "Electrical products for utility and commercial markets. Grid modernization beneficiary as transmission infrastructure must be expanded to serve new data center campuses." },
  JCI:  { name: "Johnson Controls Int'l", primarySegment: "PowerHardware", sectors: { Compute: 3, Infrastructure: 12, Power: 8, Cooling: 65, Grid: 30 }, explanation: "Building automation and HVAC including data center cooling. Thermal management solutions for the AI era. Exposed to the retrofit market as existing facilities upgrade for AI density." },
  SIEGY:{ name: "Siemens Energy AG", primarySegment: "PowerHardware", sectors: { Compute: 4, Infrastructure: 10, Power: 32, Cooling: 8, Grid: 82 }, explanation: "Gas turbines competing with GE Vernova for data center power generation orders. Transformer shortages have made Siemens Energy a critical bottleneck and beneficiary of grid expansion." },
  BKR:  { name: "Baker Hughes Co", primarySegment: "PowerHardware", sectors: { Compute: 3, Infrastructure: 8, Power: 30, Cooling: 5, Grid: 55 }, explanation: "Gas turbine technology and LNG equipment. Industrial Energy Technology segment growing as data center operators seek efficient on-site gas generation and backup power solutions." },
  // Utilities (AI Load Beneficiaries)
  D:    { name: "Dominion Energy Inc", primarySegment: "Utilities", sectors: { Compute: 5, Infrastructure: 15, Power: 78, Cooling: 5, Grid: 42 }, explanation: "Serves Northern Virginia, home to 70% of global internet traffic. 40-47 GW of data center capacity in active contract discussions. $50B capex plan for AI-driven load growth." },
  SO:   { name: "Southern Company", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 12, Power: 72, Cooling: 4, Grid: 38 }, explanation: "Georgia is the epicenter of data center growth in the Southeast. 50+ GW interconnection pipeline. Vogtle nuclear units 3 and 4 provide 24/7 baseload for hyperscaler commitments." },
  DUK:  { name: "Duke Energy Corp", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 10, Power: 70, Cooling: 4, Grid: 36 }, explanation: "Carolinas and Southeast utility with growing data center interconnection requests. Multi-GW pipeline from technology companies seeking clean, reliable power in the research triangle." },
  AEP:  { name: "American Electric Power", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 10, Power: 68, Cooling: 4, Grid: 42 }, explanation: "Major PJM utility. Transmission infrastructure investment is critical for connecting new data center campuses to the grid. 40 GW of new interconnection requests filed in its territory." },
  XEL:  { name: "Xcel Energy Inc", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 8, Power: 65, Cooling: 3, Grid: 35 }, explanation: "Midwest utility with growing data center load growth in Minnesota and Colorado. Microsoft and Google have targeted its service territory for clean power agreements." },
  EVRG: { name: "Evergy Inc", primarySegment: "Utilities", sectors: { Compute: 2, Infrastructure: 7, Power: 62, Cooling: 3, Grid: 30 }, explanation: "Kansas and Missouri utility seeing increased data center interest from Meta and Google. Favorable land and power costs making its territory an emerging second-tier data center market." },
  PPL:  { name: "PPL Corporation", primarySegment: "Utilities", sectors: { Compute: 2, Infrastructure: 8, Power: 60, Cooling: 3, Grid: 30 }, explanation: "Mid-Atlantic and Kentucky utility with PJM exposure. High-voltage transmission assets and data center proximity in Pennsylvania and Kentucky service territories." },
  PCG:  { name: "PG&E Corp", primarySegment: "Utilities", sectors: { Compute: 3, Infrastructure: 10, Power: 65, Cooling: 4, Grid: 35 }, explanation: "California utility serving Silicon Valley data center campuses. Grid modernization and reliability investments required to support hyperscaler load growth in the Bay Area." },
  // Construction & EPC (Infrastructure Builders)
  PWR:  { name: "Quanta Services Inc", primarySegment: "Construction", sectors: { Compute: 5, Infrastructure: 28, Power: 12, Cooling: 8, Grid: 88 }, explanation: "Largest electrical utility contractor in North America. Building the transmission lines and substations connecting data center campuses to the grid. Best-in-class backlog growth." },
  EME:  { name: "EMCOR Group Inc", primarySegment: "Construction", sectors: { Compute: 5, Infrastructure: 35, Power: 10, Cooling: 38, Grid: 65 }, explanation: "Electrical and mechanical infrastructure for data centers. $4.3B RPO in network and communications segment. Record backlog driven by AI data center construction." },
  MTZ:  { name: "MasTec Inc", primarySegment: "Construction", sectors: { Compute: 3, Infrastructure: 25, Power: 10, Cooling: 12, Grid: 70 }, explanation: "Infrastructure construction with rapidly growing data center revenue. EPS growth approximately 30%. Builds the electrical infrastructure backbone connecting AI facilities to the grid." },
  STRL: { name: "Sterling Infrastructure Inc", primarySegment: "Construction", sectors: { Compute: 5, Infrastructure: 30, Power: 8, Cooling: 10, Grid: 60 }, explanation: "Data center site development with 125% YoY revenue growth from data center segment. Builds the physical foundations and civil infrastructure for hyperscaler campuses." },
  FLR:  { name: "Fluor Corporation", primarySegment: "Construction", sectors: { Compute: 3, Infrastructure: 20, Power: 15, Cooling: 8, Grid: 55 }, explanation: "Engineering and construction for energy and infrastructure projects. AI-era buildout of power generation and grid infrastructure plays to core competencies." },
  PRIM: { name: "Primoris Services Corp", primarySegment: "Construction", sectors: { Compute: 2, Infrastructure: 18, Power: 10, Cooling: 5, Grid: 68 }, explanation: "Utility infrastructure and power delivery services. Growing exposure to grid expansion and transmission projects required to serve new data center loads." },
  // Sector ETFs (Benchmarks)
  URNM: { name: "Sprott Uranium Miners ETF", primarySegment: "ETF", sectors: { Compute: 2, Infrastructure: 3, Power: 82, Cooling: 2, Grid: 10 }, explanation: "Pure-play uranium miners ETF. Tracks the uranium mining sector with no dilution from utilities or nuclear equipment makers. High-beta uranium thesis exposure." },
  DTCR: { name: "Global X Data Center ETF", primarySegment: "ETF", sectors: { Compute: 15, Infrastructure: 85, Power: 25, Cooling: 35, Grid: 22 }, explanation: "Data center and digital infrastructure ETF. Tracks REITs, operators, and technology companies building or relying on data center infrastructure globally." },
  GRID: { name: "First Trust Nasdaq Smart Grid ETF", primarySegment: "ETF", sectors: { Compute: 3, Infrastructure: 15, Power: 22, Cooling: 5, Grid: 85 }, explanation: "Grid infrastructure ETF tracking companies enabling the smart grid. Includes grid hardware, software, and utility companies modernizing electrical infrastructure for AI demand." },
  PAVE: { name: "Global X US Infrastructure ETF", primarySegment: "ETF", sectors: { Compute: 3, Infrastructure: 30, Power: 12, Cooling: 8, Grid: 60 }, explanation: "US infrastructure development ETF. Tracks construction, engineering, and materials companies benefiting from data center and grid infrastructure buildout." },
  // Raw Materials - Mining & Metals
  FCX:  { name: "Freeport-McMoRan Inc", primarySegment: "RawMaterials", sectors: { Compute: 3, Infrastructure: 10, Power: 8, Cooling: 5, Grid: 45 }, explanation: "World's largest publicly traded copper producer. Copper is the essential conductor in every data center power distribution system, transformer, and grid interconnection." },
  SCCO: { name: "Southern Copper Corp", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 8, Power: 7, Cooling: 4, Grid: 42 }, explanation: "Major copper miner with operations in Mexico and Peru. Growing copper demand from data center electrification and grid expansion is a structural tailwind." },
  TECK: { name: "Teck Resources Ltd", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 8, Power: 6, Cooling: 3, Grid: 38 }, explanation: "Diversified miner transitioning to a pure-play copper producer after selling coal assets. Copper exposure aligned with AI-driven grid buildout." },
  HBM:  { name: "Hudbay Minerals Inc", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 6, Power: 5, Cooling: 3, Grid: 35 }, explanation: "Mid-tier copper and gold miner with operations in Peru, Manitoba, and Arizona. Copper Flat expansion adds supply into a tightening copper market." },
  NUE:  { name: "Nucor Corporation", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 25, Power: 5, Cooling: 3, Grid: 30 }, explanation: "Largest steel producer in North America using electric arc furnaces. Data center construction requires massive structural steel for campus buildings and rack infrastructure." },
  STLD: { name: "Steel Dynamics Inc", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 22, Power: 4, Cooling: 3, Grid: 28 }, explanation: "Electric arc furnace steelmaker with growing exposure to data center construction demand. Structural steel and rebar volumes benefit from hyperscaler campus buildout." },
  CLF:  { name: "Cleveland-Cliffs Inc", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 20, Power: 4, Cooling: 3, Grid: 25 }, explanation: "Largest flat-rolled steel producer in North America. Supplies steel for data center shells, grid infrastructure, and transmission tower construction." },
  X:    { name: "United States Steel Corp", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 18, Power: 4, Cooling: 3, Grid: 24 }, explanation: "Integrated steel producer with plate and structural steel products used in data center construction and grid infrastructure projects." },
  MP:   { name: "MP Materials Corp", primarySegment: "RawMaterials", sectors: { Compute: 5, Infrastructure: 8, Power: 10, Cooling: 3, Grid: 20 }, explanation: "Only integrated rare earth mining and processing operation in the Western Hemisphere. Rare earths are critical for permanent magnets in wind turbines and EV motors supporting the energy transition." },
  BHP:  { name: "BHP Group Ltd", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 12, Power: 8, Cooling: 3, Grid: 40 }, explanation: "World's largest mining company by market cap. Major copper producer with growing exposure to electrification and grid expansion demand from AI data center buildout." },
  RIO:  { name: "Rio Tinto Group", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 12, Power: 7, Cooling: 3, Grid: 38 }, explanation: "Global mining giant with significant copper and aluminum production. Both metals are essential for electrical infrastructure serving data center campuses." },
  VALE: { name: "Vale S.A.", primarySegment: "RawMaterials", sectors: { Compute: 2, Infrastructure: 10, Power: 6, Cooling: 3, Grid: 35 }, explanation: "World's largest nickel producer and major copper producer. Nickel is critical for battery storage systems providing backup power at data center facilities." },
  COPX: { name: "Global X Copper Miners ETF", primarySegment: "ETF", sectors: { Compute: 2, Infrastructure: 8, Power: 6, Cooling: 3, Grid: 42 }, explanation: "ETF tracking copper mining companies globally. Pure-play exposure to rising copper demand from data center electrification and grid modernization." },
  // Raw Materials - Natural Gas
  AR:   { name: "Antero Resources Corp", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 5, Power: 55, Cooling: 2, Grid: 15 }, explanation: "Appalachian natural gas producer. Gas-fired generation is the bridge fuel for data center power as nuclear and renewables scale. Growing Marcellus/Utica production." },
  EQT:  { name: "EQT Corporation", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 5, Power: 58, Cooling: 2, Grid: 18 }, explanation: "Largest natural gas producer in the United States. Data center operators are signing long-term gas supply agreements to ensure reliable power generation capacity." },
  RRC:  { name: "Range Resources Corp", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 5, Power: 52, Cooling: 2, Grid: 14 }, explanation: "Appalachian natural gas and NGL producer. Benefits from rising gas demand for data center power generation in PJM and Southeast markets." },
  SWN:  { name: "Southwestern Energy Co", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 5, Power: 50, Cooling: 2, Grid: 14 }, explanation: "Natural gas producer focused on Appalachia and Haynesville. Gas demand growth from data center power generation is a structural demand tailwind." },
  LNG:  { name: "Cheniere Energy Inc", primarySegment: "NatGas", sectors: { Compute: 2, Infrastructure: 8, Power: 48, Cooling: 2, Grid: 20 }, explanation: "Largest US LNG exporter. While primarily an export play, domestic gas price support from LNG demand indirectly benefits gas-fired data center power economics." },
  // Renewable Generation
  FSLR: { name: "First Solar Inc", primarySegment: "Renewables", sectors: { Compute: 3, Infrastructure: 12, Power: 65, Cooling: 3, Grid: 30 }, explanation: "Largest US solar panel manufacturer. Hyperscalers are signing massive solar PPAs to meet clean energy commitments for data center operations." },
  ENPH: { name: "Enphase Energy Inc", primarySegment: "Renewables", sectors: { Compute: 3, Infrastructure: 8, Power: 55, Cooling: 3, Grid: 25 }, explanation: "Microinverter technology for solar installations. Distributed generation complements utility-scale solar supporting data center renewable energy targets." },
  SEDG: { name: "SolarEdge Technologies", primarySegment: "Renewables", sectors: { Compute: 3, Infrastructure: 8, Power: 52, Cooling: 3, Grid: 22 }, explanation: "Solar inverter and power optimizer manufacturer. Enabling distributed solar generation that feeds into grids increasingly strained by data center load growth." },
  AES:  { name: "AES Corporation", primarySegment: "Renewables", sectors: { Compute: 3, Infrastructure: 15, Power: 68, Cooling: 4, Grid: 35 }, explanation: "Global power company with a large renewable energy portfolio. Signed multi-GW renewable PPAs with hyperscalers including Google and Microsoft for data center power." },
  // Transmission & Grid Hardware
  WIRE: { name: "Encore Wire Corp", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 15, Power: 10, Cooling: 3, Grid: 72 }, explanation: "Copper and aluminum wire manufacturer. Every data center requires extensive copper wiring for power distribution from grid interconnection to server rack." },
  GNRC: { name: "Generac Holdings Inc", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 12, Power: 20, Cooling: 3, Grid: 55 }, explanation: "Backup power generator manufacturer. Data centers require redundant backup power systems and Generac's commercial/industrial segment is growing from DC demand." },
  AYI:  { name: "Acuity Brands Inc", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 10, Power: 5, Cooling: 3, Grid: 45 }, explanation: "Intelligent lighting and building management systems. Data center facilities require advanced lighting controls and electrical infrastructure management." },
  AOS:  { name: "A.O. Smith Corporation", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 8, Power: 8, Cooling: 35, Grid: 30 }, explanation: "Water heating and treatment technology. Data center cooling systems increasingly rely on water-based thermal management including evaporative cooling and water treatment." },
  IDA:  { name: "IDACORP Inc", primarySegment: "TransmissionGrid", sectors: { Compute: 2, Infrastructure: 10, Power: 60, Cooling: 3, Grid: 45 }, explanation: "Idaho utility with significant hydroelectric generation. Meta and other hyperscalers have targeted Idaho for data centers due to low-cost, clean hydroelectric power." },
  // Crypto/AI DC Operators
  CLSK: { name: "CleanSpark Inc", primarySegment: "CryptoAIDC", sectors: { Compute: 20, Infrastructure: 60, Power: 35, Cooling: 25, Grid: 15 }, explanation: "Bitcoin miner with growing data center infrastructure. Pivoting excess power and facility capacity toward AI/HPC hosting as GPU demand outstrips crypto mining economics." },
  MARA: { name: "MARA Holdings Inc", primarySegment: "CryptoAIDC", sectors: { Compute: 18, Infrastructure: 55, Power: 30, Cooling: 22, Grid: 12 }, explanation: "Largest publicly traded Bitcoin miner by hash rate. Exploring AI/HPC hosting to monetize data center infrastructure and power contracts beyond cryptocurrency mining." },
  // Additional Compute (AI Networking & Servers)
  AVGO: { name: "Broadcom Inc", primarySegment: "Compute", sectors: { Compute: 75, Infrastructure: 20, Power: 8, Cooling: 10, Grid: 5 }, explanation: "Custom AI accelerators (TPU for Google, proprietary ASICs) and dominant networking silicon (Memory fabric, PCIe switches). Critical to data center interconnect at scale." },
  DELL: { name: "Dell Technologies Inc", primarySegment: "Compute", sectors: { Compute: 55, Infrastructure: 35, Power: 8, Cooling: 15, Grid: 5 }, explanation: "Enterprise server and storage manufacturer with PowerEdge AI server line. Growing AI infrastructure revenue as enterprises build private AI compute capacity." },
  ANET: { name: "Arista Networks Inc", primarySegment: "Compute", sectors: { Compute: 40, Infrastructure: 30, Power: 5, Cooling: 8, Grid: 5 }, explanation: "Data center networking switches and software. Every AI training cluster requires high-bandwidth, low-latency networking. Arista dominates cloud titan network deployments." },
  MRVL: { name: "Marvell Technology Inc", primarySegment: "Compute", sectors: { Compute: 65, Infrastructure: 18, Power: 5, Cooling: 8, Grid: 5 }, explanation: "Custom AI accelerator and data center networking silicon. Electro-optics and custom compute for hyperscaler AI infrastructure deployments." },
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

// Generate realistic sparkline data
function generateSparkline(basePrice: number, volatility: number = 0.02, points: number = 30): number[] {
  const data: number[] = [basePrice];
  for (let i = 1; i < points; i++) {
    const change = data[i - 1] * (1 + (Math.random() - 0.5) * volatility * 2);
    data.push(parseFloat(change.toFixed(2)));
  }
  return data;
}

function sparklineParamsForTimeframe(tf: string): { points: number; volatility: number } {
  if (tf === "5D") return { points: 30, volatility: 0.025 };
  if (tf === "1M") return { points: 60, volatility: 0.035 };
  return { points: 20, volatility: 0.015 }; // 1D default
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

// Nuclear Renaissance Index (NRI) - Jan 1, 2024 base prices
// Jan 1, 2024 is the anchor date: narrative around AI baseload demand started accelerating.
// All prices are closing prices circa Jan 2, 2024 (first trading day 2024).
const NRI_BASE = {
  CEG: 146.00,       // CEG ~$143-148 range, pre-AI PPA narrative acceleration
  VST: 28.50,        // VST ~$25-32 range, pre-AI merchant power premium
  CCJ: 47.50,        // CCJ ~$46-49, pre-2024 uranium spot spike to $107
  NLR: 68.00,        // VanEck Uranium+Nuclear ETF, early-Jan 2024 baseline
  URANIUM_SPOT: 91.00,  // U3O8 spot ~$90-95/lb in Jan 2024 (pre-Feb 2024 spike to $107)
};

// SMR & PPA policy score (1-10 qualitative, updated periodically)
// Current: 7.8 - NRC Kairos/Oklo approvals, Microsoft TMI restart PPA, Amazon/Talen Virginia nuclear PPA,
// Google advanced nuclear PPAs, several state-level nuclear support legislation packages.
const SMR_POLICY_SCORE = 7.8;

// Current U3O8 uranium spot price $/lb (updated March 2026)
// Spot rallied back to ~$101.50/lb in Jan/Feb 2026 before pulling back; currently ~$92/lb as of early Mar 2026.
// This is now ABOVE the Jan 2024 base of $91/lb, reversing the prior drawdown.
const URANIUM_SPOT_CURRENT = 92.0;

function getStockData(tickers: string[]) {
  return tickers.map((ticker) => {
    const data = STATIC_MARKET_DATA[ticker] ?? {
      name: `${ticker}`,
      price: 50 + Math.random() * 200,
      change: (Math.random() - 0.4) * 5,
      changePercent: (Math.random() - 0.4) * 4,
      pe: null,
      revenueGrowth: null,
    };
    return {
      ticker,
      name: data.name,
      price: data.price,
      change: data.change,
      changePercent: data.changePercent,
      pe: data.pe,
      revenueGrowth: data.revenueGrowth,
      sparkline: generateSparkline(data.price),
      powerMW: (data as any).powerMW,
      vs_sp500: (data as any).vs_sp500,
      marketCapDisplay: (data as any).marketCapDisplay,
    };
  });
}

// Generate scatter data with a target Pearson r using the standard linear noise model:
//   y = r * x_std + sqrt(1 - r^2) * noise_std  (both in z-score space, then rescale)
function gaussianRandom(): number {
  // Box-Muller
  const u1 = Math.random() || 1e-10;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// CCJ (Cameco): pure uranium miner - tight beta to U3O8 spot, target r ~ 0.82
// Uranium spot range approx $65-$110 over 52-week scatter; CCJ approx $90-$135 (Mar 2026 price ~$113)
function generateCCJCorrelationData() {
  const data = [];
  const targetR = 0.82;
  const sqrtTerm = Math.sqrt(1 - targetR * targetR);
  for (let i = 0; i < 52; i++) {
    const x = gaussianRandom(); // shared factor (uranium direction)
    const e = gaussianRandom(); // idiosyncratic noise
    const uStd = x;
    const cStd = targetR * x + sqrtTerm * e;
    // Rescale: uranium mean=86, sd=11; ccj mean=112, sd=11 (2025-2026 price ranges)
    const uranium = parseFloat((86 + uStd * 11).toFixed(2));
    const ccj = parseFloat((112 + cStd * 11).toFixed(2));
    data.push({
      uranium: Math.max(60, Math.min(115, uranium)),
      ccj: Math.max(82, Math.min(148, ccj))
    });
  }
  return data;
}

// CEG (Constellation Energy): nuclear utility - looser uranium beta, target r ~ 0.65
// CEG influenced by electricity contracts, capex, and macro beyond uranium spot (Mar 2026 price ~$315)
function generateCEGCorrelationData() {
  const data = [];
  const targetR = 0.65;
  const sqrtTerm = Math.sqrt(1 - targetR * targetR);
  for (let i = 0; i < 52; i++) {
    const x = gaussianRandom();
    const e = gaussianRandom();
    const uStd = x;
    const cStd = targetR * x + sqrtTerm * e;
    // Rescale: uranium mean=86, sd=11; ceg mean=310, sd=60 (2025-2026 price ranges)
    const uranium = parseFloat((86 + uStd * 11).toFixed(2));
    const ceg = parseFloat((310 + cStd * 60).toFixed(2));
    data.push({
      uranium: Math.max(60, Math.min(115, uranium)),
      ceg: Math.max(160, Math.min(470, ceg))
    });
  }
  return data;
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

// ─── News cache (1-hour TTL) ────────────────────────────────────────────────
interface NewsItem { headline: string; source: string; url: string; publishedAt: string; }
let newsCache: { items: NewsItem[]; timestamp: number } | null = null;
const EARNINGS_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
let earningsCache: { items: any[]; timestamp: number } | null = null;
const NEWS_CACHE_TTL = 60 * 60 * 1000; // 1 hour - safe for RSS and NewsData.io

// RSS feeds: AI infrastructure, power grid, nuclear, datacenters
const RSS_FEEDS: Array<{ url: string; sourceName: string }> = [
  { url: "https://www.utilitydive.com/feeds/news/", sourceName: "Utility Dive" },
  { url: "https://www.datacenterdynamics.com/en/rss/", sourceName: "Data Center Dynamics" },
  { url: "https://www.world-nuclear-news.org/rss", sourceName: "World Nuclear News" },
  { url: "https://www.power-eng.com/feed/", sourceName: "Power Engineering" },
  { url: "https://nuclearenergynow.org/feed/", sourceName: "Nuclear Energy Now" },
];

async function fetchRSSNews(): Promise<NewsItem[]> {
  const parser = new RSSParser({ timeout: 8000 });
  const allItems: NewsItem[] = [];

  await Promise.allSettled(
    RSS_FEEDS.map(async ({ url, sourceName }) => {
      try {
        const feed = await parser.parseURL(url);
        for (const item of feed.items ?? []) {
          const title = item.title ?? "";
          const desc = item.contentSnippet ?? item.content ?? "";
          if (!title || !isNewsRelevant(title + " " + desc)) continue;
          allItems.push({
            headline: title,
            source: feed.title ? feed.title.replace(/\s*\|.*$/, "").trim() : sourceName,
            url: item.link ?? item.guid ?? "#",
            publishedAt: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
          });
        }
      } catch (_e) {
        // Feed failed - skip silently
      }
    })
  );

  // Sort newest first, deduplicate by headline prefix
  allItems.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const seen = new Set<string>();
  return allItems.filter((item) => {
    const key = item.headline.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
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
];

function isNewsRelevant(headline: string): boolean {
  const lower = headline.toLowerCase();
  return NEWS_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // KPI endpoint - three composite indicators
  app.get("/api/kpis", async (req, res) => {
    // Static defaults for intraday % changes
    let nvdaChange = 2.86, tsmChange = 1.62, muChange = 2.03, eqixChange = 1.40;
    let cegChange = 3.18,  vstChange = 2.44,  ccjChange = 3.10, neeChange = -0.39, etrChange = 0.82;
    // Static defaults for NRI price levels (used for since-base performance)
    let cegPrice  = STATIC_MARKET_DATA.CEG.price;   // ~$315 (Mar 2026 fallback)
    let vstPrice  = STATIC_MARKET_DATA.VST.price;   // ~$154 (Mar 2026 fallback)
    let ccjPrice  = STATIC_MARKET_DATA.CCJ.price;   // ~$113 (Mar 2026 fallback)
    let nlrPrice  = STATIC_MARKET_DATA.NLR.price;   // ~$68 (Mar 2026 fallback)

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
        yahooFinance.quote("ETR").catch(() => null),
      ]);
      if (quotes[0]?.regularMarketChangePercent != null) nvdaChange  = quotes[0].regularMarketChangePercent;
      if (quotes[1]?.regularMarketChangePercent != null) tsmChange   = quotes[1].regularMarketChangePercent;
      if (quotes[2]?.regularMarketChangePercent != null) muChange    = quotes[2].regularMarketChangePercent;
      if (quotes[3]?.regularMarketChangePercent != null) eqixChange  = quotes[3].regularMarketChangePercent;
      if (quotes[4]?.regularMarketChangePercent != null) cegChange   = quotes[4].regularMarketChangePercent;
      if (quotes[5]?.regularMarketChangePercent != null) vstChange   = quotes[5].regularMarketChangePercent;
      if (quotes[6]?.regularMarketChangePercent != null) ccjChange   = quotes[6].regularMarketChangePercent;
      if (quotes[8]?.regularMarketChangePercent != null) neeChange   = quotes[8].regularMarketChangePercent;
      if (quotes[9]?.regularMarketChangePercent != null) etrChange   = quotes[9].regularMarketChangePercent;
      // Live prices for NRI basket performance calculation
      if (quotes[4]?.regularMarketPrice != null) cegPrice = quotes[4].regularMarketPrice;
      if (quotes[5]?.regularMarketPrice != null) vstPrice = quotes[5].regularMarketPrice;
      if (quotes[6]?.regularMarketPrice != null) ccjPrice = quotes[6].regularMarketPrice;
      if (quotes[7]?.regularMarketPrice != null) nlrPrice = quotes[7].regularMarketPrice;
    } catch (_e) {
      // Fall through to static defaults
    }

    // ─────────────────────────────────────────────────────────
    // 1. NUCLEAR RENAISSANCE INDEX (NRI)
    // Anchored basket index - base = 100 on January 1, 2024.
    // Six components across utilities, miners, ETF, policy, and raw commodity.
    // Policy multiplier (0.9-1.1) captures regulatory/legislative regime separately
    // from the 10% direct policy component.
    // ─────────────────────────────────────────────────────────
    const cegPerf  = cegPrice  / NRI_BASE.CEG;           // stock performance vs base date
    const vstPerf  = vstPrice  / NRI_BASE.VST;
    const ccjPerf  = ccjPrice  / NRI_BASE.CCJ;
    const nlrPerf  = nlrPrice  / NRI_BASE.NLR;
    const uPerf    = URANIUM_SPOT_CURRENT / NRI_BASE.URANIUM_SPOT;  // uranium spot performance
    // SMR policy component: 0 + (score/10) normalized so 5/10=1.0 baseline, 10/10=1.5
    // Using: perf = 0.5 + (score / 10), giving 0.5 at score=0 and 1.5 at score=10
    const policyPerf = 0.5 + (SMR_POLICY_SCORE / 10);

    const nriWeightedPerf =
      0.25 * cegPerf +
      0.20 * vstPerf +
      0.15 * ccjPerf +
      0.20 * nlrPerf +
      0.10 * uPerf   +
      0.10 * policyPerf;

    // Policy multiplier: separate regulatory regime factor (0.9 to 1.1)
    // At score 7.8: 0.9 + (7.8/10 × 0.2) = 1.056
    const nriPolicyMultiplier = 0.9 + (SMR_POLICY_SCORE / 10) * 0.2;
    const nriValue = parseFloat((100 * nriWeightedPerf * nriPolicyMultiplier).toFixed(1));

    // Intraday momentum signal for display (not used in index calculation)
    const nriMomentum = cegChange * 0.35 + vstChange * 0.30 + ccjChange * 0.20 + neeChange * 0.15;

    // ─────────────────────────────────────────────────────────
    // 2. AI POWER DEMAND INDEX (0-100)
    // Measures the pace at which AI compute infrastructure is driving
    // power demand pressure on the US grid.
    //
    // Structural baseline = 72/100, derived from:
    //   - US data center electricity share ~5-6% of national grid (DOE 2024 actual: 4.4% / 183 TWh)
    //   - AI-driven demand CAGR: ~35%/yr (2022-2025 actuals, EIA + utility regulatory filings)
    //   - Hyperscaler 2026 AI capex guidance: ~$660B Big 4 (AMZN $200B, GOOGL $180B, MSFT $120B, META $125B)
    // NOTE: Structural baseline is a static hardcoded constant. Uranium spot price ($92/lb, Mar 2026),
    // SMR policy score (7.8/10), and electricity demand data are also static estimates.
    // Only stock prices and intraday % changes are live (Yahoo Finance).
    //   - GPU/HBM demand backlog: NVDA revenue +122% YoY (FY2025), TSM CoWoS capacity constrained
    //   - 100 would represent grid fully saturated by AI demand (theoretical maximum)
    //
    // Momentum layer: intraday signals from key infrastructure names (±8 pt range)
    //   NVDA (40%) + TSM (25%) + EQIX (20%) + MU (15%)
    //   Rationale: GPU demand (NVDA/TSM) drives primary load signal;
    //   EQIX reflects live data center capacity absorption; MU tracks HBM memory demand.
    // ─────────────────────────────────────────────────────────
    const aiMomentum = (nvdaChange * 0.40 + tsmChange * 0.25 + eqixChange * 0.20 + muChange * 0.15) * 1.2;
    const aiPowerIndex = Math.max(52, Math.min(94, 72 + aiMomentum + (Math.random() - 0.5) * 0.3));

    // ─────────────────────────────────────────────────────────
    // 3. GRID STRESS SCORE (0-100)
    // Measures supply/demand gap pressure on the US transmission grid.
    //
    // Structural baseline = 68/100, derived from:
    //   - PJM reserve margin: declined from 27% (2020) to 20% (2024); projected <15% by 2028
    //   - MISO issued formal capacity shortfall warnings for 2027-2028
    //   - ERCOT: 900+ hours of high-price scarcity events in 2023
    //   - EIA long-term: 30GW+ of announced DC load vs <15GW new dispatchable capacity planned
    //   - 100 would represent a declared grid emergency / rolling blackout conditions
    //
    // Momentum layer: power price signals from merchant generators (±8 pt range)
    //   VST (40%) + CEG (35%): rising merchant power stocks = power prices tightening
    //   EQIX (25%): rising DC REIT = forward load commitment accelerating
    // ─────────────────────────────────────────────────────────
    const stressMomentum = (vstChange * 0.40 + cegChange * 0.35 + eqixChange * 0.25) * 1.0;
    const gridStress = Math.max(52, Math.min(92, 68 + stressMomentum + (Math.random() - 0.5) * 0.4));

    res.json({
      aiPowerIndex:  parseFloat(aiPowerIndex.toFixed(1)),
      nriValue:      nriValue,
      gridStress:    parseFloat(gridStress.toFixed(1)),
      smrPolicyScore: SMR_POLICY_SCORE,
      nriBaseDate:   "Jan 1, 2024",
      constituents: {
        // AI Power Index signals
        nvdaChange:  parseFloat(nvdaChange.toFixed(2)),
        tsmChange:   parseFloat(tsmChange.toFixed(2)),
        eqixChange:  parseFloat(eqixChange.toFixed(2)),
        muChange:    parseFloat(muChange.toFixed(2)),
        // NRI price performance since Jan 1, 2024
        cegPerf:     parseFloat(cegPerf.toFixed(3)),
        vstPerf:     parseFloat(vstPerf.toFixed(3)),
        ccjPerf:     parseFloat(ccjPerf.toFixed(3)),
        nlrPerf:     parseFloat(nlrPerf.toFixed(3)),
        uPerf:       parseFloat(uPerf.toFixed(3)),
        policyPerf:  parseFloat(policyPerf.toFixed(3)),
        nriPolicyMultiplier: parseFloat(nriPolicyMultiplier.toFixed(3)),
        nriMomentum: parseFloat(nriMomentum.toFixed(2)),
        // Grid Stress signals
        vstChange:   parseFloat(vstChange.toFixed(2)),
        cegChange:   parseFloat(cegChange.toFixed(2)),
      },
    });
  });

  // Stack endpoint - 8 layers, 10-min cache
  app.get("/api/stack", async (req, res) => {
    try {
      const timeframe = (req.query.timeframe as string) || "1D";
      const spParams = sparklineParamsForTimeframe(timeframe);
      const cacheKey = timeframe;
      const now = Date.now();

      // Serve from cache if fresh
      let stockData: Record<string, any> = {};
      if (stackCache[cacheKey] && (now - stackCache[cacheKey].timestamp) < STACK_CACHE_TTL) {
        stockData = stackCache[cacheKey].data;
      } else {
        try {
          const YahooFinanceClass = (await import("yahoo-finance2")).default;
          const yahooFinance = new YahooFinanceClass({ suppressNotices: ["yahooSurvey"] });
          const results = await Promise.all(
            ALL_STACK_TICKERS.map((t) => yahooFinance.quote(t).catch(() => null))
          );
          results.forEach((r, i) => {
            if (r?.regularMarketPrice) {
              const ticker = ALL_STACK_TICKERS[i];
              const staticData = STATIC_MARKET_DATA[ticker];
              stockData[ticker] = {
                ticker,
                name: r.longName || r.shortName || staticData?.name || ticker,
                price: r.regularMarketPrice,
                change: r.regularMarketChange ?? 0,
                changePercent: r.regularMarketChangePercent ?? 0,
                pe: r.trailingPE ?? staticData?.pe ?? null,
                revenueGrowth: staticData?.revenueGrowth ?? null,
                sparkline: generateSparkline(r.regularMarketPrice, spParams.volatility, spParams.points),
                powerMW: staticData?.powerMW,
                vs_sp500: staticData?.vs_sp500,
                marketCapDisplay: staticData?.marketCapDisplay,
              };
            }
          });
        } catch (e) {
          // Fall through to static data
        }

        // Fill in missing tickers with static fallback
        ALL_STACK_TICKERS.forEach((ticker) => {
          if (!stockData[ticker]) {
            const s = STATIC_MARKET_DATA[ticker];
            if (s) {
              stockData[ticker] = {
                ticker,
                ...s,
                sparkline: generateSparkline(s.price, spParams.volatility, spParams.points),
              };
            }
          }
        });

        stackCache[cacheKey] = { data: stockData, timestamp: now };
      }

      const ccjCorrelationData = generateCCJCorrelationData();
      const cegCorrelationData = generateCEGCorrelationData();
      const ccjR = calculateCorrelation(
        ccjCorrelationData.map((d) => d.uranium),
        ccjCorrelationData.map((d) => d.ccj)
      );
      const cegR = calculateCorrelation(
        cegCorrelationData.map((d) => d.uranium),
        cegCorrelationData.map((d) => d.ceg)
      );

      res.json({
        compute:             STACK_TICKERS.compute.map((t) => stockData[t]).filter(Boolean),
        nuclear:             STACK_TICKERS.nuclear.map((t) => stockData[t]).filter(Boolean),
        uranium:             STACK_TICKERS.uranium.map((t) => stockData[t]).filter(Boolean),
        powerHardware:       STACK_TICKERS.powerHardware.map((t) => stockData[t]).filter(Boolean),
        utilities:           STACK_TICKERS.utilities.map((t) => stockData[t]).filter(Boolean),
        dataCenters:         STACK_TICKERS.dataCenters.map((t) => stockData[t]).filter(Boolean),
        construction:        STACK_TICKERS.construction.map((t) => stockData[t]).filter(Boolean),
        rawMaterialsMining:  STACK_TICKERS.rawMaterialsMining.map((t) => stockData[t]).filter(Boolean),
        rawMaterialsNatGas:  STACK_TICKERS.rawMaterialsNatGas.map((t) => stockData[t]).filter(Boolean),
        renewableGeneration: STACK_TICKERS.renewableGeneration.map((t) => stockData[t]).filter(Boolean),
        transmissionGrid:    STACK_TICKERS.transmissionGrid.map((t) => stockData[t]).filter(Boolean),
        cryptoAIDC:          STACK_TICKERS.cryptoAIDC.map((t) => stockData[t]).filter(Boolean),
        etfsBenchmarks:      STACK_TICKERS.etfsBenchmarks.map((t) => stockData[t]).filter(Boolean),
        correlation: ccjCorrelationData,
        correlationCoeff: parseFloat(ccjR.toFixed(3)),
        cegCorrelationCoeff: parseFloat(cegR.toFixed(3)),
      });
    } catch (error) {
      console.error("Stack error:", error);
      res.status(500).json({ error: "Failed to fetch stack data" });
    }
  });

  // Top Movers endpoint - top 5 by absolute % change across all stack tickers
  app.get("/api/top-movers", async (_req, res) => {
    try {
      const cacheKey = "1D";
      const now = Date.now();
      let stockData: Record<string, any> = {};

      if (stackCache[cacheKey] && (now - stackCache[cacheKey].timestamp) < STACK_CACHE_TTL) {
        stockData = stackCache[cacheKey].data;
      } else {
        const spParams = sparklineParamsForTimeframe("1D");
        try {
          const YahooFinanceClass = (await import("yahoo-finance2")).default;
          const yahooFinance = new YahooFinanceClass({ suppressNotices: ["yahooSurvey"] });
          const results = await Promise.all(
            ALL_STACK_TICKERS.map((t) => yahooFinance.quote(t).catch(() => null))
          );
          results.forEach((r, i) => {
            if (r?.regularMarketPrice) {
              const ticker = ALL_STACK_TICKERS[i];
              const staticData = STATIC_MARKET_DATA[ticker];
              stockData[ticker] = {
                ticker,
                name: r.longName || r.shortName || staticData?.name || ticker,
                price: r.regularMarketPrice,
                change: r.regularMarketChange ?? 0,
                changePercent: r.regularMarketChangePercent ?? 0,
                pe: r.trailingPE ?? staticData?.pe ?? null,
                revenueGrowth: staticData?.revenueGrowth ?? null,
                sparkline: generateSparkline(r.regularMarketPrice, spParams.volatility, spParams.points),
                powerMW: staticData?.powerMW,
                vs_sp500: staticData?.vs_sp500,
                marketCapDisplay: staticData?.marketCapDisplay,
              };
            }
          });
        } catch (_e) {}
        ALL_STACK_TICKERS.forEach((ticker) => {
          if (!stockData[ticker]) {
            const s = STATIC_MARKET_DATA[ticker];
            if (s) stockData[ticker] = { ticker, ...s, sparkline: generateSparkline(s.price, spParams.volatility, spParams.points) };
          }
        });
        stackCache[cacheKey] = { data: stockData, timestamp: now };
      }

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
      const cacheKey = "1D";
      const now = Date.now();
      let stockData: Record<string, any> = {};

      if (stackCache[cacheKey] && (now - stackCache[cacheKey].timestamp) < STACK_CACHE_TTL) {
        stockData = stackCache[cacheKey].data;
      } else {
        const spParams = sparklineParamsForTimeframe("1D");
        try {
          const YahooFinanceClass = (await import("yahoo-finance2")).default;
          const yahooFinance = new YahooFinanceClass({ suppressNotices: ["yahooSurvey"] });
          const results = await Promise.all(
            ALL_STACK_TICKERS.map((t) => yahooFinance.quote(t).catch(() => null))
          );
          results.forEach((r, i) => {
            if (r?.regularMarketPrice) {
              const ticker = ALL_STACK_TICKERS[i];
              const staticData = STATIC_MARKET_DATA[ticker];
              stockData[ticker] = {
                ticker,
                name: r.longName || r.shortName || staticData?.name || ticker,
                price: r.regularMarketPrice,
                change: r.regularMarketChange ?? 0,
                changePercent: r.regularMarketChangePercent ?? 0,
                pe: r.trailingPE ?? staticData?.pe ?? null,
                revenueGrowth: staticData?.revenueGrowth ?? null,
                sparkline: generateSparkline(r.regularMarketPrice, spParams.volatility, spParams.points),
                powerMW: staticData?.powerMW,
                vs_sp500: staticData?.vs_sp500,
                marketCapDisplay: staticData?.marketCapDisplay,
              };
            }
          });
        } catch (_e) {}
        ALL_STACK_TICKERS.forEach((ticker) => {
          if (!stockData[ticker]) {
            const s = STATIC_MARKET_DATA[ticker];
            if (s) stockData[ticker] = { ticker, ...s, sparkline: generateSparkline(s.price, spParams.volatility, spParams.points) };
          }
        });
        stackCache[cacheKey] = { data: stockData, timestamp: now };
      }

      const SECTOR_LABELS: Record<string, string> = {
        compute: "Compute", nuclear: "Nuclear", uranium: "Uranium",
        powerHardware: "Power HW", utilities: "Utilities",
        dataCenters: "Data Ctrs", construction: "Constr.",
        rawMaterialsMining: "Mining", rawMaterialsNatGas: "Nat Gas",
        renewableGeneration: "Renewables", transmissionGrid: "Grid HW",
        cryptoAIDC: "Crypto DC", etfsBenchmarks: "ETFs",
      };

      const pulse = Object.entries(STACK_TICKERS).map(([key, tickers]) => {
        const changes = tickers.map((t) => stockData[t]?.changePercent ?? 0);
        const avg = changes.reduce((s, v) => s + v, 0) / changes.length;
        return { sector: key, label: SECTOR_LABELS[key] ?? key, avgChange: parseFloat(avg.toFixed(2)) };
      });

      res.json(pulse);
    } catch (error) {
      console.error("Sector pulse error:", error);
      res.status(500).json({ error: "Failed to compute sector pulse" });
    }
  });

  const SUPPLY_CHAIN_STAGES = {
    rawMaterials: {
      name: "Raw Materials",
      tagline: "Where it comes from",
      color: "#CD7F32",
      bottleneckStatus: "Tightening" as const,
      bottleneckDetail: "Copper prices above $10,000/ton. Uranium spot at $80+/lb. Electrical steel lead times at 8-12 months. Demand from AI data centers could require 475,000 additional tons of copper annually by 2028.",
      keyMetric: "Copper: $10,200/ton",
      tickers: ["CCJ", "UEC", "NXE", "DNN", "UUUU", "LEU", "FCX", "SCCO", "TECK", "HBM", "NUE", "STLD", "CLF", "X", "MP", "BHP", "RIO", "VALE", "AR", "EQT", "RRC", "SWN", "LNG", "COPX"],
    },
    generation: {
      name: "Generation",
      tagline: "How it's made",
      color: "#F07800",
      bottleneckStatus: "Tightening" as const,
      bottleneckDetail: "GE Vernova gas turbine backlog exceeds 3 years. Nuclear fleet operating near capacity limits. Constellation, Vistra, and Talen are signing long-term PPAs with hyperscalers at premium rates. SMR deployment timeline remains 2028-2030 at earliest.",
      keyMetric: "GEV backlog: $100B+",
      tickers: ["CEG", "VST", "TLN", "NRG", "GEV", "SIEGY", "BKR", "SMR", "OKLO", "BWXT", "NEE", "AES", "FSLR", "ENPH", "SEDG", "SO", "DUK", "AEP"],
    },
    transmission: {
      name: "Transmission",
      tagline: "How it moves",
      color: "#F0A500",
      bottleneckStatus: "Bottlenecked" as const,
      bottleneckDetail: "Large power transformer lead times at 18-36 months. US domestic production approximately 60 units/year against estimated demand of 200-500 over 5 years. This is the tightest bottleneck in the chain. PJM interconnection queue exceeds 250 GW of pending projects with 4+ year wait times.",
      keyMetric: "LPT lead time: 18-36 months",
      tickers: ["ETN", "ABB", "PWR", "EMR", "HUBB", "AYI", "WIRE", "AOS", "GNRC", "IDA", "NVT"],
    },
    distribution: {
      name: "Distribution",
      tagline: "How it connects",
      color: "#22c55e",
      bottleneckStatus: "Tightening" as const,
      bottleneckDetail: "Data center switchgear and UPS systems face 12-18 month lead times. Liquid cooling demand growing 40%+ annually as GPU power density increases. Eaton and Vertiv order backlogs at record levels. Site development constrained by permitting delays in key markets.",
      keyMetric: "Eaton backlog: 2-3 years",
      tickers: ["VRT", "CARR", "JCI", "ETN", "ABB", "EME", "MTZ", "STRL", "FLR", "PRIM"],
    },
    endUse: {
      name: "End Use",
      tagline: "Where it goes",
      color: "#a855f7",
      bottleneckStatus: "Flowing" as const,
      bottleneckDetail: "48 tracked facilities. 28 operational, 15 under construction, 5 announced. Total tracked capacity: 20.7 GW. Hyperscaler capex commitments exceed $200B over the next 3 years. GPU compute demand continues to outpace supply.",
      keyMetric: "48 facilities / 20.7 GW",
      tickers: ["EQIX", "DLR", "AMT", "NVDA", "AMD", "AVGO", "TSM", "MU", "INTC", "SMCI", "META", "AMZN", "MSFT", "GOOGL", "AAPL", "IREN", "CLSK", "MARA", "DELL", "ANET", "MRVL"],
    },
  };

  app.get("/api/supply-chain", async (_req, res) => {
    try {
      const cacheKey = "supply-chain";
      const now = Date.now();
      const cached = stackCache[cacheKey];
      if (cached && now - cached.timestamp < 5 * 60 * 1000) {
        const stockData = cached.data;
        const stages = Object.entries(SUPPLY_CHAIN_STAGES).map(([key, stage]) => {
          const stocks = stage.tickers
            .map((t) => stockData[t])
            .filter(Boolean);
          const avgChange = stocks.length > 0
            ? parseFloat((stocks.reduce((s, st) => s + (st.changePercent ?? 0), 0) / stocks.length).toFixed(2))
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
            })),
          };
        });
        return res.json({ stages, tightestBottleneck: "Transmission" });
      }

      const stockData: Record<string, any> = {};
      const allTickers = [...new Set(Object.values(SUPPLY_CHAIN_STAGES).flatMap((s) => s.tickers))];
      try {
        const results = await Promise.all(
          allTickers.map((t) => yahooFinance.quote(t).catch(() => null))
        );
        results.forEach((r, i) => {
          if (r?.regularMarketPrice) {
            const ticker = allTickers[i];
            const staticData = STATIC_MARKET_DATA[ticker];
            stockData[ticker] = {
              ticker,
              name: r.shortName || r.longName || staticData?.name || ticker,
              price: r.regularMarketPrice,
              change: r.regularMarketChange ?? 0,
              changePercent: r.regularMarketChangePercent ?? 0,
              marketCapDisplay: staticData?.marketCapDisplay || "",
            };
          }
        });
      } catch {
        // fall through to static
      }

      allTickers.forEach((ticker) => {
        if (!stockData[ticker]) {
          const s = STATIC_MARKET_DATA[ticker];
          if (s) stockData[ticker] = { ticker, name: s.name, price: s.price, change: s.change, changePercent: s.changePercent, marketCapDisplay: s.marketCapDisplay };
        }
      });

      stackCache[cacheKey] = { data: stockData, timestamp: now };

      const stages = Object.entries(SUPPLY_CHAIN_STAGES).map(([key, stage]) => {
        const stocks = stage.tickers.map((t) => stockData[t]).filter(Boolean);
        const avgChange = stocks.length > 0
          ? parseFloat((stocks.reduce((s, st) => s + (st.changePercent ?? 0), 0) / stocks.length).toFixed(2))
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
          })),
        };
      });

      res.json({ stages, tightestBottleneck: "Transmission" });
    } catch (error) {
      console.error("Supply chain error:", error);
      res.status(500).json({ error: "Failed to fetch supply chain data" });
    }
  });

  const SUBSCRIBERS_FILE = join(process.cwd(), "server", "data", "subscribers.json");
  interface Subscriber { email: string; subscribedAt: string; }

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

  const UNSUB_SECRET = process.env.SESSION_SECRET || "gridtilt-unsub-fallback";
  function makeUnsubToken(email: string): string {
    return createHmac("sha256", UNSUB_SECRET).update(email).digest("hex");
  }

  const subscribeRateLimit = new Map<string, { count: number; resetAt: number }>();

  app.post("/api/subscribe", async (req: Request, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== "string") {
        return res.status(400).json({ error: "Email is required" });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "That doesn't look like an email" });
      }

      const ip = req.ip || "unknown";
      const now = Date.now();
      const limit = subscribeRateLimit.get(ip);
      if (limit && now < limit.resetAt && limit.count >= 5) {
        return res.status(429).json({ error: "Too many attempts. Try again later." });
      }
      if (!limit || now >= (limit?.resetAt ?? 0)) {
        subscribeRateLimit.set(ip, { count: 1, resetAt: now + 3600000 });
      } else {
        limit.count++;
      }

      const subscribers = loadSubscribers();
      const normalizedEmail = email.toLowerCase().trim();

      if (subscribers.some((s) => s.email === normalizedEmail)) {
        return res.json({ message: "You're already on the list", status: "exists" });
      }

      subscribers.push({ email: normalizedEmail, subscribedAt: new Date().toISOString() });
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

  app.get("/api/unsubscribe", (req, res) => {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).send("Invalid unsubscribe link");
    }

    const subscribers = loadSubscribers();
    const remaining = subscribers.filter((s) => {
      return makeUnsubToken(s.email) !== token;
    });

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
    try {
      const subscribers = loadSubscribers();
      const subscriberCount = subscribers.length;

      let stockData: Record<string, any> = {};
      try {
        const cacheKey = "supply-chain";
        const cached = stackCache[cacheKey];
        if (cached) stockData = cached.data;
      } catch {}

      const topMovers = Object.values(stockData)
        .filter((s: any) => s?.changePercent)
        .sort((a: any, b: any) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
        .slice(0, 5);

      const monthYear = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>The GridTilt Brief</title></head>
<body style="margin:0;padding:0;background:#0d0d14;font-family:system-ui,-apple-system,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d14;"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#151520;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.06);">
<tr><td style="padding:32px;border-bottom:1px solid rgba(240,120,0,0.15);">
<div style="font-size:22px;font-weight:800;color:#fff;">Grid<span style="color:#F07800;">Tilt</span></div>
<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;font-family:monospace;">The GridTilt Brief / ${monthYear}</div>
</td></tr>
<tr><td style="padding:32px;">
<div style="font-size:14px;font-weight:700;color:#F0A500;margin-bottom:16px;text-transform:uppercase;letter-spacing:1px;">Top Movers</div>
${topMovers.map((s: any) => `
<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);">
<span style="color:#fff;font-size:13px;font-weight:600;">${s.ticker}</span>
<span style="color:#fff;font-size:12px;">${s.name}</span>
<span style="color:${s.changePercent >= 0 ? '#22c55e' : '#ef4444'};font-size:12px;font-family:monospace;">${s.changePercent >= 0 ? '+' : ''}${s.changePercent.toFixed(2)}%</span>
</div>
`).join("")}
</td></tr>
<tr><td style="padding:32px;background:#0d0d14;border-top:1px solid rgba(255,255,255,0.04);">
<div style="text-align:center;">
<a href="${BASE_URL}" style="display:inline-block;padding:12px 32px;background:#F07800;color:#000;text-decoration:none;font-weight:700;font-size:13px;border-radius:6px;">Explore the Dashboard</a>
</div>
<div style="text-align:center;margin-top:20px;font-size:11px;color:rgba(255,255,255,0.3);">
Sent to ${subscriberCount} subscribers. You're receiving this because you subscribed at gridtilt.com.<br>
<a href="${BASE_URL}/api/unsubscribe?token=PREVIEW" style="color:rgba(255,255,255,0.4);">Unsubscribe</a>
</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

      res.type("html").send(html);
    } catch (error) {
      console.error("Newsletter preview error:", error);
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  app.post("/api/newsletter/send", async (req, res) => {
    const authKey = req.headers["x-admin-key"];
    if (authKey !== process.env.SESSION_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
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
      const previewRes = await fetch(previewUrl);
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
              subject: `The GridTilt Brief - ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
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

      res.json({ message: `Newsletter sent`, sent, errors, total: subscribers.length });
    } catch (error) {
      console.error("Newsletter send error:", error);
      res.status(500).json({ error: "Failed to send newsletter" });
    }
  });

  app.get("/api/admin/subscribers", (req, res) => {
    const authKey = req.headers["x-admin-key"];
    if (authKey !== process.env.SESSION_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const subscribers = loadSubscribers();
    res.json({ count: subscribers.length, subscribers });
  });

  app.delete("/api/admin/subscribers/:email", (req, res) => {
    const authKey = req.headers["x-admin-key"];
    if (authKey !== process.env.SESSION_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const emailToRemove = decodeURIComponent(req.params.email).toLowerCase();
    const subscribers = loadSubscribers();
    const remaining = subscribers.filter((s) => s.email !== emailToRemove);
    saveSubscribers(remaining);
    res.json({ message: "Removed", count: remaining.length });
  });

  // Earnings calendar endpoint - upcoming earnings dates for all stack tickers (4h cache)
  app.get("/api/earnings-calendar", async (_req, res) => {
    try {
      const now = Date.now();
      if (earningsCache && (now - earningsCache.timestamp) < EARNINGS_CACHE_TTL) {
        return res.json(earningsCache.items);
      }

      const results: any[] = [];
      let idCounter = 1000; // start above manual catalyst IDs

      try {
        const YahooFinanceClass = (await import("yahoo-finance2")).default;
        const yahooFinance = new YahooFinanceClass({ suppressNotices: ["yahooSurvey"] });

        const summaries = await Promise.all(
          ALL_STACK_TICKERS.map((ticker) =>
            yahooFinance.quoteSummary(ticker, { modules: ["calendarEvents"] }).catch(() => null)
          )
        );

        summaries.forEach((summary, i) => {
          const ticker = ALL_STACK_TICKERS[i];
          const earningsDate = summary?.calendarEvents?.earnings?.earningsDate?.[0];
          if (earningsDate) {
            const d = new Date(earningsDate);
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
          }
        });
      } catch (_e) {
        // Yahoo Finance failed - return empty array, manual catalysts still show
      }

      // Deduplicate by ticker (keep closest date)
      const seen = new Set<string>();
      const deduped = results.filter((item) => {
        const key = item.tickers[0];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      earningsCache = { items: deduped, timestamp: now };
      res.json(deduped);
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
  const MANUAL_CATALYSTS = [
    { id: 'palisades-restart', category: 'Regulatory', title: 'NRC Review: Palisades Nuclear Restart', description: "NRC is reviewing Holtec's application to restart Michigan's 800 MW Palisades plant, which shut down in 2022. A decision would be the first US nuclear plant restart from decommissioned status.", dateLabel: 'Apr 2026', sortDate: '2026-04-15', affectedTickers: ['CEG', 'VST', 'TLN'], affectedSectors: ['Nuclear'] },
    { id: 'pjm-auction', category: 'Market', title: 'PJM Capacity Auction Results', description: 'PJM Interconnection, which operates the grid for 13 states and D.C., holds annual capacity auctions to procure generation commitments. Results set clearing prices that affect merchant generator revenue.', dateLabel: 'Q2 2026', sortDate: '2026-05-01', affectedTickers: ['VST', 'CEG', 'NRG'], affectedSectors: ['Generation'] },
    { id: 'ferc-order-1920', category: 'Infrastructure', title: 'FERC Transmission Planning Rule (Order 1920)', description: 'FERC Order 1920, issued May 2024, requires regional transmission planning on a 20-year forward-looking basis. Implementation timelines and compliance filings are ongoing through 2026.', dateLabel: '2026', sortDate: '2026-06-01', affectedTickers: ['PWR', 'ETN', 'EMR'], affectedSectors: ['Transmission'] },
    { id: 'doe-loan-programs', category: 'Regulatory', title: 'DOE Loan Programs for Nuclear/Grid', description: "The DOE Loan Programs Office has authority to issue loans and loan guarantees for energy infrastructure projects, including nuclear and grid modernization. Disbursement decisions are ongoing.", dateLabel: '2026-2027', sortDate: '2026-06-15', affectedTickers: ['SMR', 'OKLO', 'BWXT', 'GEV'], affectedSectors: ['Nuclear', 'Grid'] },
    { id: 'hyperscaler-capex', category: 'Industry', title: 'Hyperscaler Capex Guidance Updates', description: 'META, MSFT, AMZN, and GOOGL report quarterly earnings with updated capital expenditure guidance for AI infrastructure and datacenter buildouts.', dateLabel: 'Ongoing (quarterly)', sortDate: '2026-04-29', affectedTickers: ['META', 'MSFT', 'AMZN', 'GOOGL'], affectedSectors: ['End Use', 'Distribution'] },
    { id: 'lpt-tariffs', category: 'Market', title: 'Large Power Transformer Import Tariff Decisions', description: 'US trade policy decisions on large power transformer imports affect domestic supply timelines. The US imports a significant share of LPTs, and tariff changes impact procurement lead times.', dateLabel: 'Mid-2026', sortDate: '2026-07-01', affectedTickers: ['ETN', 'ABB', 'PWR'], affectedSectors: ['Transmission'] },
    { id: 'tmi-restart', category: 'Infrastructure', title: 'Three Mile Island Unit 1 Restart', description: "Constellation Energy has announced plans to restart Three Mile Island Unit 1 (837 MW) under a power purchase agreement with Microsoft. NRC regulatory review is required before restart can proceed.", dateLabel: '2026-2028', sortDate: '2026-08-01', affectedTickers: ['CEG', 'MSFT'], affectedSectors: ['Nuclear'] },
    { id: 'epa-emissions', category: 'Regulatory', title: 'EPA Power Plant Emissions Rules', description: 'EPA has proposed updated emissions standards for new and existing gas-fired power plants. Final rules will affect permitting timelines and operating costs for gas generation.', dateLabel: '2026', sortDate: '2026-09-01', affectedTickers: ['GEV', 'BKR', 'NRG', 'VST'], affectedSectors: ['Generation'] },
  ];

  // Earnings dates based on each company's historical reporting week.
  // Fiscal quarter designations are verified from each company's fiscal year calendar.
  // Exact day may shift by ±1 week; dates represent the typical reporting week.
  const EARNINGS_SEED = [
    { ticker: 'TSM', company: 'Taiwan Semiconductor', date: '2026-04-17', time: 'BMO', quarter: 'Q1 2026' },
    { ticker: 'GOOGL', company: 'Alphabet', date: '2026-04-29', time: 'AMC', quarter: 'Q1 2026' },
    { ticker: 'META', company: 'Meta Platforms', date: '2026-04-29', time: 'AMC', quarter: 'Q1 2026' },
    { ticker: 'MSFT', company: 'Microsoft', date: '2026-04-29', time: 'AMC', quarter: 'Q1 2026' },
    { ticker: 'AAPL', company: 'Apple', date: '2026-04-30', time: 'AMC', quarter: 'Q2 FY2026' },
    { ticker: 'AMZN', company: 'Amazon', date: '2026-04-30', time: 'AMC', quarter: 'Q1 2026' },
    { ticker: 'AMD', company: 'Advanced Micro Devices', date: '2026-05-05', time: 'AMC', quarter: 'Q1 2026' },
    { ticker: 'NVDA', company: 'NVIDIA', date: '2026-05-28', time: 'AMC', quarter: 'Q1 FY2027' },
  ];

  const STAGE_MAP: Record<string, string> = {
    CCJ: 'Raw Materials', UEC: 'Raw Materials', NXE: 'Raw Materials', DNN: 'Raw Materials',
    UUUU: 'Raw Materials', LEU: 'Raw Materials', FCX: 'Raw Materials', SCCO: 'Raw Materials',
    TECK: 'Raw Materials', HBM: 'Raw Materials', NUE: 'Raw Materials', STLD: 'Raw Materials',
    CLF: 'Raw Materials', X: 'Raw Materials', MP: 'Raw Materials', BHP: 'Raw Materials',
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
    MTZ: 'Distribution', STRL: 'Distribution', FLR: 'Distribution', PRIM: 'Distribution',
    EQIX: 'End Use', DLR: 'End Use', AMT: 'End Use', NVDA: 'End Use', AMD: 'End Use',
    AVGO: 'End Use', TSM: 'End Use', MU: 'End Use', INTC: 'End Use', SMCI: 'End Use',
    META: 'End Use', AMZN: 'End Use', MSFT: 'End Use', GOOGL: 'End Use', AAPL: 'End Use',
    IREN: 'End Use', CLSK: 'End Use', MARA: 'End Use',
  };

  const STAGE_COLORS_MAP: Record<string, string> = {
    'Raw Materials': '#C87533', 'Generation': '#F07800', 'Transmission': '#F0A500',
    'Distribution': '#22C55E', 'End Use': '#A855F7',
  };

  function getEarningsData() {
    const todayStr = new Date().toISOString().split('T')[0];
    const filtered = EARNINGS_SEED.filter(e => e.date >= todayStr);
    return filtered.map(e => ({
      ...e,
      stage: STAGE_MAP[e.ticker] || 'End Use',
      stageColor: STAGE_COLORS_MAP[STAGE_MAP[e.ticker] || 'End Use'],
    }));
  }

  app.get("/api/catalysts/earnings", (_req, res) => {
    const items = getEarningsData();
    res.json({ earnings: items });
  });

  app.get("/api/catalysts/manual", (_req, res) => {
    res.json(MANUAL_CATALYSTS);
  });

  app.get("/api/catalysts/all", (_req, res) => {
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

    const manualFormatted = MANUAL_CATALYSTS.map(c => ({
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
      const satori = (await import("satori")).default;
      const { Resvg } = await import("@resvg/resvg-js");
      const fontData = readFileSync(join(process.cwd(), "server", "fonts", "Inter-Regular.ttf"));

      const page = (req.query.page as string) || "home";
      const ticker = req.query.ticker as string | undefined;
      const name = req.query.name as string | undefined;

      let title = "The Grid is Tilting";
      let subtitle = "AI Power Infrastructure Dashboard";
      let stats: Array<{ label: string; value: string }> = [];

      if (ticker) {
        const companyInfo = COMPANY_DATABASE[ticker.toUpperCase()];
        title = companyInfo ? `${companyInfo.name} ($${ticker.toUpperCase()})` : `$${ticker.toUpperCase()}`;
        subtitle = companyInfo ? `${companyInfo.primarySegment} Sector` : "AI Power Thesis Analysis";
        stats = [{ label: "Sector", value: companyInfo?.primarySegment || "Unknown" }];
      } else if (page === "stack") {
        title = "60+ AI Power Stocks";
        subtitle = "Live Data Across 8 Sectors";
      } else if (page === "power-map") {
        title = "48 AI Data Centers Mapped";
        subtitle = "Locations by Grid Region and Operator";
      } else if (page === "sector" && name) {
        title = `${name} Sector`;
        subtitle = "AI Power Infrastructure Stocks";
      } else if (page === "region" && name) {
        title = `${name} Grid Region`;
        subtitle = "AI Data Center Locations";
      } else if (page === "operator" && name) {
        title = `${name} AI Data Centers`;
        subtitle = "Locations and Capacity";
      }

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
                          {
                            type: "div",
                            props: {
                              style: {
                                width: "8px",
                                height: "32px",
                                backgroundColor: "#F07800",
                                borderRadius: "4px",
                              },
                            },
                          },
                          {
                            type: "div",
                            props: {
                              style: { fontSize: "28px", fontWeight: "700", color: "#F07800", letterSpacing: "2px" },
                              children: "GRIDTILT",
                            },
                          },
                        ],
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: { fontSize: "52px", fontWeight: "800", lineHeight: "1.1", maxWidth: "900px" },
                        children: title,
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: { fontSize: "24px", color: "#9ca3af", maxWidth: "800px" },
                        children: subtitle,
                      },
                    },
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
                        children: (stats.length > 0 ? stats : [
                          { label: "AI Demand", value: "74" },
                          { label: "Nuclear", value: "279" },
                          { label: "Grid Stress", value: "70" },
                        ]).map((s) => ({
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
                    {
                      type: "div",
                      props: {
                        style: { fontSize: "18px", color: "#6b7280" },
                        children: "gridtilt.com",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
        {
          width: 1200,
          height: 630,
          fonts: [{ name: "Inter", data: fontData, weight: 400, style: "normal" as const }],
        },
      );

      const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } });
      const png = resvg.render().asPng();

      res.set({
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      }).send(Buffer.from(png));
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
      start_url: "/",
      display: "standalone",
      background_color: "#121110",
      theme_color: "#F07800",
      icons: [
        { src: "/favicon.png", sizes: "192x192", type: "image/png" },
        { src: "/favicon.png", sizes: "512x512", type: "image/png" },
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
  app.get("/thesis-calculator", (_req, res) => res.redirect(301, "/trade"));
  app.get("/portfolio-overlay", (_req, res) => res.redirect(301, "/portfolio"));

  // ─── Content Export APIs ────────────────────────────────────────────────
  app.get("/api/export/daily", async (_req, res) => {
    try {
      const cached = stackCache["1D"];
      const topMoversData: any[] = [];
      if (cached?.data) {
        const allStocks: any[] = [];
        for (const layer of Object.values(cached.data)) {
          if (Array.isArray(layer)) allStocks.push(...layer);
        }
        allStocks
          .filter((s: any) => s?.changePercent != null)
          .sort((a: any, b: any) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
          .slice(0, 5)
          .forEach((s: any) => {
            topMoversData.push({
              ticker: s.ticker,
              name: s.name,
              change_pct: parseFloat(s.changePercent.toFixed(2)),
              sector: s.sector || "Unknown",
            });
          });
      }

      res.json({
        date: new Date().toISOString().split("T")[0],
        thesis_status: "Expanding",
        indices: {
          ai_demand: { value: 74, trend: "up" },
          nuclear_renaissance: { value: 279, trend: "stable" },
          grid_stress: { value: 70, trend: "up" },
        },
        top_movers: topMoversData,
        facility_count: 48,
        total_capacity_gw: 20.7,
      });
    } catch (error) {
      console.error("Daily export error:", error);
      res.status(500).json({ error: "Failed to generate daily export" });
    }
  });

  app.post("/api/social/generate", (req, res) => {
    const { platform, type } = req.body || {};
    const templates: Record<string, string> = {
      thesis_status: "gridtilt thesis status\n\nai demand: 74\nnuclear renaissance: 279\ngrid stress: 70\n\nstatus: expanding\n\ngridtilt.com",
      daily_movers: "top movers on gridtilt today\n\ncheck the live dashboard for today's AI power infrastructure movers\n\ngridtilt.com/stack",
      sector_pulse: "sector pulse\n\nconstruction and data centers leading today\nnuclear and uranium tracking\n\ngridtilt.com",
      catalyst_preview: "upcoming catalysts\n\ncheck gridtilt.com/catalysts for the full calendar\n\nearnings, regulatory decisions, and policy events",
    };

    const text = templates[type || "thesis_status"] || templates.thesis_status;
    res.json({
      text,
      platform: platform || "twitter",
      has_image: true,
      image_url: `/api/og?page=${type || "home"}`,
    });
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
    let stockData: any = null;
    if (cached?.data && layerKey) {
      const layerData = (cached.data as any)[layerKey];
      if (Array.isArray(layerData)) {
        stockData = layerData.find((s: any) => s.ticker === ticker);
      }
    }

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

  return httpServer;
}

function computeThesisScore(company: { sectors: { Compute: number; Infrastructure: number; Power: number; Cooling: number; Grid: number } }): number {
  const { Compute, Infrastructure, Power, Cooling, Grid } = company.sectors;
  return Math.round((Compute * 0.25 + Infrastructure * 0.25 + Power * 0.2 + Cooling * 0.15 + Grid * 0.15));
}

function escapeXml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
