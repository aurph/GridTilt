// The header and the footer used to disagree on the company's own name: the
// animated Wordmark rendered "Grid" + "Tilt" while HomeFooter hardcoded its
// own "Grid" + "tilt". Both now split one exported constant. These tests scan
// source rather than importing the .tsx, so they need no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const CLIENT = join(ROOT, "client", "src");

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== "__tests__") sourceFiles(p, acc);
    } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
      acc.push(p);
    }
  }
  return acc;
}

test("the wordmark exports one lockup and the halves rebuild the brand", () => {
  const src = readFileSync(join(CLIENT, "components", "home", "Wordmark.tsx"), "utf-8");
  assert.match(src, /export const BRAND_TEXT = "GridTilt";/, "brand text must stay GridTilt");
  assert.match(src, /export const BRAND_HEAD/);
  assert.match(src, /export const BRAND_TAIL/);

  const split = Number(/export const BRAND_SPLIT = (\d+);/.exec(src)?.[1]);
  assert.equal("GridTilt".slice(0, split), "Grid");
  assert.equal("GridTilt".slice(split), "Tilt", "the accent half is Tilt, not tilt");
});

test("no surface renders the brand with a lowercase second half", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(CLIENT)) {
    const src = readFileSync(file, "utf-8");
    // "Grid" immediately followed by a lowercase "tilt" in rendered markup.
    // The domain (gridtilt.com), the X handle and mailto addresses are all
    // lowercase on purpose and never start with a capital G here.
    for (const m of src.match(/Grid<[^>]*>tilt/g) ?? []) {
      offenders.push(`${file.replace(ROOT + "/", "")}: ${m.slice(0, 48)}`);
    }
    for (const m of src.match(/>\s*Gridtilt\s*</g) ?? []) {
      offenders.push(`${file.replace(ROOT + "/", "")}: ${m.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], `brand rendered as "Gridtilt"; use BRAND_HEAD/BRAND_TAIL:\n${offenders.join("\n")}`);
});
