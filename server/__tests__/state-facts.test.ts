// The server's copy of the state and NERC area tables matches the client's,
// so the state share card says what My Grid says for the same state.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STATE_GRID, STATE_GRID_SOURCE as CLIENT_GRID_SOURCE } from "../../client/src/data/state-grid";
import {
  NERC_AREAS as CLIENT_AREAS,
  REGION_AREAS as CLIENT_REGIONS,
  STATE_NERC_AREA as CLIENT_STATE_AREA,
  STATE_NERC_NOTE as CLIENT_STATE_NOTE,
  NERC_LTRA as CLIENT_LTRA,
} from "../../client/src/data/nerc-reserve-margins";
import { areaForState as clientAreaForState, cushion as clientCushion } from "../../client/src/lib/reserve-margins";
import { NERC_AREAS, NERC_LTRA, REGION_AREAS, STATES, STATE_GRID_SOURCE, STATE_NERC_AREA, STATE_NERC_NOTE, areaForState, cushion } from "../state-facts";

describe("state facts (server copy)", () => {
  it("covers every state My Grid covers, with the same name, region, operator and note", () => {
    assert.deepEqual(Object.keys(STATES).sort(), Object.keys(STATE_GRID).sort());
    for (const [code, s] of Object.entries(STATE_GRID)) {
      assert.deepEqual(STATES[code], { name: s.name, region: s.region, operatorLabel: s.operatorLabel, ...(s.note ? { note: s.note } : {}) }, code);
    }
  });

  it("carries the same NERC areas, region map and state assignments", () => {
    assert.deepEqual(Object.keys(NERC_AREAS).sort(), Object.keys(CLIENT_AREAS).sort());
    for (const [key, a] of Object.entries(CLIENT_AREAS)) {
      const mine = NERC_AREAS[key];
      assert.equal(mine.key, a.key);
      assert.equal(mine.label, a.label);
      assert.equal(mine.season, a.season);
      assert.equal(mine.margin, a.margin);
      assert.equal(mine.reference, a.reference);
      assert.equal(Boolean(mine.referenceDefault), Boolean(a.referenceDefault), key);
      assert.equal(mine.risk, a.risk);
      assert.equal(mine.outlook, a.outlook, key);
    }
    assert.deepEqual(REGION_AREAS, CLIENT_REGIONS);
    assert.deepEqual(STATE_NERC_AREA, CLIENT_STATE_AREA);
    assert.deepEqual(STATE_NERC_NOTE, CLIENT_STATE_NOTE);
    // The card prints the label and dates itself from published: all of it must match.
    assert.deepEqual({ ...NERC_LTRA }, { ...CLIENT_LTRA });
    assert.equal(STATE_GRID_SOURCE, CLIENT_GRID_SOURCE);
  });

  it("assigns every state the same area, or none, with the same cushion", () => {
    for (const code of Object.keys(STATE_GRID)) {
      const client = clientAreaForState(code);
      const server = areaForState(code);
      assert.equal(server?.key ?? null, client?.key ?? null, code);
      if (client && server) assert.equal(cushion(server), clientCushion(client), code);
    }
    assert.equal(areaForState("MD")?.key, "PJM");
    assert.equal(areaForState("AK"), null);
    assert.equal(areaForState("ZZ"), null);
  });
});
