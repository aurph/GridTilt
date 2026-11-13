import { Link } from "wouter";
import { Zap } from "lucide-react";
import { StatePagesRow } from "@/components/StatePagesRow";
import { SECTIONS } from "@/lib/sections";

// The four sections, from the site map the top bar reads (lib/sections.ts),
// so a wrong address still lands somewhere useful.
const LINKS = SECTIONS.map((s) => ({ label: s.label, href: s.href, desc: s.dek }));

export default function NotFound() {
  return (
    <div className="w-full flex flex-col items-center px-6 py-16 md:py-24 text-center" data-testid="not-found-page">
      <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand/10 border border-brand/25 mb-6">
        <Zap className="h-8 w-8 text-brand" />
      </div>
      <p className="text-10 font-bold uppercase tracking-widest text-muted-foreground mb-3 font-mono">
        Grid Signal Lost
      </p>
      <h1 className="text-7xl font-bold tabular-nums text-brand mb-2">404</h1>
      <p className="text-xl font-semibold text-foreground mb-3">
        Page not found
      </p>
      <p className="text-sm text-muted-foreground leading-relaxed mb-8 max-w-md">
        That page doesn't exist, or it moved. Try one of the sections below, or press{" "}
        <kbd className="px-1.5 py-0.5 text-10 font-mono font-semibold bg-muted border border-border rounded text-foreground">?</kbd>{" "}
        for keyboard shortcuts.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 bg-brand/15 hover:bg-brand/25 border border-brand/30 rounded-md text-sm font-medium text-brand transition-colors"
        data-testid="link-home"
      >
        Back to the front page
      </Link>

      <div className="mt-14 w-full max-w-3xl">
        <p className="text-10 uppercase tracking-widest text-muted-foreground/50 font-mono mb-3">
          Jump to a section
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5" data-testid="not-found-sections">
          {LINKS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="text-left rounded-lg border border-border bg-card/40 px-4 py-3 hover:border-brand/40 hover:bg-muted/20 transition-colors"
              data-testid={`not-found-link-${s.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <span className="block text-sm font-semibold text-foreground">{s.label}</span>
              <span className="block text-10 text-muted-foreground mt-0.5 leading-snug">{s.desc}</span>
            </Link>
          ))}
        </div>
        <StatePagesRow className="mt-8 text-left" testId="not-found-state-pages" />
      </div>
    </div>
  );
}
