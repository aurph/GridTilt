/**
 * The Carto key reaches the browser only through this injection. If it stops
 * landing in the HTML the maps do not error - they silently render tiles
 * stamped "API KEY REQUIRED", which is why these assertions are explicit
 * about the script tag being present and parseable.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  buildRuntimeConfig,
  injectRuntimeConfig,
  readCartoApiKey,
  resetRuntimeConfigWarnings,
  CARTO_KEY_META_NAME,
} from "../runtime-config";

const HTML = "<!DOCTYPE html><html><head><title>t</title></head><body></body></html>";

function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { NODE_ENV: "test", ...overrides } as NodeJS.ProcessEnv;
}

/** Pulls the key back out of the injected meta tag. */
function injectedKey(html: string): string | null {
  const match = html.match(
    new RegExp(`<meta name="${CARTO_KEY_META_NAME}" content="([^"]*)" />`),
  );
  return match ? match[1] : null;
}

describe("readCartoApiKey", () => {
  beforeEach(() => resetRuntimeConfigWarnings());

  it("returns the key when CARTO_API is set", () => {
    assert.equal(readCartoApiKey(env({ CARTO_API: "abc123" })), "abc123");
  });

  it("trims surrounding whitespace from a pasted secret", () => {
    assert.equal(readCartoApiKey(env({ CARTO_API: "  abc123\n" })), "abc123");
  });

  it("returns null when unset or empty", () => {
    assert.equal(readCartoApiKey(env()), null);
    assert.equal(readCartoApiKey(env({ CARTO_API: "" })), null);
    assert.equal(readCartoApiKey(env({ CARTO_API: "   " })), null);
  });

  it("rejects a value with interior whitespace rather than building a broken URL", () => {
    assert.equal(readCartoApiKey(env({ CARTO_API: "abc 123" })), null);
  });

  it("rejects an absurdly long value", () => {
    assert.equal(readCartoApiKey(env({ CARTO_API: "a".repeat(257) })), null);
  });
});

describe("injectRuntimeConfig", () => {
  beforeEach(() => resetRuntimeConfigWarnings());

  it("puts the key in the head so it is readable before the app module runs", () => {
    const html = injectRuntimeConfig(HTML, env({ CARTO_API: "abc123" }));
    const headEnd = html.indexOf("</head>");
    const meta = html.indexOf(CARTO_KEY_META_NAME);
    assert.ok(meta !== -1 && meta < headEnd, "meta tag must be inside <head>");
    assert.equal(injectedKey(html), "abc123");
  });

  it("uses no inline script, which production CSP (script-src 'self') blocks", () => {
    const html = injectRuntimeConfig(HTML, env({ CARTO_API: "abc123" }));
    assert.ok(
      !/<script(?![^>]*\bsrc=)/.test(html.replace(HTML, "")),
      "injection must not add an inline script",
    );
  });

  it("omits the tag entirely when no key is configured", () => {
    const html = injectRuntimeConfig(HTML, env());
    assert.equal(injectedKey(html), null);
    assert.ok(!html.includes(CARTO_KEY_META_NAME));
  });

  it("escapes a value that would otherwise break out of the attribute", () => {
    // Not a realistic key, but the injection point must be safe regardless.
    const html = injectRuntimeConfig(HTML, env({ CARTO_API: 'a"><script>x</script>' }));
    assert.ok(!html.includes('a"><script>'), "raw quote/angle must not survive");
    assert.ok(html.includes("&quot;"), "quotes must be entity-escaped");
  });

  it("leaves HTML without a head untouched instead of throwing", () => {
    assert.equal(injectRuntimeConfig("<p>no head</p>", env()), "<p>no head</p>");
  });

  it("writes the meta name the client reads (client/src/lib/basemap.ts)", () => {
    // The two constants are in separate modules; drift would silently
    // reintroduce the watermark with no test failure anywhere else.
    assert.equal(CARTO_KEY_META_NAME, "gridtilt:carto-api-key");
  });

  it("buildRuntimeConfig exposes only the carto key", () => {
    assert.deepEqual(buildRuntimeConfig(env({ CARTO_API: "abc123" })), {
      cartoApiKey: "abc123",
    });
  });
});
