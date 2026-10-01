// ─── Weekly email digest ────────────────────────────────────────────────────
//
// Renders the newsletter HTML and plain text from the same composed Brief the
// site shows, plus the measured headline numbers and the day's top movers.
// Pure functions of their inputs (snapshot-tested). An issue's content is
// rendered once and frozen; personalize() then fills each recipient's
// unsubscribe token ("token=PREVIEW") and signup date (SIGNED_UP_PREVIEW).
//
// Email HTML rules: table layout, inline styles only, no external CSS, no
// webfonts - the dark GridTilt look approximated with email-safe styling.

import type { Brief } from "./brief";

export interface WeeklyDigestInput {
  brief: Brief;
  movers: Array<{ ticker: string; name: string; changePercent: number }>;
  trackedGW: number | null;
  constructionGW: number | null;
  fleetAvg: number | null;
  fleetAvg1yChange: number | null;
  /** The NERC area with the smallest cushion above its own reference margin. */
  tightestRTO: { label: string; marginPct: number; referencePct: number } | null;
  /** e.g. "Week of June 29 - July 4, 2026" */
  dateLabel: string;
  siteUrl: string; // no trailing slash
  /** When the figures were taken ("October 1, 2026"): the issue is frozen at this point. */
  asOf: string;
  /** Each figure in the email with its source and that source's date. */
  figureSources: Array<{ figure: string; source: string; asOf: string }>;
  footer: NewsletterFooter;
}

export interface NewsletterFooter {
  contactEmail: string;
  /** The published privacy notice. Null blocks sending; it is never invented. */
  privacyUrl: string | null;
  /** The approved mailing address required in commercial email. Null blocks sending. */
  postalAddress: string | null;
}

/** Why an issue with this footer may not be sent. Empty means nothing in the footer blocks it. */
export function footerBlockers(footer: NewsletterFooter): string[] {
  const out: string[] = [];
  if (!footer.privacyUrl) out.push("no published privacy notice (NEWSLETTER_PRIVACY_URL)");
  if (!footer.postalAddress) out.push("no approved mailing address (NEWSLETTER_POSTAL_ADDRESS)");
  return out;
}

export const UNSUBSCRIBE_HOOK = "token=PREVIEW";
export const SIGNED_UP_HOOK = "SIGNED_UP_PREVIEW";

/**
 * One recipient's copy: the HMAC token into the unsubscribe link and the
 * date they signed up into the line that says why they get this email.
 * Each hook appears exactly once in a rendered issue.
 */
export function personalize(content: string, recipient: { token: string; signedUpOn: string }, html: boolean): string {
  const date = html ? esc(recipient.signedUpOn) : recipient.signedUpOn;
  return content
    .replace(UNSUBSCRIBE_HOOK, `token=${encodeURIComponent(recipient.token)}`)
    .replace(SIGNED_UP_HOOK, date);
}

const C = {
  bg: "#0d0d14",
  card: "#151520",
  border: "rgba(255,255,255,0.06)",
  brand: "#F07800",
  brand2: "#F0A500",
  ink: "#ffffff",
  inkMuted: "rgba(255,255,255,0.55)",
  inkFaint: "rgba(255,255,255,0.38)",
  positive: "#22c55e",
  negative: "#ef4444",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pctColor(v: number): string {
  return v >= 0 ? C.positive : C.negative;
}

function keyNumberCell(label: string, value: string, sub: string): string {
  return `<td width="33%" style="padding:12px 8px;text-align:center;border:1px solid ${C.border};border-radius:8px;">
<div style="font-size:11px;color:${C.inkFaint};text-transform:uppercase;letter-spacing:1px;">${esc(label)}</div>
<div style="font-size:20px;font-weight:800;color:${C.brand2};font-family:ui-monospace,Menlo,monospace;padding:4px 0;">${esc(value)}</div>
<div style="font-size:11px;color:${C.inkMuted};">${esc(sub)}</div>
</td>`;
}

export function renderWeeklyEmail(input: WeeklyDigestInput): string {
  const { brief, movers, dateLabel, siteUrl } = input;

  const keyCells: string[] = [];
  if (input.trackedGW !== null) {
    keyCells.push(
      keyNumberCell(
        "Tracked AI Power",
        `${input.trackedGW.toFixed(1)} GW`,
        input.constructionGW !== null ? `+${input.constructionGW.toFixed(1)} GW building` : "operational + construction",
      ),
    );
  }
  if (input.fleetAvg !== null) {
    keyCells.push(
      keyNumberCell(
        "GPU Fleet Avg",
        `$${input.fleetAvg.toFixed(2)}/hr`,
        input.fleetAvg1yChange !== null ? `${input.fleetAvg1yChange > 0 ? "+" : ""}${input.fleetAvg1yChange.toFixed(1)}% 1Y` : "on-demand rental",
      ),
    );
  }
  if (input.tightestRTO !== null) {
    keyCells.push(
      keyNumberCell(
        "Grid Headroom",
        `${input.tightestRTO.marginPct.toFixed(1)}%`,
        `${input.tightestRTO.label} reserve margin, NERC reference ${input.tightestRTO.referencePct}%`,
      ),
    );
  }

  const sectionsHtml = brief.sections
    .map(
      (s) => `
<div style="font-size:13px;font-weight:700;color:${C.brand2};margin:20px 0 8px;text-transform:uppercase;letter-spacing:1px;">${esc(s.heading)}</div>
${s.points
  .map(
    (p) => `<div style="font-size:13px;line-height:1.6;color:${C.inkMuted};padding:3px 0 3px 14px;border-left:2px solid ${C.border};margin:4px 0;">${esc(p)}</div>`,
  )
  .join("")}`,
    )
    .join("");

  const moversHtml =
    movers.length === 0
      ? ""
      : `
<div style="font-size:13px;font-weight:700;color:${C.brand2};margin:24px 0 8px;text-transform:uppercase;letter-spacing:1px;">Top Movers Today</div>
<table width="100%" cellpadding="0" cellspacing="0">
${movers
  .map(
    (m) => `<tr>
<td style="padding:7px 0;border-bottom:1px solid ${C.border};font-size:13px;font-weight:700;color:${C.ink};font-family:ui-monospace,Menlo,monospace;">${esc(m.ticker)}</td>
<td style="padding:7px 0;border-bottom:1px solid ${C.border};font-size:12px;color:${C.inkMuted};">${esc(m.name)}</td>
<td align="right" style="padding:7px 0;border-bottom:1px solid ${C.border};font-size:13px;font-weight:700;font-family:ui-monospace,Menlo,monospace;color:${pctColor(m.changePercent)};">${m.changePercent > 0 ? "+" : ""}${m.changePercent.toFixed(2)}%</td>
</tr>`,
  )
  .join("")}
</table>
<div style="font-size:11px;color:${C.inkFaint};margin-top:6px;">Percent moves as of ${esc(input.asOf)}.</div>`;

  const sourcesHtml =
    input.figureSources.length === 0
      ? ""
      : `<div style="font-size:11px;color:${C.inkFaint};line-height:1.6;margin-top:10px;">Sources and dates: ${input.figureSources
          .map((f) => `${esc(f.figure)}: ${esc(f.source)}, ${esc(f.asOf)}`)
          .join("; ")}.</div>`;
  const { footer } = input;
  const privacy = footer.privacyUrl
    ? `<a href="${esc(footer.privacyUrl)}" style="color:${C.inkMuted};">Privacy</a>`
    : `<span style="color:${C.negative};">[privacy notice not published: sending is blocked]</span>`;
  const address = footer.postalAddress
    ? esc(footer.postalAddress)
    : `<span style="color:${C.negative};">[mailing address not set: sending is blocked]</span>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>The GridTilt Weekly</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:${C.card};border-radius:12px;overflow:hidden;border:1px solid ${C.border};">

<tr><td style="padding:28px 32px;border-bottom:1px solid rgba(240,120,0,0.2);">
<div style="font-size:22px;font-weight:800;color:${C.ink};">Grid<span style="color:${C.brand};">Tilt</span></div>
<div style="font-size:12px;color:${C.inkFaint};margin-top:4px;font-family:ui-monospace,Menlo,monospace;">The GridTilt Weekly · ${esc(dateLabel)}</div>
</td></tr>

<tr><td style="padding:28px 32px 8px;">
<div style="font-size:15px;line-height:1.65;color:${C.ink};">${esc(brief.summary)}</div>
</td></tr>

${keyCells.length > 0 ? `<tr><td style="padding:16px 32px 4px;"><table width="100%" cellpadding="0" cellspacing="6"><tr>${keyCells.join("")}</tr></table></td></tr>` : ""}

<tr><td style="padding:8px 32px 4px;">
${sectionsHtml}
${moversHtml}
</td></tr>

<tr><td style="padding:20px 32px;">
<div style="font-size:13px;line-height:1.6;color:${C.inkMuted};border-top:1px solid ${C.border};padding-top:16px;">${esc(brief.takeaway)}</div>
<div style="padding:18px 0 6px;">
<a href="${siteUrl}/overview" style="display:inline-block;background:${C.brand};color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 18px;border-radius:6px;">Open the dashboard</a>
</div>
</td></tr>

<tr><td style="padding:18px 32px;border-top:1px solid ${C.border};">
<div style="font-size:11px;color:${C.inkFaint};line-height:1.6;">
You are receiving this because you signed up at gridtilt.com on ${SIGNED_UP_HOOK}.
<a href="${siteUrl}/api/unsubscribe?${UNSUBSCRIBE_HOOK}" style="color:${C.inkMuted};">Unsubscribe</a>
· Contact: <a href="mailto:${esc(footer.contactEmail)}" style="color:${C.inkMuted};">${esc(footer.contactEmail)}</a>
· ${privacy}
</div>
<div style="font-size:11px;color:${C.inkFaint};line-height:1.6;margin-top:6px;">GridTilt · ${address}</div>
${sourcesHtml}
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** The plain-text part of the same issue: every figure, source and footer line the HTML has. */
export function renderWeeklyText(input: WeeklyDigestInput): string {
  const lines: string[] = [];
  lines.push(`The GridTilt Weekly, ${input.dateLabel}`, "");
  lines.push(input.brief.summary, "");
  if (input.trackedGW !== null) {
    lines.push(
      `Tracked AI power: ${input.trackedGW.toFixed(1)} GW${input.constructionGW !== null ? ` (+${input.constructionGW.toFixed(1)} GW building)` : ""}`,
    );
  }
  if (input.fleetAvg !== null) {
    lines.push(
      `GPU fleet average: $${input.fleetAvg.toFixed(2)}/hr${input.fleetAvg1yChange !== null ? ` (${input.fleetAvg1yChange > 0 ? "+" : ""}${input.fleetAvg1yChange.toFixed(1)}% 1Y)` : ""}`,
    );
  }
  if (input.tightestRTO !== null) {
    lines.push(
      `Grid headroom: ${input.tightestRTO.label} reserve margin ${input.tightestRTO.marginPct.toFixed(1)}%, NERC reference ${input.tightestRTO.referencePct}%`,
    );
  }
  for (const section of input.brief.sections) {
    lines.push("", section.heading.toUpperCase());
    for (const point of section.points) lines.push(`- ${point}`);
  }
  if (input.movers.length > 0) {
    lines.push("", "TOP MOVERS");
    for (const m of input.movers) lines.push(`${m.ticker} ${m.name}: ${m.changePercent > 0 ? "+" : ""}${m.changePercent.toFixed(2)}%`);
    lines.push(`Percent moves as of ${input.asOf}.`);
  }
  lines.push("", input.brief.takeaway, "", `Open the dashboard: ${input.siteUrl}/overview`, "");
  if (input.figureSources.length > 0) {
    lines.push(`Sources and dates: ${input.figureSources.map((f) => `${f.figure}: ${f.source}, ${f.asOf}`).join("; ")}.`, "");
  }
  lines.push(`You are receiving this because you signed up at gridtilt.com on ${SIGNED_UP_HOOK}.`);
  lines.push(`Unsubscribe: ${input.siteUrl}/api/unsubscribe?${UNSUBSCRIBE_HOOK}`);
  lines.push(`Contact: ${input.footer.contactEmail}`);
  lines.push(`Privacy: ${input.footer.privacyUrl ?? "[privacy notice not published: sending is blocked]"}`);
  lines.push(`GridTilt, ${input.footer.postalAddress ?? "[mailing address not set: sending is blocked]"}`);
  return lines.join("\n") + "\n";
}

/** "Week of June 29 - July 4, 2026" from a given end date (US-Eastern day). */
export function weeklyDateLabel(end: Date): string {
  const start = new Date(end.getTime() - 6 * 86_400_000);
  const f = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "America/New_York" });
  return `Week of ${f(start, false)} - ${f(end, true)}`;
}
