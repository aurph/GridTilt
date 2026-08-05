import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, type Variants } from "framer-motion";
import { Zap, Handshake, Cpu, MapPin } from "lucide-react";
import { Wordmark } from "./Wordmark";
import { GridPulse } from "./grid-pulse";
import { MarketTape } from "./market-tape";

// The wordmark leads and the tagline stays as shipped; the hero's job here is
// to prove the numbers under it are real. Every figure carries the date its
// dataset was last refreshed, read from the same API that serves the figure.
// Nothing is hardcoded, and a stat with no refresh date says so rather than
// borrowing today's.

interface ClusterMetrics {
  clusterCount: number;
  operationalMW: number;
  totalPlannedMW: number;
  byOperator: { operator: string }[];
  lastRefreshed: string | null;
}
interface DealMetrics {
  dealCount: number;
  totalContractedMW: number;
  lastRefreshed: string | null;
}
interface GpuMetrics {
  fleetAvg: number;
  fleetAvg1yChange: number;
  modelCount: number;
  lastRefreshed: string | null;
  asOf: string | null;
}

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-06-26" -> "26 Jun 2026". Null when the API gave us nothing usable. */
function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const mon = MONTHS[Number(m[2]) - 1];
  return mon ? `${Number(m[3])} ${mon} ${m[1]}` : null;
}

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

interface HeroStat {
  icon: typeof Zap;
  label: string;
  value: string;
  sub?: string;
  /** Dataset refresh date. Null renders "no date" rather than inventing one. */
  asOf: string | null;
  href: string;
}

export function Hero() {
  const { data: clusters } = useQuery<ClusterMetrics>({ queryKey: ["/api/clusters/metrics"] });
  const { data: deals } = useQuery<DealMetrics>({ queryKey: ["/api/deals/metrics"] });
  const { data: gpu } = useQuery<GpuMetrics>({ queryKey: ["/api/gpu-prices/metrics"] });

  const opGw = useCountUp(clusters ? clusters.operationalMW / 1000 : null);
  const dealGw = useCountUp(deals ? deals.totalContractedMW / 1000 : null);
  const gpuHr = useCountUp(gpu ? gpu.fleetAvg : null, 2);
  const clusterCount = useCountUp(clusters ? clusters.clusterCount : null, 0);

  const stats: HeroStat[] = [
    {
      icon: Zap,
      label: "Operational power for compute",
      value: opGw ? `${opGw} GW` : "--",
      sub: clusters ? `${(clusters.totalPlannedMW / 1000).toFixed(1)} GW planned` : undefined,
      asOf: shortDate(clusters?.lastRefreshed),
      href: "/compute-frontier",
    },
    {
      icon: Handshake,
      label: "Contracted power deals",
      value: dealGw ? `${dealGw} GW` : "--",
      sub: deals ? `${deals.dealCount} corporate deals` : undefined,
      asOf: shortDate(deals?.lastRefreshed),
      href: "/power-deals",
    },
    {
      icon: Cpu,
      label: "Cost of compute",
      value: gpuHr ? `$${gpuHr}/hr` : "--",
      sub: gpu ? `${gpu.fleetAvg1yChange}% over a year` : undefined,
      asOf: shortDate(gpu?.asOf ?? gpu?.lastRefreshed),
      href: "/neocloud-intel",
    },
    {
      icon: MapPin,
      label: "Tracked clusters",
      value: clusterCount ?? "--",
      sub: clusters?.byOperator ? `${clusters.byOperator.length} operators` : undefined,
      asOf: shortDate(clusters?.lastRefreshed),
      href: "/power-map",
    },
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

          {/* The ledger. Each figure links to the module that shows its working
              and prints the date its own dataset was last refreshed, so a stale
              number is visible as stale instead of reading as today's. */}
          <motion.div
            variants={fadeUp}
            className="mt-14 grid w-full grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
            data-testid="hero-stats"
          >
            {stats.map(({ icon: Icon, label, value, sub, asOf, href }, i) => (
              <Link
                key={label}
                href={href}
                className="no-underline"
                data-testid={`hero-stat-${i}`}
              >
                <motion.div
                  whileHover={{ y: -3 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className="group h-full rounded-md border border-border bg-card/80 px-4 py-3.5 text-left transition-colors hover:border-brand/50"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-brand" aria-hidden />
                    <span className="text-[12px] leading-tight text-muted-foreground">{label}</span>
                  </div>
                  <p className="mt-1.5 font-mono text-[24px] font-bold leading-none tracking-tight text-foreground tabular-nums transition-colors group-hover:text-brand">
                    {value}
                  </p>
                  {sub && <p className="mt-1 text-[11.5px] text-muted-foreground/80">{sub}</p>}
                  <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">
                    {asOf ? `as of ${asOf}` : "no date"}
                  </p>
                </motion.div>
              </Link>
            ))}
          </motion.div>
        </motion.div>
      </div>
      <MarketTape />
    </section>
  );
}
