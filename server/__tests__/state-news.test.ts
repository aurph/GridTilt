/**
 * The judgement in state-news.ts is the relevance filter. Google News honors
 * a scoped query loosely, so the fixtures below are real titles pulled from
 * live per-state feeds on 2026-09-22, including the ones that must be
 * dropped. A loose filter here does not corrupt a data file (this module
 * writes nothing), but it does put a press-release index on the page under
 * a heading that promises grid news.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  STATE_NAMES,
  buildStateNewsItems,
  isPlausiblyLocal,
  isStateNewsRelevant,
  splitHeadlineSource,
  stateNewsUrl,
  statesMentioned,
  type RawFeedItem,
} from "../state-news";

describe("stateNewsUrl", () => {
  it("builds a query naming the state and the recency window", () => {
    const url = stateNewsUrl("MD")!;
    assert.ok(url.startsWith("https://news.google.com/rss/search?q="));
    const q = decodeURIComponent(new URL(url).searchParams.get("q")!);
    assert.ok(q.includes('"Maryland"'), q);
    assert.ok(q.includes("when:14d"), q);
  });

  it("asks for both regulator spellings, since states split between them", () => {
    const q = decodeURIComponent(new URL(stateNewsUrl("TX")!).searchParams.get("q")!);
    assert.ok(q.includes("Public Service Commission"));
    assert.ok(q.includes("Public Utility Commission"));
  });

  it("covers every state plus DC", () => {
    assert.equal(Object.keys(STATE_NAMES).length, 51);
    for (const code of Object.keys(STATE_NAMES)) {
      assert.ok(stateNewsUrl(code), `no url for ${code}`);
    }
  });

  it("accepts lowercase and rejects anything unknown", () => {
    assert.ok(stateNewsUrl("md"));
    assert.equal(stateNewsUrl("ZZ"), null);
    assert.equal(stateNewsUrl(""), null);
    assert.equal(stateNewsUrl(undefined as unknown as string), null);
  });

  it("encodes the query rather than emitting raw quotes and spaces", () => {
    const url = stateNewsUrl("NY")!;
    const rawQuery = url.split("q=")[1].split("&")[0];
    assert.ok(!rawQuery.includes(" "));
    assert.ok(!rawQuery.includes('"'));
  });
});

describe("isStateNewsRelevant", () => {
  it("keeps real grid stories", () => {
    const keep = [
      "Tarrant lawmaker plans Texas data center transparency legislation",
      "State audit raises concerns about how Ohio's utility regulator manages staff, money",
      "Maryland regulators expect more utility rate hike requests",
      "Questionable data center forecasts are driving up Ohio power bills",
      "Moore says he would 'absolutely sign' statewide data center moratorium",
    ];
    for (const t of keep) assert.ok(isStateNewsRelevant(t), `dropped: ${t}`);
  });

  it("drops the generic press index the Virginia feed actually returned", () => {
    assert.equal(isStateNewsRelevant("September Releases - Governor of Virginia"), false);
  });

  it("drops unrelated state news that the loose query lets through", () => {
    const drop = [
      "Maryland football falls to Michigan State in overtime",
      "Virginia's governor names new transportation secretary",
      "Texas high school rankings released",
    ];
    for (const t of drop) assert.equal(isStateNewsRelevant(t), false, `kept: ${t}`);
  });

  it("is case insensitive", () => {
    assert.ok(isStateNewsRelevant("OHIO POWER PLANT RETIRES"));
  });
});

describe("splitHeadlineSource", () => {
  it("splits Google News 'Headline - Publisher' form", () => {
    const { headline, source } = splitHeadlineSource(
      "Abbott slaps halt on Texas data center permits - Politico",
    );
    assert.equal(headline, "Abbott slaps halt on Texas data center permits");
    assert.equal(source, "Politico");
  });

  it("splits on the last separator, so hyphenated headlines survive", () => {
    const { headline, source } = splitHeadlineSource(
      "Data centers - and the grid - face a reckoning - Canary Media",
    );
    assert.equal(headline, "Data centers - and the grid - face a reckoning");
    assert.equal(source, "Canary Media");
  });

  it("returns a null source when there is no separator to trust", () => {
    const { headline, source } = splitHeadlineSource("A headline with no publisher");
    assert.equal(headline, "A headline with no publisher");
    assert.equal(source, null);
  });
});

describe("statesMentioned", () => {
  it("does not read West Virginia as Virginia", () => {
    assert.deepEqual(statesMentioned("West Virginia utility rate case"), ["West Virginia"]);
  });

  it("still finds Virginia on its own", () => {
    assert.deepEqual(statesMentioned("Virginia data center backlash"), ["Virginia"]);
  });

  it("keeps the other multi-word pairs apart", () => {
    assert.deepEqual(statesMentioned("North Carolina grid plan"), ["North Carolina"]);
    assert.deepEqual(statesMentioned("New York utility bills"), ["New York"]);
  });

  it("treats Washington DC as federal, not Washington state", () => {
    assert.deepEqual(statesMentioned("Washington, D.C. regulators weigh utility rules"), []);
    assert.deepEqual(statesMentioned("Washington state utility commission acts"), ["Washington"]);
  });

  it("finds nothing in a headline that names no state", () => {
    assert.deepEqual(statesMentioned("Baltimore County Council votes on data center moratorium"), []);
  });

  it("does not match a state name buried inside another word", () => {
    assert.deepEqual(statesMentioned("Indianapolis grid upgrade"), []);
  });
});

describe("isPlausiblyLocal", () => {
  it("drops the Arizona story the Vermont feed actually returned", () => {
    assert.equal(
      isPlausiblyLocal("The Trump Administration's Actions Are Increasing Utility Bills in Arizona", "Vermont"),
      false,
    );
  });

  it("keeps a local story that never names the state", () => {
    // Both are real: neither headline contains its own state's name.
    assert.ok(isPlausiblyLocal("Baltimore County Council To Vote On Extending Data Center Moratorium", "Maryland"));
    assert.ok(isPlausiblyLocal("City of Torrington Addresses Increase in Electric Transmission Costs", "Wyoming"));
  });

  it("keeps a story that names this state alongside another", () => {
    assert.ok(isPlausiblyLocal("Maryland and Virginia regulators jointly review grid costs", "Maryland"));
  });

  it("does not drop Virginia coverage for naming West Virginia", () => {
    assert.ok(isPlausiblyLocal("West Virginia grid plan", "West Virginia"));
  });
});

function item(title: string, extra: Partial<RawFeedItem> = {}): RawFeedItem {
  return { title, link: `https://example.com/${encodeURIComponent(title)}`, ...extra };
}

describe("buildStateNewsItems", () => {
  it("drops irrelevant entries and keeps the real ones", () => {
    const out = buildStateNewsItems([
      item("September Releases - Governor of Virginia"),
      item("Virginia data center backlash spills into midterms - Virginia Mercury"),
    ], "Virginia");
    assert.equal(out.length, 1);
    assert.equal(out[0].source, "Virginia Mercury");
  });

  it("drops another state's story out of a thin state's feed", () => {
    const out = buildStateNewsItems([
      item("The Trump Administration's Actions Are Increasing Utility Bills in Arizona - CAP"),
      item("Green Mountain Power's resilience projects reduce Vermont outages - DEI"),
    ], "Vermont");
    assert.equal(out.length, 1);
    assert.match(out[0].headline, /Vermont/);
  });

  it("leads with headlines that name the state", () => {
    const out = buildStateNewsItems([
      item("Regional grid operator weighs new nuclear - RTO", { isoDate: "2026-09-22T00:00:00Z" }),
      item("Vermont utility bills rise - VTDigger", { isoDate: "2026-09-01T00:00:00Z" }),
    ], "Vermont");
    // The Vermont story is older but is the one actually about this state.
    assert.match(out[0].headline, /Vermont/);
  });

  it("deduplicates repeats of the same story", () => {
    const out = buildStateNewsItems([
      item("Maryland regulators expect more utility rate hike requests - WTOP"),
      item("Maryland regulators expect more utility rate hike requests - The Cool Down"),
    ], "Maryland");
    assert.equal(out.length, 1);
  });

  it("sorts newest first within a tier", () => {
    const out = buildStateNewsItems([
      item("Older Ohio grid story - A", { isoDate: "2026-09-01T00:00:00Z" }),
      item("Newer Ohio grid story - B", { isoDate: "2026-09-20T00:00:00Z" }),
    ], "Ohio");
    assert.deepEqual(out.map((i) => i.source), ["B", "A"]);
  });

  it("sinks undated items instead of letting them lead", () => {
    const out = buildStateNewsItems([
      item("Undated Ohio grid story - A", { isoDate: "not-a-date" }),
      item("Dated Ohio grid story - B", { isoDate: "2026-09-20T00:00:00Z" }),
    ], "Ohio");
    assert.equal(out[0].source, "B");
  });

  it("caps the list so one state cannot flood the card", () => {
    const many = Array.from({ length: 40 }, (_, i) => item(`Grid story number ${i} - Source${i}`));
    assert.equal(buildStateNewsItems(many, "Ohio").length, 12);
  });

  it("returns an empty list rather than throwing on junk input", () => {
    assert.deepEqual(buildStateNewsItems([], "Ohio"), []);
    assert.deepEqual(buildStateNewsItems([{ title: "" }, {}], "Ohio"), []);
    assert.deepEqual(buildStateNewsItems(undefined as unknown as RawFeedItem[], "Ohio"), []);
  });

  it("falls back to the guid when an item carries no link", () => {
    const out = buildStateNewsItems([{ title: "Grid story - S", guid: "urn:x" }], "Ohio");
    assert.equal(out[0].url, "urn:x");
  });

  it("does not leak the internal ranking flag into the payload", () => {
    const out = buildStateNewsItems([item("Ohio grid story - S")], "Ohio");
    assert.deepEqual(Object.keys(out[0]).sort(), ["headline", "publishedAt", "source", "url"]);
  });
});
