# Newsletter sending: sender domain, webhook, the send flow, and the first test

Procedure only. No addresses, keys or exports belong in this repository.

## What the code does

- **An issue is frozen before it is sent.** `POST /api/admin/newsletter/issues` renders the current weekly content once and stores its subject, HTML and plain text as an issue revision (`server/newsletter-ledger.ts`). Nothing is sent. Sending reads the stored copy, so a retry after a restart sends byte-identical content.
- **Sending takes a typed confirmation.** `POST /api/admin/newsletter/issues/:id/:revision/send` with `{"confirm": "<id>/<revision>"}`. The old one-shot `POST /api/newsletter/send` answers 410, so no cron or stray call can send by implication.
- **One delivery row per issue revision and address** (keyed by email hash). Each row has a fixed idempotency key sent to Resend as `Idempotency-Key`; Resend keeps keys 24 hours and answers a repeat with the original email id instead of sending again.
- **One run at a time.** A send run holds a ten-minute lease on the revision, renewed as it goes; a second run at the same time is told a run is in progress (tested on a real Postgres server with two connection pools).
- **Checked again right before each attempt.** An address that opted out, bounced, complained or was erased after the run started is skipped, not sent.
- **Outcomes:** `accepted` (provider took it, not proof of inbox delivery), `delivered` (provider webhook), `failed` (rejected, or a permanent bounce), `queued` (rate limit or provider error, retried by the next run), `unknown` (no answer: it may have been accepted), `skipped`. An `unknown` row is retried with the same key only within 23 hours of its first attempt; after that it is left for review, because a new attempt could send a second copy.
- **Pace:** 4 requests per second per run, under Resend's default team limit of 10 per second.
- **Corrections:** a second revision of an issue needs a reason and goes only to the addresses an earlier revision was accepted for, once.
- **Provider webhooks** (`POST /api/webhooks/resend`) are verified with the Svix signature before anything is read, applied once per event id, and never move a delivery backwards (a late "delivered" does not undo a bounce). A permanent bounce, a complaint or a provider suppression suppresses the address for every later issue. Logs carry the event type and id, never an address.
- **One-click unsubscribe (RFC 8058):** every email carries `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`; a POST to the link opts out with an empty 200. The unsubscribe token derivation is unchanged, so links in emails already sent keep working.
- **Every email states** each figure's source and date, why the reader gets it ("you signed up at gridtilt.com on <date>"), the unsubscribe link, a contact address, the privacy notice and the mailing address. If the privacy notice or the mailing address is not configured, the preview says so and the issue is blocked from sending; neither is ever invented.
- **No contact copies at the provider.** The old sync added each signup to "the first audience" in Resend. The Postgres list and its suppressions are the only list; Resend only sends.

## Sender domain (public DNS as read on 2026-10-01)

- `_dmarc.gridtilt.com`: `v=DMARC1; p=reject; sp=reject; pct=100;`. Receivers reject mail claiming to be from gridtilt.com (or a subdomain) that does not pass aligned SPF or DKIM. Keep it; do not weaken it to hide a sender problem.
- No SPF record at `gridtilt.com`, no MX, no DKIM key at `resend._domainkey` or at any common selector checked (google, default, selector1/2, s1/s2, k1-3, mail, dkim, mandrill, postmark, ses, sendgrid), and no return-path records at `send.gridtilt.com`. DNS is hosted at name.com.
- So no provider is set up to send as gridtilt.com today. Mail from `brief@gridtilt.com` would be rejected.

To set it up:

1. Resend, Domains, Add domain: `news.gridtilt.com`. Resend recommends sending from a subdomain rather than the root domain. Pick the region closest to most readers.
2. Resend then shows the records for that domain: a DKIM `TXT` record, and for the return path (default `send.news.gridtilt.com`) an `MX` and an SPF `TXT`. The values are generated for the domain and region; copy them exactly from the Records tab into name.com. Do not guess them.
3. Wait for Resend to verify (often 15 minutes, up to 72 hours).
4. Set `NEWSLETTER_FROM` to a sender on that domain, e.g. `GridTilt <brief@news.gridtilt.com>`. DKIM signed for `news.gridtilt.com` then aligns with the From domain, so DMARC passes under `p=reject`.
5. gridtilt.com has no MX, so replies to the sender bounce. Set `NEWSLETTER_REPLY_TO` to an address that receives mail.

## Webhook

Resend, Webhooks, add an endpoint `https://gridtilt.com/api/webhooks/resend` with the events `email.delivered`, `email.bounced`, `email.complained`, `email.failed` and `email.suppressed`. Copy its signing secret (`whsec_...`) into `RESEND_WEBHOOK_SECRET`. Resend retries a failed delivery with backoff for about a day and can replay events; both are handled.

## Before the first send

Every one of these is required. A send without them answers 409 and lists what is missing:

- `DATABASE_URL`: the delivery ledger lives in Postgres (see `subscriber-storage.md`).
- `RESEND_API_KEY` and `NEWSLETTER_FROM` on a verified domain (above).
- `RESEND_WEBHOOK_SECRET` (above): without it bounces and complaints would never suppress an address.
- `NEWSLETTER_PRIVACY_URL`: a published privacy notice. GridTilt has no privacy page yet; a draft for review is kept outside this repository.
- `NEWSLETTER_POSTAL_ADDRESS`: the approved mailing address. The FTC's CAN-SPAM guide: "Your message must include your valid physical postal address. This can be your current street address, a post office box you've registered with the U.S. Postal Service, or a private mailbox you've registered with a commercial mail receiving agency." Opt-outs must be honored within 10 business days and the mechanism must work for at least 30 days after a send ([FTC guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)).
- An issue prepared before these were set is blocked; prepare it again after setting them.

## Sending an issue

```sh
# 1. Freeze the current content as an issue (nothing is sent)
curl -sS -X POST -H "x-admin-key: <key>" -H "Content-Type: application/json" -d '{}' https://gridtilt.com/api/admin/newsletter/issues
# -> {"issueId": "weekly-YYYY-MM-DD", "revision": 1, "blockers": [], "recipientsNow": N}

# 2. Read it (HTML, then plain text)
curl -sS -H "x-admin-key: <key>" https://gridtilt.com/api/admin/newsletter/issues/weekly-YYYY-MM-DD/1/preview -o issue.html
curl -sS -H "x-admin-key: <key>" "https://gridtilt.com/api/admin/newsletter/issues/weekly-YYYY-MM-DD/1/preview?format=text"

# 3. Send it
curl -sS -X POST -H "x-admin-key: <key>" -H "Content-Type: application/json" \
  -d '{"confirm": "weekly-YYYY-MM-DD/1"}' https://gridtilt.com/api/admin/newsletter/issues/weekly-YYYY-MM-DD/1/send
# -> counts by state

# 4. Check it later (webhooks move accepted to delivered or failed)
curl -sS -H "x-admin-key: <key>" https://gridtilt.com/api/admin/newsletter/issues/weekly-YYYY-MM-DD/1
```

- Rerunning step 3 sends only what is still `queued` (and `unknown` rows inside the 23 hour window). It never sends a revision twice to an address.
- A run sends about 4 emails a second inside one HTTP request. For a list of more than about a thousand addresses the request can outlast the client or the platform's request limit; the ledger keeps what happened, so check the status and run step 3 again to continue.
- `unknown` rows older than that: look the recipient up in the Resend dashboard before doing anything by hand.
- A correction: `POST /api/admin/newsletter/issues` with `{"issueId": "weekly-YYYY-MM-DD", "correctionReason": "<what was wrong>"}` makes revision 2, which goes only to readers of revision 1.

## Written issues and the change log

A written issue (issue zero, a correction note) is kept as a private draft file outside this repository and frozen through the same route, with the draft under `editorial`:

```sh
jq '{editorial: .}' ~/Private/issue-00.json | curl -sS -X POST -H "x-admin-key: <key>" -H "Content-Type: application/json" \
  -d @- https://gridtilt.com/api/admin/newsletter/issues
```

The draft is validated first (`server/editorial-issue.ts`): 1 to 10 sections, https links only, every source with its date, and no placeholder text ("TBD", "{{...}}", "[link]"). A draft with problems is answered with the list and nothing is stored. It then gets the same footer, per-reader hooks, freezing, test copy and send as the weekly issue.

"What changed" in an issue cites `server/data/change-log.json` (served at `GET /api/changes`): one entry per actual change, with the value before and after, the source and its date, when it was reviewed, where it shows on the site, and why. Add the entry in the same change that ships the correction, so the notice never goes out before the fix is live. "Checked, no material change" is its own kind of entry. Nothing is backfilled.

## The first test message (needs the owner's go-ahead)

1. Subscribe one address you control through the site form, so its consent date and unsubscribe link are real.
2. Prepare an issue (step 1 above) and read it.
3. Send one "[Test]" copy to that address only. It is not recorded as a delivery of the issue:

   ```sh
   curl -sS -X POST -H "x-admin-key: <key>" -H "Content-Type: application/json" \
     -d '{"to": "<your address>", "confirm": "test:<your address>"}' \
     https://gridtilt.com/api/admin/newsletter/issues/weekly-YYYY-MM-DD/1/test
   ```

4. In the received message, open the original headers and check `Authentication-Results`: `spf=pass`, `dkim=pass` with `header.d=news.gridtilt.com`, and `dmarc=pass`. A provider 200 alone is not inbox receipt.
5. Click Unsubscribe in the email (or the mail client's unsubscribe button). Then the `unsubscribed` count goes up by one (read only the counts, so no address reaches the terminal: `curl -sS -H "x-admin-key: <key>" https://gridtilt.com/api/admin/subscribers | jq '{count, byState}'`), and signing up again with that address from the form says it was taken off the list earlier.
6. Only after that, send the issue (step 3 of "Sending an issue").
