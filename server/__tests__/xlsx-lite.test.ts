// The spreadsheet reader behind the EIA-860M ingest. It has to find a sheet by
// its tab name, follow shared strings, keep cells in their columns when a row
// skips some, and refuse a file it cannot read rather than return half of it.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { columnIndex, listZipEntries, parseSharedStrings, readSheetRows, readZipEntry, sheetRows, unescapeXml } from "../xlsx-lite";

/** A minimal zip writer for fixtures: stored or deflated entries, no ZIP64. */
function makeZip(files: Array<{ name: string; data: string; store?: boolean }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf-8");
    const raw = Buffer.from(f.data, "utf-8");
    const body = f.store ? raw : deflateRawSync(raw);
    const method = f.store ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    // An extra field on the local header only: readers must skip it.
    const extra = Buffer.from([0xfe, 0xca, 0x02, 0x00, 0x00, 0x00]);
    local.writeUInt16LE(extra.length, 28);
    locals.push(local, name, extra, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + extra.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const WORKBOOK = `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
<sheet name="Notes" sheetId="1" r:id="rId1"/><sheet name="Operating" sheetId="2" r:id="rId2"/></sheets></workbook>`;
const RELS = `<?xml version="1.0"?><Relationships>
<Relationship Id="rId1" Type="x/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="x/worksheet" Target="/xl/worksheets/sheet2.xml"/></Relationships>`;
const SHARED = `<sst><si><t>Plant ID</t></si><si><t xml:space="preserve">Plant Name </t></si><si><r><t>Comanche </t></r><r><t>Peak &amp; Co</t></r></si><si><t/></si></sst>`;
const SHEET2 = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Lat</t></is></c></row>
<row r="2"><c r="A2"><v>6145</v></c><c r="B2" t="s"><v>2</v></c><c r="C2"/><c r="D2"><v>32.298</v></c><c r="E2" t="str"><v>a &lt; b</v></c></row>
<row r="3"/>
<row r="4"><c r="D4"><v>-1.5E-2</v></c></row>
</sheetData></worksheet>`;

function workbook(): Buffer {
  return makeZip([
    { name: "[Content_Types].xml", data: "<Types/>", store: true },
    { name: "xl/workbook.xml", data: WORKBOOK },
    { name: "xl/_rels/workbook.xml.rels", data: RELS },
    { name: "xl/sharedStrings.xml", data: SHARED },
    { name: "xl/worksheets/sheet1.xml", data: "<worksheet><sheetData><row r=\"1\"><c r=\"A1\" t=\"inlineStr\"><is><t>wrong sheet</t></is></c></row></sheetData></worksheet>" },
    { name: "xl/worksheets/sheet2.xml", data: SHEET2 },
  ]);
}

describe("zip container", () => {
  it("lists entries and reads stored and deflated bodies, skipping local extra fields", () => {
    const zip = workbook();
    const entries = listZipEntries(zip);
    assert.deepEqual(entries.map((e) => e.name), [
      "[Content_Types].xml",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/sharedStrings.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ]);
    assert.equal(readZipEntry(zip, entries[0]).toString("utf-8"), "<Types/>");
    assert.equal(readZipEntry(zip, entries[3]).toString("utf-8"), SHARED);
  });

  it("refuses a buffer that is not a zip, and a truncated one", () => {
    assert.throws(() => listZipEntries(Buffer.from("not a zip at all, just text")), /not a zip/i);
    const zip = workbook();
    assert.throws(() => listZipEntries(zip.subarray(0, zip.length - 30)), /not a zip|truncated/i);
  });

  it("refuses a body whose length does not match its header", () => {
    const zip = workbook();
    const entry = { ...listZipEntries(zip)[3], uncompressedSize: 5 };
    assert.throws(() => readZipEntry(zip, entry), /size/i);
  });
});

describe("sheet XML", () => {
  it("turns a cell reference into a zero-based column", () => {
    assert.equal(columnIndex("A1"), 0);
    assert.equal(columnIndex("Z9"), 25);
    assert.equal(columnIndex("AA10"), 26);
    assert.equal(columnIndex("AK28484"), 36);
  });

  it("unescapes the five XML entities and numeric references", () => {
    assert.equal(unescapeXml("a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos; &#233; &#x41;"), "a & b <c> \"d\" 'e' é A");
  });

  it("reads shared strings, joining rich-text runs and keeping empty ones", () => {
    assert.deepEqual(parseSharedStrings(SHARED), ["Plant ID", "Plant Name ", "Comanche Peak & Co", ""]);
  });

  it("keeps each cell in its column, with shared, inline, formula and numeric values", () => {
    const rows = Array.from(sheetRows(SHEET2, parseSharedStrings(SHARED)));
    assert.deepEqual(rows, [
      ["Plant ID", "Plant Name ", null, "Lat"],
      ["6145", "Comanche Peak & Co", null, "32.298", "a < b"],
      [],
      [null, null, null, "-1.5E-2"],
    ]);
  });
});

describe("readSheetRows", () => {
  it("finds the sheet by its tab name through the workbook relationships", () => {
    const rows = Array.from(readSheetRows(workbook(), "Operating"));
    assert.equal(rows[0][0], "Plant ID");
    assert.equal(rows[1][1], "Comanche Peak & Co");
    assert.equal(Array.from(readSheetRows(workbook(), "Notes"))[0][0], "wrong sheet");
  });

  it("names the tabs it does have when asked for one it does not", () => {
    assert.throws(() => Array.from(readSheetRows(workbook(), "Retired")), /Retired.*Notes, Operating/);
  });
});
