import { SERIES } from '@/lib/tokens';

export type CatalystCategory = 'Regulatory' | 'Policy' | 'Infrastructure' | 'Market' | 'Industry';

// Categories not in tokens.ts CATEGORY_COLORS: assigned SERIES slots in order
// of appearance so the categories are actually distinguishable (the old map
// put them all on near-identical oranges).
export const catalystCategoryColors: Record<CatalystCategory, string> = {
  Regulatory:     SERIES[0], // series slot 1 (blue)
  Policy:         SERIES[1], // series slot 2 (amber)
  Infrastructure: SERIES[2], // series slot 3 (teal)
  Market:         SERIES[3], // series slot 4 (violet)
  Industry:       SERIES[4], // series slot 5 (magenta)
};

export interface ManualCatalyst {
  id: string;
  category: CatalystCategory;
  title: string;
  description: string;
  dateLabel: string;
  sortDate: string;
  affectedTickers: string[];
  affectedSectors: string[];
}

export const manualCatalysts: ManualCatalyst[] = [
  {
    id: 'palisades-restart',
    category: 'Regulatory',
    title: 'NRC Review: Palisades Nuclear Restart',
    description: "NRC is reviewing Holtec's application to restart Michigan's 800 MW Palisades plant, which shut down in 2022. A decision would be the first US nuclear plant restart from decommissioned status.",
    dateLabel: 'Apr 2026',
    sortDate: '2026-04-15',
    affectedTickers: ['CEG', 'VST', 'TLN'],
    affectedSectors: ['Nuclear'],
  },
  {
    id: 'pjm-auction',
    category: 'Market',
    title: 'PJM Capacity Auction Results',
    description: 'PJM Interconnection, which operates the grid for 13 states and D.C., holds annual capacity auctions to procure generation commitments. Results set clearing prices that affect merchant generator revenue.',
    dateLabel: 'Q2 2026',
    sortDate: '2026-05-01',
    affectedTickers: ['VST', 'CEG', 'NRG'],
    affectedSectors: ['Generation'],
  },
  {
    id: 'ferc-order-1920',
    category: 'Infrastructure',
    title: 'FERC Transmission Planning Rule (Order 1920)',
    description: 'FERC Order 1920, issued May 2024, requires regional transmission planning on a 20-year forward-looking basis. Implementation timelines and compliance filings are ongoing through 2026.',
    dateLabel: '2026',
    sortDate: '2026-06-01',
    affectedTickers: ['PWR', 'ETN', 'EMR'],
    affectedSectors: ['Transmission'],
  },
  {
    id: 'doe-loan-programs',
    category: 'Regulatory',
    title: 'DOE Loan Programs for Nuclear/Grid',
    description: 'The DOE Loan Programs Office has authority to issue loans and loan guarantees for energy infrastructure projects, including nuclear and grid modernization. Disbursement decisions are ongoing.',
    dateLabel: '2026-2027',
    sortDate: '2026-06-15',
    affectedTickers: ['SMR', 'OKLO', 'BWXT', 'GEV'],
    affectedSectors: ['Nuclear', 'Grid'],
  },
  {
    id: 'hyperscaler-capex',
    category: 'Industry',
    title: 'Hyperscaler Capex Guidance Updates',
    description: 'META, MSFT, AMZN, and GOOGL report quarterly earnings with updated capital expenditure guidance for AI infrastructure and datacenter buildouts.',
    dateLabel: 'Ongoing (quarterly)',
    sortDate: '2026-04-29',
    affectedTickers: ['META', 'MSFT', 'AMZN', 'GOOGL'],
    affectedSectors: ['End Use', 'Distribution'],
  },
  {
    id: 'lpt-tariffs',
    category: 'Market',
    title: 'Large Power Transformer Import Tariff Decisions',
    description: 'US trade policy decisions on large power transformer imports affect domestic supply timelines. The US imports a significant share of LPTs, and tariff changes impact procurement lead times.',
    dateLabel: 'Mid-2026',
    sortDate: '2026-07-01',
    affectedTickers: ['ETN', 'ABB', 'PWR'],
    affectedSectors: ['Transmission'],
  },
  {
    id: 'tmi-restart',
    category: 'Infrastructure',
    title: 'Three Mile Island Unit 1 Restart',
    description: 'Constellation Energy has announced plans to restart Three Mile Island Unit 1 (837 MW) under a power purchase agreement with Microsoft. NRC regulatory review is required before restart can proceed.',
    dateLabel: '2026-2028',
    sortDate: '2026-08-01',
    affectedTickers: ['CEG', 'MSFT'],
    affectedSectors: ['Nuclear'],
  },
  {
    id: 'epa-emissions',
    category: 'Regulatory',
    title: 'EPA Power Plant Emissions Rules',
    description: 'EPA has proposed updated emissions standards for new and existing gas-fired power plants. Final rules will affect permitting timelines and operating costs for gas generation.',
    dateLabel: '2026',
    sortDate: '2026-09-01',
    affectedTickers: ['GEV', 'BKR', 'NRG', 'VST'],
    affectedSectors: ['Generation'],
  },
];

export const SUPPLY_CHAIN_STAGE_MAP: Record<string, string> = {
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
  MTZ: 'Distribution', STRL: 'Distribution', FLR: 'Distribution', J: 'Distribution',
  ACM: 'Distribution', PRIM: 'Distribution',
  EQIX: 'End Use', DLR: 'End Use', AMT: 'End Use', NVDA: 'End Use', AMD: 'End Use',
  AVGO: 'End Use', TSM: 'End Use', MU: 'End Use', INTC: 'End Use', SMCI: 'End Use',
  META: 'End Use', AMZN: 'End Use', MSFT: 'End Use', GOOGL: 'End Use', AAPL: 'End Use',
  IREN: 'End Use', CLSK: 'End Use', MARA: 'End Use',
};

// Supply-chain stages are not in tokens.ts CATEGORY_COLORS: SERIES slots
// continue in order of appearance (slots 6-10) so stage dots and catalyst
// category dots stay distinguishable when they co-occur on the calendar.
export const STAGE_COLORS: Record<string, string> = {
  'Raw Materials': SERIES[5], // series slot 6 (cyan)
  'Generation': SERIES[6],    // series slot 7 (rust)
  'Transmission': SERIES[7],  // series slot 8 (green)
  'Distribution': SERIES[8],  // series slot 9 (pink)
  'End Use': SERIES[9],       // series slot 10 (brown)
};
