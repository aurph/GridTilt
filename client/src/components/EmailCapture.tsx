import { useState, useEffect, useRef } from "react";
import { Mail, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface EmailCaptureProps {
  variant?: "inline" | "banner";
}

export function EmailCapture({ variant = "inline" }: EmailCaptureProps) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "exists" | "error">("idle");
  const [dismissed, setDismissed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    try {
      const res = await apiRequest("POST", "/api/subscribe", { email: email.trim() });
      const data = await res.json();
      setStatus(data.status === "exists" ? "exists" : "success");
      if (data.status !== "exists") setEmail("");
    } catch {
      setStatus("error");
    }
  }

  if (dismissed) return null;

  if (status === "success") {
    return (
      <div className={`${variant === "banner" ? "fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg" : ""}`}>
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-center gap-3" data-testid="email-capture-success">
          <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0" />
          <div>
            <span className="text-sm font-semibold text-green-400">You're in.</span>
            <span className="text-xs text-white/40 ml-2">First brief arrives next month.</span>
          </div>
        </div>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <div className="bg-[#151520]/80 border border-white/[0.06] rounded-lg p-5" data-testid="email-capture-inline">
        <div className="flex items-start gap-3 mb-3">
          <div className="h-8 w-8 rounded-lg bg-[#F07800]/10 border border-[#F07800]/20 flex items-center justify-center flex-shrink-0">
            <Mail className="h-4 w-4 text-[#F07800]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">The GridTilt Brief</h3>
            <p className="text-xs text-white/40 mt-0.5">Monthly thesis check, top movers, new facilities. No spam.</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
            placeholder="you@example.com"
            className="flex-1 bg-[#0d0d14] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#F07800]/40 transition-colors"
            data-testid="input-email-inline"
          />
          <Button
            type="submit"
            disabled={status === "loading"}
            className="bg-[#F07800] hover:bg-[#F07800]/90 text-black font-semibold px-4 text-xs"
            data-testid="button-subscribe-inline"
          >
            {status === "loading" ? "..." : "Subscribe"}
          </Button>
        </form>
        {status === "error" && <p className="text-xs text-red-400 mt-2">Something went wrong, try again</p>}
        {status === "exists" && <p className="text-xs text-[#F0A500] mt-2">You're already on the list</p>}
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg" data-testid="email-capture-banner">
      <div className="bg-[#151520]/95 backdrop-blur-md border border-white/[0.08] rounded-xl p-4 shadow-2xl shadow-black/60">
        <button
          onClick={() => { setDismissed(true); sessionStorage.setItem("gridtilt-banner-dismissed", "1"); }}
          className="absolute top-2 right-2 text-white/30 hover:text-white/60 transition-colors"
          data-testid="button-dismiss-banner"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3 mb-3">
          <Mail className="h-4 w-4 text-[#F07800]" />
          <span className="text-sm font-semibold text-white">Get the GridTilt Brief</span>
          <span className="text-xs text-white/30">Monthly. No spam.</span>
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
            placeholder="you@example.com"
            className="flex-1 bg-[#0d0d14] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#F07800]/40 transition-colors"
            data-testid="input-email-banner"
          />
          <Button
            type="submit"
            disabled={status === "loading"}
            className="bg-[#F07800] hover:bg-[#F07800]/90 text-black font-semibold px-4 text-xs"
            data-testid="button-subscribe-banner"
          >
            {status === "loading" ? "..." : "Subscribe"}
          </Button>
        </form>
        {status === "error" && <p className="text-xs text-red-400 mt-2">Something went wrong, try again</p>}
        {status === "exists" && <p className="text-xs text-[#F0A500] mt-2">You're already on the list</p>}
      </div>
    </div>
  );
}

export function ScrollTriggeredBanner() {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const hasTriggered = useRef(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("gridtilt-banner-dismissed");
    if (stored) {
      setDismissed(true);
      return;
    }

    const timer = setTimeout(() => {
      if (!hasTriggered.current) {
        hasTriggered.current = true;
        setShow(true);
      }
    }, 30000);

    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target?.scrollHeight) return;
      const scrollPct = target.scrollTop / (target.scrollHeight - target.clientHeight);
      if (scrollPct > 0.6 && !hasTriggered.current) {
        hasTriggered.current = true;
        setShow(true);
      }
    };

    const scrollContainer = document.querySelector("main > div");
    scrollContainer?.addEventListener("scroll", handleScroll);

    return () => {
      clearTimeout(timer);
      scrollContainer?.removeEventListener("scroll", handleScroll);
    };
  }, []);

  if (dismissed || !show) return null;

  return (
    <EmailCapture
      variant="banner"
    />
  );
}
