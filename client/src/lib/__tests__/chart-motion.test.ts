// Recharts animates every series by default and never consults
// prefers-reduced-motion, so charts grew from zero regardless of what the
// visitor asked their OS for. seriesMotion() is the single switch every
// animated series spreads (contract tests live in series-motion.test.ts);
// this file walks the source and requires every series to opt in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();

/**
 * The real regression risk is a new chart being added without the prop. Recharts
 * fails silently here: an animated series that never receives a frame renders an
 * empty <g class="recharts-bar-rectangle"> with no path inside, so the chart just
 * looks blank instead of erroring. Walk the source and require every animated
 * series to opt in.
 */
test("every animated Recharts series spreads seriesMotion()", () => {
  const SERIES = ["Bar", "Line", "Area", "Pie", "Radar", "Scatter", "RadialBar", "Funnel"];
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
        if (!m.includes("...seriesMotion()")) {
          offenders.push(`${file.replace(ROOT + "/", "")}: <${tag} ...`);
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these series animate regardless of prefers-reduced-motion; spread {...seriesMotion()}:\n${offenders.join("\n")}`,
  );
});
