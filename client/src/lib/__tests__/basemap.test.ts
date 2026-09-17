/**
 * Carto authenticates raster tiles with `key=`. `api_key=` is silently
 * ignored and the tiles come back watermarked, so the parameter name is
 * pinned here rather than left to review.
 */
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  basemapTileLayerProps,
  cartoTileUrl,
  getCartoApiKey,
  CARTO_ATTRIBUTION,
  CARTO_KEY_META_NAME,
} from "../basemap";

const globalWithDocument = globalThis as { document?: unknown };

/** Stands in for the meta tag the server injects into <head>. */
function setMetaKey(content: string | null) {
  globalWithDocument.document = {
    querySelector: (selector: string) => {
      if (!selector.includes(CARTO_KEY_META_NAME)) return null;
      if (content === null) return null;
      return { getAttribute: () => content };
    },
  };
}

/** A document with no such meta tag - i.e. CARTO_API was never set. */
function setNoMeta() {
  globalWithDocument.document = { querySelector: () => null };
}

afterEach(() => {
  delete globalWithDocument.document;
});

describe("cartoTileUrl", () => {
  it("appends the key as `key`, not `api_key`", () => {
    const url = cartoTileUrl("dark_nolabels", "abc123");
    assert.ok(url.includes("?key=abc123"), url);
    assert.ok(!url.includes("api_key"), "Carto ignores api_key");
  });

  it("keeps the Leaflet placeholders intact", () => {
    const url = cartoTileUrl("dark_nolabels", "abc123");
    for (const token of ["{s}", "{z}", "{x}", "{y}", "{r}"]) {
      assert.ok(url.includes(token), `${token} missing from ${url}`);
    }
  });

  it("falls back to an unkeyed URL so the map still renders", () => {
    const url = cartoTileUrl("dark_nolabels", null);
    assert.equal(url, "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png");
    assert.ok(!url.includes("?"), "no dangling query string");
  });

  it("honours the requested style", () => {
    assert.ok(cartoTileUrl("dark_all", "k").includes("/dark_all/"));
    assert.ok(cartoTileUrl("light_nolabels", "k").includes("/light_nolabels/"));
  });

  it("encodes a key containing URL-significant characters", () => {
    assert.ok(cartoTileUrl("dark_nolabels", "a&b=c").includes("?key=a%26b%3Dc"));
  });

  it("reads the injected key when no key is passed", () => {
    setMetaKey("injected123");
    assert.ok(cartoTileUrl("dark_nolabels").includes("?key=injected123"));
  });
});

describe("getCartoApiKey", () => {
  it("returns the key from the injected meta tag", () => {
    setMetaKey("abc123");
    assert.equal(getCartoApiKey(), "abc123");
  });

  it("returns null when the meta tag is absent", () => {
    setNoMeta();
    assert.equal(getCartoApiKey(), null);
  });

  it("returns null for an empty content attribute", () => {
    setMetaKey("");
    assert.equal(getCartoApiKey(), null);
  });

  it("looks the key up under the name the server writes", () => {
    assert.equal(CARTO_KEY_META_NAME, "gridtilt:carto-api-key");
  });
});

describe("basemapTileLayerProps", () => {
  it("omits maxZoom entirely when not given", () => {
    // Passing maxZoom: undefined overrides Leaflet's default of 18 instead of
    // falling back to it, and the layer then throws "Attempted to load an
    // infinite number of tiles" on any map without its own maxZoom.
    const props = basemapTileLayerProps("dark_all");
    assert.ok(!("maxZoom" in props), "maxZoom key must be absent, not undefined");
  });

  it("includes maxZoom when given", () => {
    assert.equal(basemapTileLayerProps("dark_nolabels", 19).maxZoom, 19);
  });

  it("includes maxZoom of 0 rather than treating it as absent", () => {
    const props = basemapTileLayerProps("dark_nolabels", 0);
    assert.ok("maxZoom" in props);
    assert.equal(props.maxZoom, 0);
  });

  it("carries the url, attribution, and subdomains Leaflet needs", () => {
    const props = basemapTileLayerProps("dark_all");
    assert.ok(props.url.includes("/dark_all/"));
    assert.equal(props.attribution, CARTO_ATTRIBUTION);
    assert.equal(props.subdomains, "abcd");
  });
});

describe("attribution", () => {
  it("still credits OSM and CARTO, which the free tier requires", () => {
    assert.ok(CARTO_ATTRIBUTION.includes("openstreetmap.org/copyright"));
    assert.ok(CARTO_ATTRIBUTION.includes("carto.com/attributions"));
  });
});
