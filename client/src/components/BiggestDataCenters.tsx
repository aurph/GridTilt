import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { ErrorState } from "@/components/Freshness";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_COLORS } from "@/lib/tokens";
import { filterTrackedFacilities } from "@/lib/real-gauges";
import { BarRow, ExplainerSection } from "@/components/BarRow";

/**
 * Largest tracked facility, running and being built.
 *
 * Reads the same /api/datacenters payload as the map, filtered to the same
 * >= 400 MW floor. The largest sites in the country are not built yet, so a single
 * "biggest" number would be misleading; both are shown.
 */

interface DataCenter {
  id: number;
  name: string;
  company: string;
  city: string;
  state: string;
  powerMW: number;
  status: "operational" | "construction" | "announced";
  annualMWh: number;
}

type Mode = "running" | "building";

const MODES: Array<{ id: Mode; label: string }> = [
  { id: "running", label: "Running now" },
  { id: "building", label: "Being built" },
];

export function BiggestDataCenters() {
  const [mode, setMode] = useState<Mode>("running");
  const { data, isLoading, isError, refetch } = useQuery<DataCenter[]>({
    // Same key the map uses, so react-query serves both from one fetch.
    queryKey: ["/api/datacenters"],
  });

  const all = filterTrackedFacilities(data ?? []);
  const pool = all.filter((d) =>
    mode === "running" ? d.status === "operational" : d.status !== "operational",
  );
  const ranked = [...pool].sort((a, b) => b.powerMW - a.powerMW).slice(0, 5);
  const leader = ranked[0];
  const max = leader?.powerMW ?? 0;

  return (
    <ExplainerSection
      icon={<Trophy />}
      title="Biggest in America"
      testid="biggest-datacenters"
      aside={
        <div className="flex rounded-md overflow-hidden border border-subtle text-11" role="group" aria-label="Which sites to rank">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`px-2.5 py-1 transition-colors ${
                mode === m.id
                  ? "bg-brand text-black font-semibold"
                  : "bg-surface-raised text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`biggest-mode-${m.id}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      }
    >
      {isError ? (
        <ErrorState label="Facility data failed to load." onRetry={() => refetch()} className="py-4" />
      ) : isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-7 w-full rounded" />
          <Skeleton className="h-7 w-full rounded" />
        </div>
      ) : !leader ? (
        <p className="text-xs text-muted-foreground py-4">
          No {mode === "running" ? "operational" : "planned"} facilities in the tracked set.
        </p>
      ) : (
        <>
          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-brand/25 bg-brand/5 px-3 py-2"
            data-testid="biggest-leader"
          >
            <div className="min-w-0">
              <p className="text-10 font-mono uppercase tracking-[0.12em] text-brand">
                {mode === "running" ? "Largest running today" : "Largest being built"}
              </p>
              <p className="truncate text-[15px] font-semibold leading-tight text-foreground">{leader.name}</p>
              <p className="truncate text-11 text-muted-foreground">
                {leader.company} &middot; {leader.city}, {leader.state}
              </p>
            </div>
            <span className="shrink-0 font-mono text-[22px] font-bold leading-none text-brand-2 tabular-nums">
              {leader.powerMW.toLocaleString()} MW
            </span>
          </div>

          <ol className="mt-2" data-testid="biggest-ranked">
            {ranked.map((d, i) => (
              <li key={d.id}>
                <BarRow
                  rank={i + 1}
                  label={d.name}
                  labelClassName="w-32 sm:w-48"
                  segments={[{ pct: max > 0 ? (d.powerMW / max) * 100 : 0, color: STATUS_COLORS[d.status] }]}
                  value={`${d.powerMW.toLocaleString()} MW`}
                  title={`${d.company} · ${d.city}, ${d.state}`}
                  testid={`biggest-row-${i}`}
                />
              </li>
            ))}
          </ol>

          <p className="mt-2 text-10 leading-relaxed text-muted-foreground/70">
            Ranked by rated power across the {all.length} facilities GridTilt tracks at 400 MW and
            above.
          </p>
        </>
      )}
    </ExplainerSection>
  );
}
