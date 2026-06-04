# Index validation study

Generated 2026-06-04 by `npm run backtest:indices`.
Reproducible: the script reconstructs every number below from public data
using the exact shipped formulas in `server/indices.ts`.

## Question

The AI Demand and Grid Stress gauges are computed from constituent equity
moves. Do those market-based signals carry any information about physical
electricity output, or are they pure market sentiment?

## Method

- Reconstruct each gauge daily from adjusted closes, 2019-01 to 2026-06.
- Monthly signal = mean daily deviation from the gauge baseline
  (equivalently, mean weighted basket daily return x gain).
- Physical series: FRED `IPG2211A2N` (Industrial Production: Electric
  Power Generation, Transmission & Distribution; monthly, NSA). Growth is
  measured year over year to cancel seasonality.
- Pearson r at lead 0 (same month) and with the gauge leading physical
  growth by 1-3 months.
- Bar set by review: a basket only earns "index" framing if it beats its
  own best single constituent. Equity-basket proxies of physical
  quantities typically land near r 0.2-0.4.

## Findings

- **AI Demand: no physical signal demonstrated** (no lead reaches r 0.2 (best -0.01); fails the single-constituent bar (best constituent reaches 0.17)). Labeled a market sentiment gauge, not a physical measurement.
- **Grid Stress: no physical signal demonstrated** (no lead reaches r 0.2 (best 0.11); fails the single-constituent bar (best constituent reaches 0.24)). Labeled a market sentiment gauge, not a physical measurement.
- NPI: **SINGLE-STOCK DOMINATED: VST alone explains 91% of NPI's daily variance** (r 0.95). Not redundant with the NLR ETF (r 0.72), but the un-rebalanced price-relative construction has let the best performer swallow the basket: VST's effective weight is 43% today vs 20% stated. The index increasingly tracks one company, not a complex.

Sign instability across windows (see robustness tables) is consistent with
noise, not a weak-but-real signal.

## Results

### AI Demand vs physical electricity output growth

| Series | r (lead 0) | r (+1 mo) | r (+2 mo) | r (+3 mo) | n |
|---|---|---|---|---|---|
| **AI Demand (basket)** | **-0.21** | **-0.13** | **-0.01** | **-0.16** | 88 |
| NVDA alone | -0.20 | -0.20 | -0.03 | -0.19 | 88 |
| TSM alone | -0.07 | -0.02 | -0.04 | -0.10 | 88 |
| EQIX alone | -0.20 | -0.06 | -0.14 | -0.16 | 88 |
| MU alone | -0.16 | 0.01 | 0.17 | 0.02 | 88 |

Robustness, 2024+ only (the AI-buildout thesis window):

| Series | r (lead 0) | r (+1 mo) | r (+2 mo) | r (+3 mo) | n |
|---|---|---|---|---|---|
| AI Demand (basket) | -0.19 | -0.34 | -0.09 | 0.11 | 28 |

### Grid Stress vs physical electricity output growth

| Series | r (lead 0) | r (+1 mo) | r (+2 mo) | r (+3 mo) | n |
|---|---|---|---|---|---|
| **Grid Stress (basket)** | **-0.15** | **0.04** | **0.09** | **0.11** | 52 |
| VST alone | -0.16 | 0.21 | 0.12 | 0.24 | 88 |
| CEG alone | 0.02 | -0.02 | 0.10 | 0.12 | 52 |
| EQIX alone | -0.20 | -0.06 | -0.14 | -0.16 | 88 |

Robustness, 2024+ only:

| Series | r (lead 0) | r (+1 mo) | r (+2 mo) | r (+3 mo) | n |
|---|---|---|---|---|---|
| Grid Stress (basket) | -0.35 | -0.02 | -0.06 | 0.35 | 28 |

### NPI

NPI is a base-dated price-relative basket, not a daily momentum gauge, and
two of its legs (uranium spot, policy score; 20% of weight) have no public
daily history. It is reconstructed in `server/data/index-history.json`
with those legs held at par for transparency. No physical-correlation claim
is made for it; an equity index claiming to be an equity index does not
need one. The test it DOES need is redundancy.

### NPI redundancy check

Question: NLR (the VanEck Uranium+Nuclear ETF) is already 20% of NPI. Does
the custom basket add anything beyond what that off-the-shelf ETF already
shows? Tested on the NPI equity legs (80% of weight; uranium and policy at
par), raw closes vs Jan-1-2024 bases, daily returns since 2024.

| Benchmark | daily-return r vs NPI legs | R² | n |
|---|---|---|---|
| NLR alone | 0.72 | 0.52 | 606 |
| CEG alone | 0.88 | 0.78 | 606 |
| VST alone | 0.95 | 0.91 | 606 |
| CCJ alone | 0.61 | 0.37 | 606 |

**SINGLE-STOCK DOMINATED: VST alone explains 91% of NPI's daily variance** (r 0.95). Not redundant with the NLR ETF (r 0.72), but the un-rebalanced price-relative construction has let the best performer swallow the basket: VST's effective weight is 43% today vs 20% stated. The index increasingly tracks one company, not a complex.

Stated vs effective weights (2026-06-03; uranium and policy held at par):

| Constituent | Stated | Effective today |
|---|---|---|
| CEG | 25% | 18% |
| VST | 20% | 43% |
| CCJ | 15% | 15% |
| NLR | 20% | 16% |
| Uranium spot | 10% | 4% |
| Policy score | 10% | 4% |

The basket is never rebalanced, so winners compound their own influence.
That is a legitimate index design (the S&P does it too), but it must be
disclosed: today's NPI is mostly a merchant-power position, and "Nuclear"
in the name overstates how nuclear-pure the exposure still is.

Level tracking, both rebased to 100 on Jan 1, 2024: NPI equity legs at
**248.6** vs NLR alone at **193.9**
(2026-06-03). Mean absolute gap 60.5 points,
max 118.8. A persistent level gap with high daily
correlation means the baskets ride the same daily news but compound
differently; the merchant-power weighting (CEG+VST = 45%) is the driver.

### Intra-product overlap: NPI vs Grid Stress

CEG and VST are 45% of NPI and 75% of the Grid Stress basket. Daily
correlation between NPI equity-leg returns and the Grid Stress signal:
**r 0.96** (n=606). Above ~0.8 the dashboard would be
showing one signal twice under two names; the number here quantifies how
much of "Grid Stress" is already inside NPI.

## Limitations

- ~88 monthly observations; r values of this size carry wide
  confidence intervals. This study can rule labels in or out; it cannot
  fine-tune weights.
- FRED IPG2211A2N measures total utility output, not datacenter load
  specifically. No public monthly datacenter-load series exists.
- Daily returns use adjusted closes; production uses live intraday change.
  Over monthly averages the difference is noise.

## Reading the numbers

The labels shipped in the UI follow these results: if a gauge does not
clear the single-constituent bar with a stable sign across leads, it is
labeled a market-sentiment gauge, not a physical measurement. See the
methodology section of the README for the formulas.
