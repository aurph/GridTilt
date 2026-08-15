// auth-boundary.test.ts asserts a HAND-MAINTAINED list of protected routes.
// That list is only as good as whoever last edited it: a new admin route added
// without touching it is untested, and nothing fails to say so.
//
// This file discovers the routes instead. It walks the Express router after
// registerRoutes and requires that every admin-surface path rejects an
// unauthenticated request. A route added tomorrow is covered the moment it is
// registered, with no list to update.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-admin-coverage";
process.env.ADMIN_API_KEY ||= "test-admin-key";
process.env.NODE_ENV = "test";

// Keep the process offline: an unauthenticated request should never reach a
// network call, but a regression that skips the guard must fail on the
// assertion rather than by hanging on Yahoo.
interface YahooLike {
  quote: (...a: unknown[]) => Promise<unknown>;
  chart: (...a: unknown[]) => Promise<unknown>;
  search?: (...a: unknown[]) => Promise<unknown>;
}
const yahooModule = await import("yahoo-finance2");
const YahooFinanceClass = (yahooModule as unknown as { default: new () => YahooLike }).default;
const proto = YahooFinanceClass.prototype as YahooLike;
const originalQuote = proto.quote;
const originalChart = proto.chart;
proto.quote = () => Promise.reject(new Error("offline"));
proto.chart = () => Promise.reject(new Error("offline"));
after(() => {
  proto.quote = originalQuote;
  proto.chart = originalChart;
});

const { registerRoutes } = await import("../routes");

/**
 * Paths that are privileged without carrying the /api/admin/ prefix. These are
 * the SEC-1/SEC-2 closes plus the daily export; they must stay in sync with
 * requireAdmin usage, so they are listed explicitly rather than guessed.
 */
const EXTRA_PROTECTED = [
  "/api/newsletter/preview",
  "/api/newsletter/send",
  "/api/social/generate",
  "/api/export/daily",
];

interface DiscoveredRoute {
  method: string;
  path: string;
}

function discoverRoutes(app: express.Express): DiscoveredRoute[] {
  // Express 5 exposes `app.router`; the underscore form is the v4 fallback.
  const router = (app as unknown as { router?: { stack?: unknown[] }; _router?: { stack?: unknown[] } });
  const stack = (router.router?.stack ?? router._router?.stack ?? []) as Array<{
    route?: { path?: string | string[]; methods?: Record<string, boolean> };
  }>;

  const out: DiscoveredRoute[] = [];
  for (const layer of stack) {
    const route = layer.route;
    if (!route?.path) continue;
    const paths = Array.isArray(route.path) ? route.path : [route.path];
    const methods = Object.keys(route.methods ?? {}).filter((m) => m !== "_all");
    for (const p of paths) {
      for (const m of methods) out.push({ method: m.toUpperCase(), path: p });
    }
  }
  return out;
}

/** ":id" style params get a concrete value so the request actually routes. */
function concrete(path: string): string {
  return path
    .split("/")
    .map((seg) => (seg.startsWith(":") ? "1" : seg))
    .join("/");
}

async function startTestServer(): Promise<{ url: string; app: express.Express; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  const { port } = httpServer.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    app,
    close: () => new Promise<void>((resolve) => httpServer.close(() => resolve())),
  };
}

test("every discovered admin route rejects an unauthenticated request", async () => {
  const { url, app, close } = await startTestServer();
  try {
    const all = discoverRoutes(app);
    assert.ok(all.length > 20, `route discovery looks broken, only found ${all.length} routes`);

    const protectedRoutes = all.filter(
      (r) => r.path.includes("/api/admin") || EXTRA_PROTECTED.includes(r.path),
    );
    assert.ok(
      protectedRoutes.length >= 15,
      `expected to discover the admin surface, found ${protectedRoutes.length}`,
    );

    const leaked: string[] = [];
    for (const r of protectedRoutes) {
      const res = await fetch(`${url}${concrete(r.path)}`, {
        method: r.method,
        headers: r.method === "GET" || r.method === "DELETE" ? undefined : { "Content-Type": "application/json" },
        body: r.method === "GET" || r.method === "DELETE" ? undefined : "{}",
      });
      await res.text();
      // 401 is the intended denial. Past the admin failure limiter's budget the
      // denial becomes 429, and an unconfigured ADMIN_API_KEY yields 503. All
      // are denials; the invariant is simply that nothing succeeds.
      if (res.status >= 200 && res.status < 300) {
        leaked.push(`${r.method} ${r.path} returned ${res.status}`);
      }
    }

    assert.deepEqual(
      leaked,
      [],
      `these privileged routes answered an unauthenticated request:\n${leaked.join("\n")}`,
    );
  } finally {
    await close();
  }
});

test("no admin route is missing from the hand-maintained auth-boundary list", async () => {
  // The two tests are complementary: auth-boundary asserts exact 401 semantics
  // on a curated list, this one asserts the list has not fallen behind the
  // router. Failing here means someone added an admin route without adding it
  // there.
  const { app, close } = await startTestServer();
  try {
    const discovered = discoverRoutes(app)
      .filter((r) => r.path.includes("/api/admin"))
      .map((r) => `${r.method} ${r.path}`);

    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./auth-boundary.test.ts", import.meta.url), "utf-8"),
    );

    const missing = discovered.filter((entry) => {
      const path = entry.split(" ")[1];
      // Compare on the literal path segment before any param, which is how the
      // curated list writes them (e.g. /api/admin/tweet/123 for /:id).
      const stem = path.split("/:")[0];
      return !source.includes(stem);
    });

    assert.deepEqual(
      missing,
      [],
      `admin routes absent from auth-boundary.test.ts PROTECTED_ROUTES:\n${missing.join("\n")}`,
    );
  } finally {
    await close();
  }
});
