import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Masthead } from "@/components/masthead";
import { Colophon } from "@/components/colophon";
import NotFound from "@/pages/not-found";
import TheStack from "@/pages/TheStack";
import PowerMap from "@/pages/PowerMap";
import ComputeFrontier from "@/pages/compute-frontier";
import ComputeFrontierMethodology from "@/pages/ComputeFrontierMethodology";
import ComputeFrontierCompare from "@/pages/ComputeFrontierCompare";
import ComputeFrontierDetail from "@/pages/ComputeFrontierDetail";
import NeocloudIntel from "@/pages/neocloud-intel";
import Analyze from "@/pages/Analyze";
import CatalystTracker from "@/pages/CatalystTracker";
import StockPage from "@/pages/StockPage";
import SectorPage from "@/pages/SectorPage";
import RegionPage from "@/pages/RegionPage";
import OperatorPage from "@/pages/OperatorPage";
import BlogIndex from "@/pages/BlogIndex";
import BlogPost from "@/pages/BlogPost";
import Subscribe from "@/pages/Subscribe";
import About from "@/pages/about";
import AdminDatacenters from "@/pages/AdminDatacenters";
import AdminSocial from "@/pages/AdminSocial";
import { initAnalytics, trackPageview } from "@/lib/analytics";
import { useLocation } from "wouter";
import { useState, useEffect, lazy, Suspense } from "react";
import { X, Keyboard } from "lucide-react";

// Lazy-load the front page and the Today page so each visitor only pays for
// the chunks they actually need. Other pages stay eager - they're only
// reached after the shell has already loaded.
const Home = lazy(() => import("@/pages/Home"));
const TiltOverview = lazy(() => import("@/pages/TiltOverview"));

const SHORTCUTS = [
  { keys: ["G", "1"], description: "Go to Today", path: "/overview" },
  { keys: ["G", "2"], description: "Go to The Stack", path: "/stack" },
  { keys: ["G", "3"], description: "Go to Power", path: "/power-map" },
  { keys: ["G", "4"], description: "Go to Compute", path: "/compute-frontier" },
  { keys: ["G", "5"], description: "Go to GPUs", path: "/neocloud-intel" },
  { keys: ["G", "6"], description: "Go to Catalysts", path: "/catalysts" },
  { keys: ["G", "7"], description: "Go to Analyze", path: "/analyze" },
  { keys: ["G", "8"], description: "Go to Analysis", path: "/blog" },
  { keys: ["?"], description: "Show this keyboard shortcuts panel", path: null },
];

function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      data-testid="keyboard-shortcuts-modal"
    >
      <div className="absolute inset-0 bg-ink/25" onClick={onClose} />
      <div className="relative bg-card border border-rule rounded-sm p-6 shadow-lg w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-brand-ink" />
            <h2 className="text-sm font-semibold text-foreground">Keyboard shortcuts</h2>
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
              <span className="text-[13px] text-muted-foreground">{sc.description}</span>
              <div className="flex items-center gap-1">
                {sc.keys.map((k, j) => (
                  <span key={j} className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-paper-shade border border-rule rounded-sm text-foreground">
                      {k}
                    </kbd>
                    {j < sc.keys.length - 1 && (
                      <span className="text-[11px] text-muted-foreground">then</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-ink-muted mt-4 pt-3 border-t border-rule text-center">
          Press Esc or click outside to close
        </p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/overview" component={TiltOverview} />
      <Route path="/stack" component={TheStack} />
      <Route path="/power-map" component={PowerMap} />
      <Route path="/compute-frontier" component={ComputeFrontier} />
      <Route path="/compute-frontier/methodology" component={ComputeFrontierMethodology} />
      <Route path="/compute-frontier/compare" component={ComputeFrontierCompare} />
      <Route path="/compute-frontier/:id" component={ComputeFrontierDetail} />
      <Route path="/neocloud-intel" component={NeocloudIntel} />
      {/* Consolidation: GPU Economics is now the economics tab of GPU Prices */}
      <Route path="/gpu-economics">{() => <Redirect to="/neocloud-intel?tab=economics" replace />}</Route>
      {/* Consolidation: Deals and Queue are tabs of Power; Brief lives in Analysis */}
      <Route path="/power-deals">{() => <Redirect to="/power-map?tab=deals" replace />}</Route>
      <Route path="/brief">{() => <Redirect to="/blog" replace />}</Route>
      <Route path="/supply-chain">{() => <Redirect to="/stack?view=flow" replace />}</Route>
      <Route path="/analyze" component={Analyze} />
      <Route path="/trade">{() => <Redirect to="/analyze?tab=scenario" replace />}</Route>
      <Route path="/portfolio">{() => <Redirect to="/analyze?tab=portfolio" replace />}</Route>
      <Route path="/catalysts" component={CatalystTracker} />
      <Route path="/queue">{() => <Redirect to="/power-map?tab=queue" replace />}</Route>
      <Route path="/stock/:ticker" component={StockPage} />
      <Route path="/sector/:slug" component={SectorPage} />
      <Route path="/region/:slug" component={RegionPage} />
      <Route path="/operator/:slug" component={OperatorPage} />
      <Route path="/blog" component={BlogIndex} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/subscribe" component={Subscribe} />
      <Route path="/about" component={About} />
      <Route path="/admin/datacenters" component={AdminDatacenters} />
      <Route path="/admin/social" component={AdminSocial} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Suspense fallback while a lazy chunk loads: the wordmark on paper.
function LoadingShell() {
  return (
    <div className="flex items-center justify-center py-24" aria-busy="true">
      <span className="font-serif text-[22px] text-ink-muted">
        Grid<em className="italic">Tilt</em>
      </span>
    </div>
  );
}

function App() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [location, navigate] = useLocation();
  const [gPressed, setGPressed] = useState(false);

  // Privacy-respecting pageviews (GoatCounter); inert unless
  // VITE_GOATCOUNTER_CODE is set at build time.
  useEffect(() => {
    initAnalytics();
  }, []);
  useEffect(() => {
    trackPageview(location);
  }, [location]);

  // New route = new article: start at the top, like a page turn.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

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
          "1": "/overview", "2": "/stack", "3": "/power-map",
          "4": "/compute-frontier", "5": "/neocloud-intel", "6": "/catalysts",
          "7": "/analyze", "8": "/blog",
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

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <div className="min-h-screen bg-background flex flex-col">
          <Masthead />
          <main className="flex-1">
            <Suspense fallback={<LoadingShell />}>
              <Router />
            </Suspense>
          </main>
          <Colophon />
        </div>
        {showShortcuts && (
          <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
