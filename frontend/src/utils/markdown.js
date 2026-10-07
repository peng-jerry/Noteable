/**
 * Pure text transforms behind the Markdown toolbar and editor shortcuts.
 *
 * Each takes the textarea's (value, selectionStart, selectionEnd) and returns
 * an edit: { start, end, text, selStart, selEnd } meaning "replace
 * value[start:end] with text, then select selStart..selEnd" (positions are
 * in the new value). Keeping these pure makes them easy to test.
 */
import { continueList, parseItem } from "./lists";

export { continueList };

/** Wrap the selection in a marker, e.g. ** for bold. Toggles it off if already wrapped. */
export function wrap(value, selStart, selEnd, before, after = before, placeholder = "text") {
  const selected = value.slice(selStart, selEnd);
  const outerStart = selStart - before.length;
  const outerEnd = selEnd + after.length;

  if (
    outerStart >= 0 &&
    value.slice(outerStart, selStart) === before &&
    value.slice(selEnd, outerEnd) === after
  ) {
    return {
      start: outerStart,
      end: outerEnd,
      text: selected,
      selStart: outerStart,
      selEnd: outerStart + selected.length,
    };
  }

  const inner = selected || placeholder;
  return {
    start: selStart,
    end: selEnd,
    text: before + inner + after,
    selStart: selStart + before.length,
    selEnd: selStart + before.length + inner.length,
  };
}

/** Index range of the full lines touched by the selection. */
function lineRange(value, selStart, selEnd) {
  const start = value.lastIndexOf("\n", selStart - 1) + 1;
  let end = value.indexOf("\n", selEnd > selStart && value[selEnd - 1] === "\n" ? selEnd - 1 : selEnd);
  if (end === -1) end = value.length;
  return { start, end };
}

const LIST_PREFIX = /^(\s*)([-*+] \[[ xX]\] |[-*+] |\d+[.)] |> |#{1,6} )/;

/**
 * Toggle a line prefix ("- ", "1. ", "> ", "## ", "- [ ] ") on every selected line.
 * Works on an empty line too: the marker appears and the caret goes after it.
 * `numbered` counts up (1. 2. 3.), continuing from a numbered item just above.
 */
export function prefixLines(value, selStart, selEnd, prefix, { numbered = false } = {}) {
  const { start, end } = lineRange(value, selStart, selEnd);
  const lines = value.slice(start, end).split("\n");
  const pattern = numbered ? /^(\s*)\d+[.)] / : new RegExp(`^(\\s*)${escapeRegExp(prefix)}`);
  const filled = lines.filter((line) => line.trim());
  const allHave = filled.length > 0 && filled.every((line) => pattern.test(line));

  // Continue the numbering of a list directly above, e.g. after "2. foo" → "3. ".
  let next = 1;
  if (numbered && start > 0) {
    const above = value.slice(value.lastIndexOf("\n", start - 2) + 1, start - 1);
    const item = parseItem(above);
    if (item?.number !== null && item?.number !== undefined) next = item.number + 1;
  }

  const updated = lines.map((line) => {
    if (allHave) return line.replace(pattern, "$1");
    if (!line.trim() && lines.length > 1) return line;
    const [, indent, rest] = line.replace(LIST_PREFIX, "$1").match(/^(\s*)(.*)$/);
    const marker = numbered ? `${next++}. ` : prefix;
    return indent + marker + rest;
  });
  const text = updated.join("\n");

  // One line with a plain caret: keep the caret where it was in the text
  // (or after the new marker on an empty line). Several lines: select them.
  if (selStart === selEnd && lines.length === 1) {
    const delta = text.length - lines[0].length;
    const caret = Math.max(start, Math.min(start + text.length, selStart + delta));
    return { start, end, text, selStart: caret, selEnd: caret };
  }
  return { start, end, text, selStart: start, selEnd: start + text.length };
}

/** Insert a link, using the selection as its text and selecting the URL. */
export function link(value, selStart, selEnd) {
  const label = value.slice(selStart, selEnd) || "link text";
  const url = "https://";
  const text = `[${label}](${url})`;
  const urlStart = selStart + label.length + 3;
  return { start: selStart, end: selEnd, text, selStart: urlStart, selEnd: urlStart + url.length };
}

/** Inline code for a single-line selection; a fenced block for multi-line. */
export function code(value, selStart, selEnd) {
  const selected = value.slice(selStart, selEnd);
  if (!selected.includes("\n")) return wrap(value, selStart, selEnd, "`", "`", "code");
  const atLineStart = selStart === 0 || value[selStart - 1] === "\n";
  const text = `${atLineStart ? "" : "\n"}\`\`\`\n${selected.replace(/\n$/, "")}\n\`\`\`\n`;
  return { start: selStart, end: selEnd, text, selStart: selStart + text.length, selEnd: selStart + text.length };
}

/** Strip Markdown syntax for one-line previews: "## **Hi** [x](u)" → "Hi x". */
export function plainText(markdown = "") {
  return markdown
    .replace(/```[^\n]*/g, " ") // code fences
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images → alt text
    .replace(/\[\[([^[\]\n]+)\]\]/g, "$1") // [[wiki links]] → title
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → link text
    .replace(/!?\[([^\]]*)\](\([^)]*)?$/, "$1") // a link or image cut off by the excerpt
    .replace(/(^|\s)\|?(\s*:?-{3,}:?\s*\|)+/g, "$1") // table separator rows
    .replace(/\|/g, " ") // table cell borders
    .replace(/^\s*\*\s(?=\S)/, "") // a leading "* " bullet
    .replace(/(^|\s)(#{1,6}|>|[-+](?: \[[ xX]\])?|\* \[[ xX]\]|\d+\.)(?=\s)/g, "$1") // block markers
    .replace(/(\*\*|\*|~~|`)(?=\S)([^]*?\S)\1/g, "$2") // bold / italic / strike / code
    .replace(/(^|[^\w])(__|_)(?=\S)([^]*?\S)\2(?!\w)/g, "$1$3") // _emphasis_ (not snake_case)
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Toolbar definitions: id → { label, icon, shortcut?, run(value, s, e) }. */
export const TOOLBAR_ACTIONS = [
  { id: "bold", label: "Bold", icon: "bold", shortcut: "b", run: (v, s, e) => wrap(v, s, e, "**", "**", "bold text") },
  { id: "italic", label: "Italic", icon: "italic", shortcut: "i", run: (v, s, e) => wrap(v, s, e, "_", "_", "italic text") },
  { id: "heading", label: "Heading", icon: "heading", run: (v, s, e) => prefixLines(v, s, e, "## ") },
  { id: "bullets", label: "Bulleted list", icon: "list", run: (v, s, e) => prefixLines(v, s, e, "- ") },
  { id: "numbers", label: "Numbered list", icon: "list-ordered", run: (v, s, e) => prefixLines(v, s, e, "1. ", { numbered: true }) },
  { id: "tasks", label: "Checklist", icon: "checklist", run: (v, s, e) => prefixLines(v, s, e, "- [ ] ") },
  { id: "quote", label: "Quote", icon: "quote", run: (v, s, e) => prefixLines(v, s, e, "> ") },
  { id: "code", label: "Code", icon: "code", shortcut: "e", run: code },
  { id: "link", label: "Link", icon: "link", shortcut: "k", run: link },
];
