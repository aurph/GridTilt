// The map layers are a few hundred KB of JSON and the host does not compress
// API responses, so the two layer routes send gzip themselves: serialized and
// compressed once per content key, not once per request.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { acceptsGzip, jsonGzipCache } from "../json-gzip";

describe("jsonGzipCache", () => {
  it("builds once per key and again only when the key changes", () => {
    const cache = jsonGzipCache();
    let builds = 0;
    const build = () => ({ n: ++builds, rows: Array.from({ length: 200 }, (_, i) => ({ id: i, name: "row" })) });
    const a = cache("sites", "k1", build);
    const b = cache("sites", "k1", build);
    assert.equal(builds, 1);
    assert.equal(a, b, "the same buffers are reused");
    cache("sites", "k2", build);
    assert.equal(builds, 2);
    cache("plants", "k2", build);
    assert.equal(builds, 3, "each name has its own entry");
  });

  it("holds the JSON and a gzip of it that inflates to the same text, much smaller", () => {
    const value = { rows: Array.from({ length: 500 }, (_, i) => ({ id: i, operator: "Amazon Web Services", state: "VA" })) };
    const { json, gz } = jsonGzipCache()("x", "k", () => value);
    assert.deepEqual(JSON.parse(json.toString("utf-8")), value);
    assert.equal(gunzipSync(gz).toString("utf-8"), json.toString("utf-8"));
    assert.ok(gz.length < json.length / 5, `${gz.length} vs ${json.length}`);
  });
});

describe("acceptsGzip", () => {
  it("reads the request's Accept-Encoding, including a zero quality that refuses it", () => {
    assert.equal(acceptsGzip("gzip, deflate, br"), true);
    assert.equal(acceptsGzip("br;q=1.0, gzip;q=0.8"), true);
    assert.equal(acceptsGzip("identity"), false);
    assert.equal(acceptsGzip("gzip;q=0"), false);
    assert.equal(acceptsGzip("x-gzip-not"), false);
    assert.equal(acceptsGzip(undefined), false);
    assert.equal(acceptsGzip(["br", "gzip"]), true);
  });
});
