// Post-deploy smoke check. Read-only: every request is a GET.
//
//   npm run smoke -- https://gridtilt.com
//   SMOKE_ADMIN_KEY=... npm run smoke -- https://gridtilt.com   (adds the admin freshness report)
//
// Exits 1 when any check fails. See server/smoke.ts for what each check means.

import { formatResults, runSmoke } from "../server/smoke";

const base = (process.argv[2] ?? "https://gridtilt.com").replace(/\/+$/, "");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

const results = await runSmoke({
  base,
  today,
  gpuDataPermitted: process.env.SMOKE_GPU_PERMITTED === "true",
  adminKey: process.env.SMOKE_ADMIN_KEY || undefined,
});
console.log(`GridTilt smoke check: ${base} (${today})`);
console.log(formatResults(results));
process.exit(results.some((r) => r.level === "fail") ? 1 : 0);
