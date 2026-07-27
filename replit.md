# GridTilt

Research dashboard for the AI power economy: equities, infrastructure, and power data. Live at gridtilt.com.

**See CLAUDE.md for working conventions, module map, data custody, and do-not-touch zones. When this file and CLAUDE.md disagree, CLAUDE.md wins; when CLAUDE.md and the code disagree, the code wins.**

## Stack

- Client: React 18 + TypeScript + Vite, wouter routing, TanStack Query v5, Tailwind + house-modified shadcn/ui, Recharts / visx / d3 / react-leaflet. Dark mode only.
- Server: Express 5, one process (Vite middleware in dev, static from `dist/public` in prod), port 5000.
- Persistence: JSON files in `server/data/` and `content/blog/`. No database, no ORM, no `shared/` directory.
- Not Next.js. No redux or app-level context.

## Commands

```bash
npm run dev      # tsx server with Vite middleware, port 5000
npm run check    # tsc typecheck
npm test         # node:test suites (server + client lib)
npm run build    # vite client + esbuild server -> dist/
npm start        # serve the built bundle
```

Required env: `UNSUB_TOKEN_SECRET`, `ADMIN_API_KEY` (see `.env.example`).

## Deploy gotcha

Replit autoscale. A push to GitHub does NOT deploy, and autoscale does not auto-pull. Merge, then Deployments -> Redeploy, manually. After redeploy, sanity-check `/api/stack`, `/api/kpis`, `/api/clusters/metrics`. Machine-written JSON in `server/data/` sits on ephemeral disk; a redeploy can lose it.

## Style

Plain, direct copy. No em dashes. Data honesty: serve real observations, flag estimates, degrade with explicit errors, never fabricate numbers.

## User preferences

- No new API keys or tokens. Do not ask to mint or configure additional keys (GitHub PATs, EIA, anything). GitHub sync runs on the Replit GitHub connection; My Grid rates stay in their honest unconfigured state unless a key is volunteered.
