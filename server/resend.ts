// ─── Resend: one email per call, and webhook verification (T18) ─────────────
//
// Behavior checked against Resend's docs on 2026-10-01:
// - POST https://api.resend.com/emails with "Authorization: Bearer <key>".
// - An Idempotency-Key header (up to 256 characters) is kept for 24 hours.
//   The same key with the same payload returns the original response without
//   sending again; with a different payload it answers 409
//   invalid_idempotent_request; while the first request is in flight, 409
//   concurrent_idempotent_requests (safe to retry later).
// - The default rate limit is 10 requests per second per team, then 429.
// - Webhooks are signed by Svix: HMAC-SHA256 over "<svix-id>.<svix-timestamp>.<raw
//   body>" with the base64 key after "whsec_", sent as space-separated "v1,<sig>"
//   entries in svix-signature. Retries keep the same svix-id.
//
// A request that errors or times out may still have been accepted, so it is
// "ambiguous", never "failed": the caller retries it only with the same
// idempotency key inside the provider's 24 hour window.

import { createHmac, timingSafeEqual } from "crypto";

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  replyTo?: string;
}

export type SendOutcome =
  | { kind: "accepted"; providerId: string }
  /** Not sent, and a later attempt may succeed: rate limit, provider error, a concurrent duplicate. */
  | { kind: "retryable"; detail: string }
  /** Not sent, and resending the same request will not help. */
  | { kind: "rejected"; detail: string }
  /** No answer: the provider may or may not have accepted it. */
  | { kind: "ambiguous"; detail: string };

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export const RESEND_EMAILS_URL = "https://api.resend.com/emails";
export const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function sendViaResend(
  apiKey: string,
  email: OutgoingEmail,
  idempotencyKey: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs = 15_000,
): Promise<SendOutcome> {
  if (idempotencyKey.length === 0 || idempotencyKey.length > 256) {
    return { kind: "rejected", detail: "idempotency key must be 1 to 256 characters" };
  }
  const body: Record<string, unknown> = {
    from: email.from,
    to: [email.to],
    subject: email.subject,
    html: email.html,
    text: email.text,
  };
  if (email.headers) body.headers = email.headers;
  if (email.replyTo) body.reply_to = email.replyTo;

  let res;
  try {
    res = await fetchImpl(RESEND_EMAILS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { kind: "ambiguous", detail: `no response: ${(e as Error)?.name ?? "error"}` };
  }

  let raw = "";
  try {
    raw = await res.text();
  } catch {
    /* body unreadable */
  }
  let parsed: { id?: unknown; name?: unknown; message?: unknown } = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* not JSON */
  }

  if (res.ok) {
    if (typeof parsed.id === "string" && parsed.id) return { kind: "accepted", providerId: parsed.id };
    return { kind: "ambiguous", detail: `HTTP ${res.status} without an email id` };
  }
  const name = typeof parsed.name === "string" ? parsed.name : "";
  const detail = `HTTP ${res.status}${name ? ` ${name}` : ""}`;
  if (res.status === 409 && name === "concurrent_idempotent_requests") return { kind: "retryable", detail };
  if (res.status === 429 || res.status >= 500) return { kind: "retryable", detail };
  return { kind: "rejected", detail };
}

/**
 * Svix signature check for a Resend webhook. `rawBody` must be the bytes as
 * received; a re-serialized JSON body will not verify.
 */
export function verifyResendWebhook(
  secret: string,
  headers: { id?: string; timestamp?: string; signature?: string },
  rawBody: Buffer | string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret.startsWith("whsec_") || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isInteger(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  let key: Buffer;
  try {
    key = Buffer.from(secret.slice("whsec_".length), "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const body = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  for (const part of signature.split(" ")) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    let given: Buffer;
    try {
      given = Buffer.from(sig, "base64");
    } catch {
      continue;
    }
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}
