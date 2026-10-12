// ─── Editorial issues (T19) ──────────────────────────────────────────────────
//
// A written issue (issue zero, a correction note, a weekly change record) in
// the same frame as the weekly digest: the same footer, the same per-reader
// hooks, HTML and plain text. Its content arrives as data from a private
// draft, is validated here, and is frozen like any issue by
// POST /api/admin/newsletter/issues with { "editorial": { ... } }.
//
// The validator refuses placeholder text: a real send carries no "TBD",
// "{{...}}" or "[link]". Every link must be https. Every source names its date.

import {
  EMAIL_COLORS as C,
  escapeEmailHtml as esc,
  footerHtml,
  footerText,
  SIGNED_UP_HOOK,
  UNSUBSCRIBE_HOOK,
  type NewsletterFooter,
} from "./weekly-digest";

export interface EditorialSection {
  heading: string;
  paragraphs: string[];
  links?: Array<{ label: string; url: string }>;
  /** Each source with its own date, shown under the section. */
  sources?: Array<{ label: string; url: string; date: string }>;
}

export interface EditorialIssue {
  issueId: string;
  subject: string;
  /** The preview line mail clients show after the subject. */
  preheader: string;
  sections: EditorialSection[];
}

const ISSUE_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const PLACEHOLDER = /\{\{|\}\}|\bTBD\b|\bTODO\b|\bXXX\b|\[(?:link|url|tbd|placeholder|insert)[^\]]*\]|lorem ipsum/i;

function str(v: unknown, field: string, min: number, max: number, errors: string[]): string {
  if (typeof v !== "string") {
    errors.push(`${field} must be text`);
    return "";
  }
  const t = v.trim();
  if (t.length < min || t.length > max) errors.push(`${field} must be ${min} to ${max} characters`);
  if (PLACEHOLDER.test(t)) errors.push(`${field} contains placeholder text`);
  if (t.includes(UNSUBSCRIBE_HOOK) || t.includes(SIGNED_UP_HOOK)) errors.push(`${field} uses a reserved hook`);
  return t;
}

function httpsUrl(v: unknown, field: string, errors: string[]): string {
  if (typeof v !== "string") {
    errors.push(`${field} must be a URL`);
    return "";
  }
  try {
    const u = new URL(v);
    if (u.protocol !== "https:") errors.push(`${field} must be https`);
    return u.toString();
  } catch {
    errors.push(`${field} is not a URL`);
    return "";
  }
}

/** Validate a draft. Returns the issue or every problem found, never a partial issue. */
export function parseEditorialIssue(value: unknown): { ok: true; issue: EditorialIssue } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const v = (value ?? {}) as Record<string, unknown>;
  const issueId = typeof v.issueId === "string" ? v.issueId : "";
  if (!ISSUE_ID.test(issueId)) errors.push("issueId must be 3 to 64 lowercase letters, digits or dashes");
  const subject = str(v.subject, "subject", 5, 120, errors);
  const preheader = str(v.preheader, "preheader", 5, 200, errors);
  const rawSections = Array.isArray(v.sections) ? v.sections : [];
  if (rawSections.length < 1 || rawSections.length > 10) errors.push("an issue has 1 to 10 sections");
  const sections: EditorialSection[] = rawSections.slice(0, 10).map((raw, i) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    const at = `sections[${i}]`;
    const paragraphsRaw = Array.isArray(s.paragraphs) ? s.paragraphs : [];
    if (paragraphsRaw.length < 1 || paragraphsRaw.length > 8) errors.push(`${at} has 1 to 8 paragraphs`);
    const section: EditorialSection = {
      heading: str(s.heading, `${at}.heading`, 1, 80, errors),
      paragraphs: paragraphsRaw.slice(0, 8).map((p, j) => str(p, `${at}.paragraphs[${j}]`, 1, 1200, errors)),
    };
    if (s.links !== undefined) {
      const links = Array.isArray(s.links) ? s.links : [];
      if (links.length > 6) errors.push(`${at} has at most 6 links`);
      section.links = links.slice(0, 6).map((l, k) => {
        const o = (l ?? {}) as Record<string, unknown>;
        return { label: str(o.label, `${at}.links[${k}].label`, 1, 120, errors), url: httpsUrl(o.url, `${at}.links[${k}].url`, errors) };
      });
    }
    if (s.sources !== undefined) {
      const sources = Array.isArray(s.sources) ? s.sources : [];
      if (sources.length > 6) errors.push(`${at} has at most 6 sources`);
      section.sources = sources.slice(0, 6).map((src, k) => {
        const o = (src ?? {}) as Record<string, unknown>;
        return {
          label: str(o.label, `${at}.sources[${k}].label`, 1, 160, errors),
          url: httpsUrl(o.url, `${at}.sources[${k}].url`, errors),
          date: str(o.date, `${at}.sources[${k}].date`, 4, 40, errors),
        };
      });
    }
    return section;
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, issue: { issueId, subject, preheader, sections } };
}

export function renderEditorialEmail(issue: EditorialIssue, siteUrl: string, footer: NewsletterFooter): string {
  const sectionsHtml = issue.sections
    .map((s) => {
      const paras = s.paragraphs
        .map((p) => `<p style="font-size:15px;line-height:1.65;color:${C.ink};margin:0 0 12px;">${esc(p)}</p>`)
        .join("");
      const links = (s.links ?? [])
        .map((l) => `<div style="font-size:13px;margin:4px 0;"><a href="${esc(l.url)}" style="color:${C.brand};">${esc(l.label)}</a></div>`)
        .join("");
      const sources = (s.sources ?? [])
        .map(
          (src) =>
            `<div style="font-size:11px;color:${C.inkFaint};margin:4px 0;">Source: <a href="${esc(src.url)}" style="color:${C.inkMuted};">${esc(src.label)}</a>, ${esc(src.date)}</div>`,
        )
        .join("");
      return `<tr><td style="padding:20px 32px 4px;">
<div style="font-size:13px;font-weight:700;color:${C.brand2};margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">${esc(s.heading)}</div>
${paras}${links}${sources}
</td></tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(issue.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(issue.preheader)}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};"><tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:${C.card};border-radius:12px;overflow:hidden;border:1px solid ${C.border};">

<tr><td style="padding:28px 32px;border-bottom:1px solid rgba(240,120,0,0.2);">
<div style="font-size:22px;font-weight:800;color:${C.ink};">Grid<span style="color:${C.brand};">Tilt</span></div>
<div style="font-size:13px;color:${C.inkMuted};margin-top:6px;">${esc(issue.subject)}</div>
</td></tr>

${sectionsHtml}

<tr><td style="padding:18px 32px;border-top:1px solid ${C.border};">
${footerHtml(siteUrl, footer)}
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}

export function renderEditorialText(issue: EditorialIssue, siteUrl: string, footer: NewsletterFooter): string {
  const lines: string[] = [issue.subject, ""];
  for (const s of issue.sections) {
    lines.push(s.heading.toUpperCase());
    for (const p of s.paragraphs) lines.push(p, "");
    for (const l of s.links ?? []) lines.push(`${l.label}: ${l.url}`);
    for (const src of s.sources ?? []) lines.push(`Source: ${src.label}, ${src.date}: ${src.url}`);
    if ((s.links ?? []).length + (s.sources ?? []).length > 0) lines.push("");
  }
  lines.push(...footerText(siteUrl, footer));
  return lines.join("\n") + "\n";
}
