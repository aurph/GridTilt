// ─── Resend webhook events (T18) ─────────────────────────────────────────────
//
// Each event id is applied once. Every effect here is idempotent and never
// walks a delivery backwards, so the order is: skip a seen id, apply, then
// record the id. A failure while applying leaves the id unrecorded, and
// Resend's retry applies it again; a retry after success is a no-op.
// A permanent bounce, a complaint or a provider suppression suppresses the
// address for every later issue, whatever happened to this one.
// Logs carry the event type and id, never an address.

import { type PoolLike, type SubscriberStore } from "./subscriber-store";
import { applyDeliveryEvent, ensureLedger, recordEventOnce } from "./newsletter-ledger";

export interface ResendEvent {
  type?: unknown;
  data?: {
    email_id?: unknown;
    to?: unknown;
    bounce?: { type?: unknown; subType?: unknown };
  };
}

export type EventResult = { duplicate: true } | { duplicate: false; applied: string };

function firstRecipient(to: unknown): string | null {
  const v = Array.isArray(to) ? to[0] : to;
  return typeof v === "string" && v.includes("@") ? v : null;
}

export async function applyResendEvent(
  pool: PoolLike,
  store: SubscriberStore,
  eventId: string,
  event: ResendEvent,
  now = new Date(),
): Promise<EventResult> {
  await ensureLedger(pool);
  const seen = await pool.query("SELECT 1 FROM provider_events WHERE event_id = $1", [eventId]);
  if (seen.rows.length > 0) return { duplicate: true };

  const type = typeof event.type === "string" ? event.type : "unknown";
  const providerId = typeof event.data?.email_id === "string" ? event.data.email_id : null;
  const to = firstRecipient(event.data?.to);
  let applied = "ignored";

  switch (type) {
    case "email.delivered":
      if (providerId) await applyDeliveryEvent(pool, providerId, "delivered", null, now);
      applied = "delivered";
      break;
    case "email.bounced": {
      const kind = String(event.data?.bounce?.type ?? "").toLowerCase();
      const sub = typeof event.data?.bounce?.subType === "string" ? event.data.bounce.subType : "unspecified";
      if (kind === "permanent") {
        if (to) await store.suppress(to, "bounced", now);
        if (providerId) await applyDeliveryEvent(pool, providerId, "failed", `permanent bounce: ${sub}`.slice(0, 120), now);
        applied = "permanent bounce";
      } else {
        // A transient bounce is not a reason to stop sending to the address.
        applied = "transient bounce";
      }
      break;
    }
    case "email.complained":
      if (to) await store.suppress(to, "complained", now);
      applied = "complaint";
      break;
    case "email.failed":
      if (providerId) await applyDeliveryEvent(pool, providerId, "failed", "the provider could not send it", now);
      applied = "failed";
      break;
    case "email.suppressed":
      // The provider refused to send because the address is on its own
      // suppression list (an earlier hard bounce or complaint).
      if (to) await store.suppress(to, "bounced", now);
      if (providerId) await applyDeliveryEvent(pool, providerId, "failed", "on the provider's suppression list", now);
      applied = "provider suppression";
      break;
  }

  await recordEventOnce(pool, eventId, type, now);
  return { duplicate: false, applied };
}
