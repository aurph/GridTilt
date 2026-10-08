// CI's dependency gate: `npm audit` at high, minus the advisories recorded in
// audit-exceptions.json. An unrecorded high or critical advisory fails, and so
// does an exception past its reviewBy date, so an acceptance cannot go stale
// silently. Run: node scripts/audit-gate.mjs
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const FAILING = new Set(["high", "critical"]);

/** Advisory ids (GHSA) behind each vulnerable package, from `npm audit --json`. */
export function advisoriesOf(report) {
  const found = [];
  for (const [name, v] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of v.via ?? []) {
      if (typeof via !== "object" || !via.url) continue;
      const id = via.url.split("/").pop();
      found.push({ package: name, id, severity: via.severity, title: via.title });
    }
  }
  return found;
}

/** The problems that fail the gate; empty means pass. */
export function gate(report, exceptions, today) {
  const accepted = new Map(exceptions.map((e) => [e.advisory, e]));
  const problems = [];
  for (const a of advisoriesOf(report)) {
    if (!FAILING.has(a.severity)) continue;
    if (!accepted.has(a.id)) problems.push(`${a.severity}: ${a.package} ${a.id} (${a.title})`);
  }
  for (const e of exceptions) {
    if (e.reviewBy < today) problems.push(`exception ${e.advisory} (${e.package}) passed its reviewBy date ${e.reviewBy}`);
  }
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let raw;
  try {
    raw = execFileSync("npm", ["audit", "--json"], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    // npm audit exits non-zero whenever it finds anything; the JSON is still on stdout.
    raw = err.stdout;
  }
  const report = JSON.parse(raw);
  const { exceptions } = JSON.parse(readFileSync(new URL("../audit-exceptions.json", import.meta.url), "utf-8"));
  const problems = gate(report, exceptions, new Date().toISOString().slice(0, 10));
  if (problems.length) {
    console.error("npm audit gate failed:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  console.log(`npm audit gate passed (${exceptions.length} recorded exception(s), see audit-exceptions.json)`);
}
