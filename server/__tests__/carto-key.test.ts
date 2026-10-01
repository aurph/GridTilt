/**
 * CARTO returns HTTP 200 and the same watermark PNG for a missing key and for
 * a key it does not accept, so a wrong key looks exactly like a working one
 * unless something fetches tiles and compares them. These tests pin how the
 * check reads CARTO's answers, without touching the network.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { probeCartoKey, PROBE_TILE_URLS, siteReferer } from "../carto-key";

interface FakeResponse {
  status?: number;
  etag?: string | null;
  body?: string;
}

/** A fetch that answers each probe tile in order and records the URLs and headers asked for. */
function fakeFetch(answers: FakeResponse[] | Error) {
  const urls: string[] = [];
  const headers: Array<Record<string, string> | undefined> = [];
  let i = 0;
  const impl = async (url: string, init?: { headers?: Record<string, string> }) => {
    urls.push(url);
    headers.push(init?.headers);
    if (answers instanceof Error) throw answers;
    const a = answers[i++ % answers.length];
    const status = a.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (name: string) => (name.toLowerCase() === "etag" ? (a.etag ?? null) : null) },
      arrayBuffer: async () => new TextEncoder().encode(a.body ?? "").buffer as ArrayBuffer,
    };
  };
  return { impl, urls, headers };
}

describe("probeCartoKey", () => {
  it("accepts a key when two different places come back as different tiles", async () => {
    const f = fakeFetch([
      { etag: '"a1"', body: "west" },
      { etag: '"b2"', body: "east" },
    ]);
    assert.equal(await probeCartoKey("good", f.impl), "accepted");
  });

  it("rejects a key when CARTO labels the tile a watermark", async () => {
    const f = fakeFetch([
      { etag: '"wm-da89c20e77c1-dark"', body: "stamp" },
      { etag: '"wm-da89c20e77c1-dark"', body: "stamp" },
    ]);
    assert.equal(await probeCartoKey("bad", f.impl), "rejected");
  });

  it("rejects a key when two different places come back byte-identical, whatever the ETag", async () => {
    const f = fakeFetch([
      { etag: '"x"', body: "same" },
      { etag: '"y"', body: "same" },
    ]);
    assert.equal(await probeCartoKey("bad", f.impl), "rejected");
  });

  it("calls 401 and 403 refused: a key whose website list does not include the site", async () => {
    assert.equal(await probeCartoKey("k", fakeFetch([{ status: 401 }]).impl), "refused");
    assert.equal(await probeCartoKey("k", fakeFetch([{ status: 403 }]).impl), "refused");
  });

  it("sends the site's origin as Referer, as a browser on the site does", async () => {
    // A key restricted to websites answers 403 to a request with no Referer,
    // which is every server-side request unless it sets one.
    const f = fakeFetch([{ body: "a" }, { body: "b" }]);
    await probeCartoKey("k", f.impl, 8000, "https://gridtilt.com/");
    assert.deepEqual(f.headers, [{ Referer: "https://gridtilt.com/" }, { Referer: "https://gridtilt.com/" }]);
  });

  it("says unreachable, not rejected, when CARTO errors or cannot be reached", async () => {
    assert.equal(await probeCartoKey("k", fakeFetch([{ status: 503 }]).impl), "unreachable");
    assert.equal(await probeCartoKey("k", fakeFetch(new Error("ECONNRESET")).impl), "unreachable");
  });

  it("asks for two different tiles, keyed with `key=` and URL-encoded", async () => {
    const f = fakeFetch([{ body: "a" }, { body: "b" }]);
    await probeCartoKey("a&b", f.impl);
    assert.equal(new Set(f.urls).size, 2);
    assert.deepEqual(
      f.urls,
      PROBE_TILE_URLS.map((u) => `${u}?key=a%26b`),
    );
  });
});

describe("siteReferer", () => {
  it("is the production origin in production and localhost elsewhere", () => {
    assert.equal(siteReferer("production"), "https://gridtilt.com/");
    assert.equal(siteReferer("development"), "http://localhost/");
    assert.equal(siteReferer(undefined), "http://localhost/");
  });

  it("defaults to the literal process.env.NODE_ENV, which the production build replaces", async () => {
    // The deployment runs `node dist/index.cjs` with no NODE_ENV at runtime;
    // only a literal process.env.NODE_ENV is rewritten by the build's define.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../carto-key.ts", import.meta.url), "utf8");
    assert.match(src, /siteReferer\(nodeEnv: string \| undefined = process\.env\.NODE_ENV\)/);
  });
});
