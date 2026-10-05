import { useDeferredValue, useRef } from "react";
import { TOOLBAR_ACTIONS, continueList } from "../utils/markdown";
import Icon from "./Icon";
import MarkdownPreview from "./LazyMarkdownPreview";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl+";

/**
 * Markdown textarea + formatting toolbar + live preview.
 * `view` is "write" | "split" | "preview".
 */
export default function MarkdownEditor({ value, onChange, view, textareaId, placeholder }) {
  const textareaRef = useRef(null);
  // Typing stays responsive on long notes; the preview catches up a moment later.
  const deferredValue = useDeferredValue(value);

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

  function onKeyDown(e) {
    const el = e.currentTarget;
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

  return (
    <div className={`md-editor view-${view}`}>
      {view !== "preview" && (
        <div className="md-toolbar" role="toolbar" aria-label="Formatting">
          {TOOLBAR_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              className="tool-btn"
              onMouseDown={(e) => e.preventDefault() /* keep the textarea selection */}
              onClick={() => runAction(action)}
              aria-label={action.label}
              title={action.shortcut ? `${action.label} (${MOD}${action.shortcut.toUpperCase()})` : action.label}
            >
              <Icon name={action.icon} />
            </button>
          ))}
        </div>
      )}
      <div className="md-panes">
        {view !== "preview" && (
          <textarea
            id={textareaId}
            ref={textareaRef}
            className="md-input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            spellCheck
            aria-label="Note content (Markdown)"
          />
        )}
        {view !== "write" && (
          <div className="md-preview" aria-label="Preview" tabIndex={0}>
            <MarkdownPreview content={deferredValue} />
          </div>
        )}
      </div>
    </div>
  );
}
