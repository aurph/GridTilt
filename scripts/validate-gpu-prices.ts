// CLI wrapper for the agentic-refresh gate: compares the working-tree
// gpu-rental-prices.json (the refresh's output) against the version at git
// HEAD (the last human-approved state). Exit 1 on any violation.
//
//   npx tsx scripts/validate-gpu-prices.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateGpuPrices, type GpuPriceFile } from "../server/gpu-price-validation";

const REL = "server/data/gpu-rental-prices.json";

const next = JSON.parse(readFileSync(join(process.cwd(), REL), "utf-8")) as GpuPriceFile;
const prev = JSON.parse(
  execFileSync("git", ["show", `HEAD:${REL}`], { encoding: "utf-8" }),
) as GpuPriceFile;

const r = validateGpuPrices(next, prev);
if (r.ok) {
  console.log(`gpu-price gate: OK (${next.models.length} models, lastRefreshed ${next.lastRefreshed})`);
  process.exit(0);
}
console.error(`gpu-price gate: ${r.errors.length} violation(s):`);
for (const e of r.errors) console.error(`  - ${e}`);
process.exit(1);
