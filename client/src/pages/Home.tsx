import { useQuery } from "@tanstack/react-query";
import { LandingHero } from "@/components/home/landing-hero";
import { Provenance, PullStat } from "@/components/editorial";

interface ClusterMetrics {
  clusterCount: number;
  operationalMW: number;
  totalPlannedMW: number;
  byOperator: { operator: string }[];
}

interface DealMetrics {
  dealCount: number;
  totalContractedMW: number;
}

interface GpuMetrics {
  asOf: string;
  fleetAvg: number;
  fleetAvg1yChange: number;
  modelCount: number;
}

function fmtGW(mw: number): string {
  return `${(mw / 1000).toFixed(1).replace(/\.0$/, "")} GW`;
}

/** Live figures under the intro: what the instrument is tracking right now. */
function StatsBand() {
  const { data: clusters } = useQuery<ClusterMetrics>({ queryKey: ["/api/clusters/metrics"] });
  const { data: deals } = useQuery<DealMetrics>({ queryKey: ["/api/deals/metrics"] });
  const { data: gpu } = useQuery<GpuMetrics>({ queryKey: ["/api/gpu-prices/metrics"] });

  return (
    <section className="mx-auto max-w-[1200px] px-5 sm:px-8 py-10" data-testid="home-stats">
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4 lg:divide-x lg:divide-rule lg:[&>div+div]:pl-6">
        <div>
          <PullStat
            label="Operational power for compute"
            value={clusters ? fmtGW(clusters.operationalMW) : "--"}
            note={clusters ? `${fmtGW(clusters.totalPlannedMW)} planned` : undefined}
          />
          <Provenance source="GridTilt cluster registry" />
        </div>
        <div>
          <PullStat
            label="Contracted power deals"
            value={deals ? fmtGW(deals.totalContractedMW) : "--"}
            note={deals ? `${deals.dealCount} corporate deals` : undefined}
          />
          <Provenance source="GridTilt deal registry" />
        </div>
        <div>
          <PullStat
            label="Cost of compute"
            value={gpu ? `$${gpu.fleetAvg.toFixed(2)}/hr` : "--"}
            delta={
              gpu ? (
                <span className={`text-[13px] font-semibold tnum ${gpu.fleetAvg1yChange <= 0 ? "text-positive" : "text-negative"}`}>
                  {gpu.fleetAvg1yChange > 0 ? "+" : ""}{gpu.fleetAvg1yChange}% 1y
                </span>
              ) : undefined
            }
            note={gpu ? `fleet average, ${gpu.modelCount} GPUs` : undefined}
          />
          <Provenance source="GridTilt GPU index" updated={gpu?.asOf} />
        </div>
        <div>
          <PullStat
            label="Tracked clusters"
            value={clusters ? String(clusters.clusterCount) : "--"}
            note={clusters?.byOperator?.length ? `across ${clusters.byOperator.length} operators` : undefined}
          />
          <Provenance source="GridTilt cluster registry" />
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <LandingHero />
      <StatsBand />
    </>
  );
}
