import { Link } from "wouter";
import { Zap } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center text-center px-6 max-w-md">
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
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          This page doesn't exist.
        </p>
        <Link
          href="/overview"
          className="px-5 py-2.5 bg-brand/15 hover:bg-brand/25 border border-brand/30 rounded-md text-sm font-medium text-brand transition-colors"
          data-testid="link-home"
        >
          Return to Tilt Overview
        </Link>
      </div>
    </div>
  );
}
