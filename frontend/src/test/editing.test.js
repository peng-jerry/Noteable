import { describe, expect, it } from "vitest";
import { continueList, indentList, lineIndexAt, renumberBlock, toggleTask } from "../utils/lists";
import { prefixLines } from "../utils/markdown";
import { insertTable, splitRow, tableMarkdown, tableTab } from "../utils/tables";

/** Apply an edit the way the editor does; returns [newValue, selected text, caret]. */
const apply = (value, edit) => {
  const next = value.slice(0, edit.start) + edit.text + value.slice(edit.end);
  return [next, next.slice(edit.selStart, edit.selEnd), edit.selStart];
};

describe("list buttons on empty lines", () => {
  it("adds the marker to an empty line and puts the caret after it", () => {
    for (const [prefix, opts, expected] of [
      ["- ", {}, "- "],
      ["1. ", { numbered: true }, "1. "],
      ["- [ ] ", {}, "- [ ] "],
      ["> ", {}, "> "],
    ]) {
      const [value, , caret] = apply("", prefixLines("", 0, 0, prefix, opts));
      expect(value).toBe(expected);
      expect(caret).toBe(expected.length);
    }
  });

  it("works on an empty line after other text, and toggles back off", () => {
    const value = "intro\n";
    const [once, , caret] = apply(value, prefixLines(value, 6, 6, "- "));
    expect(once).toBe("intro\n- ");
    expect(caret).toBe(once.length);
    expect(apply(once, prefixLines(once, 8, 8, "- "))[0]).toBe("intro\n");
  });

  it("continues numbering from the item above", () => {
    const value = "1. a\n2. b\n";
    expect(apply(value, prefixLines(value, value.length, value.length, "1. ", { numbered: true }))[0]).toBe("1. a\n2. b\n3. ");
  });

  it("keeps the caret in place when prefixing a line with text", () => {
    const [value, , caret] = apply("milk", prefixLines("milk", 2, 2, "- "));
    expect(value).toBe("- milk");
    expect(caret).toBe(4);
  });

  it("keeps indentation when switching list type", () => {
    expect(apply("    - item", prefixLines("    - item", 6, 6, "- [ ] "))[0]).toBe("    - [ ] item");
  });
});

describe("Tab / Shift+Tab nesting", () => {
  it("nests a numbered item under the one above and restarts its count", () => {
    const value = "1. a\n2. b\n3. c";
    const [next, , caret] = apply(value, indentList(value, 9, 9, 1)); // caret after "b"
    expect(next).toBe("1. a\n    1. b\n2. c");
    expect(next.slice(caret - 1, caret)).toBe("b"); // caret stayed after "b"
  });

  it("continues an existing nested level", () => {
    const value = "1. a\n    1. x\n2. b";
    expect(apply(value, indentList(value, 16, 16, 1))[0]).toBe("1. a\n    1. x\n    2. b");
  });

  it("un-nests and renumbers on Shift+Tab", () => {
    const value = "1. a\n    1. b\n2. c";
    expect(apply(value, indentList(value, 12, 12, -1))[0]).toBe("1. a\n2. b\n3. c");
  });

  it("won't nest the first item or skip a level (which would make a code block)", () => {
    expect(apply("- a", indentList("- a", 3, 3, 1))[0]).toBe("- a");
    const value = "- a\n    - b";
    expect(apply(value, indentList(value, 11, 11, 1))[0]).toBe(value);
  });

  it("indents every selected item", () => {
    const value = "- a\n- b\n- c";
    expect(apply(value, indentList(value, 4, value.length, 1))[0]).toBe("- a\n    - b\n    - c");
  });

  it("returns null outside lists so Tab can leave the editor", () => {
    expect(indentList("plain text", 3, 3, 1)).toBeNull();
  });

  it("renumbers each level separately", () => {
    const lines = ["1. a", "    5. x", "    9. y", "7. b", "- bullet", "1. new"];
    expect(renumberBlock(lines, 0)).toEqual(["1. a", "    1. x", "    2. y", "2. b", "- bullet", "1. new"]);
  });
});

describe("Enter in lists", () => {
  it("continues numbering and renumbers the rest", () => {
    const value = "1. a\n2. b";
    expect(apply(value, continueList(value, 4, 4))[0]).toBe("1. a\n2. \n3. b");
  });

  it("continues checklists unchecked and keeps nesting", () => {
    const value = "- [x] done";
    expect(apply(value, continueList(value, 10, 10))[0]).toBe("- [x] done\n- [ ] ");
    const nested = "- a\n    - b";
    expect(apply(nested, continueList(nested, 11, 11))[0]).toBe("- a\n    - b\n    - ");
  });

  it("moves an empty nested item out a level, and ends the list at the top", () => {
    const nested = "1. a\n    1. ";
    expect(apply(nested, continueList(nested, nested.length, nested.length))[0]).toBe("1. a\n2. ");
    const [ended, , caret] = apply("- a\n- ", continueList("- a\n- ", 6, 6));
    expect(ended).toBe("- a\n\n"); // a blank line keeps the next paragraph out of the list
    expect(caret).toBe(ended.length);
    expect(apply("> q\n> ", continueList("> q\n> ", 6, 6))[0]).toBe("> q\n\n");
  });
});

describe("checklists", () => {
  it("toggles a task on a given line", () => {
    const value = "# Todo\n- [ ] milk\n    - [x] eggs\n- plain";
    expect(toggleTask(value, 1)).toBe("# Todo\n- [x] milk\n    - [x] eggs\n- plain");
    expect(toggleTask(value, 2)).toBe("# Todo\n- [ ] milk\n    - [ ] eggs\n- plain");
    expect(toggleTask(value, 3)).toBeNull();
    expect(lineIndexAt(value, value.indexOf("eggs"))).toBe(2);
  });
});

describe("tables", () => {
  it("builds and inserts a table on its own lines, selecting the first header", () => {
    expect(tableMarkdown(2, 1)).toBe("| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |");
    const [value, selected] = apply("intro", insertTable("intro", 5, 5, 2, 1));
    expect(value.startsWith("intro\n\n| Column 1 |")).toBe(true);
    expect(selected).toBe("Column 1");
  });

  it("splits rows, keeping escaped pipes", () => {
    expect(splitRow("| a | b \\| c |  |")).toEqual(["a", "b \\| c", ""]);
  });

  it("Tab moves to the next cell, skipping the separator, and realigns", () => {
    const value = "| Name | Qty |\n| --- | --- |\n| apple | 3 |";
    const [next, selected] = apply(value, tableTab(value, 3, false));
    expect(selected).toBe("Qty");
    expect(next).toBe("| Name  | Qty |\n| ----- | --- |\n| apple | 3   |");
    const qty = next.indexOf("Qty");
    expect(apply(next, tableTab(next, qty, false))[1]).toBe("apple");
  });

  it("Tab in the last cell adds a row; Shift+Tab goes back", () => {
    const value = "| a | b |\n|---|:-:|\n| 1 | 2 |";
    const [next, , caret] = apply(value, tableTab(value, value.length - 2, false));
    expect(next.split("\n")).toHaveLength(4);
    expect(next.split("\n")[1]).toBe("| --- | :-: |");
    expect(next.slice(caret).startsWith("    |")).toBe(true);
    const [, back] = apply(value, tableTab(value, value.length - 2, true));
    expect(back).toBe("1");
  });

  it("returns null outside tables", () => {
    expect(tableTab("not a table", 2, false)).toBeNull();
  });
});
