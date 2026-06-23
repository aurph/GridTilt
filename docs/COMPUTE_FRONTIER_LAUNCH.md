# Compute Frontier launch assets

Copy for announcing the Compute Frontier module. GridTilt voice: plain, factual,
lead with real numbers, no hype, no em dashes. Figures as of 2026-06-23 (49
clusters, 19 operators, ~47 GW planned, ~3.9 GW operational, ~1.52M disclosed
accelerators across 7 clusters, Meta leads planned at 22%). The live figures
update from the data, so re-check before posting if it has been a while.

Nothing here posts automatically. The in-product `compute_frontier` tweet
template is dry-run only (generate it with `POST /api/social/generate` body
`{"template":"compute_frontier"}`). Post manually or wire it into the rotation
when you decide.

---

## 1. Primary X post (the rotating template, current data)

```
gridtilt · compute frontier

49 AI superclusters tracked · 3.9 GW operational · 47.0 GW planned

Meta leads at 22% of planned MW. 1.52M accelerators disclosed across 7 clusters. 3.6 GW tied to tracked nuclear deals.

https://gridtilt.com/compute-frontier
```

## 2. Launch thread (the push)

**1/**
```
new on gridtilt: compute frontier.

the named AI superclusters the buildout actually runs on, tracked by GPUs, chips, and power, and tied to the nuclear deals that feed them.

49 clusters, 19 operators, 47 GW planned.

https://gridtilt.com/compute-frontier
```

**2/**
```
most lists stop at the big hyperscalers. the buildout is wider than that.

alongside OpenAI/Oracle, Meta, Microsoft, AWS, Google, and xAI: neoclouds and miners-turned-AI doing real gigawatts. Nscale, CoreWeave, Crusoe, IREN, Galaxy Digital, TeraWulf, Cipher, Applied Digital, Stack.
```

**3/**
```
every number is sourced or labeled an estimate. GPU counts show only where an operator actually disclosed one (7 clusters, ~1.5M accelerators). no fabricated precision.

and we show power needed vs power secured: which clusters have a nuclear deal behind them, and which run on grid or gas.
```

**4/**
```
how concentrated is the frontier? Meta leads the planned buildout at 22%, but no single operator owns it.

free, no login. methodology and per-cluster sources are public.

https://gridtilt.com/compute-frontier
```

## 3. Cross-channel blurb (newsletter, LinkedIn, general)

```
GridTilt now tracks the Compute Frontier: 49 named AI superclusters across 19
operators, by GPUs, chips, and power. It is the compute layer that sits next to
the data center map, the grid interconnection queue, and the equities.

About 47 GW planned and 3.9 GW operational today, with roughly 1.5 million
accelerators disclosed across the seven clusters that publish counts. Every
figure is either sourced or marked an estimate, and each cluster links to the
nuclear-for-AI deal that feeds it where one applies. We also separate power
needed from power secured, so you can see which clusters actually have firm
power behind them.

Built for people tracking the buildout without a Bloomberg terminal. Free, no
login, sources on every entry. See it at gridtilt.com/compute-frontier.
```

## 4. One-liner (bio, link preview, short posts)

```
Compute Frontier: 49 named AI superclusters by GPUs, chips, and power, tied to the nuclear deals that feed them. Sourced, free, no login. gridtilt.com/compute-frontier
```

## 5. Optional next step (not done yet)

- A short "new" marker on the Compute Frontier sidebar item for a few weeks
  would be an in-product push. Small code change; say the word.
- Adding `compute_frontier` to the Mon-Fri auto-poster rotation would make it
  ship on a cadence. It is intentionally dry-run only right now.
