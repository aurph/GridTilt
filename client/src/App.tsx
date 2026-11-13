import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MobileBar, TopNav } from "@/components/top-nav";
import NotFound from "@/pages/not-found";
import { Skeleton } from "@/components/ui/skeleton";
import { NewsTicker } from "@/components/NewsTicker";
import { CommandPalette } from "@/components/command-palette";
import { SiteFooter } from "@/components/site-footer";
import { ErrorBoundary } from "@/components/error-boundary";
import { initAnalytics, trackPageview } from "@/lib/analytics";
import { useLocation, useSearch } from "wouter";
import { LEGACY_ROUTES, legacyRedirect, metaAddress } from "@/lib/sections";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { X, Keyboard } from "lucide-react";

// Every route is its own chunk. Importing them eagerly meant the first page
// a visitor opened downloaded all of them, so reading a blog post pulled
// leaflet (Power Map), d3 (Supply Chain) and recharts (nine pages) first.
// NotFound stays eager: it is the fallback, so it must never be the thing
// that fails to load.
const Home = lazy(() => import("@/pages/Home"));
const SectionPage = lazy(() => import("@/pages/section-page"));
const States = lazy(() => import("@/pages/states"));
const StatePage = lazy(() => import("@/pages/state-page"));
const ComputeFrontierMethodology = lazy(() => import("@/pages/ComputeFrontierMethodology"));
const ComputeFrontierCompare = lazy(() => import("@/pages/ComputeFrontierCompare"));
const ComputeFrontierDetail = lazy(() => import("@/pages/ComputeFrontierDetail"));
const StockPage = lazy(() => import("@/pages/StockPage"));
const SectorPage = lazy(() => import("@/pages/SectorPage"));
const RegionPage = lazy(() => import("@/pages/RegionPage"));
const OperatorPage = lazy(() => import("@/pages/OperatorPage"));
const DataStatus = lazy(() => import("@/pages/data-status"));
const BlogIndex = lazy(() => import("@/pages/BlogIndex"));
const BlogPost = lazy(() => import("@/pages/BlogPost"));
const Subscribe = lazy(() => import("@/pages/Subscribe"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const AdminDatacenters = lazy(() => import("@/pages/AdminDatacenters"));
const AdminSocial = lazy(() => import("@/pages/AdminSocial"));

// Routes that render WITHOUT the dashboard chrome (no sidebar, no header,
// no news ticker). Currently just the marketing landing at /.
const MARKETING_ROUTES: string[] = [];

const SHORTCUTS = [
  { keys: ["G", "1"], description: "Go to States", path: "/states" },
  { keys: ["G", "2"], description: "Go to Grid", path: "/grid" },
  { keys: ["G", "3"], description: "Go to Compute", path: "/compute" },
  { keys: ["G", "4"], description: "Go to Markets", path: "/markets" },
  { keys: ["G", "5"], description: "Go to Research", path: "/blog" },
  { keys: ["⌘", "K"], description: "Search pages, states, tickers, clusters", path: null },
  { keys: ["?"], description: "Show this keyboard shortcuts panel", path: null },
];

/**
 * An address that used to be a page of its own. Forwards to the section and
 * chip that hold it now (lib/sections.ts), carrying the rest of the query
 * string. The server answers the same addresses with one 301 (seo.ts).
 */
function LegacyRedirect() {
  const [location] = useLocation();
  const search = useSearch();
  const to = legacyRedirect(location, search);
  return to ? <Redirect to={to} replace /> : <NotFound />;
}

function KeyboardShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      data-testid="keyboard-shortcuts-modal"
    >
      {/* Click-outside-to-close, for a mouse. Keyboard closes with Escape, which
          the shortcut handler already owns, so this is decoration to a screen
          reader rather than a control it should announce. */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-card border border-card-border rounded-lg p-6 shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-brand" />
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
                    <kbd className="px-1.5 py-0.5 text-10 font-mono font-semibold bg-muted border border-border rounded text-foreground">
                      {k}
                    </kbd>
                    {j < sc.keys.length - 1 && (
                      <span className="text-10 text-muted-foreground">then</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-10 text-muted-foreground/50 mt-4 pt-3 border-t border-border text-center">
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
      <Route path="/states" component={States} />
      <Route path="/state/:slug" component={StatePage} />
      <Route path="/grid">{() => <SectionPage id="grid" />}</Route>
      <Route path="/compute">{() => <SectionPage id="compute" />}</Route>
      <Route path="/markets">{() => <SectionPage id="markets" />}</Route>
      {/* Cluster pages keep their addresses; they light up Buildout. */}
      <Route path="/compute-frontier/methodology" component={ComputeFrontierMethodology} />
      <Route path="/compute-frontier/compare" component={ComputeFrontierCompare} />
      <Route path="/compute-frontier/:id" component={ComputeFrontierDetail} />
      {/* Every address that used to be a page or an alias (LEGACY_ROUTES). */}
      {Object.keys(LEGACY_ROUTES).map((path) => (
        <Route key={path} path={path} component={LegacyRedirect} />
      ))}
      <Route path="/data-status" component={DataStatus} />
      <Route path="/stock/:ticker" component={StockPage} />
      <Route path="/sector/:slug" component={SectorPage} />
      <Route path="/region/:slug" component={RegionPage} />
      <Route path="/operator/:slug" component={OperatorPage} />
      <Route path="/blog" component={BlogIndex} />
      <Route path="/blog/:slug" component={BlogPost} />
      <Route path="/subscribe" component={Subscribe} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/admin/datacenters" component={AdminDatacenters} />
      <Route path="/admin/social" component={AdminSocial} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Minimal Suspense fallback while the lazy Home chunk loads on cold visits.
// Holds the wordmark + a pulse dot in the masthead position so the first paint
// of / is the brand on the dark surface, not a blank black screen.
function HomeLoadingShell() {
  return (
    <div
      className="gt-marketing min-h-screen w-full"
      style={{ padding: "clamp(24px, 5vw, 96px)" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily: "JetBrains Mono, monospace",
          fontSize: 11,
          letterSpacing: "0.2em",
          color: "rgba(255,255,255,0.4)",
          textTransform: "uppercase",
        }}
      >
        <span className="gt-pulse" />
        <span>Loading · GridTilt</span>
      </div>
    </div>
  );
}

/**
 * Pending state for a route chunk. The fallback used to be null, which was
 * survivable when every page was already in the main bundle; with routes split
 * it would be a blank panel on each first visit.
 *
 * Shaped like the page it stands in for rather than a grey block: nearly every
 * dashboard route opens with a PageHeader strip (title, inline stats) over a
 * stat row and a main panel, so the placeholder holds that geometry and the
 * real content lands without the layout jumping.
 */
function RouteLoading() {
  return (
    <div data-testid="route-loading" role="status" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <div className="border-b border-border px-4 sm:px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <div className="px-4 sm:px-6 py-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[68px] w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    </div>
  );
}

function App() {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [location, navigate] = useLocation();
  const [gPressed, setGPressed] = useState(false);

  const isMarketing = MARKETING_ROUTES.includes(location);

  // Privacy-respecting page views (GoatCounter); inert unless
  // VITE_GOATCOUNTER_CODE is set at build time, and only on the production
  // host. See lib/analytics.ts and lib/analytics-events.ts.
  useEffect(() => {
    initAnalytics();
  }, []);
  useEffect(() => {
    trackPageview(location);
  }, [location]);

  // The tab title follows the address. The server writes the title into the
  // HTML on a full load, so the first render is skipped; after that each new
  // page or chip asks the same source for its title (/api/page-meta).
  const search = useSearch();
  const address = metaAddress(location, search);
  const firstAddress = useRef(true);
  useEffect(() => {
    if (firstAddress.current) {
      firstAddress.current = false;
      return;
    }
    let live = true;
    fetch(`/api/page-meta?path=${encodeURIComponent(address)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((meta: { title?: string } | null) => {
        if (live && meta?.title) document.title = meta.title;
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [address]);

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
          "1": "/states", "2": "/grid", "3": "/compute", "4": "/markets", "5": "/blog",
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
          <ErrorBoundary label="This page failed to render." resetKey={location}>
            <Suspense fallback={<HomeLoadingShell />}>
              <Router />
            </Suspense>
          </ErrorBoundary>
          {showShortcuts && (
            <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
          )}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }


  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <div className="flex h-screen w-full flex-col bg-background overflow-hidden">
          <TopNav />
          {/* Chrome: if the ticker breaks it drops out, it does not take the
              page with it and it does not deserve an error panel of its own. */}
          <ErrorBoundary silent>
            <NewsTicker />
          </ErrorBoundary>
          {/* isolate: the map's layers carry z-indexes in the hundreds; kept
              inside main they cannot rise over the phone bar or a menu.
              pb-20: the phone bar floats over the bottom of the screen, so
              the page ends above it. */}
          <main className="isolate flex-1 overflow-auto pb-20 sm:pb-0">
            <ErrorBoundary label="This page failed to render." resetKey={location}>
              <Suspense fallback={<RouteLoading />}>
                <Router />
              </Suspense>
            </ErrorBoundary>
            <SiteFooter />
          </main>
        </div>
        <MobileBar />
        <CommandPalette />
        {showShortcuts && (
          <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />
        )}
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
