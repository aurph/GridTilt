/**
 * JSON for a data file that is a header plus a long list: the header is
 * indented and readable, the list has one row per line. A refresh then shows
 * up in a diff as the rows that changed, and the file stays far smaller than
 * fully indented JSON.
 *
 * The list is written last, whatever its position in the object.
 */
export function stringifyRows(file: Record<string, unknown>, rowsKey: string): string {
  const rows = file[rowsKey];
  if (!Array.isArray(rows)) throw new Error(`${rowsKey} is not an array`);
  const head: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(file)) if (k !== rowsKey) head[k] = v;
  const headJson = JSON.stringify(head, null, 2);
  const body = rows.length === 0 ? "[]" : `[\n${rows.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]`;
  const open = headJson === "{}" ? "{\n" : `${headJson.slice(0, -2)},\n`;
  return `${open}  ${JSON.stringify(rowsKey)}: ${body}\n}\n`;
}
