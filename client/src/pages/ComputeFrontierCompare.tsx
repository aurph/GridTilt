import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { EstFlag, PageShell, PageTitle, Provenance } from "@/components/editorial";

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
}

/** Status is typographic, not a pill: weight and ink step carry the state. */
const STATUS_CLASS: Record<string, string> = {
  operational: "font-semibold text-ink",
  construction: "text-ink-secondary",
  announced: "text-ink-muted",
};

/** Ochre dagger on any value whose field is in the cluster's estimated[]. */
function est(c: Cluster, field: string): ReactNode {
  return c.estimated.includes(field) ? <EstFlag /> : null;
}

export default function ComputeFrontierCompare() {
  const { data: clusters, isLoading, isError } = useQuery<Cluster[]>({ queryKey: ["/api/clusters"] });

  const sorted = useMemo(
    () => (clusters ? [...clusters].sort((a, b) => b.plannedPowerMW - a.plannedPowerMW) : []),
    [clusters],
  );

  const [sel, setSel] = useState<string[]>(["", "", ""]);

  // Seed the first two columns with the largest clusters once data arrives.
  useEffect(() => {
    if (sorted.length && sel.every((s) => s === "")) {
      setSel([sorted[0]?.id ?? "", sorted[1]?.id ?? "", ""]);
    }
  }, [sorted, sel]);

  const chosen = sel.map((id) => sorted.find((c) => c.id === id)).filter((c): c is Cluster => !!c);

  const rows: Array<{ label: string; num?: boolean; render: (c: Cluster) => ReactNode }> = [
    { label: "Operator", render: (c) => c.operator },
    { label: "Status", render: (c) => <span className={STATUS_CLASS[c.status] ?? "text-ink-muted"}>{c.status}</span> },
    { label: "Location", render: (c) => `${c.location.city}, ${c.location.state}` },
    { label: "Grid region", render: (c) => c.gridRegion },
    { label: "Chip", render: (c) => c.chipType },
    { label: "GPUs", num: true, render: (c) => (c.gpuCount == null ? "not disclosed" : <>{c.gpuCount.toLocaleString()}{est(c, "gpuCount")}</>) },
    { label: "Rated MW", num: true, render: (c) => (c.ratedPowerMW === 0 ? "—" : <>{c.ratedPowerMW.toLocaleString()}{est(c, "ratedPowerMW")}</>) },
    { label: "Planned MW", num: true, render: (c) => <>{c.plannedPowerMW.toLocaleString()}{est(c, "plannedPowerMW")}</> },
    { label: "Energy", render: (c) => c.energySource },
    { label: "Workload", render: (c) => c.workload },
    { label: "Online", render: (c) => <>{c.onlineDate}{est(c, "onlineDate")}</> },
    { label: "Nuclear deal", render: (c) => (c.linkedDeal ? <Link href="/queue" className="text-brand-ink no-underline hover:text-ink">{c.linkedDeal}</Link> : "none") },
  ];

  return (
    <PageShell>
      <PageTitle
        title="Compare clusters"
        dek="Two or three superclusters side by side, figure for figure."
        right={
          <Link href="/compute-frontier" className="text-[12.5px] font-semibold text-brand-ink no-underline hover:text-ink" data-testid="cfc-back">
            ← Compute Frontier
          </Link>
        }
        testId="cfc-header"
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError || sorted.length === 0 ? (
        <p className="text-[14px] text-ink-secondary" data-testid="cfc-error">Cluster dataset unavailable.</p>
      ) : (
        <>
          {/* Column pickers */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 mb-5" data-testid="cfc-pickers">
            {[0, 1, 2].map((i) => (
              <label key={i} className="flex items-center gap-1.5 text-[13px] text-ink-secondary">
                <span className="text-ink-muted">{String.fromCharCode(65 + i)}</span>
                <select
                  value={sel[i]}
                  onChange={(e) => setSel((s) => s.map((v, j) => (j === i ? e.target.value : v)))}
                  className="bg-paper border border-rule rounded-sm px-1.5 py-1 text-[13px] text-ink hover:border-rule-strong max-w-[220px]"
                  data-testid={`cfc-select-${i}`}
                >
                  <option value="">none</option>
                  {sorted.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            ))}
          </div>

          {/* Comparison table: ruled columns, one field per row */}
          {chosen.length === 0 ? (
            <p className="text-[14px] text-ink-secondary" data-testid="cfc-empty">Pick at least one cluster to compare.</p>
          ) : (
            <div className="overflow-x-auto" data-testid="cfc-table">
              <table className="print-table">
                <thead>
                  <tr>
                    <th className="w-32">Field</th>
                    {chosen.map((c) => (
                      <th key={c.id} className="min-w-[180px]">
                        <Link href={`/compute-frontier/${c.id}`} className="font-serif text-[15px] font-medium normal-case tracking-normal text-ink no-underline hover:text-brand-ink" style={{ fontVariantCaps: "normal" }}>
                          {c.name}
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <td className="text-ink-muted whitespace-nowrap">{row.label}</td>
                      {chosen.map((c) => (
                        <td key={c.id} className={row.num ? "tnum" : undefined}>{row.render(c)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-[12.5px] text-ink-muted">† estimated value</p>
              <Provenance source="GridTilt cluster registry" extra="tracked, not exhaustive" />
            </div>
          )}
        </>
      )}

      <p className="mt-8 text-[12.5px] text-ink-muted leading-relaxed">
        Back to the <Link href="/compute-frontier" className="text-brand-ink no-underline hover:text-ink">Compute Frontier</Link> or read the{" "}
        <Link href="/compute-frontier/methodology" className="text-brand-ink no-underline hover:text-ink">methodology</Link>.
      </p>
    </PageShell>
  );
}
