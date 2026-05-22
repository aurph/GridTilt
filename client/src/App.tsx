import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import TheStack from "@/pages/TheStack";
import PowerMap from "@/pages/PowerMap";
import TheTrade from "@/pages/TheTrade";
import PortfolioOverlay from "@/pages/PortfolioOverlay";
import CatalystTracker from "@/pages/CatalystTracker";
import StockPage from "@/pages/StockPage";
import SectorPage from "@/pages/SectorPage";
import RegionPage from "@/pages/RegionPage";
import OperatorPage from "@/pages/OperatorPage";
import BlogIndex from "@/pages/BlogIndex";
import BlogPost from "@/pages/BlogPost";
import SupplyChain from "@/pages/SupplyChain";
import Subscribe from "@/pages/Subscribe";
import Queue from "@/pages/Queue";
import AdminDatacenters from "@/pages/AdminDatacenters";
import AdminSocial from "@/pages/AdminSocial";
import { NewsTicker } from "@/components/NewsTicker";
import { useLocation } from "wouter";
import { useState, useEffect, useLayoutEffect, lazy, Suspense } from "react";
import { X, Keyboard } from "lucide-react";

// Lazy-load the marketing landing and the dashboard root so each visitor only
// pays for the chunks they actually need. Other dashboard pages stay eager —
// they're only reached after the user has already loaded the dashboard shell.
const Home = lazy(() => import("@/pages/Home"));
const TiltOverview = lazy(() => import("@/pages/TiltOverview"));

// Routes that render WITHOUT the dashboard chrome (no sidebar, no header,
// no news ticker). Currently just the marketing landing at /.
const MARKETING_ROUTES = ["/"];

const PAGE_TITLES: Record<string, string> = {
  "/": "GridTilt",
  "/overview": "Tilt Overview",
  "/stack": "The Stack",
  "/power-map": "Power Map",
  "/supply-chain": "Supply Chain",
  "/trade": "Scenario Calculator",
  "/portfolio": "Portfolio Overlay",
  "/catalysts": "Catalyst Tracker",
  "/queue": "Interconnection Backlog",
  "/blog": "Analysis",
  "/subscribe": "Subscribe",
};

const SHORTCUTS = [
  { keys: ["G", "1"], description: "Go to Tilt Overview", path: "/overview" },
  { keys: ["G", "2"], description: "Go to The Stack", path: "/stack" },
  { keys: ["G", "3"], description: "Go to Power Map", path: "/power-map" },
  { keys: ["G", "4"], description: "Go to Supply Chain", path: "/supply-chain" },
  { keys: ["G", "5"], description: "Go to Portfolio Overlay", path: "/portfolio" },
  { keys: ["G", "6"], description: "Go to Scenario Calculator", path: "/trade" },
  { keys: ["G", "7"], description: "Go to Catalyst Tracker", path: "/catalysts" },
  { keys: ["G", "8"], description: "Go to Analysis", path: "/blog" },
  { keys: ["G", "9"], description: "Go to Interconnection Backlog", path: "/queue" },
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
      <Route path="/" component={Home} />
      <Route path="/overview" component={TiltOverview} />
      <Route path="/stack" component={TheStack} />
      <Route path="/power-map" component={PowerMap} />
      <Route path="/supply-chain" component={SupplyChain} />
      <Route path="/trade" component={TheTrade} />
      <Route path="/portfolio" component={PortfolioOverlay} />
      <Route path="/catalysts" component={CatalystTracker} />
      <Route path="/queue" component={Queue} />
      <Route path="/stock/:ticker" component={StockPage} />
      <Route path="/sector/:slug" component={SectorPage} />
      <Route path="/region/:slug" component={RegionPage} />
      <Route path="/operator/:slug" component={OperatorPage} />
      <Route path="/blog" component={BlogIndex} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/subscribe" component={Subscribe} />
      <Route path="/admin/datacenters" component={AdminDatacenters} />
      <Route path="/admin/social" component={AdminSocial} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Minimal Suspense fallback while the lazy Home chunk loads on cold visits.
// Holds the wordmark in the masthead position so the first paint of / is the
// brand mark on the Swiss surface, not a blank white screen.
function HomeLoadingShell() {
  return (
    <div
      className="anchor-swiss min-h-screen w-full"
      style={{ padding: "clamp(20px, 4vw, 64px)" }}
    >
      <span
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "#111111",
        }}
      >
        GRIDTILT
      </span>
    </div>
  );
}

function App() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [location, navigate] = useLocation();
  const [gPressed, setGPressed] = useState(false);

  const isMarketing = MARKETING_ROUTES.includes(location);

  // Strip the dashboard's forced `.dark` class on marketing routes so Tailwind
  // dark-mode variants don't bleed into the Swiss surface. Restore on dashboard.
  useLayoutEffect(() => {
    if (isMarketing) {
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
    }
  }, [isMarketing]);

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
          "4": "/supply-chain", "5": "/portfolio", "6": "/trade",
          "7": "/catalysts", "8": "/blog", "9": "/queue",
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

  // Marketing layout — bare. No SidebarProvider, no AppSidebar, no Header, no
  // NewsTicker. The Home component owns its own Swiss surface via .anchor-swiss.
  if (isMarketing) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <Suspense fallback={<HomeLoadingShell />}>
            <Router />
          </Suspense>
          {showShortcuts && (
            <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
          )}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }

  // Dashboard layout — sidebar, header, news ticker shell.
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
              <main className="flex-1 overflow-auto">
                <Suspense fallback={null}>
                  <Router />
                </Suspense>
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
