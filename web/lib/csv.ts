/**
 * Minimal, dependency-free CSV parser for client-side file imports.
 *
 * - Auto-detects the delimiter (`,`, `;` or TAB) from the first line — Italian
 *   Excel exports commonly use `;` (the comma is the decimal separator there).
 * - Handles quoted fields, escaped quotes (`""`) and CRLF/LF line endings; strips a
 *   leading BOM. Fully-empty rows are dropped.
 *
 * Returns a matrix of rows × cells (all trimmed by the caller as needed).
 */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const delim = detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      pushField();
    } else if (c === '\n') {
      pushRow();
    } else if (c === '\r') {
      // ignore — the following \n terminates the row
    } else {
      field += c;
    }
  }
  // Flush a trailing field/row that has no terminating newline.
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Pick the delimiter most frequent on the first line (defaults to comma). */
function detectDelimiter(text: string): string {
  const nl = text.search(/\r?\n/);
  const firstLine = nl >= 0 ? text.slice(0, nl) : text;
  let best = ',';
  let bestCount = -1;
  for (const d of [',', ';', '\t']) {
    const count = firstLine.split(d).length - 1;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}
