// The frontier types are declared twice, once in server/frontier-models.ts and
// once in client/src/lib/frontier-series.ts. That is the house convention: types
// are not shared across the client/server boundary, each side declares what it
// consumes.
//
// The cost of that convention is silent drift, and it had already happened. The
// client's FrontierRegistry carried a `summary` field the server's did not,
// because the route adds it at request time and nothing named that shape. The
// two were describing different things under one name.
//
// This compares the declarations as source text, since importing client code
// into a server test would defeat the separation the convention exists for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SERVER = join(process.cwd(), "server", "frontier-models.ts");
const CLIENT = join(process.cwd(), "client", "src", "lib", "frontier-series.ts");

/** Names declared on both sides that must stay identical. */
const SHARED = [
  "BenchmarkFamily",
  "BenchmarkUnit",
  "ReleaseStatus",
  "InclusionReason",
  "Provenance",
  "LabGlyph",
  "FrontierLab",
  "FrontierSource",
  "BenchmarkDefinition",
  "FrontierBenchmarkResult",
  "FrontierModel",
  "FrontierSummary",
] as const;

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
}

/** A union's members, order-independent. */
function unionMembers(src: string, name: string): string[] | null {
  const m = new RegExp(`export type ${name}\\s*=\\s*([^;]+);`).exec(stripComments(src));
  if (!m) return null;
  return m[1]
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean)
    .sort();
}

/** An interface's fields as `name: type`, order-independent. */
function interfaceFields(src: string, name: string): string[] | null {
  const clean = stripComments(src);
  const start = new RegExp(`export interface ${name}\\s*\\{`).exec(clean);
  if (!start) return null;
  let i = clean.indexOf("{", start.index);
  let depth = 0;
  let j = i;
  for (; j < clean.length; j += 1) {
    if (clean[j] === "{") depth += 1;
    else if (clean[j] === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return clean
    .slice(i + 1, j)
    .split(/[;\n]/)
    .map((f) => f.trim().replace(/,$/, "").replace(/\s+/g, " "))
    .filter(Boolean)
    .sort();
}

const serverSrc = readFileSync(SERVER, "utf-8");
const clientSrc = readFileSync(CLIENT, "utf-8");

for (const name of SHARED) {
  test(`${name} is declared the same on both sides`, () => {
    const s = unionMembers(serverSrc, name) ?? interfaceFields(serverSrc, name);
    const c = unionMembers(clientSrc, name) ?? interfaceFields(clientSrc, name);
    assert.notEqual(s, null, `${name} is missing from server/frontier-models.ts`);
    assert.notEqual(c, null, `${name} is missing from client/src/lib/frontier-series.ts`);
    assert.deepEqual(
      s,
      c,
      `${name} has drifted between the server and the client declaration`,
    );
  });
}

test("the response shape is named, not just spread at the route", () => {
  // The drift this file exists for: the route returns the registry plus a
  // summary, and for a while only the client had a type saying so.
  assert.ok(
    /export type FrontierRegistryResponse/.test(serverSrc),
    "server must name what /api/frontier-models returns",
  );
  assert.ok(
    /summary: FrontierSummary/.test(serverSrc),
    "the response type must carry the summary the route attaches",
  );
});

test("the server registry models the file, which has no summary", () => {
  // frontier-models.json holds records only. If a summary is ever added to the
  // file, FrontierRegistry gains it and this expectation should change with it.
  const fields = interfaceFields(serverSrc, "FrontierRegistry") ?? [];
  assert.ok(
    !fields.some((f) => f.startsWith("summary")),
    "FrontierRegistry describes the file; the summary belongs to the response",
  );
});

test("the shared list covers every type declared on both sides", () => {
  // Guards against a new shared type being added to both files and quietly
  // escaping this check.
  const declared = (src: string) =>
    new Set(
      [...src.matchAll(/export (?:type|interface) (\w+)/g)].map((m) => m[1]),
    );
  const onBoth = [...declared(serverSrc)].filter((n) => declared(clientSrc).has(n));
  const unchecked = onBoth.filter(
    (n) => !(SHARED as readonly string[]).includes(n) && n !== "FrontierRegistry",
  );
  assert.deepEqual(
    unchecked,
    [],
    `these are declared on both sides but not compared: ${unchecked.join(", ")}`,
  );
});
