import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFredCsv } from "../physical";

test("parseFredCsv reads FRED's two-column format and skips gaps", () => {
  const csv = [
    "DATE,IPG2211A2N",
    "2024-01-01,108.42",
    "2024-02-01,.", // FRED encodes missing data as '.'
    "2024-03-01,95.01",
    "", // trailing blank line
  ].join("\n");
  const points = parseFredCsv(csv);
  assert.deepEqual(points, [
    { month: "2024-01", value: 108.42 },
    { month: "2024-03", value: 95.01 },
  ]);
});

test("parseFredCsv returns empty for a header-only file", () => {
  assert.deepEqual(parseFredCsv("DATE,IPG2211A2N\n"), []);
});
