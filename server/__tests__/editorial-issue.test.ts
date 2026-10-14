// Written issues: validated before anything is frozen, and rendered in the
// same frame as the weekly email with the same per-reader hooks.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseEditorialIssue, renderEditorialEmail, renderEditorialText, type EditorialIssue } from "../editorial-issue";
import { SIGNED_UP_HOOK, UNSUBSCRIBE_HOOK } from "../weekly-digest";

const FOOTER = { contactEmail: "gridtilt1@gmail.com", privacyUrl: "https://gridtilt.com/privacy", postalAddress: "PO Box 1, Baltimore, MD 21201" };

const DRAFT = {
  issueId: "gridtilt-00",
  subject: "GridTilt 00: What a power-project announcement tells you",
  preheader: "A local starting point, one project record, and the limits of the numbers.",
  sections: [
    {
      heading: "One project: Clinton, Illinois",
      paragraphs: ["Meta and Constellation announced a 20-year agreement for 1,121 MW <from> an existing plant."],
      links: [{ label: "The record on GridTilt", url: "https://gridtilt.com/power-map?tab=deals" }],
      sources: [{ label: "Meta newsroom", url: "https://about.fb.com/news/2025/06/meta-constellation-partner-clean-energy-project/", date: "June 3, 2025" }],
    },
  ],
};

describe("parseEditorialIssue", () => {
  it("accepts a complete draft", () => {
    const r = parseEditorialIssue(DRAFT);
    assert.ok(r.ok);
  });

  it("refuses placeholder text anywhere", () => {
    for (const bad of ["Next hearing: TBD", "See {{state_link}}", "Read more [link here]", "Lorem ipsum dolor"]) {
      const r = parseEditorialIssue({ ...DRAFT, sections: [{ ...DRAFT.sections[0], paragraphs: [bad] }] });
      assert.ok(!r.ok && r.errors.some((e) => e.includes("placeholder")), bad);
    }
  });

  it("refuses non-https links, a missing source date, reserved hooks and malformed ids", () => {
    const http = parseEditorialIssue({ ...DRAFT, sections: [{ ...DRAFT.sections[0], links: [{ label: "x", url: "http://example.com" }] }] });
    assert.ok(!http.ok && http.errors.some((e) => e.includes("https")));
    const undated = parseEditorialIssue({ ...DRAFT, sections: [{ ...DRAFT.sections[0], sources: [{ label: "x", url: "https://example.com" }] }] });
    assert.ok(!undated.ok && undated.errors.some((e) => e.includes("date")));
    const hook = parseEditorialIssue({ ...DRAFT, preheader: `unsubscribe ${UNSUBSCRIBE_HOOK}` });
    assert.ok(!hook.ok && hook.errors.some((e) => e.includes("reserved hook")));
    assert.ok(!parseEditorialIssue({ ...DRAFT, issueId: "GridTilt 00" }).ok);
    assert.ok(!parseEditorialIssue({ ...DRAFT, sections: [] }).ok);
  });
});

describe("rendering a written issue", () => {
  const issue = (parseEditorialIssue(DRAFT) as { ok: true; issue: EditorialIssue }).issue;
  const html = renderEditorialEmail(issue, "https://gridtilt.com", FOOTER);
  const text = renderEditorialText(issue, "https://gridtilt.com", FOOTER);

  it("carries the subject, the preview line, each section, and each source with its date", () => {
    assert.ok(html.includes("GridTilt 00: What a power-project announcement tells you"));
    assert.ok(html.includes("A local starting point, one project record"));
    assert.ok(html.includes("Source: <a href=\"https://about.fb.com/"));
    assert.ok(html.includes("June 3, 2025"));
    assert.ok(html.includes("&lt;from&gt;"), "text is escaped");
  });

  it("has the shared footer and each per-reader hook exactly once, in HTML and text", () => {
    for (const body of [html, text]) {
      assert.equal(body.split(UNSUBSCRIBE_HOOK).length - 1, 1);
      assert.equal(body.split(SIGNED_UP_HOOK).length - 1, 1);
      assert.ok(body.includes("PO Box 1, Baltimore, MD 21201"));
    }
    assert.ok(text.includes("Source: Meta newsroom, June 3, 2025: https://about.fb.com/"));
  });
});
