/**
 * Markdown (GFM) tables: inserting one, and Tab / Shift+Tab between cells,
 * which also re-aligns the columns so the source stays readable.
 * Pure helpers returning editor edits (see utils/markdown.js).
 */
import { diffEdit } from "./lists";

const isTableLine = (line) => /^\s*\|/.test(line);
const isSeparatorCell = (cell) => /^:?-{1,}:?$/.test(cell.trim());

/** Split a row into trimmed cells, honouring escaped pipes (\|). */
export function splitRow(line) {
  let body = line.trim();
  if (body.startsWith("|")) body = body.slice(1);
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1);
  const cells = [];
  let current = "";
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === "\\" && body[i + 1] === "|") {
      current += "\\|";
      i += 1;
    } else if (body[i] === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += body[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Markdown for an empty table with `cols` columns and `rows` body rows. */
export function tableMarkdown(cols, rows) {
  const headers = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`);
  const width = Math.max(...headers.map((h) => h.length));
  const pad = (s) => s.padEnd(width);
  const line = (cells) => `| ${cells.map(pad).join(" | ")} |`;
  return [
    line(headers),
    line(headers.map(() => "-".repeat(width))),
    ...Array.from({ length: rows }, () => line(headers.map(() => ""))),
  ].join("\n");
}

/** Insert a table on its own lines at the caret, selecting the first header. */
export function insertTable(value, selStart, selEnd, cols, rows) {
  const before = value.slice(0, selStart);
  const after = value.slice(selEnd);
  const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = after.startsWith("\n\n") || after === "" ? "\n" : after.startsWith("\n") ? "\n" : "\n\n";
  const table = tableMarkdown(cols, rows);
  const text = lead + table + trail;
  const first = selStart + lead.length + 2; // after "| "
  return { start: selStart, end: selEnd, text, selStart: first, selEnd: first + "Column 1".length };
}

/** Rebuild table rows with padded, aligned columns. */
export function formatRows(rows) {
  const cols = Math.max(...rows.map((r) => r.cells.length));
  const cells = rows.map((r) => [...r.cells, ...Array(cols - r.cells.length).fill("")]);
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.max(3, ...cells.filter((_, i) => !rows[i].separator).map((row) => row[c].length)),
  );
  return cells.map((row, i) => {
    const out = row.map((cell, c) => {
      if (!rows[i].separator) return cell.padEnd(widths[c]);
      const left = cell.trim().startsWith(":");
      const right = cell.trim().endsWith(":");
      const dashes = "-".repeat(widths[c] - (left ? 1 : 0) - (right ? 1 : 0));
      return `${left ? ":" : ""}${dashes}${right ? ":" : ""}`;
    });
    return { text: `${rows[i].indent}| ${out.join(" | ")} |`, cells: row, widths };
  });
}

/**
 * Tab / Shift+Tab inside a table: move to the next / previous cell and select
 * its text. Tab in the last cell adds a row. Returns null outside tables.
 */
export function tableTab(value, selStart, backwards) {
  const lines = value.split("\n");
  const offsets = [];
  let pos = 0;
  for (const l of lines) {
    offsets.push(pos);
    pos += l.length + 1;
  }
  let row = offsets.length - 1;
  while (row > 0 && offsets[row] > selStart) row -= 1;
  if (!isTableLine(lines[row])) return null;

  let first = row;
  let last = row;
  while (first > 0 && isTableLine(lines[first - 1])) first -= 1;
  while (last < lines.length - 1 && isTableLine(lines[last + 1])) last += 1;

  const indent = lines[first].match(/^\s*/)[0];
  const rows = lines.slice(first, last + 1).map((line) => {
    const cells = splitRow(line);
    return { cells, indent, separator: cells.every(isSeparatorCell) };
  });

  // Which cell is the caret in? Count unescaped pipes before it.
  const before = lines[row].slice(0, selStart - offsets[row]).replace(/\\\|/g, "");
  const pipes = (before.match(/\|/g) || []).length;
  const col = Math.max(0, pipes - 1);

  const cols = Math.max(...rows.map((r) => r.cells.length));
  const order = [];
  rows.forEach((r, ri) => {
    if (!r.separator) for (let c = 0; c < cols; c += 1) order.push([ri, c]);
  });
  const here = order.findIndex(([ri, c]) => ri === row - first && c === Math.min(col, cols - 1));
  let target = order[here + (backwards ? -1 : 1)];
  if (!target) {
    if (backwards) target = order[0];
    else {
      rows.push({ cells: Array(cols).fill(""), indent, separator: false });
      target = [rows.length - 1, 0];
    }
  }

  const formatted = formatRows(rows);
  const newLines = [...lines.slice(0, first), ...formatted.map((f) => f.text), ...lines.slice(last + 1)];
  const after = newLines.join("\n");

  const [tr, tc] = target;
  const lineStart = newLines.slice(0, first + tr).reduce((sum, l) => sum + l.length + 1, 0);
  const { widths, cells } = formatted[tr];
  const cellStart = lineStart + indent.length + 2 + widths.slice(0, tc).reduce((sum, w) => sum + w + 3, 0);
  return diffEdit(value, after, cellStart, cellStart + cells[tc].length);
}
