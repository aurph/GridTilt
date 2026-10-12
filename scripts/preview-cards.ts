// Renders every social and share card to PNG so they can be eyeballed before
// they go out on X. Nothing here posts anything.
//
// Run:  npx tsx scripts/preview-cards.ts [outDir]
// Default outDir: .card-preview/ (gitignored)

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { ogCardForTemplate, pageOgCard, type CardParams } from "../server/routes.js";
import { renderOgPng, type OgCard } from "../server/og-card.js";

const OUT = process.argv[2] ?? ".card-preview";

// The weekday rotation, the share variants, the on-demand templates, then
// a few page previews. A null card means the template names nothing.
const CARDS: Array<{ file: string; card: () => Promise<OgCard | null> | OgCard }> = [
  ...["buildout", "gpu_rental", "cluster_spotlight", "grid_backlog", "documented_change"].map((t) => ({
    file: `rotation-${t}`,
    card: () => ogCardForTemplate(t),
  })),
  ...(["MD", "VA", "TX", "KY", "AK"] as const).map((state) => ({
    file: `share-state-${state}`,
    card: () => ogCardForTemplate("state_fact", { state } satisfies CardParams),
  })),
  { file: "share-project-stargate-abilene", card: () => ogCardForTemplate("project_status", { id: "stargate-abilene" }) },
  { file: "share-correction-nerc", card: () => ogCardForTemplate("correction", { id: "2026-09-29-nerc-reserve-margins" }) },
  { file: "share-correction-abilene", card: () => ogCardForTemplate("correction", { id: "2026-09-28-stargate-abilene-rated-power" }) },
  { file: "ondemand-top_movers", card: () => ogCardForTemplate("top_movers") },
  { file: "ondemand-catalyst_preview", card: () => ogCardForTemplate("catalyst_preview") },
  { file: "page-home", card: () => pageOgCard("home") },
  { file: "page-stack", card: () => pageOgCard("stack") },
  { file: "page-compute-frontier-abilene", card: () => pageOgCard("compute-frontier", undefined, "Stargate Abilene (OpenAI/Oracle)") },
  { file: "page-queue", card: () => pageOgCard("queue") },
  { file: "page-ticker-NVDA", card: () => pageOgCard("stack", "NVDA") },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  let failures = 0;

  for (const c of CARDS) {
    try {
      const card = await c.card();
      if (!card) {
        failures++;
        console.error(`${c.file.padEnd(34)} NO CARD (template names nothing)`);
        continue;
      }
      const png = await renderOgPng(card);
      writeFileSync(join(OUT, `${c.file}.png`), png);

      // A dataset card without an as-of is a bug; a page card without one
      // prints "AS OF —" on purpose. A card without a source is always a bug.
      const warn: string[] = [];
      if (!card.asOf) warn.push("no as-of");
      if (!card.source) warn.push("NO SOURCE");
      console.log(
        `${c.file.padEnd(34)} ${String(png.length).padStart(7)} B  visual=${card.visual.kind.padEnd(8)}` +
          ` asOf=${card.asOf ?? "—"}${warn.length ? "  <-- " + warn.join(", ") : ""}`,
      );
    } catch (err: any) {
      failures++;
      console.error(`${c.file.padEnd(34)} FAILED: ${err?.message}`);
    }
  }

  console.log(`\nwrote ${CARDS.length - failures}/${CARDS.length} cards to ${OUT}/`);
  if (failures) process.exitCode = 1;
}

main();
