# GridTilt — Security

This file documents what's in place to protect gridtilt.com and its
subscribers. If you find a vulnerability, see "Reporting" at the bottom.

Last updated: 2026-05-23

---

## Threat model

GridTilt is a public research dashboard with:
- A small public API surface for live market and infrastructure data.
- An email subscriber list (single source of truth: `server/data/subscribers.json`).
- An admin surface for content management, newsletter sending, and social
  posting, gated by a shared-secret API key.
- A live Replit deployment behind Replit's reverse proxy.

The realistic threats are: spam signups, abuse of compute via API hammering
that exhausts the Yahoo Finance quota, brute-force attempts against the
admin API key, scraping, and clickjacking embeds. Nothing here defends
against a determined nation-state actor with stolen infrastructure access.

---

## What's enforced in production

### Security headers (via helmet)

Configured in `server/index.ts`:

- **Content-Security-Policy**
  - `default-src 'self'`
  - `script-src 'self' https://platform.twitter.com`
    (production; development adds `'unsafe-eval' 'unsafe-inline'` for Vite HMR)
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
    (React inline-style props render as `style="..."` attributes; without
    `'unsafe-inline'` for styles the entire component tree breaks)
  - `font-src 'self' https://fonts.gstatic.com data:`
  - `img-src 'self' data: https:`
  - `connect-src 'self'` (production; development adds `ws: wss:`)
  - `frame-src 'self' https://platform.twitter.com`
  - `frame-ancestors 'none'` (no embedding of GridTilt anywhere)
  - `object-src 'none'`
  - `base-uri 'self'`
- **Strict-Transport-Security** (production only): `max-age=31536000;
  includeSubDomains; preload`
- **X-Frame-Options**: `SAMEORIGIN`
- **X-Content-Type-Options**: `nosniff`
- **Referrer-Policy**: `strict-origin-when-cross-origin`
- **Permissions-Policy**: `camera=() microphone=() geolocation=()`
- **X-XSS-Protection**: `0` (explicit disable; modern browsers' built-in
  XSS auditor is deprecated and can be tricked into worsening security)
- `X-Powered-By` header is **disabled** so the stack isn't advertised.

### Body size limits

- JSON bodies: 100 kB
- URL-encoded bodies: 100 kB

### Rate limits

| Surface | Window | Max | Notes |
|---|---|---|---|
| Global `/api/*` | 1 min | 120 / IP | Baseline cap. Dashboard polling well under this. |
| `POST /api/subscribe` | 1 hour | 5 / IP | Tighten for spam control. |
| `GET /api/unsubscribe` | 1 min | 10 / IP | Token is HMAC-SHA256 so brute force is infeasible; this is defense in depth. |
| `/api/admin/*`, `/api/newsletter/*` | 1 min | 5 **failed** / IP | `skipSuccessfulRequests: true` — only counts 401s, so legit admin sessions are unaffected. |

All limiters use the `draft-7` `RateLimit-*` standard headers; no legacy
`X-RateLimit-*` headers. Storage is in-memory (`express-rate-limit` default)
which resets on Replit redeploy — acceptable for a single-instance
deployment; revisit if you scale horizontally.

### Admin authentication

- Single shared-secret API key in `ADMIN_API_KEY` env var.
- Compared via `crypto.timingSafeEqual` to prevent timing-side-channel
  inference of the key.
- Returns 503 (not 401) if the env var is missing entirely, so a
  misconfiguration can't accidentally allow unauthenticated admin access.
- Failed attempts also flow through the admin auth-failure rate limiter
  above, so brute-force attempts are throttled to 5 failures / IP / min.

### Unsubscribe tokens

- HMAC-SHA256 of the subscriber email, signed with `UNSUB_TOKEN_SECRET`.
- Separate secret from `ADMIN_API_KEY` so leaking one does not compromise
  the other.
- Server refuses to start if `UNSUB_TOKEN_SECRET` is unset — won't
  silently issue or accept invalid tokens.
- Comparison via `crypto.timingSafeEqual`.

### Logging discipline

- API requests are logged with method, path, status, duration.
- Sensitive routes (`/api/admin/subscribers`, `/api/subscribe`,
  `/api/unsubscribe`) have their response bodies redacted from logs.
- Errors print to `console.error` (Replit log stream) but never leak
  stack traces in HTTP responses (the global error handler returns
  `{ message }` only, no stack).

---

## Secrets

| Env var | Required? | Purpose | Source of truth |
|---|---|---|---|
| `UNSUB_TOKEN_SECRET` | Yes (boot fails) | HMAC key for unsubscribe tokens | Replit Secrets |
| `ADMIN_API_KEY` | Yes (admin endpoints return 503 without it) | `x-admin-key` header for admin routes | Replit Secrets |
| `RESEND_API_KEY` | Optional | Resend.com audience sync + newsletter send | Replit Secrets |
| `NEWSDATA_API_KEY` | Optional | Supplemental news feed | Replit Secrets |
| `X_API_KEY` + `X_API_SECRET` + `X_ACCESS_TOKEN` + `X_ACCESS_TOKEN_SECRET` | Optional | Daily auto-tweet | Replit Secrets |

**Never** commit any of these to the repo. `.env.example` documents the
shape only — actual values live in Replit's Secrets panel.

### Rotation procedure

Run these whenever a secret is suspected to have leaked or every 6-12
months as routine hygiene.

1. Generate a new value: `openssl rand -hex 32`.
2. Add the new value as a new env var in Replit Secrets (e.g.
   `ADMIN_API_KEY_NEW`).
3. Briefly update code to accept either old or new value.
4. Replace the old env var with the new value.
5. Remove the dual-accept code path.
6. Redeploy.

For `UNSUB_TOKEN_SECRET`, rotation invalidates every existing
unsubscribe link in mail clients. The dual-accept approach above is the
right pattern — accept old + new HMACs during transition, then drop the
old after ~30 days.

---

## What's intentionally NOT in place

These are decisions, not omissions:

- **No CSRF tokens.** No cookie-based authentication is used; admin auth
  is via header, public endpoints are unauthenticated. CSRF is moot.
- **No CORS allowlist.** GridTilt is currently same-origin only. If
  embedding or splitting the frontend ever happens, this becomes a
  required addition.
- **No 2FA on admin.** Single shared secret is the threat model. Rotation
  is the mitigation. 2FA would require either an external auth provider
  or a TOTP implementation; not worth the complexity at this scale.
- **In-memory rate limit store, not Redis.** Single-instance deployment;
  per-IP limits resetting on redeploy is acceptable. Revisit at horizontal
  scale or if abuse patterns emerge.
- **No SAST / SCA in CI.** Manual `npm audit` and dependabot would help
  but require GitHub Actions setup that doesn't exist yet.

---

## Reporting

Found a vulnerability? Email **gridtilt1@gmail.com** with details.
Coordinated disclosure preferred — give us 14 days to patch before
publishing. Cash bounty not offered; credit in this file is.
