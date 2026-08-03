import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  blendedPrice,
  buildInferencePriceView,
  readInferencePrices,
  validateInferencePrices,
} from "../inference-prices";

describe("readInferencePrices", () => {
  test("the shipped registry loads and validates", () => {
    const registry = readInferencePrices();
    assert.ok(registry.models.length >= 3);
    assert.ok(registry.labs.length >= 1);
    assert.ok(registry.sources.length >= 1);
  });

  test("every price carries an https source read on a real date", () => {
    const registry = readInferencePrices();
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    for (const model of registry.models) {
      const source = byId.get(model.sourceId);
      assert.ok(source, `model ${model.id} has a resolvable source`);
      assert.match(source!.url, /^https:\/\//);
      assert.match(source!.accessedAt, /^20\d\d-\d\d-\d\d$/);
    }
  });

  test("every trajectory point is dated, priced, and cited", () => {
    const registry = readInferencePrices();
    const byId = new Map(registry.sources.map((s) => [s.id, s]));
    assert.ok(registry.trajectory.points.length >= 3);
    for (const point of registry.trajectory.points) {
      assert.match(point.date, /^20\d\d-\d\d-\d\d$/);
      assert.ok(point.inputPerMTok > 0);
      assert.ok(byId.get(point.sourceId), `trajectory point ${point.id} has a resolvable source`);
    }
  });
});

describe("blendedPrice", () => {
  test("weights input and output by the stated mix", () => {
    // 3:1 input:output of ($0.20 in, $1.20 out) = (0.6 + 1.2) / 4 = 0.45
    assert.equal(blendedPrice(0.2, 1.2, 3, 1), 0.45);
    // even mix is the plain average
    assert.equal(blendedPrice(5, 30, 1, 1), 17.5);
  });

  test("rejects a zero-sum weighting", () => {
    assert.throws(() => blendedPrice(1, 1, 0, 0), /weights/i);
  });
});

describe("buildInferencePriceView", () => {
  test("joins lab and source, computes blended, and sorts cheapest first", () => {
    const view = buildInferencePriceView(readInferencePrices());
    for (let i = 1; i < view.rows.length; i++) {
      assert.ok(view.rows[i].blendedPerMTok >= view.rows[i - 1].blendedPerMTok);
    }
    assert.equal(view.cheapestId, view.rows[0]?.id);
    assert.equal(view.priciestId, view.rows.at(-1)?.id);
    for (let i = 1; i < view.trajectory.points.length; i++) {
      assert.ok(view.trajectory.points[i].date >= view.trajectory.points[i - 1].date, "trajectory sorted by date");
    }
    for (const row of view.rows) {
      assert.ok(row.labName, "row has a joined lab name");
      assert.ok(row.source.url, "row has a joined source");
    }
  });
});

describe("validateInferencePrices", () => {
  const base = () => ({
    asOf: "2026-07-30",
    methodology: "Test.",
    blendRatioInput: 3,
    blendRatioOutput: 1,
    labs: [{ id: "openai", name: "OpenAI", color: "#f07800" }],
    sources: [{ id: "src", publisher: "OpenAI", title: "Pricing", url: "https://example.com/p", publishedAt: "2026-07-30", accessedAt: "2026-07-30", locator: "row" }],
    models: [{ id: "m1", labId: "openai", name: "Model One", tier: "flagship", inputPerMTok: 5, outputPerMTok: 30, sourceId: "src" }],
    trajectory: { metric: "input $/M at release", note: "milestones", points: [{ id: "t1", name: "Model One", tier: "flagship", date: "2023-03-14", inputPerMTok: 30, sourceId: "src" }] },
    events: [],
  });

  test("accepts a well-formed registry", () => {
    assert.doesNotThrow(() => validateInferencePrices(base()));
  });

  test("rejects a model referencing a missing source", () => {
    const bad = base();
    bad.models[0].sourceId = "nope";
    assert.throws(() => validateInferencePrices(bad), /missing source/i);
  });

  test("rejects an unknown tier", () => {
    const bad = base();
    (bad.models[0] as { tier: string }).tier = "budget";
    assert.throws(() => validateInferencePrices(bad), /invalid tier/i);
  });

  test("rejects a negative price", () => {
    const bad = base();
    bad.models[0].inputPerMTok = -1;
    assert.throws(() => validateInferencePrices(bad), /invalid input price/i);
  });

  test("rejects a non-https source", () => {
    const bad = base();
    bad.sources[0].url = "http://example.com/p";
    assert.throws(() => validateInferencePrices(bad), /https/i);
  });

  test("rejects an event dated after asOf", () => {
    const bad = base();
    bad.events = [{ id: "e1", date: "2026-08-01", headline: "Future.", sourceIds: ["src"] }];
    assert.throws(() => validateInferencePrices(bad), /invalid date/i);
  });

  test("rejects a trajectory point referencing a missing source", () => {
    const bad = base();
    bad.trajectory.points[0].sourceId = "ghost";
    assert.throws(() => validateInferencePrices(bad), /missing source/i);
  });
});
