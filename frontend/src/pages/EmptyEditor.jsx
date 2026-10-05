import Icon from "../components/Icon";

/** Shown in the editor pane when no note is open (index route of /notes). */
export default function EmptyEditor() {
  return (
    <div className="editor-message empty-editor">
      <Icon name="note" size={40} />
      <h2>Pick a note, or start a new one</h2>
      <p className="muted">
        Notes are written in Markdown and save automatically as you type.
      </p>
      <p className="muted small">
        Tip: <kbd>Ctrl</kbd>+<kbd>B</kbd> bold · <kbd>Ctrl</kbd>+<kbd>I</kbd> italic ·{" "}
        <kbd>Ctrl</kbd>+<kbd>K</kbd> link · <kbd>Ctrl</kbd>+<kbd>S</kbd> save now · type <kbd>[[</kbd> to link a note
      </p>
    </div>
  );
}
