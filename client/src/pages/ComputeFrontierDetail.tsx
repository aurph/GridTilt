import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { EstFlag, PageShell, Provenance, PullStat, RuleSection } from "@/components/editorial";

interface Cluster {
  id: string;
  name: string;
  operator: string;
  status: "operational" | "construction" | "announced";
  location: { city: string; state: string; lat: number; lng: number };
  gridRegion: string;
  gpuCount: number | null;
  chipType: string;
  ratedPowerMW: number;
  plannedPowerMW: number;
  energySource: string;
  workload: string;
  linkedDeal: string | null;
  onlineDate: string;
  estimated: string[];
  sources: string[];
  notes?: string;
}

/** Status is typographic, not a pill: weight and ink step carry the state. */
const STATUS_CLASS: Record<string, string> = {
  operational: "font-semibold text-ink",
  construction: "text-ink-secondary",
  announced: "text-ink-muted",
};

export default function ComputeFrontierDetail() {
  const [, params] = useRoute("/compute-frontier/:id");
  const id = params?.id;
  const { data: cluster, isLoading, isError } = useQuery<Cluster>({
    queryKey: ["/api/clusters", id ?? ""],
    enabled: !!id,
  });

  return (
    <PageShell>
      {/* Reference-entry lead: serif name over a classification line */}
      <div className="pt-7 sm:pt-9 pb-4 border-b border-rule mb-6" data-testid="cfd-header">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="font-serif font-medium text-[30px] sm:text-[36px] leading-[1.05] tracking-tight text-ink">
              {cluster ? cluster.name : isLoading ? "Loading" : "Cluster not found"}
            </h1>
            {cluster && (
              <p className="mt-2 text-[14px] text-ink-secondary">
                {cluster.operator} · <span className={STATUS_CLASS[cluster.status] ?? "text-ink-muted"}>{cluster.status}</span> · {cluster.location.city}, {cluster.location.state}
              </p>
            )}
          </div>
          <Link href="/compute-frontier" className="text-[12.5px] font-semibold text-ink no-underline hover:text-brand-ink pb-1" data-testid="cfd-back">
            ← Compute Frontier
          </Link>
        </div>
      </div>

      <div className="max-w-[900px]">
        {isError || (!isLoading && !cluster) ? (
          <p className="text-[14px] text-ink-secondary" data-testid="cfd-error">
            No cluster matches this id. Back to the{" "}
            <Link href="/compute-frontier" className="text-ink no-underline hover:text-brand-ink">Compute Frontier</Link>.
          </p>
        ) : isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">{Array(8).fill(null).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : cluster ? (
          <>
            {/* Key figures */}
            <div data-testid="cfd-facts">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-5 pb-5 border-b border-rule">
                <PullStat
                  label="GPUs / accelerators"
                  value={cluster.gpuCount == null ? "not disclosed" : cluster.gpuCount.toLocaleString()}
                  delta={cluster.estimated.includes("gpuCount") ? <EstFlag /> : undefined}
                />
                <PullStat
                  label="Rated power"
                  value={cluster.ratedPowerMW === 0 ? "—" : `${cluster.ratedPowerMW.toLocaleString()} MW`}
                  delta={cluster.estimated.includes("ratedPowerMW") ? <EstFlag /> : undefined}
                />
                <PullStat
                  label="Planned power"
                  value={`${cluster.plannedPowerMW.toLocaleString()} MW`}
                  delta={cluster.estimated.includes("plannedPowerMW") ? <EstFlag /> : undefined}
                />
                <PullStat
                  label="Online"
                  value={cluster.onlineDate}
                  delta={cluster.estimated.includes("onlineDate") ? <EstFlag /> : undefined}
                />
              </div>
              {/* Classification list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10">
                {[
                  { label: "Chip", value: cluster.chipType },
                  { label: "Grid region", value: cluster.gridRegion },
                  { label: "Energy source", value: cluster.energySource },
                  { label: "Workload", value: cluster.workload },
                ].map((f) => (
                  <div key={f.label} className="flex items-baseline justify-between gap-4 py-2 border-b border-rule text-[13.5px]">
                    <span className="text-ink-muted">{f.label}</span>
                    <span className="text-ink text-right">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {cluster.notes && (
              <RuleSection head="Context">
                <p className="max-w-[68ch] text-[15px] leading-relaxed text-ink-secondary">{cluster.notes}</p>
              </RuleSection>
            )}

            <RuleSection head="Power" testId="cfd-power">
              {cluster.linkedDeal ? (
                <p className="max-w-[68ch] text-[15px] leading-relaxed text-ink-secondary">
                  This cluster's power is tied to a tracked nuclear-for-AI deal,{" "}
                  <span className="text-ink font-medium">{cluster.linkedDeal}</span>. See it on the{" "}
                  <Link href="/queue" className="text-ink no-underline hover:text-brand-ink">Backlog</Link> page.
                </p>
              ) : (
                <p className="max-w-[68ch] text-[15px] leading-relaxed text-ink-secondary">
                  Powered by {cluster.energySource}. No tracked nuclear-for-AI deal applies to this site, which is the
                  common case across the frontier.
                </p>
              )}
            </RuleSection>

            <RuleSection head="Sources" testId="cfd-sources">
              <ul>
                {cluster.sources.map((s, i) => (
                  <li key={i} className="py-1.5 border-b border-rule last:border-b-0">
                    <a
                      href={s}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] text-ink-secondary underline decoration-rule-strong underline-offset-2 hover:text-brand-ink break-all"
                    >
                      {s}
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12.5px] text-ink-muted">† estimated value</p>
              <Provenance
                source="GridTilt cluster registry"
                extra="figures marked † are GridTilt estimates or announced targets not yet realized; GPU counts read not disclosed where an operator has not published one; tracked from public announcements, not exhaustive"
              />
            </RuleSection>
          </>
        ) : null}
      </div>
    </PageShell>
  );
}
