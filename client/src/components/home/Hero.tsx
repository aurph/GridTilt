import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, type Variants } from "framer-motion";
import { Zap, Handshake, Cpu, MapPin } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { GridPulse } from "./grid-pulse";
import { MarketTape } from "./market-tape";

interface ClusterMetrics {
  clusterCount: number;
  operationalMW: number;
  totalPlannedMW: number;
  byOperator: { operator: string }[];
}
interface DealMetrics { dealCount: number; totalContractedMW: number; }
interface GpuMetrics { fleetAvg: number; fleetAvg1yChange: number; modelCount: number; }

/** rAF count-up toward a target once it arrives; honest "--" before data. */
function useCountUp(target: number | null, decimals = 1, ms = 1100): string | null {
  const [display, setDisplay] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (target == null || started.current) return;
    started.current = true;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay((target * eased).toFixed(decimals));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, decimals, ms]);
  return display;
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: "easeOut" } },
};

export function Hero() {
  const { data: clusters } = useQuery<ClusterMetrics>({ queryKey: ["/api/clusters/metrics"] });
  const { data: deals } = useQuery<DealMetrics>({ queryKey: ["/api/deals/metrics"] });
  const { data: gpu } = useQuery<GpuMetrics>({ queryKey: ["/api/gpu-prices/metrics"] });

  const opGw = useCountUp(clusters ? clusters.operationalMW / 1000 : null);
  const dealGw = useCountUp(deals ? deals.totalContractedMW / 1000 : null);
  const gpuHr = useCountUp(gpu ? gpu.fleetAvg : null, 2);
  const clusterCount = useCountUp(clusters ? clusters.clusterCount : null, 0);

  const stats: { icon: typeof Zap; label: string; value: string; sub?: string }[] = [
    { icon: Zap, label: "Operational power for compute", value: opGw ? `${opGw} GW` : "--", sub: clusters ? `${(clusters.totalPlannedMW / 1000).toFixed(1)} GW planned` : undefined },
    { icon: Handshake, label: "Contracted power deals", value: dealGw ? `${dealGw} GW` : "--", sub: deals ? `${deals.dealCount} corporate deals` : undefined },
    { icon: Cpu, label: "Cost of compute", value: gpuHr ? `$${gpuHr}/hr` : "--", sub: gpu ? `${gpu.fleetAvg1yChange}% over a year` : undefined },
    { icon: MapPin, label: "Tracked clusters", value: clusterCount ?? "--", sub: clusters?.byOperator ? `${clusters.byOperator.length} operators` : undefined },
  ];

  return (
    <section
      className="gt-marketing relative w-full overflow-hidden border-b border-border"
      style={{ minHeight: "calc(100vh - 88px)" }}
      data-testid="home-hero"
    >
      <div className="absolute inset-0 z-0 opacity-75" aria-hidden>
        <GridPulse />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[inherit] max-w-[1200px] flex-col items-center justify-center px-6 py-16 text-center">
        <Wordmark />
        <motion.div
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.14, delayChildren: 1.5 }}
          className="flex w-full flex-col items-center"
        >
          <motion.p variants={fadeUp} className="mt-5 text-[16px] font-semibold text-foreground sm:text-[18px]">
            Energy infrastructure, in plain sight.
          </motion.p>
          <motion.p variants={fadeUp} className="mx-auto mt-3 max-w-[54ch] text-[14px] leading-[1.65] text-muted-foreground sm:text-[15px]">
            Data centers are rewriting the American power grid. GridTilt maps who is building,
            where the electricity comes from, and what it means for the bill you pay.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/overview"
              className="rounded bg-brand px-6 py-3 text-[14px] font-semibold text-black no-underline transition-opacity hover:opacity-90"
              data-testid="hero-cta-dashboard"
            >
              Open the dashboard
            </Link>
            <Link
              href="/power-map"
              className="rounded border border-border bg-card/60 px-6 py-3 text-[14px] font-semibold text-foreground no-underline transition-colors hover:border-brand/50"
              data-testid="hero-cta-map"
            >
              Explore the map
            </Link>
          </motion.div>

          <motion.div
            variants={fadeUp}
            className="mt-14 grid w-full grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
            data-testid="hero-stats"
          >
            {stats.map(({ icon: Icon, label, value, sub }) => (
              <motion.div
                key={label}
                whileHover={{ y: -3 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="rounded-md border border-border bg-card/80 px-4 py-3.5 text-left"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-brand" aria-hidden />
                  <span className="text-[12px] leading-tight text-muted-foreground">{label}</span>
                </div>
                <p className="mt-1.5 font-mono text-[24px] font-bold leading-none tracking-tight text-foreground tabular-nums">
                  {value}
                </p>
                {sub && <p className="mt-1 text-[11.5px] text-muted-foreground/80">{sub}</p>}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </div>
      <MarketTape />
    </section>
  );
}
