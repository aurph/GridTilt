/**
 * Privacy-respecting pageview analytics via GoatCounter: no cookies, no
 * cross-site tracking, no personal data. Entirely inert until
 * VITE_GOATCOUNTER_CODE is set at build time (the goatcounter.com site code),
 * so development and forks send nothing.
 *
 * SPA note: automatic counting is disabled and every route change is counted
 * manually from the router, otherwise only the first page load would count.
 */

declare global {
  interface Window {
    goatcounter?: {
      no_onload?: boolean;
      count?: (opts: { path: string; title?: string }) => void;
    };
  }
}

const CODE: string | undefined = import.meta.env.VITE_GOATCOUNTER_CODE;

let loaded = false;

export function initAnalytics(): void {
  if (!CODE || loaded || typeof document === "undefined") return;
  loaded = true;
  window.goatcounter = { no_onload: true };
  const s = document.createElement("script");
  s.async = true;
  s.src = "https://gc.zgo.at/count.js";
  s.dataset.goatcounter = `https://${CODE}.goatcounter.com/count`;
  document.head.appendChild(s);
}

/** Count one pageview for the given path. Safe to call when inactive. */
export function trackPageview(path: string): void {
  if (!CODE) return;
  // the script may still be loading on the first navigation; retry once
  if (window.goatcounter?.count) {
    window.goatcounter.count({ path });
  } else {
    setTimeout(() => window.goatcounter?.count?.({ path }), 1500);
  }
}
