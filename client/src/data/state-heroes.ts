/**
 * One image per published state page, keyed by the page's slug. Every frame is
 * a generated illustration, so the alt text says so and no caption names a
 * place. Sources and encoding: scripts/encode-media-stills.sh.
 */
export interface StateHero {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export const STATE_HEROES: Record<string, StateHero> = {
  maryland: {
    src: "/media/state/md-3-ac0af29c.webp",
    width: 1920,
    height: 815,
    alt: "Illustration: transmission towers on piles in still water.",
  },
  virginia: {
    src: "/media/state/va-2-c34faa21.webp",
    width: 1920,
    height: 815,
    alt: "Illustration: a transmission line crossing low hills toward long, low buildings at night.",
  },
  texas: {
    src: "/media/state/tx-1-ac1949bb.webp",
    width: 1920,
    height: 815,
    alt: "Illustration: two lines of transmission towers running to a flat horizon, with stacks and wind turbines small in the distance.",
  },
};
