import { Suspense, forwardRef, lazy, useDeferredValue, useImperativeHandle, useMemo, useRef, useState } from "react";
import { caretCoordinates } from "../utils/caret";
import { diffEdit, indentList, lineIndexAt, toggleTask } from "../utils/lists";
import { TOOLBAR_ACTIONS, continueList } from "../utils/markdown";
import { insertTable, tableTab } from "../utils/tables";
import Icon from "./Icon";
import MarkdownPreview from "./LazyMarkdownPreview";
import { PreviewActions } from "./MarkdownPreview";
import Resizer from "./Resizer";
import TablePicker from "./TablePicker";
import { useToast } from "./Toasts";

// Loaded on demand: drawing and the camera are only needed when opened.
const DoodleDialog = lazy(() => import("./DoodleDialog"));
const CameraDialog = lazy(() => import("./CameraDialog"));

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl+";

/** If the caret sits inside an unfinished "[[…", return { start, query }. */
export function findLinkQuery(value, caret) {
  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const before = value.slice(lineStart, caret);
  const open = before.lastIndexOf("[[");
  if (open < 0) return null;
  const query = before.slice(open + 2);
  if (query.includes("]]") || query.includes("[") || query.length > 80) return null;
  return { start: lineStart + open + 2, query };
}

/**
 * Markdown textarea + formatting toolbar + live preview.
 * `view` is "write" | "split" | "preview". In split view a draggable divider
 * sets the editor's share (`split`, 0–1). Typing "[[" suggests note titles.
 *
 * Keys: Tab / Shift+Tab nest list items and move between table cells (and
 * otherwise leave the editor as usual); Ctrl/⌘+Enter ticks a checklist item.
 * The toolbar also inserts tables, doodles and photos (`media`); checklist
 * boxes in the preview can be clicked, and doodles edited from there.
 *
 * The ref exposes scrollToHeading(offset, slug) for the outline.
 */
const MarkdownEditor = forwardRef(function MarkdownEditor(
  { value, onChange, view, textareaId, placeholder, titles = [], resolveTitle, split = 0.5, onSplitChange, onSplitReset, noteId, media = true },
  ref,
) {
  const toast = useToast();
  const textareaRef = useRef(null);
  const previewRef = useRef(null);
  const panesRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const savedSelection = useRef(null); // where to insert once a dialog finishes
  const [link, setLink] = useState(null); // { start, query, top, left, active }
  const [panel, setPanel] = useState(null); // "table" | { doodle: id | null } | "camera"
  // Typing stays responsive on long notes; the preview catches up a moment later.
  const deferredValue = useDeferredValue(value);

  useImperativeHandle(ref, () => ({
    scrollToHeading(offset, slug) {
      const el = textareaRef.current;
      if (el && view !== "preview") {
        const { absoluteTop } = caretCoordinates(el, offset);
        el.scrollTo({ top: Math.max(0, absoluteTop - 24), behavior: "smooth" });
        el.focus({ preventScroll: true });
        el.setSelectionRange(offset, offset);
      }
      const target = previewRef.current?.querySelector(`#${CSS.escape(slug)}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    focus: () => textareaRef.current?.focus(),
  }));

  const suggestions = useMemo(() => {
    if (!link) return [];
    const q = link.query.trim().toLowerCase();
    const matches = titles.filter((t) => t.title.toLowerCase().includes(q)).slice(0, 8);
    const exact = matches.some((t) => t.title.toLowerCase() === q);
    return q && !exact ? [...matches, { id: null, title: link.query.trim() }] : matches;
  }, [link, titles]);

  function applyEdit(edit) {
    const el = textareaRef.current;
    if (!edit || !el) return;
    el.focus();
    el.setSelectionRange(edit.start, edit.end);
    // execCommand keeps the browser's undo history working; fall back if unsupported.
    const ok =
      typeof document.execCommand === "function" &&
      document.execCommand("insertText", false, edit.text);
    if (!ok) {
      el.setRangeText(edit.text, edit.start, edit.end, "end");
      onChange(el.value);
    }
    el.setSelectionRange(edit.selStart, edit.selEnd);
  }

  function runAction(action) {
    const el = textareaRef.current;
    applyEdit(action.run(el.value, el.selectionStart, el.selectionEnd));
  }

  function indent(direction) {
    const el = textareaRef.current;
    const edit = indentList(el.value, el.selectionStart, el.selectionEnd, direction);
    if (edit) applyEdit(edit);
    else el.focus();
  }

  /** Remember the caret before a dialog takes focus. */
  function openPanel(next) {
    const el = textareaRef.current;
    savedSelection.current = el ? [el.selectionStart, el.selectionEnd] : null;
    setPanel(next);
  }

  /** Insert Markdown on its own line(s) where the caret was. */
  function insertBlock(markdown) {
    const el = textareaRef.current;
    const current = valueRef.current;
    if (!el) {
      onChange(`${current}${current && !current.endsWith("\n") ? "\n" : ""}${markdown}\n`);
      return;
    }
    const [s, e] = (savedSelection.current ?? [current.length, current.length]).map((n) => Math.min(n, current.length));
    // Blank lines around it, so it can't merge into a table, list or paragraph above.
    const before = current.slice(0, s);
    const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const text = `${lead}${markdown}\n\n`;
    applyEdit({ start: s, end: e, text, selStart: s + text.length, selEnd: s + text.length });
  }

  // Stable across renders, so the preview doesn't re-render on every keystroke.
  const previewActions = useMemo(
    () => ({
      onToggleTask: (line) => {
        const next = toggleTask(valueRef.current, line);
        if (next !== null) onChangeRef.current(next);
      },
      onEditDoodle: media ? (id) => setPanel({ doodle: id }) : undefined,
    }),
    [media],
  );

  function updateLinkQuery() {
    const el = textareaRef.current;
    if (!el || el.selectionStart !== el.selectionEnd) return setLink(null);
    const found = findLinkQuery(el.value, el.selectionStart);
    if (!found) return setLink(null);
    const coords = caretCoordinates(el, el.selectionStart);
    setLink((prev) => ({
      ...found,
      top: el.offsetTop + coords.top + coords.height + 4,
      left: Math.min(el.offsetLeft + coords.left, el.clientWidth - 240),
      active: prev && prev.start === found.start ? Math.min(prev.active, 8) : 0,
    }));
    return undefined;
  }

  function insertLink(title) {
    const el = textareaRef.current;
    if (!link || !el) return;
    // Replace what's typed after "[[" (and a "]]" right after the caret, if any) with "Title]]".
    const caret = el.selectionStart;
    const end = el.value.slice(caret, caret + 2) === "]]" ? caret + 2 : caret;
    const text = `${title}]]`;
    const pos = link.start + text.length;
    applyEdit({ start: link.start, end, text, selStart: pos, selEnd: pos });
    setLink(null);
  }

  function onKeyDown(e) {
    const el = e.currentTarget;
    if (link && suggestions.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setLink((l) => ({ ...l, active: (l.active + step + suggestions.length) % suggestions.length }));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertLink(suggestions[link.active]?.title ?? link.query);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setLink(null);
        return;
      }
    }
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Tables first, then lists; anywhere else Tab leaves the editor as usual.
      const edit =
        tableTab(el.value, el.selectionStart, e.shiftKey) ??
        indentList(el.value, el.selectionStart, el.selectionEnd, e.shiftKey ? -1 : 1);
      if (edit) {
        e.preventDefault();
        applyEdit(edit);
      }
      return;
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      const next = toggleTask(el.value, lineIndexAt(el.value, el.selectionStart));
      if (next !== null) {
        e.preventDefault();
        applyEdit(diffEdit(el.value, next, el.selectionStart, el.selectionEnd));
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
      const action = TOOLBAR_ACTIONS.find((a) => a.shortcut === e.key.toLowerCase());
      if (action) {
        e.preventDefault();
        runAction(action);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing) {
      const edit = continueList(el.value, el.selectionStart, el.selectionEnd);
      if (edit) {
        e.preventDefault();
        applyEdit(edit);
      }
    }
  }

  const panesStyle = view === "split" ? { gridTemplateColumns: `minmax(0, ${split}fr) 6px minmax(0, ${1 - split}fr)` } : undefined;

  return (
    <div className={`md-editor view-${view}`}>
      {view !== "preview" && (
        <div className="md-toolbar" role="toolbar" aria-label="Formatting">
          {TOOLBAR_GROUPS.map((group, gi) => (
            <span className="tool-group" key={gi}>
              {group.map((id) => {
                const action = TOOLBAR_ACTIONS.find((a) => a.id === id);
                return (
                  <ToolButton
                    key={id}
                    icon={action.icon}
                    label={action.label}
                    title={action.shortcut ? `${action.label} (${MOD}${action.shortcut.toUpperCase()})` : action.label}
                    onClick={() => runAction(action)}
                  />
                );
              })}
              {gi === 1 && (
                <>
                  <ToolButton icon="outdent" label="Decrease indent" title="Decrease indent (Shift+Tab)" onClick={() => indent(-1)} />
                  <ToolButton icon="indent" label="Increase indent" title="Increase indent (Tab)" onClick={() => indent(1)} />
                </>
              )}
              {gi === 2 && (
                <ToolButton
                  icon="link2"
                  label="Link to another note"
                  title="Link to another note ([[)"
                  onClick={() => {
                    const el = textareaRef.current;
                    const selected = el.value.slice(el.selectionStart, el.selectionEnd);
                    applyEdit({
                      start: el.selectionStart,
                      end: el.selectionEnd,
                      text: `[[${selected}`,
                      selStart: el.selectionStart + 2 + selected.length,
                      selEnd: el.selectionStart + 2 + selected.length,
                    });
                    requestAnimationFrame(updateLinkQuery);
                  }}
                />
              )}
            </span>
          ))}
          <span className="tool-group">
            <span className="tool-anchor">
              <ToolButton
                icon="table"
                label="Insert table"
                title="Insert table"
                expanded={panel === "table"}
                onClick={() => (panel === "table" ? setPanel(null) : openPanel("table"))}
              />
              {panel === "table" && (
                <TablePicker
                  onClose={() => setPanel(null)}
                  onPick={(cols, rows) => {
                    setPanel(null);
                    const el = textareaRef.current;
                    const [s, e] = savedSelection.current ?? [el.value.length, el.value.length];
                    applyEdit(insertTable(el.value, s, e, cols, rows));
                  }}
                />
              )}
            </span>
            {media && (
              <>
                <ToolButton icon="doodle" label="Draw a doodle" title="Draw a doodle" onClick={() => openPanel({ doodle: null })} />
                <ToolButton icon="camera" label="Take or add a picture" title="Take or add a picture" onClick={() => openPanel("camera")} />
              </>
            )}
          </span>
        </div>
      )}
      <div className="md-panes" ref={panesRef} style={panesStyle}>
        {view !== "preview" && (
          <div className="md-input-wrap">
            <textarea
              id={textareaId}
              ref={textareaRef}
              className="md-input"
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                requestAnimationFrame(updateLinkQuery);
              }}
              onKeyDown={onKeyDown}
              onClick={updateLinkQuery}
              onKeyUp={(e) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) updateLinkQuery();
              }}
              onBlur={() => setTimeout(() => setLink(null), 150)}
              onScroll={() => link && updateLinkQuery()}
              placeholder={placeholder}
              spellCheck
              aria-label="Note content (Markdown)"
              aria-autocomplete="list"
              aria-expanded={Boolean(link && suggestions.length)}
            />
            {link && suggestions.length > 0 && (
              <ul className="link-suggestions" role="listbox" aria-label="Link to note" style={{ top: link.top, left: Math.max(8, link.left) }}>
                {suggestions.map((s, i) => (
                  <li
                    key={s.id ?? `new:${s.title}`}
                    role="option"
                    aria-selected={i === link.active}
                    className={i === link.active ? "active" : ""}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertLink(s.title);
                    }}
                  >
                    <Icon name={s.id ? "note" : "plus"} />
                    <span>{s.id ? s.title : `Link to new note “${s.title}”`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {view === "split" && (
          <Resizer
            label="Resize editor and preview"
            value={split}
            min={0.2}
            max={0.8}
            pxToValue={(dx) => dx / (panesRef.current?.clientWidth || 1000)}
            format={(v) => `editor ${Math.round(v * 100)} percent`}
            onChange={(v) => onSplitChange?.(v)}
            onReset={() => onSplitReset?.()}
          />
        )}
        {view !== "write" && (
          <div className="md-preview" aria-label="Preview" tabIndex={0} ref={previewRef}>
            <PreviewActions.Provider value={previewActions}>
              <MarkdownPreview content={deferredValue} resolveTitle={resolveTitle} />
            </PreviewActions.Provider>
          </div>
        )}
      </div>

      {panel?.doodle !== undefined && (
        <Suspense fallback={null}>
          <DoodleDialog
            open
            attachmentId={panel.doodle}
            noteId={noteId}
            onClose={() => setPanel(null)}
            onSaved={(attachment, isNew) => {
              setPanel(null);
              if (isNew) insertBlock(attachment.markdown);
              else toast.success("Doodle updated.");
            }}
          />
        </Suspense>
      )}
      {panel === "camera" && (
        <Suspense fallback={null}>
          <CameraDialog
            open
            noteId={noteId}
            onClose={() => setPanel(null)}
            onUploaded={(attachment) => {
              setPanel(null);
              insertBlock(attachment.markdown);
            }}
          />
        </Suspense>
      )}
    </div>
  );
});

const TOOLBAR_GROUPS = [
  ["bold", "italic", "heading"],
  ["bullets", "numbers", "tasks", "quote"],
  ["code", "link"],
];

function ToolButton({ icon, label, title, onClick, expanded }) {
  return (
    <button
      type="button"
      className="tool-btn"
      onMouseDown={(e) => e.preventDefault() /* keep the textarea selection */}
      onClick={onClick}
      aria-label={label}
      title={title ?? label}
      aria-expanded={expanded}
    >
      <Icon name={icon} />
    </button>
  );
}

export default MarkdownEditor;
