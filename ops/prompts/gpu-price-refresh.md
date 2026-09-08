# Weekly GPU rental price refresh

You are refreshing GridTilt's GPU rental price index. Truthfulness is the
product: every number must trace to a source you actually opened this
session. You edit exactly ONE file: `server/data/gpu-rental-prices.json`.
Do not touch any other file. Do not add or remove models.

## Pass 1 — research

For each of the models in the file (do not change the set), establish the
current blended on-demand $/GPU/hour:

- Check the provider price lists already cited in each model's `sources`
  (CoreWeave, Lambda, Nebius, Vultr, Vast.ai, RunPod, TensorWave, ...) and
  the comparison trackers (getdeploying.com, computeprices.com). Prefer
  provider pages over trackers when they disagree.
- On-demand only. Never a reserved, spot, or contract rate.
- Record the observed low and high across providers, and set
  `currentUsdPerHr` to an honest blended figure inside that band.
- Keep every price's basis per-GPU-hour (divide 8-GPU node prices by 8 only
  when the listing is explicitly a uniform node).

## Pass 2 — adversarial check

Re-examine every model whose price you changed, hunting for your own
mistakes: a node price not divided per GPU, a spot price mistaken for
on-demand, a stale cached page, a tracker echoing an outdated figure. For
anything you cannot re-confirm from a second independent source, revert to
the previous value rather than guess.

## Hard rules (the CI gate enforces these; violating any fails the run)

- Model set unchanged; unit unchanged.
- `low <= currentUsdPerHr <= high`, all positive.
- Every model keeps >= 2 https sources; update `sources` to what you
  actually used this session.
- `estimated` flags never shrink. Blended figures stay flagged.
- `historyAnchors` are append-only. Never edit or remove an existing
  anchor. Append one new anchor `{date: "YYYY-MM", price}` per model whose
  price changed (current month).
- A move above 60% from the previous value is blocked by the gate. If you
  believe such a move is real, leave the old value in place and describe
  the evidence in your final summary instead - a human takes it from there.
- Update each touched model's `asOf` (YYYY-MM) and the envelope
  `lastRefreshed` (YYYY-MM-DD, today). Refresh `oneYearTrend` prose only
  where the story actually changed.

## Finish

Run the gate yourself and fix anything it reports before finishing:

    npx tsx scripts/validate-gpu-prices.ts

End with a short summary: which models moved, by how much, and the single
most load-bearing source per changed model.
