import { useState } from "react";
import { CheckCircle2, Mail, TrendingUp, Map, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

export default function Subscribe() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "exists" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

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
    <div className="h-full overflow-y-auto" data-testid="subscribe-page">
      <div className="max-w-xl mx-auto px-4 py-16 space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-[#F07800]/10 border border-[#F07800]/20 mb-2">
            <Mail className="h-6 w-6 text-[#F07800]" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            The GridTilt Brief
          </h1>
          <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed">
            Thesis health, top movers, new facilities, one data point. Monthly. No spam.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: TrendingUp, label: "Tilt Status", desc: "AI Power Index, NRI, Grid Stress updates" },
            { icon: BarChart3, label: "Top Movers", desc: "Best and worst performers by sector" },
            { icon: Map, label: "Power Map", desc: "New facilities and capacity updates" },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="bg-[#161614]/80 border border-white/[0.06] rounded-lg p-3 text-center">
              <Icon className="h-4 w-4 text-[#F0A500] mx-auto mb-1.5" />
              <div className="text-[11px] font-semibold text-white/80">{label}</div>
              <div className="text-[10px] text-white/30 mt-0.5 leading-tight">{desc}</div>
            </div>
          ))}
        </div>

        {status === "success" ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-6 text-center" data-testid="subscribe-success">
            <CheckCircle2 className="h-8 w-8 text-green-400 mx-auto mb-2" />
            <div className="text-sm font-semibold text-green-400">You're in</div>
            <div className="text-xs text-white/40 mt-1">First brief arrives next month.</div>
          </div>
        ) : status === "exists" ? (
          <div className="bg-[#F0A500]/10 border border-[#F0A500]/20 rounded-lg p-6 text-center" data-testid="subscribe-exists">
            <Mail className="h-8 w-8 text-[#F0A500] mx-auto mb-2" />
            <div className="text-sm font-semibold text-[#F0A500]">You're already on the list</div>
            <div className="text-xs text-white/40 mt-1">Check your inbox for the next brief.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3" data-testid="subscribe-form">
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
                placeholder="you@example.com"
                className="flex-1 bg-[#161614] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#F07800]/40 transition-colors"
                data-testid="input-email"
              />
              <Button
                type="submit"
                disabled={status === "loading"}
                className="bg-[#F07800] hover:bg-[#F07800]/90 text-black font-semibold px-6"
                data-testid="button-subscribe"
              >
                {status === "loading" ? "..." : "Subscribe"}
              </Button>
            </div>
            {status === "error" && (
              <p className="text-xs text-red-400" data-testid="subscribe-error">{errorMsg}</p>
            )}
            <p className="text-[10px] text-white/25 text-center">
              One email per month. Unsubscribe anytime.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
