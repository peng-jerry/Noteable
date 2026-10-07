/**
 * List editing: Tab / Shift+Tab nesting and renumbering of numbered lists.
 *
 * Like the other editor helpers these are pure: they take the textarea's
 * (value, selStart, selEnd) and return an edit { start, end, text, selStart,
 * selEnd } (see utils/markdown.js), or null when the key should behave
 * normally.
 */

// Nested items are indented 4 spaces: deep enough to sit under both "- " and
// "10. " parents in CommonMark, and never deep enough to become a code block
// (indentList never goes more than one level below the item above).
export const INDENT = "    ";

const ITEM = /^(\s*)([-*+]|(\d+)([.)]))( \[[ xX]\])?( +|$)/;

/** Parse a list item line, or null if the line isn't one. */
export function parseItem(line) {
  const m = line.match(ITEM);
  if (!m) return null;
  return {
    indent: m[1].length,
    marker: m[2],
    number: m[3] ? Number(m[3]) : null,
    task: Boolean(m[5]),
    prefixLength: m[0].length,
  };
}

/** Text → lines with the start offset of each. */
function splitLines(value) {
  const lines = value.split("\n");
  const offsets = [];
  let pos = 0;
  for (const line of lines) {
    offsets.push(pos);
    pos += line.length + 1;
  }
  return { lines, offsets };
}

function lineOf(offsets, pos) {
  let i = offsets.length - 1;
  while (i > 0 && offsets[i] > pos) i -= 1;
  return i;
}

/**
 * The smallest edit that turns `before` into `after`, with the selection
 * given in `after` coordinates. Keeping it small preserves undo history.
 */
export function diffEdit(before, after, selStart, selEnd) {
  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before[p] === after[p]) p += 1;
  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s += 1;
  return { start: p, end: before.length - s, text: after.slice(p, after.length - s), selStart, selEnd };
}

/** Indices [first, last] of the run of list lines around `index` (blank lines end it). */
function listBlock(lines, index) {
  const inList = (i) => i >= 0 && i < lines.length && lines[i].trim() !== "" && (parseItem(lines[i]) || /^\s+\S/.test(lines[i]));
  let first = index;
  let last = index;
  while (inList(first - 1)) first -= 1;
  while (inList(last + 1)) last += 1;
  return [first, last];
}

/**
 * Renumber the numbered items in the list block around `index`, in place.
 * Each nesting level counts on its own: the top level keeps its starting
 * number, deeper levels restart at 1 (shown as a. / i. in the preview).
 */
export function renumberBlock(lines, index) {
  if (index < 0 || index >= lines.length || !lines[index].trim()) return lines;
  const [first, last] = listBlock(lines, index);
  const stack = []; // { indent, numbered, count }
  for (let i = first; i <= last; i += 1) {
    const item = parseItem(lines[i]);
    if (!item) continue; // wrapped continuation text
    while (stack.length && stack[stack.length - 1].indent > item.indent) stack.pop();
    const top = stack[stack.length - 1];
    let expected = null;
    if (top && top.indent === item.indent) {
      if (item.number === null) {
        stack[stack.length - 1] = { indent: item.indent, numbered: false };
      } else if (!top.numbered) {
        stack[stack.length - 1] = { indent: item.indent, numbered: true, count: item.number };
      } else {
        top.count += 1;
        expected = top.count;
      }
    } else if (item.number === null) {
      stack.push({ indent: item.indent, numbered: false });
    } else {
      const start = stack.length === 0 ? item.number : 1;
      stack.push({ indent: item.indent, numbered: true, count: start });
      expected = start;
    }
    if (expected !== null && expected !== item.number) {
      lines[i] = lines[i].replace(/^(\s*)\d+/, `$1${expected}`);
    }
  }
  return lines;
}

/** Map a column on a line whose start changed length by `delta`. */
const shiftCol = (col, delta, length) => Math.min(length, Math.max(0, col + delta));

/**
 * Tab (direction 1) / Shift+Tab (-1) on list items: nest or un-nest every
 * selected item and renumber. Returns null if the selection has no list
 * items (so Tab can move focus as usual).
 */
export function indentList(value, selStart, selEnd, direction) {
  const { lines, offsets } = splitLines(value);
  const startLine = lineOf(offsets, selStart);
  let endLine = lineOf(offsets, selEnd);
  if (selEnd > selStart && offsets[endLine] === selEnd) endLine -= 1;

  const targets = [];
  for (let i = startLine; i <= endLine; i += 1) if (parseItem(lines[i])) targets.push(i);
  if (!targets.length) return null;

  const before = lines.map((l) => l.length);
  for (const i of targets) {
    const item = parseItem(lines[i]);
    if (direction > 0) {
      // Only nest under an item above it, and at most one level deeper.
      let parent = null;
      for (let j = i - 1; j >= 0 && lines[j].trim(); j -= 1) {
        const above = parseItem(lines[j]);
        if (above && above.indent <= item.indent) {
          parent = above;
          break;
        }
      }
      if (!parent || item.indent >= parent.indent + INDENT.length) continue;
      lines[i] = " ".repeat(parent.indent + INDENT.length - item.indent) + lines[i];
    } else {
      const remove = Math.min(item.indent, INDENT.length);
      lines[i] = lines[i].slice(remove);
    }
  }
  for (const i of targets) renumberBlock(lines, i);
  // Items below the selection may need new numbers too.
  if (endLine + 1 < lines.length) renumberBlock(lines, endLine + 1);

  const after = lines.join("\n");
  const { offsets: newOffsets } = splitLines(after);
  const map = (pos, line) => {
    const col = pos - offsets[line];
    return newOffsets[line] + shiftCol(col, lines[line].length - before[line], lines[line].length);
  };
  return diffEdit(value, after, map(selStart, startLine), map(selEnd, lineOf(offsets, selEnd)));
}

/**
 * Enter inside a list continues it ("- " → "- ", "3. " → "4. ", "- [x] " →
 * "- [ ] ") and renumbers what follows. Enter on an empty nested item moves
 * it out a level; on an empty top-level item it ends the list.
 */
export function continueList(value, selStart, selEnd) {
  if (selStart !== selEnd) return null;
  const lineStart = value.lastIndexOf("\n", selStart - 1) + 1;
  const lineEnd = value.indexOf("\n", selStart) === -1 ? value.length : value.indexOf("\n", selStart);
  const line = value.slice(lineStart, lineEnd);
  const quote = line.match(/^(\s*)> /);
  const item = parseItem(line);
  if (!item && !quote) return null;

  const prefixLength = item ? item.prefixLength : quote[0].length;
  if (selStart - lineStart < prefixLength) return null; // caret inside the marker
  if (!line.slice(prefixLength).trim()) {
    if (item && item.indent > 0) return indentList(value, selStart, selEnd, -1);
    // End the list/quote with a blank line after it; otherwise Markdown would
    // fold the next thing typed back into the last item.
    return { start: lineStart, end: lineEnd, text: "\n", selStart: lineStart + 1, selEnd: lineStart + 1 };
  }

  const indent = " ".repeat(item ? item.indent : quote[1].length);
  let marker = "> ";
  if (item) {
    marker = item.number !== null ? `${item.number + 1}${item.marker.slice(-1)} ` : `${item.marker} `;
    if (item.task) marker += "[ ] ";
  }
  const insert = `\n${indent}${marker}`;
  const afterValue = value.slice(0, selStart) + insert + value.slice(selEnd);
  const caret = selStart + insert.length;
  if (!item || item.number === null) {
    return { start: selStart, end: selEnd, text: insert, selStart: caret, selEnd: caret };
  }
  const { lines, offsets } = splitLines(afterValue);
  const newLine = lineOf(offsets, caret);
  const oldLength = lines[newLine].length;
  renumberBlock(lines, newLine);
  const renumbered = lines.join("\n");
  const shifted = caret + (lines[newLine].length - oldLength);
  return diffEdit(value, renumbered, shifted, shifted);
}

/**
 * Check or uncheck the task on line `lineIndex` (0-based): "- [ ] x" ⇄
 * "- [x] x". Returns the new value, or null if that line isn't a task.
 */
export function toggleTask(value, lineIndex) {
  const lines = value.split("\n");
  const line = lines[lineIndex];
  if (line === undefined) return null;
  const m = line.match(/^(\s*(?:[-*+]|\d+[.)]) \[)([ xX])(\])/);
  if (!m) return null;
  lines[lineIndex] = m[1] + (m[2] === " " ? "x" : " ") + m[3] + line.slice(m[0].length);
  return lines.join("\n");
}

/** Line index (0-based) of a character offset. */
export function lineIndexAt(value, pos) {
  let count = 0;
  for (let i = 0; i < pos && i < value.length; i += 1) if (value[i] === "\n") count += 1;
  return count;
}
