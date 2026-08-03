import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Mail, TrendingUp, Map, BarChart3, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface TopMover {
  ticker: string;
  name: string;
  changePercent: number;
}
interface SectorMeta {
  key: string;
  name: string;
  tickerCount: number;
}
interface Datacenter {
  powerMW: number;
  status: "operational" | "construction" | "announced";
}

// What subscribers actually get, sourced from composeBrief/renderWeeklyEmail
// (server/brief.ts, server/weekly-digest.ts): grid + GPU gauges, the movers
// table, and the compute-cluster / deals sections. The old copy here still
// described the retired sentiment indices (AI Power Demand / NPI / Grid
// Stress), which the weekly send stopped carrying.
const FEATURES = [
  { icon: TrendingUp, label: "Grid & GPUs", desc: "Tracked GW live and building, GPU fleet pricing, tightest RTO margin" },
  { icon: BarChart3, label: "Top Movers", desc: "Best and worst equity performers, signed and colored" },
  { icon: Map, label: "Buildout & Deals", desc: "Named compute clusters and corporate power deals" },
];

export default function Subscribe() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "exists" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: movers } = useQuery<TopMover[]>({ queryKey: ["/api/top-movers"] });
  const { data: sectors } = useQuery<SectorMeta[]>({ queryKey: ["/api/sectors"] });
  const { data: datacenters } = useQuery<Datacenter[]>({ queryKey: ["/api/datacenters"] });

  const equityCount = sectors?.reduce((t, s) => t + s.tickerCount, 0) ?? null;
  const trackedGW = datacenters
    ? datacenters.filter((d) => d.status !== "announced").reduce((t, d) => t + d.powerMW, 0) / 1000
    : null;
  const topMover = movers && movers.length > 0 ? movers[0] : null;
  const moverUp = (topMover?.changePercent ?? 0) >= 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setStatus("error");
      setErrorMsg("That doesn't look like an email");
      return;
    }

    setStatus("loading");
    try {
      const res = await apiRequest("POST", "/api/subscribe", { email: email.trim() });
      const data = await res.json();
      if (data.status === "exists") {
        setStatus("exists");
      } else {
        setStatus("success");
        setEmail("");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong, try again");
    }
  }

  return (
    <div data-testid="subscribe-page">
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-12 md:py-16">
        <div className="grid lg:grid-cols-[1fr_380px] gap-10 lg:gap-14 items-start">
          <div className="space-y-8">
            <div className="space-y-3">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-brand/10 border border-brand/20">
                <Mail className="h-6 w-6 text-brand" />
              </div>
              <h1 className="text-3xl font-bold text-ink tracking-tight">
                The GridTilt Brief
              </h1>
              <p className="text-sm text-white/50 max-w-lg leading-relaxed">
                The AI power buildout, in one weekly email: grid capacity, GPU pricing, top movers, and
                the corporate power deals that moved the thesis. Sourced, not hyped.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-3" data-testid="subscribe-features">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="bg-surface-raised/80 border border-subtle rounded-lg p-3.5">
                  <Icon className="h-4 w-4 text-brand-2 mb-1.5" />
                  <div className="text-11 font-semibold text-white/80">{label}</div>
                  <div className="text-10 text-white/35 mt-0.5 leading-tight">{desc}</div>
                </div>
              ))}
            </div>

            <div className="border-t border-subtle pt-6">
              <p className="text-9 font-mono uppercase tracking-widest text-white/25 mb-3">
                Live on the site right now
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-3" data-testid="subscribe-live-stats">
                {equityCount !== null && (
                  <div>
                    <div className="text-lg font-mono font-bold text-white/85">{equityCount}+</div>
                    <div className="text-10 text-white/35">equities tracked</div>
                  </div>
                )}
                {trackedGW !== null && (
                  <div>
                    <div className="text-lg font-mono font-bold text-white/85">{trackedGW.toFixed(1)} GW</div>
                    <div className="text-10 text-white/35">datacenter capacity tracked</div>
                  </div>
                )}
                {topMover && (
                  <div>
                    <div className={`text-lg font-mono font-bold flex items-center gap-1 ${moverUp ? "text-positive" : "text-negative"}`}>
                      {moverUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      ${topMover.ticker} {moverUp ? "+" : ""}{topMover.changePercent.toFixed(2)}%
                    </div>
                    <div className="text-10 text-white/35">today's biggest mover</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:sticky lg:top-20">
            {status === "success" ? (
              <div className="bg-positive-deep/10 border border-positive-deep/20 rounded-lg p-6 text-center" data-testid="subscribe-success">
                <CheckCircle2 className="h-8 w-8 text-positive mx-auto mb-2" />
                <div className="text-sm font-semibold text-positive">You're in</div>
                <div className="text-xs text-white/40 mt-1">Your first brief arrives with the next weekly send.</div>
              </div>
            ) : status === "exists" ? (
              <div className="bg-brand-2/10 border border-brand-2/20 rounded-lg p-6 text-center" data-testid="subscribe-exists">
                <Mail className="h-8 w-8 text-brand-2 mx-auto mb-2" />
                <div className="text-sm font-semibold text-brand-2">You're already on the list</div>
                <div className="text-xs text-white/40 mt-1">Check your inbox for the next brief.</div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-surface-raised/60 border border-subtle rounded-xl p-5 space-y-3" data-testid="subscribe-form">
                <div>
                  <label htmlFor="subscribe-email" className="block text-11 font-semibold text-white/70 mb-1.5">
                    Email address
                  </label>
                  <input
                    id="subscribe-email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
                    placeholder="you@example.com"
                    className="w-full bg-surface-raised border border-subtle rounded-lg px-4 py-2.5 text-sm text-ink placeholder:text-white/30 focus:outline-none focus:border-brand/40 transition-colors"
                    data-testid="input-email"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={status === "loading"}
                  className="w-full bg-brand hover:bg-brand/90 text-black font-semibold"
                  data-testid="button-subscribe"
                >
                  {status === "loading" ? "..." : "Subscribe"}
                </Button>
                {status === "error" && (
                  <p className="text-xs text-negative" data-testid="subscribe-error">{errorMsg}</p>
                )}
                <p className="text-10 text-white/25 text-center pt-1">
                  Free. One email per week. Unsubscribe anytime.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
