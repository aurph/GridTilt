import { useState, useEffect, useRef } from "react";
import { Mail, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

interface ExtraField {
  // Constrained to body keys /api/subscribe knows how to persist. Adding a
  // new option here requires a parallel change in server/routes.ts (the
  // handler destructures only `email`, `intent`, `context`); otherwise the
  // user's answer is silently dropped on the server.
  name: "intent";
  label: string;
  placeholder: string;
  optional?: boolean;
}

interface EmailCaptureProps {
  variant?: "inline" | "banner";
  // "default" = the existing dashboard dark-on-charcoal card.
  // "marketing" = the home-page surface (warm dark + JetBrains Mono + orange accent).
  theme?: "default" | "marketing";
  extraField?: ExtraField;
  context?: string;
  successMessage?: string;
  submitLabel?: string;
  heading?: string;
  subheading?: string;
}

export function EmailCapture({
  variant = "inline",
  theme = "default",
  extraField,
  context,
  successMessage,
  submitLabel,
  heading,
  subheading,
}: EmailCaptureProps) {
  const [email, setEmail] = useState("");
  const [extraValue, setExtraValue] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "exists" | "error">("idle");
  const [dismissed, setDismissed] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus("loading");
    try {
      const body: Record<string, string> = { email: email.trim() };
      if (extraField && extraValue.trim()) body[extraField.name] = extraValue.trim();
      if (context) body.context = context;
      const res = await apiRequest("POST", "/api/subscribe", body);
      const data = await res.json();
      setStatus(data.status === "exists" ? "exists" : "success");
      if (data.status !== "exists") {
        setEmail("");
        setExtraValue("");
      }
    } catch {
      setStatus("error");
    }
  }

  if (dismissed) return null;

  // ── Marketing variant (Home / and Home thesis section) ─────────────────────
  if (theme === "marketing") {
    if (status === "success") {
      return (
        <div
          style={{
            border: "1px solid #F07800",
            background: "rgba(240,120,0,0.06)",
            padding: 22,
            borderRadius: 4,
          }}
          data-testid="email-capture-success-marketing"
        >
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 14,
              color: "#F2F1ED",
              lineHeight: 1.55,
            }}
          >
            {successMessage ?? "You're on the list. We'll only email about this one feature."}
          </p>
        </div>
      );
    }

    return (
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.06)",
          background: "#131211",
          padding: 24,
          borderRadius: 4,
        }}
        data-testid="email-capture-marketing"
      >
        {heading && (
          <h3
            style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 15,
              fontWeight: 700,
              color: "#F2F1ED",
              marginBottom: 8,
              letterSpacing: "-0.005em",
            }}
          >
            {heading}
          </h3>
        )}
        {subheading && (
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              color: "#9C9A93",
              marginBottom: 22,
              lineHeight: 1.55,
            }}
          >
            {subheading}
          </p>
        )}
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          {extraField && (
            <div>
              <label
                htmlFor="email-capture-extra"
                style={{
                  display: "block",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 10,
                  color: "#9C9A93",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  marginBottom: 10,
                }}
              >
                {extraField.label}
                {extraField.optional ? " · optional" : ""}
              </label>
              <textarea
                id="email-capture-extra"
                value={extraValue}
                onChange={(e) => {
                  setExtraValue(e.target.value);
                  setStatus("idle");
                }}
                placeholder={extraField.placeholder}
                rows={3}
                maxLength={500}
                style={{
                  width: "100%",
                  padding: "11px 13px",
                  background: "#0B0B0A",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 4,
                  color: "#F2F1ED",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  lineHeight: 1.5,
                  resize: "none",
                  outline: "none",
                  transition: "border-color 180ms ease-out",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#F07800")}
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")
                }
                data-testid="input-extra-field"
              />
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setStatus("idle");
              }}
              placeholder="you@example.com"
              style={{
                flex: 1,
                padding: "11px 13px",
                background: "#0B0B0A",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 4,
                color: "#F2F1ED",
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                outline: "none",
                transition: "border-color 180ms ease-out",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#F07800")}
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")
              }
              data-testid="input-email-marketing"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              style={{
                padding: "11px 18px",
                background: "#F07800",
                color: "#0B0B0A",
                border: "1px solid #F07800",
                borderRadius: 4,
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                cursor: "pointer",
                transition: "transform 180ms ease-out, box-shadow 220ms ease-out",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 0 24px -6px rgba(240,120,0,0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = "";
              }}
              data-testid="button-subscribe-marketing"
            >
              {status === "loading" ? "..." : submitLabel ?? "Subscribe"}
            </button>
          </div>
        </form>
        {status === "error" && (
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              color: "#F07800",
              marginTop: 12,
            }}
          >
            Something went wrong. Try again.
          </p>
        )}
        {status === "exists" && (
          <p
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              color: "#9C9A93",
              marginTop: 12,
            }}
          >
            You're already on the list.
          </p>
        )}
      </div>
    );
  }

  // ── Default (dashboard) variants — unchanged ───────────────────────────────
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
      <div className="bg-[#161614]/80 border border-white/[0.06] rounded-lg p-5" data-testid="email-capture-inline">
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
            className="flex-1 bg-[#0E0E0C] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#F07800]/40 transition-colors"
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
      <div className="bg-[#161614]/95 backdrop-blur-md border border-white/[0.08] rounded-xl p-4 shadow-2xl shadow-black/60">
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
            className="flex-1 bg-[#0E0E0C] border border-white/[0.08] rounded-md px-3 py-2 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#F07800]/40 transition-colors"
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
