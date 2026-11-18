// ─── A small .xlsx reader ───────────────────────────────────────────────────
//
// Just enough to read one sheet of a published workbook as rows of text: the
// zip container (stored or deflated entries), shared strings, and the cells of
// a sheet in their columns. Used by scripts/ingest-power-plants.ts to read
// EIA-860M, which EIA publishes only as .xlsx.
//
// Why not a library: the common ones carry open advisories, and CI fails the
// build on a new high advisory (`npm audit`). A workbook is a zip of XML, and
// Node already has the inflater.
//
// Not supported, on purpose: ZIP64, encryption, styles, dates as dates (a
// cell's stored value is returned as text), formulas (their cached value is
// returned). A file that needs any of these throws instead of reading wrong.

import { inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  /** 0 = stored, 8 = deflated. */
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** The entries of a zip, from its central directory. */
export function listZipEntries(buf: Buffer): ZipEntry[] {
  // The end record is the last 22 bytes plus an optional comment (64 KB at most).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory record; truncated?)");
  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new Error("ZIP64 archives are not supported");

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL_SIG) throw new Error("not a zip file (bad central directory; truncated?)");
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const uncompressedSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localHeaderOffset = buf.readUInt32LE(p + 42);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) throw new Error("ZIP64 archives are not supported");
    const name = buf.toString("utf-8", p + 46, p + 46 + nameLen);
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** One entry's bytes, inflated when needed and checked against its declared size. */
export function readZipEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const p = entry.localHeaderOffset;
  if (p + 30 > buf.length || buf.readUInt32LE(p) !== LOCAL_SIG) throw new Error(`zip entry ${entry.name}: bad local header`);
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const body = buf.subarray(start, start + entry.compressedSize);
  let out: Buffer;
  if (entry.method === 0) out = Buffer.from(body);
  else if (entry.method === 8) out = inflateRawSync(body);
  else throw new Error(`zip entry ${entry.name}: compression method ${entry.method} is not supported`);
  if (out.length !== entry.uncompressedSize) {
    throw new Error(`zip entry ${entry.name}: size ${out.length} does not match the declared ${entry.uncompressedSize}`);
  }
  return out;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function unescapeXml(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, ref: string) => {
    if (ref.startsWith("#x")) return String.fromCodePoint(parseInt(ref.slice(2), 16));
    if (ref.startsWith("#")) return String.fromCodePoint(parseInt(ref.slice(1), 10));
    return ENTITIES[ref] ?? whole;
  });
}

/** Every `<t>` run inside a fragment, joined (rich text is several runs). */
function textRuns(fragment: string): string {
  let out = "";
  const re = /<t(?:\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/t>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment))) out += m[1] ?? "";
  return unescapeXml(out);
}

/** xl/sharedStrings.xml as an array, in index order. */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const re = /<si(?:\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(textRuns(m[1] ?? ""));
  return out;
}

/** "AB12" -> 27: the zero-based column of a cell reference. */
export function columnIndex(ref: string): number {
  let n = 0;
  for (let i = 0; i < ref.length; i++) {
    const c = ref.charCodeAt(i);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

/**
 * The rows of a sheet, each an array indexed by column: text for a cell with
 * a value, null for a gap. An empty row is an empty array, so row numbers
 * stay meaningful to the caller.
 */
export function* sheetRows(xml: string, shared: string[]): Generator<(string | null)[]> {
  // Attributes are matched lazily so a self-closing <row .../> is not read as
  // an opening tag (which would swallow the next row as its body).
  const rowRe = /<row(?:\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/row>)/g;
  const cellRe = /<c(\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/c>)/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const row: (string | null)[] = [];
    const inner = rm[1];
    if (inner) {
      cellRe.lastIndex = 0;
      let cm: RegExpExecArray | null;
      let next = 0;
      while ((cm = cellRe.exec(inner))) {
        const attrs = cm[1] ?? "";
        const ref = /\br="([A-Z]+)\d+"/.exec(attrs);
        const col = ref ? columnIndex(ref[1]) : next;
        next = col + 1;
        const body = cm[2];
        if (body === undefined) continue;
        const type = /\bt="([a-zA-Z]+)"/.exec(attrs)?.[1] ?? "n";
        let value: string | null = null;
        if (type === "inlineStr") {
          value = textRuns(body);
        } else {
          const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body);
          if (v) {
            if (type === "s") {
              const s = shared[Number(v[1])];
              if (s === undefined) throw new Error(`sheet cell refers to shared string ${v[1]}, which does not exist`);
              value = s;
            } else {
              value = unescapeXml(v[1]);
            }
          }
        }
        if (value === null) continue;
        while (row.length < col) row.push(null);
        row[col] = value;
      }
    }
    yield row;
  }
}

/** The rows of the sheet with this tab name. */
export function* readSheetRows(xlsx: Buffer, sheetName: string): Generator<(string | null)[]> {
  const entries = listZipEntries(xlsx);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const text = (name: string): string => {
    const e = byName.get(name);
    if (!e) throw new Error(`workbook has no ${name}`);
    return readZipEntry(xlsx, e).toString("utf-8");
  };

  const tabs = new Map<string, string>();
  const sheetRe = /<sheet\s([^>]*)\/?>/g;
  const workbook = text("xl/workbook.xml");
  let m: RegExpExecArray | null;
  while ((m = sheetRe.exec(workbook))) {
    const name = /\bname="([^"]*)"/.exec(m[1])?.[1];
    const rid = /\br:id="([^"]*)"/.exec(m[1])?.[1];
    if (name && rid) tabs.set(unescapeXml(name), rid);
  }
  const rid = tabs.get(sheetName);
  if (!rid) throw new Error(`workbook has no sheet named ${sheetName}; it has ${Array.from(tabs.keys()).join(", ")}`);

  const rels = text("xl/_rels/workbook.xml.rels");
  let target: string | null = null;
  const relRe = /<Relationship\s([^>]*)\/?>/g;
  while ((m = relRe.exec(rels))) {
    if (/\bId="([^"]*)"/.exec(m[1])?.[1] === rid) target = /\bTarget="([^"]*)"/.exec(m[1])?.[1] ?? null;
  }
  if (!target) throw new Error(`workbook relationship ${rid} for sheet ${sheetName} is missing`);
  const path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;

  const shared = byName.has("xl/sharedStrings.xml") ? parseSharedStrings(text("xl/sharedStrings.xml")) : [];
  const rows = sheetRows(text(path), shared);
  for (let step = rows.next(); !step.done; step = rows.next()) yield step.value;
}
