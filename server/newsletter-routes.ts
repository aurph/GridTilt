// ─── Newsletter routes (T18) ─────────────────────────────────────────────────
//
// Sending is two deliberate steps, both admin-only:
//   1. POST /api/admin/newsletter/issues renders the current content once and
//      freezes it as an issue revision (nothing is sent).
//   2. POST /api/admin/newsletter/issues/:id/:revision/send with
//      { "confirm": "<id>/<revision>" } sends that frozen revision.
// The old one-shot POST /api/newsletter/send is retired (410), so no cron or
// stray call can send by implication. Provider webhooks arrive at
// POST /api/webhooks/resend and are verified before anything is read.

import type { Express, Request, Response } from "express";
import type { PoolLike, SubscriberStore } from "./subscriber-store";
import { createIssue, getIssue, issueStats } from "./newsletter-ledger";
import { sendIssue, sendTestCopy, type SendDeps } from "./newsletter-send";
import { applyResendEvent } from "./newsletter-events";
import { verifyResendWebhook } from "./resend";
import { parseEditorialIssue, type EditorialIssue } from "./editorial-issue";

export interface RenderedIssue {
  subject: string;
  html: string;
  text: string;
  /** Reasons the content itself may not be sent (no privacy notice, no mailing address). */
  blockers: string[];
  suggestedIssueId: string;
}

export interface NewsletterRouteDeps {
  pool: PoolLike | null;
  store: SubscriberStore | null;
  requireAdmin: (req: Request, res: Response) => boolean;
  renderCurrent: () => RenderedIssue;
  /** A written issue (issue zero, a correction note) in the same frame and footer. */
  renderEditorial: (issue: EditorialIssue) => RenderedIssue;
  /** Configuration that blocks sending (provider key, sender address); empty when ready. */
  sendBlockers: () => string[];
  /** Built only when sending is configured. */
  sendDeps: () => SendDeps | null;
  webhookSecret: () => string | undefined;
  logError?: (message: string, detail: string) => void;
}

const LEDGER_MISSING = "The delivery ledger needs DATABASE_URL (Postgres).";

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function parseRevision(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : null;
}

export function registerNewsletterRoutes(app: Express, deps: NewsletterRouteDeps): void {
  const logError = deps.logError ?? ((m: string, d: string) => console.error(m, d));

  app.get("/api/newsletter/preview", (req, res) => {
    if (!deps.requireAdmin(req, res)) return; // SEC-1: leaked subscriber count when public
    try {
      const r = deps.renderCurrent();
      if (req.query.format === "text") return res.type("text/plain").send(r.text);
      res.type("html").send(r.html);
    } catch (e) {
      logError("Newsletter preview failed:", errText(e));
      res.status(500).json({ error: "Failed to generate preview" });
    }
  });

  // Retired: it rendered and sent in one call, guarded only by a six-day file marker.
  app.post("/api/newsletter/send", (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    res.status(410).json({
      error:
        "Replaced. Prepare an issue with POST /api/admin/newsletter/issues, then send it with POST /api/admin/newsletter/issues/:id/:revision/send and {\"confirm\": \"<id>/<revision>\"}.",
    });
  });

  app.post("/api/admin/newsletter/issues", async (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    if (!deps.pool || !deps.store) return res.status(503).json({ error: LEDGER_MISSING });
    const body = (req.body ?? {}) as { issueId?: unknown; correctionReason?: unknown; editorial?: unknown };
    let rendered: RenderedIssue;
    let issueId: string;
    if (body.editorial !== undefined) {
      const parsed = parseEditorialIssue(body.editorial);
      if (!parsed.ok) return res.status(400).json({ error: "The editorial issue has problems; nothing was stored.", errors: parsed.errors });
      try {
        rendered = deps.renderEditorial(parsed.issue);
      } catch (e) {
        logError("Editorial render failed:", errText(e));
        return res.status(500).json({ error: "Rendering failed; nothing was stored." });
      }
      issueId = parsed.issue.issueId;
    } else {
      try {
        rendered = deps.renderCurrent();
      } catch (e) {
        // A failed render stores nothing: an error page is not an email body.
        logError("Newsletter render failed:", errText(e));
        return res.status(500).json({ error: "Rendering failed; nothing was stored." });
      }
      issueId = typeof body.issueId === "string" && body.issueId ? body.issueId : rendered.suggestedIssueId;
    }
    try {
      const issue = await createIssue(deps.pool, {
        issueId,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        blockers: rendered.blockers,
        correctionReason: typeof body.correctionReason === "string" ? body.correctionReason : null,
      });
      const recipientsNow = (await deps.store.listSendable()).length;
      res.status(201).json({
        issueId: issue.issueId,
        revision: issue.revision,
        contentSha256: issue.contentSha256,
        blockers: [...issue.blockers, ...deps.sendBlockers()],
        recipientsNow,
      });
    } catch (e) {
      res.status(400).json({ error: errText(e) });
    }
  });

  app.get("/api/admin/newsletter/issues/:issueId/:revision", async (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    if (!deps.pool) return res.status(503).json({ error: LEDGER_MISSING });
    const revision = parseRevision(req.params.revision);
    if (revision === null) return res.status(400).json({ error: "Bad revision" });
    const issue = await getIssue(deps.pool, String(req.params.issueId), revision);
    if (!issue) return res.status(404).json({ error: "No such issue revision" });
    res.json({
      issueId: issue.issueId,
      revision: issue.revision,
      subject: issue.subject,
      contentSha256: issue.contentSha256,
      createdAt: issue.createdAt,
      correctionReason: issue.correctionReason,
      blockers: [...issue.blockers, ...deps.sendBlockers()],
      counts: await issueStats(deps.pool, issue.issueId, issue.revision),
    });
  });

  app.get("/api/admin/newsletter/issues/:issueId/:revision/preview", async (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    if (!deps.pool) return res.status(503).json({ error: LEDGER_MISSING });
    const revision = parseRevision(req.params.revision);
    if (revision === null) return res.status(400).json({ error: "Bad revision" });
    const issue = await getIssue(deps.pool, String(req.params.issueId), revision);
    if (!issue) return res.status(404).json({ error: "No such issue revision" });
    if (req.query.format === "text") return res.type("text/plain").send(issue.text);
    res.type("html").send(issue.html);
  });

  app.post("/api/admin/newsletter/issues/:issueId/:revision/send", async (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    if (!deps.pool || !deps.store) return res.status(503).json({ error: LEDGER_MISSING });
    const issueId = String(req.params.issueId);
    const revision = parseRevision(req.params.revision);
    if (revision === null) return res.status(400).json({ error: "Bad revision" });
    // Typed out on purpose: no default, no "latest", so nothing sends by implication.
    if ((req.body ?? {}).confirm !== `${issueId}/${revision}`) {
      return res.status(400).json({ error: `Send needs {"confirm": "${issueId}/${revision}"}` });
    }
    const configBlockers = deps.sendBlockers();
    const sendDeps = deps.sendDeps();
    if (configBlockers.length > 0 || !sendDeps) {
      return res.status(409).json({ status: "blocked", blockers: configBlockers.length > 0 ? configBlockers : ["sending is not configured"] });
    }
    try {
      const report = await sendIssue(sendDeps, issueId, revision);
      if (report.status === "not_found") return res.status(404).json(report);
      if (report.status === "busy") return res.status(409).json({ ...report, error: "Another send of this revision is running" });
      if (report.status === "blocked") return res.status(409).json(report);
      res.json(report);
    } catch (e) {
      logError("Newsletter send failed:", errText(e));
      res.status(500).json({ error: "The send stopped; the ledger holds what happened so far. Check the issue status before retrying." });
    }
  });

  // One "[Test]" copy to one current subscriber, for checking authentication
  // headers and the unsubscribe link in a real inbox. Not a delivery of the issue.
  app.post("/api/admin/newsletter/issues/:issueId/:revision/test", async (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    if (!deps.pool || !deps.store) return res.status(503).json({ error: LEDGER_MISSING });
    const issueId = String(req.params.issueId);
    const revision = parseRevision(req.params.revision);
    if (revision === null) return res.status(400).json({ error: "Bad revision" });
    const to = typeof (req.body ?? {}).to === "string" ? String(req.body.to).trim().toLowerCase() : "";
    if (!to.includes("@")) return res.status(400).json({ error: "A test needs {\"to\": \"<a subscribed address>\"}" });
    if ((req.body ?? {}).confirm !== `test:${to}`) {
      return res.status(400).json({ error: `A test send needs {"confirm": "test:${to}"}` });
    }
    const configBlockers = deps.sendBlockers();
    const sendDeps = deps.sendDeps();
    if (configBlockers.length > 0 || !sendDeps) {
      return res.status(409).json({ status: "blocked", blockers: configBlockers.length > 0 ? configBlockers : ["sending is not configured"] });
    }
    const report = await sendTestCopy(sendDeps, issueId, revision, to);
    if (report.status === "not_found") return res.status(404).json(report);
    if (report.status === "blocked") return res.status(409).json(report);
    if (report.status === "not_a_subscriber") {
      return res.status(409).json({ ...report, error: "Subscribe this address through the site form first, so its unsubscribe link and signup date are real." });
    }
    res.json(report);
  });

  app.post("/api/webhooks/resend", async (req: Request, res: Response) => {
    const secret = deps.webhookSecret();
    if (!secret) return res.status(503).json({ error: "Webhook secret not configured" });
    const raw = (req as Request & { rawBody?: unknown }).rawBody;
    const headers = {
      id: req.header("svix-id") ?? undefined,
      timestamp: req.header("svix-timestamp") ?? undefined,
      signature: req.header("svix-signature") ?? undefined,
    };
    if (!(raw instanceof Buffer) || !verifyResendWebhook(secret, headers, raw)) {
      return res.status(401).json({ error: "Invalid signature" });
    }
    // Answered 503 so the provider retries once storage is back.
    if (!deps.pool || !deps.store) return res.status(503).json({ error: LEDGER_MISSING });
    let event: unknown;
    try {
      event = JSON.parse(raw.toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Body is not JSON" });
    }
    try {
      const result = await applyResendEvent(deps.pool, deps.store, headers.id as string, event as never);
      res.json({ received: true, duplicate: result.duplicate });
    } catch (e) {
      logError("Webhook event not applied (the provider will retry):", `${headers.id} ${errText(e)}`);
      res.status(500).json({ error: "Not applied; retry" });
    }
  });
}
