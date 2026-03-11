import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import TiltOverview from "@/pages/TiltOverview";
import TheStack from "@/pages/TheStack";
import PowerMap from "@/pages/PowerMap";
import TheTrade from "@/pages/TheTrade";
import PortfolioOverlay from "@/pages/PortfolioOverlay";
import CatalystTracker from "@/pages/CatalystTracker";
import { NewsTicker } from "@/components/NewsTicker";
import { useLocation } from "wouter";
import { useState, useEffect } from "react";
import { X, Keyboard } from "lucide-react";

const PAGE_TITLES: Record<string, string> = {
  "/": "Tilt Overview",
  "/stack": "The Stack",
  "/power-map": "Power Map",
  "/trade": "Thesis Calculator",
  "/portfolio": "Portfolio Overlay",
  "/catalysts": "Catalyst Tracker",
};

const SHORTCUTS = [
  { keys: ["G", "1"], description: "Go to Tilt Overview", path: "/" },
  { keys: ["G", "2"], description: "Go to The Stack", path: "/stack" },
  { keys: ["G", "3"], description: "Go to Power Map", path: "/power-map" },
  { keys: ["G", "4"], description: "Go to Thesis Calculator", path: "/trade" },
  { keys: ["G", "5"], description: "Go to Portfolio Overlay", path: "/portfolio" },
  { keys: ["G", "6"], description: "Go to Catalyst Tracker", path: "/catalysts" },
  { keys: ["?"], description: "Show this keyboard shortcuts panel", path: null },
];

function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      data-testid="keyboard-shortcuts-modal"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-card-border rounded-lg p-6 shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-[#F07800]" />
            <h2 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-close-shortcuts"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map((sc, i) => (
            <div key={i} className="flex items-center justify-between py-1.5">
              <span className="text-xs text-muted-foreground">{sc.description}</span>
              <div className="flex items-center gap-1">
                {sc.keys.map((k, j) => (
                  <span key={j} className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-muted border border-border rounded text-foreground">
                      {k}
                    </kbd>
                    {j < sc.keys.length - 1 && (
                      <span className="text-[10px] text-muted-foreground">then</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/50 mt-4 pt-3 border-t border-border text-center">
          Press Esc or click outside to close
        </p>
      </div>
    </div>
  );
}

function Header() {
  const [location] = useLocation();
  const pageTitle = PAGE_TITLES[location] ?? "GridTilt";

  return (
    <header
      className="flex items-center gap-3 px-4 border-b border-border bg-background/90 backdrop-blur-sm flex-shrink-0"
      style={{ zIndex: 50, height: "42px" }}
    >
      <SidebarTrigger data-testid="button-sidebar-toggle" className="text-muted-foreground h-7 w-7" />
      <div className="w-px h-4 bg-border" />
      <span className="text-xs font-semibold text-foreground tracking-wide">{pageTitle}</span>
      <div className="flex-1" />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="hidden sm:inline font-mono text-muted-foreground/60">GridTilt</span>
        <span className="text-border hidden sm:inline">·</span>
        <span className="hidden md:inline text-muted-foreground/70">AI Infrastructure and Power Economy</span>
        <span className="text-border hidden md:inline">·</span>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span className="text-muted-foreground/70">Live</span>
        </div>
      </div>
    </header>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={TiltOverview} />
      <Route path="/stack" component={TheStack} />
      <Route path="/power-map" component={PowerMap} />
      <Route path="/trade" component={TheTrade} />
      <Route path="/portfolio" component={PortfolioOverlay} />
      <Route path="/catalysts" component={CatalystTracker} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [, navigate] = useLocation();
  const [gPressed, setGPressed] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || (e.target as HTMLElement)?.isContentEditable) return;

      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }
      if (e.key === "Escape") {
        setShowShortcuts(false);
        setGPressed(false);
        return;
      }
      if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey) {
        setGPressed(true);
        setTimeout(() => setGPressed(false), 1500);
        return;
      }
      if (gPressed) {
        const routes: Record<string, string> = {
          "1": "/", "2": "/stack", "3": "/power-map",
          "4": "/trade", "5": "/portfolio", "6": "/catalysts",
        };
        if (routes[e.key]) {
          navigate(routes[e.key]);
          setGPressed(false);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [gPressed, navigate]);

  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <SidebarProvider style={style as React.CSSProperties} defaultOpen={true}>
          <div className="flex h-screen w-full bg-background overflow-hidden">
            <AppSidebar />
            <div className="flex flex-col flex-1 min-w-0">
              <Header />
              <NewsTicker />
              <main className="flex-1 overflow-hidden">
                <Router />
              </main>
            </div>
          </div>
          {showShortcuts && (
            <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
          )}
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
