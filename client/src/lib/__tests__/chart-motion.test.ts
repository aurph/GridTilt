// Recharts animates every series by default and never consults
// prefers-reduced-motion, so charts grew from zero regardless of what the
// visitor asked their OS for. seriesAnimation is the single switch every
// animated series spreads; these tests pin the contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const CHART_THEME = join(ROOT, "client", "src", "lib", "chart-theme.ts");

test("seriesAnimation is derived from prefersReducedMotion, not hardcoded", () => {
  const src = readFileSync(CHART_THEME, "utf-8");
  assert.match(src, /isAnimationActive:\s*!prefersReducedMotion/, "seriesAnimation must invert the media query");
  assert.match(src, /prefers-reduced-motion:\s*reduce/, "must query the reduce preference");
  // Node has no window; the guard is what keeps this importable outside a browser.
  assert.match(src, /typeof window !== "undefined"/, "must guard window access");
});

// In a Node test there is no window, so the module-load evaluation must land on
// "no preference" and leave animation enabled rather than throwing.
test("chart-theme imports cleanly without a DOM and defaults to animation on", async () => {
  const mod = await import("../chart-theme");
  assert.equal(mod.prefersReducedMotion, false, "no window means no stated preference");
  assert.equal(mod.seriesAnimation.isAnimationActive, true);
});

/**
 * The real regression risk is a new chart being added without the prop. Recharts
 * fails silently here: an animated series that never receives a frame renders an
 * empty <g class="recharts-bar-rectangle"> with no path inside, so the chart just
 * looks blank instead of erroring. Walk the source and require every animated
 * series to opt in.
 */
test("every animated Recharts series spreads seriesAnimation", () => {
  const SERIES = ["Bar", "Line", "Area", "Pie", "Radar"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== "__tests__") walk(p);
      } else if (entry.name.endsWith(".tsx")) {
        files.push(p);
      }
    }
  };
  walk(join(ROOT, "client", "src"));

  const offenders: string[] = [];
  for (const file of files) {
    const src = readFileSync(file, "utf-8");
    // Only Recharts series take isAnimationActive. @visx exports a <Area> too,
    // but it is a pure path generator with no animation and no such prop.
    if (!/from "recharts"/.test(src)) continue;
    for (const tag of SERIES) {
      // Opening tags of the series itself, never <BarChart>/<LineChart>/etc.
      const re = new RegExp(`<${tag}(?![A-Za-z])[\\s/>][^>]*`, "g");
      for (const m of src.match(re) ?? []) {
        if (!m.includes("...seriesAnimation")) {
          offenders.push(`${file.replace(ROOT + "/", "")}: <${tag} ...`);
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these series animate regardless of prefers-reduced-motion; spread {...seriesAnimation}:\n${offenders.join("\n")}`,
  );
});
