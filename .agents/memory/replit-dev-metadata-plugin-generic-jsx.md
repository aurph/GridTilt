---
name: Replit dev metadata plugin vs generic JSX
description: Any generic JSX type argument (LinePath<T>, Area<T>, etc.) breaks the Replit babel metadata plugin in dev
---
The Replit dev-mode babel metadata plugin injects attributes into JSX opening tags and cannot parse generic type arguments on ANY component, not just LinePath. Symptom: vite:react-babel "Unexpected token" pointing at `data-component-name="X"<Type>`.

**Why:** the plugin rewrites the tag before parsing, so `<Area<ChartPoint>` becomes invalid syntax. tsc still passes; only the dev server breaks.

**How to apply:** after every pull of visx chart files, run:
`sed -i 's/<\([A-Z][A-Za-z]*\)<[A-Za-z]*>/<\1/g' client/src/components/neocloud/PriceHistoryChart.tsx`
(and grep the rest of the repo for `<[A-Z][A-Za-z]*<` if new chart files arrive). Type inference works fine without the explicit generics.
