/**
 * Route contract for /api/state-news/:state. The 404 path is what keeps a
 * typo'd or probed state code from reaching the upstream fetch at all, so it
 * is asserted without touching the network.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.UNSUB_TOKEN_SECRET ||= "test-secret-for-state-news-routes";
process.env.ADMIN_API_KEY ||= "test-admin-key";
process.env.NODE_ENV = "test";

const { registerRoutes } = await import("../routes");

async function withServer(fn: (base: string) => Promise<void>) {
  const app = express();
  const server = createServer(app);
  await registerRoutes(server, app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("unknown state codes 404 without reaching the network", async () => {
  await withServer(async (base) => {
    for (const code of ["ZZ", "XX", "99"]) {
      const res = await fetch(`${base}/api/state-news/${code}`);
      assert.equal(res.status, 404, `expected 404 for ${code}`);
      const body = await res.json() as { error: string };
      assert.match(body.error, /unknown state/i);
    }
  });
});

test("a path segment that is not a state code is rejected, not proxied", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/state-news/${encodeURIComponent("../etc/passwd")}`);
    assert.ok(res.status === 404 || res.status === 400, `got ${res.status}`);
  });
});
