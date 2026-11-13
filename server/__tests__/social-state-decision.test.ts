// Tuesday's post: the newest dated decision on a published state page. Locks
// the copy character for character, the reasons it skips, and that the row it
// picks from the shipped registry fits a post.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildStateDecisionPost, type StateDecisionInput } from "../social-format";
import { latestStateDecision, type CuratedStateLike } from "../social-data";
import { STATES } from "../state-facts";

const TODAY = "2026-11-17";
const ROW: StateDecisionInput = {
  state: "Virginia",
  slug: "virginia",
  date: "2026-10-23",
  title: "Dominion's large-load connection queue case continued after FERC ruling on PJM",
  documentUrl: "https://www.scc.virginia.gov/docketsearch/DOCS/8abc01!.PDF",
  reviewed: "2026-10-30",
};

test("the post is the state, the decision's date, its title, the document and the state page", () => {
  const r = buildStateDecisionPost(ROW, TODAY, 30);
  assert.deepEqual(r, {
    ok: true,
    text:
      "Virginia, Oct 23, 2026: Dominion's large-load connection queue case continued after FERC ruling on PJM.\n" +
      "Document: https://www.scc.virginia.gov/docketsearch/DOCS/8abc01!.PDF\n" +
      "\n" +
      "https://gridtilt.com/state/virginia",
  });
});

test("a title that already ends in a period is not doubled", () => {
  const r = buildStateDecisionPost({ ...ROW, title: "Rate case decided." }, TODAY, 30);
  assert.ok(r.ok && r.text.startsWith("Virginia, Oct 23, 2026: Rate case decided.\n"));
});

test("it skips, with the reason, rather than post from a page that is past its review", () => {
  const r = buildStateDecisionPost({ ...ROW, reviewed: "2026-10-01" }, TODAY, 30);
  assert.deepEqual(r, {
    ok: false,
    skip: "Virginia's state page review is from 2026-10-01, 47 days ago, past the 30-day limit for its rows to be posted as checked",
  });
});

test("it skips when there is no decision, a bad date, a future date, a link that is not https, or a post that would not fit", () => {
  assert.deepEqual(buildStateDecisionPost(null, TODAY, 30), { ok: false, skip: "no dated decision is on a published state page" });
  const bad = buildStateDecisionPost({ ...ROW, date: "2026-13-40" }, TODAY, 30);
  assert.ok(!bad.ok && bad.skip.includes("is not a valid day"));
  const future = buildStateDecisionPost({ ...ROW, date: "2026-11-20" }, TODAY, 30);
  assert.ok(!future.ok && future.skip.includes("after today"));
  const http = buildStateDecisionPost({ ...ROW, documentUrl: "http://example.com/x.pdf" }, TODAY, 30);
  assert.deepEqual(http, { ok: false, skip: "the decision's document link is not https" });
  const long = buildStateDecisionPost({ ...ROW, title: "x".repeat(260) }, TODAY, 30);
  assert.ok(!long.ok && /over the 280 limit/.test(long.skip));
});

test("the newest decision wins; status snapshots and unnamed states are never picked", () => {
  const states: CuratedStateLike[] = [
    {
      code: "MD",
      slug: "maryland",
      reviewed: "2026-10-30",
      documents: [
        { date: "2026-09-14", title: "A Maryland decision", url: "https://example.org/md" },
        { kind: "status", date: "2026-11-10", title: "A newer snapshot", url: "https://example.org/snap" },
      ],
    },
    { code: "VA", slug: "virginia", reviewed: "2026-10-30", documents: [{ date: "2026-10-23", title: "A Virginia decision", url: "https://example.org/va" }] },
    { code: "ZZ", slug: "atlantis", reviewed: "2026-10-30", documents: [{ date: "2026-11-11", title: "Nowhere", url: "https://example.org/zz" }] },
  ];
  assert.deepEqual(latestStateDecision(states, STATES), {
    state: "Virginia",
    slug: "virginia",
    date: "2026-10-23",
    title: "A Virginia decision",
    documentUrl: "https://example.org/va",
    reviewed: "2026-10-30",
  });
  assert.equal(latestStateDecision([], STATES), null);
  assert.equal(latestStateDecision(undefined, STATES), null);
});

test("every decision in the shipped registry fits a post", () => {
  const root = JSON.parse(readFileSync(join(process.cwd(), "server", "data", "state-pages.json"), "utf-8")) as { states: CuratedStateLike[] };
  let checked = 0;
  for (const s of root.states) {
    for (const d of s.documents.filter((x) => (x.kind ?? "decision") === "decision")) {
      const r = buildStateDecisionPost(
        { state: STATES[s.code].name, slug: s.slug, date: d.date, title: d.title, documentUrl: d.url, reviewed: s.reviewed },
        s.reviewed,
        30,
      );
      assert.ok(r.ok, `${s.slug} ${d.date}: ${r.ok ? "" : r.skip}`);
      assert.ok(r.ok && r.text.length <= 280);
      assert.doesNotMatch(r.ok ? r.text : "", /\u2014/, "no em dash");
      checked += 1;
    }
  }
  assert.ok(checked >= 3, "the registry carries decisions to check");
  const newest = latestStateDecision(root.states, STATES);
  assert.ok(newest && root.states.some((s) => s.slug === newest.slug));
});
