import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { ErrorState } from "@/components/Freshness";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_COLORS } from "@/lib/tokens";
import { homesEquivalent } from "@/lib/scale-compare";

/**
 * "What is the biggest data center in America?"
 *
 * A question an ordinary person asks and that this product could not answer on a
 * phone. Everything here is read off the same /api/datacenters payload the map
 * uses, so it costs no extra request and can never disagree with the dots.
 *
 * The running / being-built split is the point, not a detail. The largest sites
 * in the country are not built yet, so a single "biggest" number would be
 * technically sourced and still misleading. Answering both keeps it honest and
 * happens to be the more interesting answer.
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

const MODES: Array<{ id: Mode; label: string; blurb: string }> = [
  { id: "running", label: "Running now", blurb: "Live and drawing power today" },
  { id: "building", label: "Being built", blurb: "Under construction or announced" },
];

export function BiggestDataCenters() {
  const [mode, setMode] = useState<Mode>("running");
  const { data, isLoading, isError, refetch } = useQuery<DataCenter[]>({
    // Same key the map uses, so react-query serves both from one fetch.
    queryKey: ["/api/datacenters"],
  });

  const all = data ?? [];
  const pool = all.filter((d) =>
    mode === "running" ? d.status === "operational" : d.status !== "operational",
  );
  const ranked = [...pool].sort((a, b) => b.powerMW - a.powerMW).slice(0, 5);
  const leader = ranked[0];
  const max = leader?.powerMW ?? 0;
  const homes = leader ? homesEquivalent(leader.annualMWh) : null;

  return (
    <div className="border-t border-border px-4 sm:px-6 py-5" data-testid="biggest-datacenters">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
        <span className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">Biggest in America</h2>
        </span>
        <div className="flex rounded-md overflow-hidden border border-subtle text-xs" role="group" aria-label="Which sites to rank">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`px-3 py-1.5 transition-colors ${
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
        <span className="text-11 text-muted-foreground/70">
          {MODES.find((m) => m.id === mode)?.blurb}
        </span>
      </div>

      {isError ? (
        <ErrorState label="Facility data failed to load." onRetry={() => refetch()} className="py-4" />
      ) : isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded" />
          <Skeleton className="h-10 w-full rounded" />
        </div>
      ) : !leader ? (
        <p className="text-xs text-muted-foreground py-4">
          No {mode === "running" ? "operational" : "planned"} facilities in the tracked set.
        </p>
      ) : (
        <>
          {/* The answer, stated plainly and large enough to read at arm's length. */}
          <div className="rounded-lg border border-brand/25 bg-brand/5 p-4" data-testid="biggest-leader">
            <p className="text-10 font-mono uppercase tracking-[0.12em] text-brand">
              {mode === "running" ? "Largest running today" : "Largest being built"}
            </p>
            <p className="mt-1.5 text-[17px] font-semibold leading-tight text-foreground">{leader.name}</p>
            <p className="text-xs text-muted-foreground">
              {leader.company} &middot; {leader.city}, {leader.state}
            </p>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[28px] font-bold leading-none text-brand-2 tabular-nums">
                {leader.powerMW.toLocaleString()} MW
              </span>
              {homes !== null && (
                <span className="text-xs text-muted-foreground">
                  about the electricity {homes.toLocaleString("en-US")} US homes use in a year
                </span>
              )}
            </div>
          </div>

          <ol className="mt-3 space-y-1.5" data-testid="biggest-ranked">
            {ranked.map((d, i) => (
              <li key={d.id} className="flex items-center gap-3" data-testid={`biggest-row-${i}`}>
                <span className="w-4 shrink-0 font-mono text-11 text-muted-foreground/60 tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-foreground">{d.name}</span>
                  {/* Bar is width-relative to the leader, so the gap between
                      first and fifth is visible without reading a number. */}
                  <span className="mt-1 block h-1.5 w-full rounded-full bg-surface-base" aria-hidden>
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${max > 0 ? (d.powerMW / max) * 100 : 0}%`,
                        backgroundColor: STATUS_COLORS[d.status],
                      }}
                    />
                  </span>
                </span>
                <span className="w-20 shrink-0 text-right font-mono text-xs text-foreground tabular-nums">
                  {d.powerMW.toLocaleString()} MW
                </span>
              </li>
            ))}
          </ol>

          <p className="mt-3 text-10 leading-relaxed text-muted-foreground/70">
            Ranked by rated power across the {all.length} facilities GridTilt tracks at 400 MW and
            above. Homes equivalent uses the EIA figure of 10,791 kWh per US residential customer
            per year and is a scale comparison, not a count of homes actually served.{" "}
            <a
              href="https://www.eia.gov/tools/faqs/faq.php?id=97&t=3"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:text-brand-2"
            >
              EIA
            </a>
          </p>
        </>
      )}
    </div>
  );
}
