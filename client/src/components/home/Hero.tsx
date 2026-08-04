import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion, type Variants } from "framer-motion";
import { Wordmark } from "./Wordmark";
import { GridPulse } from "./grid-pulse";
import { MarketTape } from "./market-tape";
import { HeroMap } from "./hero-map";

// The hero's job is to say what GridTilt is and prove the numbers are real.
// Every figure below carries the date its dataset was last refreshed, read
// from the same API that serves the figure. Nothing here is hardcoded, and a
// stat with no refresh date says so rather than borrowing today's.

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
      label: "Operational power for compute",
      value: opGw ? `${opGw} GW` : "--",
      sub: clusters ? `${(clusters.totalPlannedMW / 1000).toFixed(1)} GW planned` : undefined,
      asOf: shortDate(clusters?.lastRefreshed),
      href: "/compute-frontier",
    },
    {
      label: "Contracted power deals",
      value: dealGw ? `${dealGw} GW` : "--",
      sub: deals ? `${deals.dealCount} corporate deals` : undefined,
      asOf: shortDate(deals?.lastRefreshed),
      href: "/power-deals",
    },
    {
      label: "Cost of compute",
      value: gpuHr ? `$${gpuHr}/hr` : "--",
      sub: gpu ? `${gpu.fleetAvg1yChange}% over a year` : undefined,
      asOf: shortDate(gpu?.asOf ?? gpu?.lastRefreshed),
      href: "/neocloud-intel",
    },
    {
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
      <HeroMap />

      <div className="relative z-10 mx-auto flex min-h-[inherit] max-w-[1200px] flex-col justify-center px-6 py-16">
        <motion.div
          initial="hidden"
          animate="show"
          transition={{ staggerChildren: 0.09, delayChildren: 0.12 }}
          className="flex w-full flex-col"
        >
          {/* Masthead. The wordmark anchors the brand at reading size so the
              sentence below can lead; the nav already carries it persistently. */}
          <motion.div
            variants={fadeUp}
            className="flex items-end justify-between gap-6 border-b pb-4"
            style={{ borderColor: "var(--mkt-line-bright)" }}
          >
            <div className="gt-hero-masthead">
              <Wordmark />
            </div>
          </motion.div>

          <motion.h1 variants={fadeUp} className="gt-tagline-primary mt-9 max-w-[19ch]">
            The AI power buildout, tracked with{" "}
            <span className="gt-tagline-emphasis">sourced numbers.</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mt-5 max-w-[46ch] text-[15px] leading-[1.7] sm:text-[16.5px]"
            style={{ color: "var(--mkt-ink-muted)" }}
          >
            Data centers, generation, transmission, and the companies behind them.
          </motion.p>

          <motion.div variants={fadeUp} className="mt-9 flex flex-wrap items-center gap-4">
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
              and prints the date its dataset was last refreshed. This is the
              claim in the headline, made checkable in the same viewport. */}
          <motion.div
            variants={fadeUp}
            className="mt-14 grid w-full grid-cols-2 border-t lg:grid-cols-4"
            style={{ borderColor: "var(--mkt-line-bright)" }}
            data-testid="hero-stats"
          >
            {stats.map(({ label, value, sub, asOf, href }, i) => (
              <Link
                key={label}
                href={href}
                className="group border-b px-1 py-5 no-underline transition-colors sm:px-5 lg:border-b-0"
                style={{
                  borderColor: "var(--mkt-line)",
                  borderLeftWidth: i === 0 ? 0 : 1,
                  borderLeftStyle: "solid",
                  borderLeftColor: "var(--mkt-line)",
                }}
                data-testid={`hero-stat-${i}`}
              >
                <p
                  className="font-mono text-[26px] font-bold leading-none tracking-tight tabular-nums transition-colors group-hover:text-brand"
                  style={{ color: "var(--mkt-ink)" }}
                >
                  {value}
                </p>
                <p className="mt-2 text-[12.5px] leading-tight" style={{ color: "var(--mkt-ink-muted)" }}>
                  {label}
                </p>
                {sub && (
                  <p className="mt-1 text-[11.5px]" style={{ color: "var(--mkt-ink-quiet)" }}>
                    {sub}
                  </p>
                )}
                <p
                  className="mt-2.5 font-mono text-[10.5px] uppercase tracking-[0.14em]"
                  style={{ color: "var(--mkt-ink-quiet)" }}
                >
                  {asOf ? `as of ${asOf}` : "no date"}
                </p>
              </Link>
            ))}
          </motion.div>
        </motion.div>
      </div>
      <MarketTape />
    </section>
  );
}
