// Guards the social card. Two of these lock in bugs that shipped silently for
// months, so read the comments before relaxing an assertion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { buildCardTree, projectDot, assertMapPathIntact, formatAsOf, type OgCard } from "../og-card";
import { MAP_W, MAP_H, MAP_SCALE, MAP_TRANSLATE, US_PATH } from "../us-map";

// ── Fonts ──────────────────────────────────────────────────────────────────
//
// The original card asked for fontWeight 700/800 and fontFamily "monospace"
// while registering only Inter-Regular. satori cannot synthesize weights, so
// every "bold" heading and every stat number silently rendered at weight 400
// and in the wrong family. Nothing failed; the card just looked flat. If these
// files go missing the same silent regression returns.

test("every font face the card asks for exists on disk", () => {
  for (const f of ["Inter-Regular.ttf", "Inter-Bold.woff", "JetBrainsMono-Bold.woff"]) {
    const p = join(process.cwd(), "server", "fonts", f);
    assert.ok(existsSync(p), `missing font ${f}; card will silently render the wrong weight`);
    assert.ok(readFileSync(p).length > 5_000, `${f} is suspiciously small`);
  }
});

// ── Map geometry ───────────────────────────────────────────────────────────
//
// satori truncates large inline SVG markup with no error. Splitting the US
// outline into per-state <path> elements blew that limit and rendered a
// country missing 44 of its 49 states. Keep it one path, and keep it long.

test("US outline is a single intact path", () => {
  assertMapPathIntact();
  assert.ok(US_PATH.startsWith("M"), "path should start with a moveto");
  assert.ok(US_PATH.length > 30_000, `path is only ${US_PATH.length} chars; likely truncated`);
});

test("known cities project inside the map box, in the right places", () => {
  const abilene = projectDot(32.4487, -99.7331);
  const sanFrancisco = projectDot(37.7749, -122.4194);
  const newYork = projectDot(40.7128, -74.006);

  for (const [name, p] of [["Abilene", abilene], ["SF", sanFrancisco], ["NYC", newYork]] as const) {
    assert.ok(p, `${name} should project`);
    assert.ok(p![0] >= 0 && p![0] <= MAP_W, `${name} x out of box`);
    assert.ok(p![1] >= 0 && p![1] <= MAP_H, `${name} y out of box`);
  }
  // West coast must land left of the east coast, and Texas below New York.
  assert.ok(sanFrancisco![0] < newYork![0], "SF should be west of NYC");
  assert.ok(abilene![1] > newYork![1], "Abilene should be south of NYC");
});

test("coordinates outside the continental box are rejected, not clamped", () => {
  assert.equal(projectDot(64.2008, -149.4937), null, "Alaska should not be plotted");
  assert.equal(projectDot(21.3099, -157.8581), null, "Hawaii should not be plotted");
});

test("garbage coordinates return null instead of NaN pixels", () => {
  assert.equal(projectDot(NaN, -99), null);
  assert.equal(projectDot(40, Infinity), null);
});

// The runtime projection is d3's geoAlbers written out longhand so the CJS
// server bundle never has to require() the ESM-only d3-geo. That trade is only
// safe while the arithmetic matches d3 exactly, so pin it here. d3-geo is a
// devDependency and is used by this test and the generator script only.
test("baked projection matches d3-geo across the continental US", async () => {
  const { geoAlbers } = await import("d3-geo");
  const reference = geoAlbers().scale(MAP_SCALE).translate(MAP_TRANSLATE);

  let worst = 0;
  let compared = 0;
  for (let lat = 25; lat <= 49; lat += 1) {
    for (let lng = -124; lng <= -67; lng += 1) {
      const mine = projectDot(lat, lng);
      const theirs = reference([lng, lat]);
      if (!mine || !theirs) continue; // box-clipped by us, not by d3
      worst = Math.max(worst, Math.hypot(mine[0] - theirs[0], mine[1] - theirs[1]));
      compared++;
    }
  }

  assert.ok(compared > 500, `expected a dense sample, compared only ${compared} points`);
  assert.ok(worst < 1e-6, `baked projection drifts ${worst}px from d3-geo`);
});

// ── as-of formatting ───────────────────────────────────────────────────────

test("formatAsOf renders a card-ready date or null", () => {
  assert.equal(formatAsOf("2026-06-26"), "26 JUN 2026");
  assert.equal(formatAsOf("2026-01-05T12:00:00Z"), "5 JAN 2026");
  assert.equal(formatAsOf(null), null);
  assert.equal(formatAsOf(""), null);
  assert.equal(formatAsOf("not a date"), null);
  assert.equal(formatAsOf("2026-13-01"), null, "month 13 has no name");
});

// ── Frame ──────────────────────────────────────────────────────────────────

/** Flatten the satori tree into the strings it will render. */
function textsOf(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => textsOf(n, out));
    return out;
  }
  if (node && typeof node === "object") {
    const props = (node as { props?: { children?: unknown } }).props;
    if (props && "children" in props) textsOf(props.children, out);
  }
  return out;
}

const sample: OgCard = {
  title: "the AI buildout, tracked",
  subtitle: "every US compute cluster we count carries a public source",
  stats: [{ label: "Clusters", value: "235" }],
  asOf: "26 JUN 2026",
  source: "235/235 entries sourced · company filings",
  visual: { kind: "none" },
};

test("the card always shows when it was measured and where it came from", () => {
  const texts = textsOf(buildCardTree(sample));
  assert.ok(texts.includes("AS OF 26 JUN 2026"), "as-of missing from card");
  assert.ok(texts.includes(sample.source), "source line missing from card");
  assert.ok(texts.includes("GRIDTILT"));
  assert.ok(texts.includes("gridtilt.com"));
});

test("a card with no as-of degrades honestly instead of inventing a date", () => {
  const texts = textsOf(buildCardTree({ ...sample, asOf: null }));
  assert.ok(texts.includes("AS OF —"), "missing as-of should print an em dash, not today");
  assert.ok(
    !texts.some((t) => /\d{4}/.test(t) && t.startsWith("AS OF")),
    "must not fabricate a year",
  );
});

test("long stat values step down in size so they cannot collide with the visual", () => {
  const sizeOf = (value: string): number => {
    const find = (n: any): number | null => {
      if (n && typeof n === "object") {
        if (n.props?.children === value && n.props?.style?.fontSize) {
          return parseFloat(n.props.style.fontSize);
        }
        const kids = n.props?.children;
        for (const k of Array.isArray(kids) ? kids : [kids]) {
          const hit = find(k);
          if (hit !== null) return hit;
        }
      }
      return null;
    };
    return find(buildCardTree({ ...sample, stats: [{ label: "L", value }] }))!;
  };

  assert.equal(sizeOf("235"), 44);
  assert.ok(sizeOf("OpenAI / Oracle") < sizeOf("235"), "long values must shrink");
  assert.ok(sizeOf("A very long operator name") < sizeOf("OpenAI / Oracle"), "longer still must shrink further");
});

test("all four visual kinds build without throwing", () => {
  const kinds: OgCard["visual"][] = [
    { kind: "none" },
    { kind: "map", dots: [{ lat: 32.4487, lng: -99.7331, mw: 1200, status: "construction" }] },
    { kind: "bars", bars: [{ label: "ERCOT", value: 230, display: "230 GW", hot: true }] },
    { kind: "columns", columns: [{ label: "H100", value: 2.69, display: "$2.69" }] },
  ];
  for (const visual of kinds) {
    assert.doesNotThrow(() => buildCardTree({ ...sample, visual }), `visual ${visual.kind} threw`);
  }
});

test("bars scale against the largest value without dividing by zero", () => {
  assert.doesNotThrow(() =>
    buildCardTree({
      ...sample,
      visual: { kind: "bars", bars: [{ label: "empty", value: 0, display: "0 GW" }] },
    }),
  );
});

test("a highlighted map dot suppresses the status legend", () => {
  const withHighlight = textsOf(
    buildCardTree({
      ...sample,
      visual: {
        kind: "map",
        dots: [
          { lat: 32.4487, lng: -99.7331, highlight: true },
          { lat: 40.7128, lng: -74.006 },
        ],
        legend: true,
      },
    }),
  );
  assert.ok(!withHighlight.includes("operational"), "legend should be hidden when one dot is spotlit");
});
