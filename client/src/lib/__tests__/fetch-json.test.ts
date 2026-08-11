/**
 * fetchJson is the inline-queryFn escape hatch for URLs with query strings.
 * The bug it exists to prevent: dropping the status check, so an error body
 * reaches the component typed as if it were data. /api/news returning
 * {error:"Too many requests"} with a 429 is what blanked the app.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fetchJson } from "../queryClient";

const realFetch = globalThis.fetch;

function stub(status: number, body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

describe("fetchJson", () => {
  beforeEach(() => {
    globalThis.fetch = realFetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns the parsed body on 200", async () => {
    stub(200, [{ headline: "a" }]);
    assert.deepEqual(await fetchJson("/api/news"), [{ headline: "a" }]);
  });

  it("throws on a rate-limit body instead of returning it as data", async () => {
    stub(429, { error: "Too many requests" });
    await assert.rejects(() => fetchJson("/api/news"), /429/);
  });

  it("throws on 500 rather than handing back an error object", async () => {
    stub(500, { error: "boom" });
    await assert.rejects(() => fetchJson("/api/stack?timeframe=1D"), /500/);
  });

  it("throws on the honest 503 unconfigured payload too", async () => {
    // Callers that want to render a 503 body (my-grid rates) keep their own
    // queryFn on purpose; the shared helper must not silently allow it.
    stub(503, { configured: false });
    await assert.rejects(() => fetchJson("/api/physical/retail-rates"), /503/);
  });
});
