// ─── Sending one frozen issue revision (T18) ─────────────────────────────────
//
// One run: take the lease, queue every sendable address once, then for each
// row: re-check the address immediately before the attempt, mark it
// attempting, send with the row's fixed idempotency key, and record what the
// provider said. A crash leaves rows "attempting"; the next run retries them
// with the same key inside the provider's window, so a request that was in
// fact accepted is answered with its original id instead of a second email.
// Nothing here claims exactly-once delivery: an ambiguous row past the window
// stays "unknown" for an operator.

import { emailHash, normalizeEmail, type SubscriberStore } from "./subscriber-store";
import {
  claimLease,
  correctionRecipients,
  ensureLedger,
  getIssue,
  issueStats,
  markAttempting,
  markOutcome,
  newLeaseOwner,
  queueRecipients,
  releaseLease,
  rowsToAttempt,
  type Issue,
} from "./newsletter-ledger";
import { IDEMPOTENCY_WINDOW_MS, type OutgoingEmail, type SendOutcome } from "./resend";
import { personalize } from "./weekly-digest";
import type { PoolLike } from "./subscriber-store";

export interface SendConfig {
  from: string;
  replyTo?: string;
  siteUrl: string; // no trailing slash
}

export interface SendDeps {
  pool: PoolLike;
  store: SubscriberStore;
  send: (email: OutgoingEmail, idempotencyKey: string) => Promise<SendOutcome>;
  /** The unchanged unsubscribe HMAC from routes.ts. */
  tokenFor: (email: string) => string;
  config: SendConfig;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Pause between requests. 250 ms keeps one run at 4 per second, under Resend's 10 per second team limit. */
  minIntervalMs?: number;
  /** Retry ambiguous rows only this long after their first attempt (under the provider's 24 h). */
  retryWindowMs?: number;
  leaseMs?: number;
}

export type SendReport =
  | { status: "busy" }
  | { status: "not_found" }
  | { status: "blocked"; blockers: string[] }
  | { status: "done"; queuedNow: number; attempted: number; counts: Record<string, number> };

/** "May 1, 2026" in Eastern time, for the "you signed up on" line. */
export function signupDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "an earlier date";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

/** One recipient's email: personalized content plus the RFC 8058 one-click headers. */
function composeEmail(
  deps: SendDeps,
  issue: Issue,
  sub: { email: string; subscribedAt: string | null },
  subjectPrefix = "",
): OutgoingEmail {
  const token = deps.tokenFor(sub.email);
  const recipient = { token, signedUpOn: signupDateLabel(sub.subscribedAt ?? "") };
  const unsubscribeUrl = `${deps.config.siteUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
  return {
    from: deps.config.from,
    to: sub.email,
    subject: `${subjectPrefix}${issue.subject}`,
    html: personalize(issue.html, recipient, true),
    text: personalize(issue.text, recipient, false),
    headers: {
      // Mail clients POST to this URL for one-click unsubscribe (subscriber-routes.ts).
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    ...(deps.config.replyTo ? { replyTo: deps.config.replyTo } : {}),
  };
}

export async function sendIssue(deps: SendDeps, issueId: string, revision: number): Promise<SendReport> {
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const minInterval = deps.minIntervalMs ?? 250;
  const window = deps.retryWindowMs ?? IDEMPOTENCY_WINDOW_MS - 60 * 60 * 1000;
  const leaseMs = deps.leaseMs ?? 10 * 60 * 1000;
  const { pool, store } = deps;

  await ensureLedger(pool);
  const issue = await getIssue(pool, issueId, revision);
  if (!issue) return { status: "not_found" };
  if (issue.blockers.length > 0) return { status: "blocked", blockers: issue.blockers };

  const owner = newLeaseOwner();
  if (!(await claimLease(pool, issueId, revision, owner, now(), leaseMs))) return { status: "busy" };
  try {
    // Who this revision is for: every sendable address, or for a correction,
    // only the sendable addresses an earlier revision reached.
    const sendable = await store.listSendable();
    const byHash = new Map(sendable.map((s) => [emailHash(s.email), s]));
    let hashes = Array.from(byHash.keys());
    if (revision > 1) {
      const reached = await correctionRecipients(pool, issueId, revision);
      hashes = hashes.filter((h) => reached.has(h));
    }
    const queuedNow = await queueRecipients(pool, issueId, revision, hashes, now());

    const rows = await rowsToAttempt(pool, issueId, revision, now(), window);
    let attempted = 0;
    for (const row of rows) {
      if (attempted > 0 && attempted % 20 === 0) {
        // Renew the lease on long runs; a lost lease means another run took over.
        if (!(await claimLease(pool, issueId, revision, owner, now(), leaseMs))) break;
      }
      const sub = byHash.get(row.emailHash);
      // Checked again right before the attempt: an opt-out during the run wins.
      if (!sub || !(await store.isSendable(sub.email))) {
        await markOutcome(pool, row, "skipped", { detail: "not sendable when its turn came" }, now());
        continue;
      }
      await markAttempting(pool, row, now());
      attempted++;
      const outcome = await deps.send(composeEmail(deps, issue, sub), row.idempotencyKey);
      if (outcome.kind === "accepted") await markOutcome(pool, row, "accepted", { providerId: outcome.providerId, detail: null }, now());
      else if (outcome.kind === "retryable") await markOutcome(pool, row, "queued", { detail: outcome.detail }, now());
      else if (outcome.kind === "rejected") await markOutcome(pool, row, "failed", { detail: outcome.detail }, now());
      else await markOutcome(pool, row, "unknown", { detail: outcome.detail }, now());
      if (minInterval > 0) await sleep(minInterval);
    }
    return { status: "done", queuedNow, attempted, counts: await issueStats(pool, issueId, revision) };
  } finally {
    await releaseLease(pool, issueId, revision, owner);
  }
}

export type TestSendReport =
  | { status: "not_found" }
  | { status: "blocked"; blockers: string[] }
  | { status: "not_a_subscriber" }
  | { status: "sent"; outcome: SendOutcome };

/**
 * One copy of a frozen revision, subject marked "[Test]", to one current
 * subscriber: for checking SPF, DKIM and DMARC in a real inbox and that its
 * unsubscribe link works. The address must be subscribed through the form,
 * so the link and the signup date are real. It is not a delivery of the
 * issue and is not recorded as one. A repeat within the same minute reuses
 * the idempotency key, so a double click sends one copy.
 */
export async function sendTestCopy(deps: SendDeps, issueId: string, revision: number, to: string): Promise<TestSendReport> {
  const now = deps.now ?? (() => new Date());
  await ensureLedger(deps.pool);
  const issue = await getIssue(deps.pool, issueId, revision);
  if (!issue) return { status: "not_found" };
  if (issue.blockers.length > 0) return { status: "blocked", blockers: issue.blockers };
  const email = normalizeEmail(to);
  if (!(await deps.store.isSendable(email))) return { status: "not_a_subscriber" };
  const sub = (await deps.store.listSendable()).find((s) => s.email === email);
  if (!sub) return { status: "not_a_subscriber" };
  const minute = Math.floor(now().getTime() / 60_000);
  const key = `gridtilt-test-${issueId}-r${revision}-${emailHash(email).slice(0, 16)}-${minute}`;
  return { status: "sent", outcome: await deps.send(composeEmail(deps, issue, sub, "[Test] "), key) };
}
