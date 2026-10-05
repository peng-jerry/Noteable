import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { findLinkQuery } from "../components/MarkdownEditor";
import { matches, sortNotes } from "../hooks/useNoteList";
import { batchFiles, filesFromZip } from "../utils/importFiles";
import {
  extractHeadings,
  fillTemplate,
  linkifyWikiLinks,
  markdownToText,
  noteStats,
  safeFileName,
  titleResolver,
} from "../utils/notes";
import { availableSorts, rememberSort, resolveSort, sortQuery } from "../utils/sorting";

describe("wiki links", () => {
  const resolve = titleResolver([
    { id: "n1", title: "Flask Basics" },
    { id: "n2", title: "flask basics" }, // older duplicate: first one wins
  ]);

  it("resolves titles case-insensitively, preferring the first match", () => {
    expect(resolve("FLASK   basics")).toBe("n1");
    expect(resolve("Nope")).toBeNull();
  });

  it("links existing and missing notes but leaves code alone", () => {
    const md = "See [[Flask Basics]] and [[New Page]].\n`[[inline]]`\n```\n[[fenced]]\n```";
    const out = linkifyWikiLinks(md, resolve);
    expect(out).toContain('[Flask Basics](#/notes/n1 "wikilink")');
    expect(out).toContain('[New Page](#/new?title=New%20Page "wikilink-missing")');
    expect(out).toContain("`[[inline]]`");
    expect(out).toContain("[[fenced]]");
  });

  it("detects an unfinished [[ before the caret", () => {
    expect(findLinkQuery("see [[Fla", 9)).toEqual({ start: 6, query: "Fla" });
    expect(findLinkQuery("see [[Flask]] x", 15)).toBeNull();
    expect(findLinkQuery("line one [[a\nline two", 21)).toBeNull();
  });
});

describe("outline and stats", () => {
  it("extracts headings with unique slugs, skipping code blocks", () => {
    const md = "# Intro\ntext\n```\n# not a heading\n```\n## Setup **steps**\n## Intro";
    const headings = extractHeadings(md);
    expect(headings.map((h) => [h.level, h.text, h.slug])).toEqual([
      [1, "Intro", "intro"],
      [2, "Setup steps", "setup-steps"],
      [2, "Intro", "intro-1"],
    ]);
    expect(md.slice(headings[1].offset).startsWith("## Setup")).toBe(true);
  });

  it("counts words, characters and reading time", () => {
    expect(noteStats("")).toEqual({ words: 0, characters: 0, readingMinutes: 0 });
    expect(noteStats("word ".repeat(450))).toMatchObject({ words: 450, readingMinutes: 2 });
  });
});

describe("templates", () => {
  it("fills placeholders, using the filled title inside the body", () => {
    const now = new Date(2026, 9, 5, 9, 30);
    const { title, content } = fillTemplate(
      { name: "Lecture", title: "Lecture — {{date}}", content: "# {{title}}\n{{weekday}} in {{folder}} {{unknown}}" },
      { folder: "15-113", now },
    );
    expect(title).toBe(`Lecture — ${now.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}`);
    expect(content.startsWith(`# ${title}\n`)).toBe(true);
    expect(content).toContain("in 15-113 {{unknown}}");
  });

  it("falls back to the template name for an empty title", () => {
    expect(fillTemplate({ name: "Blank", title: "", content: "" }).title).toBe("Blank");
  });
});

describe("export helpers", () => {
  it("turns Markdown into readable text", () => {
    const md = "# Title\n- [ ] todo\n- [x] done\n- item\n> quote\n**bold** and [link](https://x.y) and [[Note]]\n```\n# kept\n```";
    expect(markdownToText(md)).toBe("Title\n☐ todo\n☑ done\n• item\nquote\nbold and link (https://x.y) and Note\n# kept");
  });

  it("makes safe file names", () => {
    expect(safeFileName('Lecture: 1/2 "final"?')).toBe("Lecture- 1-2 -final-");
    expect(safeFileName("...")).toBe("Untitled");
  });
});

describe("import", () => {
  it("reads .md/.txt from a zip, keeping paths and skipping junk", () => {
    const zip = zipSync({
      "School/week1.md": strToU8("# Week 1"),
      "School/notes.txt": strToU8("plain"),
      "School/photo.png": new Uint8Array([1, 2, 3]),
      "__MACOSX/School/._week1.md": strToU8("junk"),
      ".DS_Store": strToU8("junk"),
    });
    const { files, skipped } = filesFromZip(zip);
    expect(files.map((f) => f.path).sort()).toEqual(["School/notes.txt", "School/week1.md"]);
    expect(files.find((f) => f.path === "School/week1.md").content).toBe("# Week 1");
    expect(skipped.map((s) => s.path)).toEqual(["School/photo.png"]);
  });

  it("reports unreadable zips", () => {
    expect(filesFromZip(new Uint8Array([1, 2, 3]), "bad.zip").skipped[0].path).toBe("bad.zip");
  });

  it("batches by count and size", () => {
    const files = Array.from({ length: 5 }, (_, i) => ({ path: `${i}.md`, content: "x".repeat(300) }));
    expect(batchFiles(files, { maxCount: 2 }).map((b) => b.length)).toEqual([2, 2, 1]);
    expect(batchFiles(files, { maxBytes: 800 }).map((b) => b.length)).toEqual([2, 2, 1]); // ~374 bytes each
  });
});

describe("sorting", () => {
  it("only offers manual order in folders and best match while searching", () => {
    const keys = (opts) => availableSorts(opts).map((o) => o.key);
    expect(keys({})).not.toContain("manual");
    expect(keys({ folder: "f1" })).toContain("manual");
    expect(keys({ q: "x" })).toContain("relevance");
  });

  it("prefers the URL, then the remembered choice, then a sensible default", () => {
    expect(resolveSort({ urlSort: "title", folder: null, q: "", view: "all" })).toBe("title");
    rememberSort("f1", "manual");
    expect(resolveSort({ folder: "f1", q: "", view: "f1" })).toBe("manual");
    expect(resolveSort({ folder: null, q: "x", view: "all" })).toBe("relevance");
    expect(resolveSort({ urlSort: "manual", folder: null, q: "", view: "all" })).toBe("updated");
    expect(sortQuery("title-desc")).toEqual({ sort: "title", order: "desc" });
  });

  it("orders notes like the API", () => {
    const notes = [
      { id: "a", title: "b", is_pinned: false, position: 2, updated_at: "2", created_at: "1" },
      { id: "b", title: "a", is_pinned: true, position: 1, updated_at: "1", created_at: "2" },
      { id: "c", title: "c", is_pinned: false, position: 0, updated_at: "3", created_at: "3" },
    ];
    expect(sortNotes(notes, { sort: "position" }).map((n) => n.id)).toEqual(["c", "b", "a"]);
    expect(sortNotes(notes, { sort: "title", order: "asc" }).map((n) => n.id)).toEqual(["b", "a", "c"]);
  });

  it("knows which notes belong in a filtered list", () => {
    const note = { folder_id: "f1", is_pinned: false, tags: [{ id: "t1" }, { id: "t2" }] };
    expect(matches(note, { tags: "t1,t2" })).toBe(true);
    expect(matches(note, { tags: "t1,t3" })).toBe(false);
    expect(matches(note, { folder_id: "unfiled" })).toBe(false);
    expect(matches(note, { q: "anything" })).toBeNull();
  });
});
