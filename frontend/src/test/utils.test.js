import { describe, expect, it } from "vitest";
import { buildTree, deletionImpact, descendantIds, folderOptions, pathTo } from "../utils/folders";
import { code, continueList, link, plainText, prefixLines, wrap } from "../utils/markdown";
import { compact, validateEmail, validatePassword } from "../utils/validation";
import { toSummary } from "../hooks/useNoteList";

const folders = [
  { id: "a", name: "Work", parent_id: null, note_count: 2 },
  { id: "b", name: "projects", parent_id: "a", note_count: 1 },
  { id: "c", name: "Deep", parent_id: "b", note_count: 4 },
  { id: "d", name: "Archive", parent_id: null, note_count: 0 },
];

/** Apply an edit to a string, the way the editor does. */
const apply = (value, edit) => value.slice(0, edit.start) + edit.text + value.slice(edit.end);

describe("folder helpers", () => {
  it("builds a sorted tree", () => {
    const tree = buildTree(folders);
    expect(tree.map((n) => n.name)).toEqual(["Archive", "Work"]);
    expect(tree[1].children[0].children[0].name).toBe("Deep");
  });

  it("finds descendants, paths and deletion impact", () => {
    expect([...descendantIds(folders, "a")].sort()).toEqual(["b", "c"]);
    expect(pathTo(folders, "c").map((f) => f.name)).toEqual(["Work", "projects", "Deep"]);
    expect(deletionImpact(folders, "a")).toEqual({ folders: 3, notes: 7 });
    expect(deletionImpact(folders, "d")).toEqual({ folders: 1, notes: 0 });
  });

  it("excludes a folder's subtree from move targets", () => {
    const ids = folderOptions(folders, { exclude: "b" }).map((o) => o.id);
    expect(ids).toEqual(["d", "a"]);
    expect(folderOptions(folders)[2]).toMatchObject({ id: "b", depth: 1 });
  });
});

describe("markdown edits", () => {
  it("wraps and unwraps a selection", () => {
    const edit = wrap("hello world", 0, 5, "**");
    expect(apply("hello world", edit)).toBe("**hello** world");
    const value = "**hello** world";
    expect(apply(value, wrap(value, 2, 7, "**"))).toBe("hello world");
  });

  it("inserts a placeholder when nothing is selected", () => {
    const edit = wrap("", 0, 0, "_", "_", "italic");
    expect(apply("", edit)).toBe("_italic_");
    expect([edit.selStart, edit.selEnd]).toEqual([1, 7]);
  });

  it("toggles line prefixes across a multi-line selection", () => {
    const value = "one\ntwo\nthree";
    const bulleted = apply(value, prefixLines(value, 0, value.length, "- "));
    expect(bulleted).toBe("- one\n- two\n- three");
    expect(apply(bulleted, prefixLines(bulleted, 0, bulleted.length, "- "))).toBe(value);
    expect(apply(value, prefixLines(value, 0, value.length, "1. ", { numbered: true }))).toBe(
      "1. one\n2. two\n3. three",
    );
  });

  it("swaps one list type for another", () => {
    expect(apply("- item", prefixLines("- item", 0, 0, "> "))).toBe("> item");
  });

  it("builds links and code blocks", () => {
    const edit = link("see docs", 4, 8);
    expect(apply("see docs", edit)).toBe("see [docs](https://)");
    expect("see [docs](https://)".slice(edit.selStart, edit.selEnd)).toBe("https://");
    expect(apply("a\nb", code("a\nb", 0, 3))).toBe("```\na\nb\n```\n");
  });

  it("continues and ends lists on Enter", () => {
    expect(apply("- milk", continueList("- milk", 6, 6))).toBe("- milk\n- ");
    expect(apply("3. c", continueList("3. c", 4, 4))).toBe("3. c\n4. ");
    expect(apply("- [x] done", continueList("- [x] done", 10, 10))).toBe("- [x] done\n- [ ] ");
    expect(apply("- a\n- ", continueList("- a\n- ", 6, 6))).toBe("- a\n\n"); // ends with a blank line
    expect(continueList("plain", 5, 5)).toBeNull();
  });
});

describe("plainText", () => {
  it("strips Markdown syntax for list previews", () => {
    expect(plainText("# Week 6 Topics: - Flask - React - **important**")).toBe(
      "Week 6 Topics: Flask React important",
    );
    expect(plainText("- [ ] milk - [x] eggs")).toBe("milk eggs");
    expect(plainText("> see [the docs](https://x.y) and `code`")).toBe("see the docs and code");
    expect(plainText("2 * 3 = 6, snake_case_name")).toBe("2 * 3 = 6, snake_case_name");
    expect(plainText("See [[Flask Basics]] now")).toBe("See Flask Basics now");
  });
});

describe("validation", () => {
  it("matches the API's rules", () => {
    expect(validateEmail("a@b.co")).toBe("");
    expect(validateEmail("nope")).not.toBe("");
    expect(validatePassword("short1")).toMatch(/8 characters/);
    expect(validatePassword("allletters")).toMatch(/letter and one number/);
    expect(validatePassword("password1")).toBe("");
    expect(compact({ a: "", b: "x" })).toEqual({ b: "x" });
  });
});

describe("toSummary", () => {
  it("makes the same excerpt as the API", () => {
    const summary = toSummary({ id: "1", title: "t", content: "a  b\n\nc" + " x".repeat(200) });
    expect(summary.content).toBeUndefined();
    expect(summary.excerpt.startsWith("a b c x")).toBe(true);
    expect(summary.excerpt.endsWith("…")).toBe(true);
    expect(summary.excerpt.length).toBeLessThanOrEqual(161); // 160 chars, trailing space trimmed, + "…"
  });
});
