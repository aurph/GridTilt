// ─── Subscriber routes (T17) ────────────────────────────────────────────────
//
// Signup, unsubscribe and the two admin list routes, over SubscriberStore.
// A success means the write reached durable storage. A missing or failing
// store answers 503 with a retry hint: no success toast, no "unsubscribed"
// page, and no local-file fallback.

import type { Express, Request, RequestHandler, Response } from "express";
import type { SubscriberStore } from "./subscriber-store";

export const SIGNUPS_UNAVAILABLE = "Signups are unavailable right now. Please try again later.";
export const SUPPRESSED_MESSAGE =
  "This address was taken off the list earlier, so the form will not add it back. To rejoin, email gridtilt1@gmail.com.";
const RETRY_AFTER_SECONDS = "300";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SubscriberRouteDeps {
  store: SubscriberStore | null;
  /** True when the unsubscribe token was issued for this address. The HMAC itself stays in routes.ts. */
  tokenMatches: (email: string, token: string) => boolean;
  requireAdmin: (req: Request, res: Response) => boolean;
  subscribeLimiter?: RequestHandler;
  unsubscribeLimiter?: RequestHandler;
  /** Runs after a new signup is stored (the email provider's audience). Failures are logged only. */
  afterSubscribe?: (email: string) => Promise<void>;
  logError?: (message: string, detail: string) => void;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function unsubscribePage(title: string, message: string, done = false): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>body{background:#0d0d14;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
.card{text-align:center;padding:2rem;max-width:32rem;}.check{color:#22c55e;font-size:3rem;}</style></head>
<body><div class="card">${done ? '<div class="check">&#10003;</div>' : ""}<h2>${escapeHtml(title)}</h2><p style="color:#888;">${escapeHtml(message)}</p></div></body></html>`;
}

const UNSUB_RETRY = unsubscribePage(
  "Not recorded yet",
  "The unsubscribe could not be saved right now, so nothing has changed. Please open the link again in a few minutes.",
);

export function registerSubscriberRoutes(app: Express, deps: SubscriberRouteDeps): void {
  const pass: RequestHandler = (_req, _res, next) => next();
  const logError = deps.logError ?? ((message: string, detail: string) => console.error(message, detail));
  const unavailable = (res: Response) =>
    res.status(503).set("Retry-After", RETRY_AFTER_SECONDS).json({ error: SIGNUPS_UNAVAILABLE, status: "unavailable" });

  app.post("/api/subscribe", deps.subscribeLimiter ?? pass, async (req: Request, res: Response) => {
    const { email, intent, context } = req.body ?? {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }
    // Trimmed before the check: a pasted trailing space is not a bad address.
    const normalized = email.toLowerCase().trim();
    if (!EMAIL_RE.test(normalized)) {
      return res.status(400).json({ error: "That doesn't look like an email" });
    }
    if (!deps.store) return unavailable(res);

    const fields = {
      intent: typeof intent === "string" && intent.trim() ? intent.trim().slice(0, 500) : null,
      context: typeof context === "string" && context.trim() ? context.trim().slice(0, 64) : null,
    };

    let result;
    try {
      result = await deps.store.subscribe(normalized, fields);
    } catch (e) {
      logError("Subscriber store write failed:", errorText(e));
      return unavailable(res);
    }

    if (result.status === "exists") {
      return res.json({ message: "You're already on the list", status: "exists" });
    }
    if (result.status === "suppressed") {
      return res.json({ message: SUPPRESSED_MESSAGE, status: "suppressed" });
    }
    if (deps.afterSubscribe) {
      try {
        await deps.afterSubscribe(normalized);
      } catch (e) {
        logError("Audience sync failed:", errorText(e));
      }
    }
    res.json({ message: "You're on the list", status: "subscribed" });
  });

  app.get("/api/unsubscribe", deps.unsubscribeLimiter ?? pass, async (req: Request, res: Response) => {
    const { token } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).send(unsubscribePage("Invalid link", "This unsubscribe link is incomplete."));
    }
    if (!deps.store) return res.status(503).set("Retry-After", RETRY_AFTER_SECONDS).send(UNSUB_RETRY);
    try {
      // The token is matched against each stored address with the unchanged
      // HMAC, so links in emails already sent keep working.
      const result = await deps.store.unsubscribe((address) => deps.tokenMatches(address, token));
      if (result.status === "not_found") {
        return res.status(404).send(unsubscribePage("Not on the list", "No address on the GridTilt list matches this link."));
      }
      res.send(unsubscribePage("Unsubscribed", "This address will not receive GridTilt emails.", true));
    } catch (e) {
      logError("Unsubscribe write failed:", errorText(e));
      res.status(503).set("Retry-After", RETRY_AFTER_SECONDS).send(UNSUB_RETRY);
    }
  });

  // RFC 8058 one-click: mail clients POST "List-Unsubscribe=One-Click" to the
  // List-Unsubscribe URL. The answer is an empty 200 (a token that matches no
  // one has nothing to stop); a failed write is a 503 so the client can retry.
  app.post("/api/unsubscribe", deps.unsubscribeLimiter ?? pass, async (req: Request, res: Response) => {
    const { token } = req.query;
    if (!token || typeof token !== "string") return res.status(400).end();
    if (!deps.store) return res.status(503).set("Retry-After", RETRY_AFTER_SECONDS).end();
    try {
      await deps.store.unsubscribe((address) => deps.tokenMatches(address, token));
      res.status(200).end();
    } catch (e) {
      logError("One-click unsubscribe write failed:", errorText(e));
      res.status(503).set("Retry-After", RETRY_AFTER_SECONDS).end();
    }
  });

  app.get("/api/admin/subscribers", async (req: Request, res: Response) => {
    if (!deps.requireAdmin(req, res)) return;
    if (!deps.store) return res.status(503).json({ error: "Subscriber storage is not configured" });
    try {
      const subscribers = await deps.store.listAll();
      const byState: Record<string, number> = {};
      for (const s of subscribers) byState[s.state] = (byState[s.state] ?? 0) + 1;
      res.json({ count: subscribers.length, byState, subscribers });
    } catch (e) {
      logError("Subscriber list failed:", errorText(e));
      res.status(503).json({ error: "Subscriber storage is unavailable" });
    }
  });

  // Retention deletion: the record goes, a hashed marker stays so no import
  // or form signup can quietly bring the address back.
  app.delete("/api/admin/subscribers/:email", async (req: Request, res: Response) => {
    if (!deps.requireAdmin(req, res)) return;
    if (!deps.store) return res.status(503).json({ error: "Subscriber storage is not configured" });
    const email = String(req.params.email ?? "").toLowerCase().trim();
    if (!email.includes("@")) return res.status(400).json({ error: "An email address is required" });
    try {
      const { found } = await deps.store.erase(email);
      res.json({ message: found ? "Removed" : "Not found; a suppression marker is recorded anyway", found });
    } catch (e) {
      logError("Subscriber erase failed:", errorText(e));
      res.status(503).json({ error: "Subscriber storage is unavailable" });
    }
  });
}
