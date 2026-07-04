// ─── Weekly email digest ────────────────────────────────────────────────────
//
// Renders the newsletter HTML from the same composed Brief the site shows,
// plus the measured headline numbers and the day's top movers. Pure function
// of its inputs (snapshot-tested); the send pipeline personalizes per
// recipient by replacing "token=PREVIEW" with each subscriber's HMAC token.
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
  tightestRTO: { label: string; marginPct: number } | null;
  /** e.g. "Week of June 29 - July 4, 2026" */
  dateLabel: string;
  siteUrl: string; // no trailing slash
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
      keyNumberCell("Grid Headroom", `${input.tightestRTO.marginPct.toFixed(1)}%`, `${input.tightestRTO.label} reserve margin`),
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
<div style="font-size:11px;color:${C.inkFaint};margin-top:6px;">Percent moves as of send time.</div>`;

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
You are receiving this because you subscribed at gridtilt.com.
<a href="${siteUrl}/api/unsubscribe?token=PREVIEW" style="color:${C.inkMuted};">Unsubscribe</a>
· Sources: Yahoo Finance, EIA, NERC LTRA, LBNL, public listings. Estimates are flagged on the site.
</div>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

/** "Week of June 29 - July 4, 2026" from a given end date (US-Eastern day). */
export function weeklyDateLabel(end: Date): string {
  const start = new Date(end.getTime() - 6 * 86_400_000);
  const f = (d: Date, withYear: boolean) =>
    d.toLocaleDateString("en-US", { month: "long", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "America/New_York" });
  return `Week of ${f(start, false)} - ${f(end, true)}`;
}
