/** The explainers' files: H.264 with sound, index first, poster, captions and https sources. */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPLAINERS } from "../../data/explainers";

const onDisk = (f: string) => join(process.cwd(), "client", "public", f);

describe("explainer files", () => {
  it("there are three, each with a poster, captions and sources over https", () => {
    assert.equal(EXPLAINERS.length, 3);
    for (const e of EXPLAINERS) {
      assert.ok(existsSync(onDisk(e.poster)), e.poster);
      assert.ok(readFileSync(onDisk(e.captions), "utf-8").startsWith("WEBVTT"), e.captions);
      assert.ok(e.sources.length > 0, e.id);
      for (const s of e.sources) assert.ok(s.url.startsWith("https://"), s.url);
    }
  });

  it("every video is H.264 with sound and its index first, so it starts while downloading", () => {
    for (const e of EXPLAINERS) {
      const buf = readFileSync(onDisk(e.video));
      assert.ok(buf.includes("avc1"), e.video);
      assert.ok(buf.includes("soun"), e.video);
      assert.ok(buf.indexOf("moov") < buf.indexOf("mdat"), e.video);
    }
  });
});
