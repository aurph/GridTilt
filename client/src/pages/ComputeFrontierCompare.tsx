import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { STATUS_COLORS } from "@/lib/tokens";

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

const STATUS_COLOR: Record<string, string> = STATUS_COLORS;

function est(c: Cluster, field: string): string {
  return c.estimated.includes(field) ? " est." : "";
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

  const rows: Array<{ label: string; render: (c: Cluster) => ReactNode }> = [
    { label: "Operator", render: (c) => c.operator },
    { label: "Status", render: (c) => <Badge variant="outline" className="text-9 px-1.5 py-0" style={{ color: STATUS_COLOR[c.status], borderColor: `${STATUS_COLOR[c.status]}55` }}>{c.status}</Badge> },
    { label: "Location", render: (c) => `${c.location.city}, ${c.location.state}` },
    { label: "Grid region", render: (c) => c.gridRegion },
    { label: "Chip", render: (c) => c.chipType },
    { label: "GPUs", render: (c) => (c.gpuCount == null ? "not disclosed" : `${c.gpuCount.toLocaleString()}${est(c, "gpuCount")}`) },
    { label: "Rated MW", render: (c) => (c.ratedPowerMW === 0 ? "—" : `${c.ratedPowerMW.toLocaleString()}${est(c, "ratedPowerMW")}`) },
    { label: "Planned MW", render: (c) => `${c.plannedPowerMW.toLocaleString()}${est(c, "plannedPowerMW")}` },
    { label: "Energy", render: (c) => c.energySource },
    { label: "Workload", render: (c) => c.workload },
    { label: "Online", render: (c) => `${c.onlineDate}${est(c, "onlineDate")}` },
    { label: "Nuclear deal", render: (c) => (c.linkedDeal ? <Link href="/queue" className="text-brand hover:text-brand-2">{c.linkedDeal}</Link> : "none") },
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title="Compare clusters"
        testId="cfc-header"
        about={
          <>Put two or three superclusters side by side. Values marked <span className="text-brand-2">est.</span> are GridTilt estimates or announced targets.</>
        }
        right={
          <Link href="/compute-frontier" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" data-testid="cfc-back">
            <ArrowLeft className="h-3.5 w-3.5" /> Compute Frontier
          </Link>
        }
      />

      <div className="flex-1 p-4 sm:p-6 space-y-4">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : isError || sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="cfc-error">Cluster dataset unavailable.</p>
        ) : (
          <>
            {/* Column pickers */}
            <div className="flex flex-wrap gap-3" data-testid="cfc-pickers">
              {[0, 1, 2].map((i) => (
                <label key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="text-muted-foreground/60">{String.fromCharCode(65 + i)}</span>
                  <select
                    value={sel[i]}
                    onChange={(e) => setSel((s) => s.map((v, j) => (j === i ? e.target.value : v)))}
                    className="bg-surface-base border border-subtle rounded px-1.5 py-1 text-xs text-foreground focus:outline-none focus:border-brand/40 max-w-[220px]"
                    data-testid={`cfc-select-${i}`}
                  >
                    <option value="" className="bg-surface-raised">none</option>
                    {sorted.map((c) => <option key={c.id} value={c.id} className="bg-surface-raised">{c.name}</option>)}
                  </select>
                </label>
              ))}
            </div>

            {/* Comparison table */}
            {chosen.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="cfc-empty">Pick at least one cluster to compare.</p>
            ) : (
              <Card className="border-card-border overflow-x-auto" data-testid="cfc-table">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-surface-base border-b border-border">
                      <th className="text-left px-4 py-2 text-[11px] text-muted-foreground font-medium w-32">Field</th>
                      {chosen.map((c) => (
                        <th key={c.id} className="text-left px-4 py-2 min-w-[180px]">
                          <Link href={`/compute-frontier/${c.id}`} className="text-foreground hover:text-brand font-semibold no-underline">{c.name}</Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.label} className="border-b border-border/30 last:border-0">
                        <td className="px-4 py-2 text-[11px] text-muted-foreground/70 align-top">{row.label}</td>
                        {chosen.map((c) => (
                          <td key={c.id} className="px-4 py-2 text-foreground align-top">{row.render(c)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}

        <p className="text-11 text-muted-foreground/60">
          Back to the <Link href="/compute-frontier" className="text-brand hover:text-brand-2">Compute Frontier</Link> or read the{" "}
          <Link href="/compute-frontier/methodology" className="text-brand hover:text-brand-2">methodology</Link>.
        </p>
      </div>
    </div>
  );
}
