import { useState } from "react";
import { CheckCircle2, Mail } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { PageShell, PageTitle } from "@/components/editorial";

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
    <PageShell>
      <div className="max-w-xl mx-auto" data-testid="subscribe-page">
        <PageTitle
          title="The Brief"
          dek="One email a week on the grid."
        />

        {status === "success" ? (
          <div className="border-y-2 border-rule-strong py-8 text-center" data-testid="subscribe-success">
            <CheckCircle2 className="h-8 w-8 text-positive mx-auto mb-2" />
            <p className="text-[15px] font-semibold text-ink">You're in</p>
            <p className="text-[13px] text-ink-muted mt-1">The next Brief lands in your inbox.</p>
          </div>
        ) : status === "exists" ? (
          <div className="border-y-2 border-rule-strong py-8 text-center" data-testid="subscribe-exists">
            <Mail className="h-8 w-8 text-brand-ink mx-auto mb-2" />
            <p className="text-[15px] font-semibold text-ink">You're already on the list</p>
            <p className="text-[13px] text-ink-muted mt-1">Check your inbox for the next Brief.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3" data-testid="subscribe-form">
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setStatus("idle"); }}
                placeholder="you@example.com"
                className="flex-1 bg-card border border-rule rounded-sm px-4 py-2.5 text-[14px] text-ink placeholder:text-ink-muted focus:outline-none focus:border-rule-strong transition-colors"
                data-testid="input-email"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="border border-ink px-6 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:border-brand-ink hover:text-brand-ink disabled:opacity-50"
                data-testid="button-subscribe"
              >
                {status === "loading" ? "…" : "Subscribe"}
              </button>
            </div>
            {status === "error" && (
              <p className="text-[12.5px] text-negative" data-testid="subscribe-error">{errorMsg}</p>
            )}
            <p className="text-[12.5px] text-ink-muted">
              Free. Unsubscribe anytime.
            </p>
          </form>
        )}
      </div>
    </PageShell>
  );
}
