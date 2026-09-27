// Minimal RFC 4180 CSV reading/writing for imports and exports (no dependency needed).

/** Parse CSV text into rows of cells. Handles quotes, escaped quotes, CRLF/LF and a UTF-8 BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Drop fully empty lines (e.g. a trailing blank line from Excel).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * One CSV cell. Values that a spreadsheet would run as a formula (=, +, -, @, tab, CR) get a
 * leading apostrophe, so opening an export in Excel/Sheets can't execute injected formulas.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV text (with BOM so Excel reads UTF-8 correctly) from a header and rows. */
export function toCsv(header: string[], rows: unknown[][]): string {
  return "\uFEFF" + [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** CSV from an array of objects, columns taken from the union of keys (first-seen order). */
export function objectsToCsv(rows: Record<string, unknown>[]): string {
  const header: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        header.push(k);
      }
    }
  }
  return toCsv(header, rows.map((r) => header.map((k) => r[k])));
}
