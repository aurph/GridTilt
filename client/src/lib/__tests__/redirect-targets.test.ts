// Old routes 301 into a specific tab or view: /queue -> /power-map?tab=queue,
// /supply-chain -> /stack?view=flow, and so on.
//
// Both parsers behind those params fall back SILENTLY on an unknown id
// (readTabParam in ToolTabs.tsx, the view reader in TheStack.tsx). So renaming
// a tab id does not break the redirect in any visible way: it keeps returning
// 200 and quietly lands the visitor on the default view. Every one of these is
// a permalink someone may have bookmarked or linked to.
//
// This walks the redirects declared in App.tsx and requires each target id to
// still exist on the destination page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");

/**
 * Where each redirect destination declares its legal ids.
 *
 * `param` is the query key the destination reads. `ids` pulls the declared set
 * out of that file's source. Adding a redirect to a page that is not listed
 * here fails the coverage test below, which is the point: someone has to say
 * how the new target validates.
 */
const DESTINATIONS: Record<string, { file: string; param: string; ids: (src: string) => string[] }> = {
  "/power-map": {
    file: "client/src/pages/PowerMap.tsx",
    param: "tab",
    ids: (src) => idsFromBlock(src, "POWER_TABS"),
  },
  "/neocloud-intel": {
    file: "client/src/pages/neocloud-intel.tsx",
    param: "tab",
    ids: (src) => idsFromBlock(src, "GPU_TABS"),
  },
  "/analyze": {
    file: "client/src/pages/Analyze.tsx",
    param: "tab",
    ids: (src) => idsFromBlock(src, "ANALYZE_TABS"),
  },
  "/stack": {
    file: "client/src/pages/TheStack.tsx",
    param: "view",
    ids: (src) => {
      const m = /const VIEW_MODES[^=]*=\s*\[([^\]]*)\]/.exec(src);
      assert.ok(m, "could not find VIEW_MODES in TheStack.tsx");
      return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    },
  },
};

/** Pull the `id: "..."` values out of a `const NAME = [ ... ]` block. */
function idsFromBlock(src: string, name: string): string[] {
  const start = src.indexOf(`const ${name}`);
  assert.ok(start >= 0, `could not find ${name}`);
  const open = src.indexOf("[", start);
  const close = src.indexOf("];", open);
  assert.ok(open >= 0 && close > open, `could not bound ${name}`);
  return [...src.slice(open, close).matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
}

interface Redirect {
  target: string;
  path: string;
  param?: string;
  value?: string;
}

function declaredRedirects(): Redirect[] {
  const app = read("client/src/App.tsx");
  return [...app.matchAll(/<Redirect\s+to="([^"]+)"/g)].map((m) => {
    const target = m[1];
    const [path, query] = target.split("?");
    if (!query) return { target, path };
    const [param, value] = query.split("=");
    return { target, path, param, value };
  });
}

test("App.tsx declares redirects and this test can see them", () => {
  // Guards against the regex silently matching nothing after a refactor, which
  // would make every assertion below pass vacuously.
  const redirects = declaredRedirects();
  assert.ok(redirects.length >= 5, `expected several redirects, found ${redirects.length}`);
});

test("every redirect that targets a tab or view names one that still exists", () => {
  const broken: string[] = [];
  for (const r of declaredRedirects()) {
    if (!r.param || !r.value) continue;
    const dest = DESTINATIONS[r.path];
    if (!dest) continue; // covered by the coverage test below
    if (dest.param !== r.param) {
      broken.push(`${r.target} uses ?${r.param}= but ${r.path} reads ?${dest.param}=`);
      continue;
    }
    const legal = dest.ids(read(dest.file));
    assert.ok(legal.length > 0, `no ids parsed out of ${dest.file}`);
    if (!legal.includes(r.value)) {
      broken.push(`${r.target} -> "${r.value}" is not one of [${legal.join(", ")}] in ${dest.file}`);
    }
  }
  assert.deepEqual(
    broken,
    [],
    `these redirects land on a default view instead of the one they name:\n${broken.join("\n")}`,
  );
});

test("every parameterized redirect target is covered by this test", () => {
  const uncovered = declaredRedirects()
    .filter((r) => r.param && !DESTINATIONS[r.path])
    .map((r) => r.target);
  assert.deepEqual(
    uncovered,
    [],
    `add these destinations to DESTINATIONS so their ids are validated:\n${uncovered.join("\n")}`,
  );
});
