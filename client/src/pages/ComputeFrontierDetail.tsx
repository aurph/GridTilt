import { type ReactNode } from "react";
import { useRoute, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Cpu, Atom, ExternalLink } from "lucide-react";

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

const STATUS_COLOR: Record<string, string> = {
  operational: "#F07800",
  construction: "#F0A500",
  announced: "#9a9a9a",
};

function Est({ on }: { on: boolean }) {
  if (!on) return null;
  return <span className="ml-1 text-[9px] font-mono uppercase tracking-wide text-[#F0A500]/80 align-top">est.</span>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border border-card-border rounded p-3 bg-card/40">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-0.5">{label}</div>
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
      <div className="grid-bg border-b border-border px-4 sm:px-6 py-5">
        <Link href="/compute-frontier" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3" data-testid="cfd-back">
          <ArrowLeft className="h-3.5 w-3.5" /> Compute Frontier
        </Link>
        {isLoading ? (
          <Skeleton className="h-8 w-80" />
        ) : isError || !cluster ? (
          <h1 className="text-xl font-semibold text-foreground">Cluster not found</h1>
        ) : (
          <div className="flex items-start gap-3">
            <Cpu className="h-6 w-6 text-[#F07800] mt-0.5 flex-shrink-0" />
            <div>
              <h1 className="text-2xl font-semibold text-foreground tracking-tight">{cluster.name}</h1>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span>{cluster.operator}</span>
                <span className="text-muted-foreground/30">·</span>
                <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0" style={{ color: STATUS_COLOR[cluster.status], borderColor: `${STATUS_COLOR[cluster.status]}55` }}>
                  {cluster.status}
                </Badge>
                <span className="text-muted-foreground/30">·</span>
                <span>{cluster.location.city}, {cluster.location.state}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 p-4 sm:p-6 space-y-4 max-w-4xl">
        {isError || (!isLoading && !cluster) ? (
          <p className="text-sm text-muted-foreground" data-testid="cfd-error">
            No cluster matches this id. Back to the{" "}
            <Link href="/compute-frontier" className="text-[#F07800] hover:text-[#F0A500]">Compute Frontier</Link>.
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
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-1">Context</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{cluster.notes}</p>
              </Card>
            )}

            <Card className="border-card-border p-4" data-testid="cfd-power">
              <div className="flex items-center gap-2 mb-1.5">
                <Atom className="h-4 w-4 text-[#F07800]" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">Power</span>
              </div>
              {cluster.linkedDeal ? (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  This cluster's power is tied to a tracked nuclear-for-AI deal,{" "}
                  <span className="text-foreground font-mono">{cluster.linkedDeal}</span>. See it on the{" "}
                  <Link href="/queue" className="text-[#F07800] hover:text-[#F0A500]">Backlog</Link> page.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Powered by {cluster.energySource}. No tracked nuclear-for-AI deal applies to this site, which is the
                  common case across the frontier.
                </p>
              )}
            </Card>

            <Card className="border-card-border p-4" data-testid="cfd-sources">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 mb-2">Sources</div>
              <ul className="space-y-1">
                {cluster.sources.map((s, i) => (
                  <li key={i}>
                    <a href={s} target="_blank" rel="noopener noreferrer" className="text-xs text-[#F07800] hover:text-[#F0A500] inline-flex items-center gap-1 break-all">
                      {s} <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </Card>

            <p className="text-[11px] text-muted-foreground/60 leading-relaxed">
              Figures marked <span className="text-[#F0A500]">est.</span> are GridTilt estimates or announced targets not
              yet realized. GPU counts read "not disclosed" where an operator has not published one. Tracked from public
              announcements; this registry is not exhaustive.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
