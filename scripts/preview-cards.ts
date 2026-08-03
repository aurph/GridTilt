// Renders every social card template to PNG so they can be eyeballed before
// they go out on X. Nothing here posts anything.
//
// Run:  npx tsx scripts/preview-cards.ts [outDir]
// Default outDir: .card-preview/ (gitignored)

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { ogCardForTemplate } from "../server/routes.js";
import { renderOgPng } from "../server/og-card.js";

const OUT = process.argv[2] ?? ".card-preview";

// The weekday rotation first, then the page/off-rotation templates.
const TEMPLATES = [
  "buildout",
  "gpu_rental",
  "cluster_spotlight",
  "grid_backlog",
  "power_mix",
  "tilt_status",
  "top_movers",
  "npi_update",
  "queue_update",
  "catalyst_preview",
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  let failures = 0;

  for (const t of TEMPLATES) {
    try {
      const card = await ogCardForTemplate(t);
      const png = await renderOgPng(card);
      writeFileSync(join(OUT, `${t}.png`), png);

      // A card with no as-of or no source is a bug, not a style choice.
      const warn: string[] = [];
      if (!card.asOf) warn.push("NO as-of");
      if (!card.source) warn.push("NO source");
      console.log(
        `${t.padEnd(20)} ${String(png.length).padStart(7)} B  visual=${card.visual.kind.padEnd(8)}` +
          `${warn.length ? "  <-- " + warn.join(", ") : ""}`,
      );
    } catch (err: any) {
      failures++;
      console.error(`${t.padEnd(20)} FAILED: ${err?.message}`);
    }
  }

  console.log(`\nwrote ${TEMPLATES.length - failures}/${TEMPLATES.length} cards to ${OUT}/`);
  if (failures) process.exitCode = 1;
}

main();
