// The failure this guards is not a slow response, it is no response at all.
// Node's fetch waits forever by default, so an upstream that accepts the
// connection and then goes silent pins the Express handler and the instance
// capacity behind it. These tests use a real server that never answers.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fetchWithTimeout, DEFAULT_TIMEOUT_MS } from "../fetch-timeout";

/** A server that accepts connections and deliberately never responds. */
function startBlackHole(): Promise<{ url: string; server: Server }> {
  return new Promise((resolve) => {
    const server = createServer(() => {
      // Intentionally empty: never write, never end.
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, server });
    });
  });
}

const openServers: Server[] = [];
after(() => {
  for (const s of openServers) s.closeAllConnections?.(), s.close();
});

test("a request to a silent upstream rejects instead of hanging", async () => {
  const { url, server } = await startBlackHole();
  openServers.push(server);

  const started = Date.now();
  await assert.rejects(
    () => fetchWithTimeout(url, {}, 150),
    (err: Error) => err.name === "AbortError" || /abort/i.test(err.message),
    "expected the deadline to abort the request",
  );
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 3_000, `should abort near the deadline, took ${elapsed}ms`);
});

test("a caller-supplied signal is not overridden", async () => {
  // Callers pass their own signal when they need a shorter or request-scoped
  // lifetime; silently replacing it would extend a deadline someone chose.
  const { url, server } = await startBlackHole();
  openServers.push(server);

  const controller = new AbortController();
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(
    () => fetchWithTimeout(url, { signal: controller.signal }, 60_000),
    (err: Error) => err.name === "AbortError" || /abort/i.test(err.message),
    "the caller's signal should still abort even with a long helper timeout",
  );
});

test("a responsive upstream passes straight through", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  openServers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;

  const res = await fetchWithTimeout(`http://127.0.0.1:${port}/`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("the timer is cleared on success so the process can exit", async () => {
  // A dangling setTimeout would keep the event loop alive for the full budget
  // after every successful call. If this leaks, the test run itself hangs.
  const server = createServer((_req, res) => res.end("ok"));
  openServers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;

  const started = Date.now();
  await fetchWithTimeout(`http://127.0.0.1:${port}/`, {}, 30_000);
  assert.ok(Date.now() - started < 5_000, "a successful call must not wait on its own timeout");
});

test("the default budget is bounded and sane", () => {
  assert.ok(DEFAULT_TIMEOUT_MS > 0 && DEFAULT_TIMEOUT_MS <= 15_000, `unreasonable default: ${DEFAULT_TIMEOUT_MS}`);
});
