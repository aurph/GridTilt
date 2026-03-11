import { Link } from "wouter";
import { Zap } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background grid-bg">
      <div className="flex flex-col items-center text-center px-6 max-w-md">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-[#F07800]/10 border border-[#F07800]/25 mb-6">
          <Zap className="h-8 w-8 text-[#F07800]" />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3 font-mono">
          Grid Signal Lost
        </p>
        <h1 className="text-7xl font-bold tabular-nums text-[#F07800] mb-2">404</h1>
        <p className="text-xl font-semibold text-foreground mb-3">
          Page not found
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">
          The grid coordinates you requested are offline. The AI power economy continues without this route.
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 bg-[#F07800]/15 hover:bg-[#F07800]/25 border border-[#F07800]/30 rounded-md text-sm font-medium text-[#F07800] transition-colors"
          data-testid="link-home"
        >
          Return to Tilt Overview
        </Link>
        <p className="text-xs text-muted-foreground/50 mt-8 font-mono">
          GridTilt -- gridtilt.com
        </p>
      </div>
    </div>
  );
}
