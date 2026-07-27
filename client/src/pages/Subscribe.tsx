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
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-brand/10 border border-brand/20 mb-2">
            <Mail className="h-6 w-6 text-brand" />
          </div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">
            The GridTilt Brief
          </h1>
          <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed">
            Thesis health, top movers, new facilities, one data point. Monthly. No spam.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: TrendingUp, label: "Tilt Status", desc: "AI Power Demand, NPI, Grid Stress updates" },
            { icon: BarChart3, label: "Top Movers", desc: "Best and worst performers by sector" },
            { icon: Map, label: "Power Map", desc: "New facilities and capacity updates" },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="bg-surface-raised/80 border border-subtle rounded-lg p-3 text-center">
              <Icon className="h-4 w-4 text-brand-2 mx-auto mb-1.5" />
              <div className="text-11 font-semibold text-white/80">{label}</div>
              <div className="text-10 text-white/30 mt-0.5 leading-tight">{desc}</div>
            </div>
          ))}
        </div>

        {status === "success" ? (
          <div className="bg-positive-deep/10 border border-positive-deep/20 rounded-lg p-6 text-center" data-testid="subscribe-success">
            <CheckCircle2 className="h-8 w-8 text-positive mx-auto mb-2" />
            <div className="text-sm font-semibold text-positive">You're in</div>
            <div className="text-xs text-white/40 mt-1">First brief arrives next month.</div>
          </div>
        ) : status === "exists" ? (
          <div className="bg-brand-2/10 border border-brand-2/20 rounded-lg p-6 text-center" data-testid="subscribe-exists">
            <Mail className="h-8 w-8 text-brand-2 mx-auto mb-2" />
            <div className="text-sm font-semibold text-brand-2">You're already on the list</div>
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
                className="flex-1 bg-surface-raised border border-subtle rounded-lg px-4 py-2.5 text-sm text-ink placeholder:text-white/30 focus:outline-none focus:border-brand/40 transition-colors"
                data-testid="input-email"
              />
              <Button
                type="submit"
                disabled={status === "loading"}
                className="bg-brand hover:bg-brand/90 text-black font-semibold px-6"
                data-testid="button-subscribe"
              >
                {status === "loading" ? "..." : "Subscribe"}
              </Button>
            </div>
            {status === "error" && (
              <p className="text-xs text-negative" data-testid="subscribe-error">{errorMsg}</p>
            )}
            <p className="text-10 text-white/25 text-center">
              One email per month. Unsubscribe anytime.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
