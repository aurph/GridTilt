/**
 * RTO/ISO reserve margins and AI-load signals - NERC LTRA 2025 (2026
 * projections). Single source of truth: the Power map, its operator table,
 * and the overview's Grid Headroom gauge all read from here.
 */
export interface RTOConfig {
  label: string;
  reserveMargin: number;
  aiSignal: "Critical" | "Elevated" | "Moderate" | "Low";
}

export const RTO_CONFIG: Record<string, RTOConfig> = {
  PJM:   { label: "PJM",   reserveMargin: 17.5, aiSignal: "Elevated" },
  MISO:  { label: "MISO",  reserveMargin: 13.4, aiSignal: "Critical" },
  ERCOT: { label: "ERCOT", reserveMargin: 15.8, aiSignal: "Critical" },
  WECC:  { label: "WECC",  reserveMargin: 24.6, aiSignal: "Moderate" },
  SERC:  { label: "SERC",  reserveMargin: 23.1, aiSignal: "Moderate" },
  SPP:   { label: "SPP",   reserveMargin: 27.8, aiSignal: "Low" },
  NPCC:  { label: "NPCC",  reserveMargin: 26.4, aiSignal: "Low" },
};

export const RTO_SOURCE_NOTE = "NERC LTRA 2025 (2026 projections)";
