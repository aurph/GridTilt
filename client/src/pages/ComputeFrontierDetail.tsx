import { type ReactNode } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Atom, ExternalLink } from "lucide-react";
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
  notes?: string;
}

const STATUS_COLOR: Record<string, string> = STATUS_COLORS;

function Est({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="ml-1 text-9 font-mono uppercase tracking-wide text-brand-2/80 align-top">est.</span>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border border-card-border rounded p-3 bg-card/40">
      <div className="text-10 font-mono uppercase tracking-wider text-muted-foreground/70 mb-0.5">{label}</div>
      <div className="text-sm text-foreground tabular-nums">{children}</div>
    </div>
  );
}

export default function ComputeFrontierDetail() {
  const [, params] = useRoute("/compute-frontier/:id");
  const id = params?.id;
  const { data: cluster, isLoading, isError } = useQuery<Cluster>({
    queryKey: ["/api/clusters", id ?? ""],
    enabled: !!id,
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <PageHeader
        title={cluster ? cluster.name : isLoading ? "Loading" : "Cluster not found"}
        testId="cfd-header"
        stats={
          cluster ? (
            <>
              <Badge variant="outline" className="text-10 font-mono px-1.5 py-0" style={{ color: STATUS_COLOR[cluster.status], borderColor: `${STATUS_COLOR[cluster.status]}55` }}>
                {cluster.status}
              </Badge>
              <span className="text-xs text-muted-foreground">{cluster.operator}</span>
              <span className="text-xs text-muted-foreground">{cluster.location.city}, {cluster.location.state}</span>
            </>
          ) : undefined
        }
        right={
          <Link href="/compute-frontier" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" data-testid="cfd-back">
            <ArrowLeft className="h-3.5 w-3.5" /> Compute Frontier
          </Link>
        }
      />

      <div className="flex-1 p-4 sm:p-6 space-y-4 max-w-4xl">
        {isError || (!isLoading && !cluster) ? (
          <p className="text-sm text-muted-foreground" data-testid="cfd-error">
            No cluster matches this id. Back to the{" "}
            <Link href="/compute-frontier" className="text-brand hover:text-brand-2">Compute Frontier</Link>.
          </p>
        ) : isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array(8).fill(null).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : cluster ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="cfd-facts">
              <Fact label="GPUs / accelerators">{cluster.gpuCount == null ? "not disclosed" : cluster.gpuCount.toLocaleString()}<Est on={cluster.estimated.includes("gpuCount")} /></Fact>
              <Fact label="Chip">{cluster.chipType}</Fact>
              <Fact label="Rated power">{cluster.ratedPowerMW === 0 ? "—" : `${cluster.ratedPowerMW.toLocaleString()} MW`}<Est on={cluster.estimated.includes("ratedPowerMW")} /></Fact>
              <Fact label="Planned power">{cluster.plannedPowerMW.toLocaleString()} MW<Est on={cluster.estimated.includes("plannedPowerMW")} /></Fact>
              <Fact label="Grid region">{cluster.gridRegion}</Fact>
              <Fact label="Energy source">{cluster.energySource}</Fact>
              <Fact label="Workload">{cluster.workload}</Fact>
              <Fact label="Online">{cluster.onlineDate}<Est on={cluster.estimated.includes("onlineDate")} /></Fact>
            </div>

            {cluster.notes && (
              <Card className="border-card-border p-4">
                <div className="text-10 font-mono uppercase tracking-wider text-muted-foreground/70 mb-1">Context</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{cluster.notes}</p>
              </Card>
            )}

            <Card className="border-card-border p-4" data-testid="cfd-power">
              <div className="flex items-center gap-2 mb-1.5">
                <Atom className="h-4 w-4 text-brand" />
                <span className="text-10 font-mono uppercase tracking-wider text-muted-foreground/70">Power</span>
              </div>
              {cluster.linkedDeal ? (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This cluster's power is tied to a tracked nuclear-for-AI deal,{" "}
                  <span className="text-foreground font-mono">{cluster.linkedDeal}</span>. See it on the{" "}
                  <Link href="/queue" className="text-brand hover:text-brand-2">Backlog</Link> page.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Powered by {cluster.energySource}. No tracked nuclear-for-AI deal applies to this site, which is the
                  common case across the frontier.
                </p>
              )}
            </Card>

            <Card className="border-card-border p-4" data-testid="cfd-sources">
              <div className="text-10 font-mono uppercase tracking-wider text-muted-foreground/70 mb-2">Sources</div>
              <ul className="space-y-1">
                {cluster.sources.map((s, i) => (
                  <li key={i}>
                    <a href={s} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:text-brand-2 inline-flex items-center gap-1 break-all">
                      {s} <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </Card>

            <p className="text-11 text-muted-foreground/60 leading-relaxed">
              Figures marked <span className="text-brand-2">est.</span> are GridTilt estimates or announced targets not
              yet realized. GPU counts read "not disclosed" where an operator has not published one. Tracked from public
              announcements; this registry is not exhaustive.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
