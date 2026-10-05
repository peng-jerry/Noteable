/**
 * Pure helpers for note content: [[wiki links]], heading outline, stats,
 * template placeholders and plain-text export. All are unit-tested.
 */
import GithubSlugger from "github-slugger";

const FENCE = /(```[\s\S]*?(?:```|$))/g;
const INLINE_CODE = /(`[^`\n]*`)/g;
const WIKI_LINK = /\[\[([^[\]\n]{1,200}?)\]\]/g;

/** Run `fn` on the parts of Markdown that aren't code (fenced or inline). */
function mapOutsideCode(md, fn) {
  return md
    .split(FENCE)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .split(INLINE_CODE)
            .map((seg, j) => (j % 2 === 1 ? seg : fn(seg)))
            .join(""),
    )
    .join("");
}

export const normalizeTitle = (title) => title.trim().replace(/\s+/g, " ");

/**
 * Turn [[Title]] into Markdown links for the preview. `resolve(title)`
 * returns a note id or null; unresolved links point at #/new?title=… which
 * creates the note when clicked.
 */
export function linkifyWikiLinks(md, resolve) {
  return mapOutsideCode(md, (text) =>
    text.replace(WIKI_LINK, (_match, raw) => {
      const title = normalizeTitle(raw);
      if (!title) return _match;
      const label = title.replace(/([\\[\]])/g, "\\$1");
      const id = resolve(title);
      return id
        ? `[${label}](#/notes/${id} "wikilink")`
        : `[${label}](#/new?title=${encodeURIComponent(title)} "wikilink-missing")`;
    }),
  );
}

/** Lower-cased title → id, preferring the first (most recently edited) match. */
export function titleResolver(titles) {
  const map = new Map();
  for (const t of titles) {
    const key = normalizeTitle(t.title).toLowerCase();
    if (!map.has(key)) map.set(key, t.id);
  }
  return (title) => map.get(normalizeTitle(title).toLowerCase()) ?? null;
}

/** Headings outside code blocks: [{ level, text, slug, offset }]. */
export function extractHeadings(md) {
  const slugger = new GithubSlugger();
  const headings = [];
  let offset = 0;
  let inFence = false;
  for (const line of md.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    else if (!inFence) {
      const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (match) {
        const text = match[2].replace(/[*_`~]/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
        headings.push({ level: match[1].length, text, slug: slugger.slug(text), offset });
      }
    }
    offset += line.length + 1;
  }
  return headings;
}

export function noteStats(md) {
  const words = md.trim() ? md.trim().split(/\s+/).length : 0;
  return {
    words,
    characters: md.length,
    readingMinutes: words ? Math.max(1, Math.round(words / 200)) : 0,
  };
}

/** Fill {{date}} {{time}} {{datetime}} {{weekday}} {{title}} {{folder}} placeholders. */
export function fillTemplate(template, { folder = "", now = new Date() } = {}) {
  const values = {
    date: now.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }),
    time: now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    weekday: now.toLocaleDateString(undefined, { weekday: "long" }),
    folder,
  };
  values.datetime = `${values.date}, ${values.time}`;
  const fill = (text, extra = {}) =>
    text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
      const k = key.toLowerCase();
      return k in extra ? extra[k] : k in values ? values[k] : match;
    });
  const title = fill(template.title || "", { title: "" }).trim() || template.name || "Untitled";
  return { title: title.slice(0, 200), content: fill(template.content || "", { title }) };
}

/** Markdown → readable plain text for .txt export (keeps line structure). */
export function markdownToText(md) {
  let inFence = false;
  return md
    .split("\n")
    .flatMap((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return [];
      }
      if (inFence) return [line];
      return [
        line
          .replace(/^(\s*)#{1,6}\s+/, "$1")
          .replace(/^(\s*)>\s?/, "$1")
          .replace(/^(\s*)[-*+] \[[xX]\] /, "$1☑ ")
          .replace(/^(\s*)[-*+] \[ \] /, "$1☐ ")
          .replace(/^(\s*)[-*+] /, "$1• ")
          .replace(/^\s*([-*_])(\s*\1){2,}\s*$/, "————")
          .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
          .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, "$1 ($2)")
          .replace(WIKI_LINK, "$1")
          .replace(/(\*\*|__|\*|~~|`)(?=\S)([^]*?\S)\1/g, "$2")
          .replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, "$1$2"),
      ];
    })
    .join("\n");
}

/** A file name that's safe on every OS. */
export function safeFileName(name, fallback = "Untitled") {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").trim().replace(/^\.+|\.+$/g, "").trim();
  return (cleaned || fallback).slice(0, 100);
}

export function downloadFile(filename, data, type = "text/plain;charset=utf-8") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
