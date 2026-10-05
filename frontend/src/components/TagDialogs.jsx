import { useEffect, useState } from "react";
import { tagsApi } from "../api";
import Dialog from "./Dialog";
import { TagChip } from "./Tags";
import { useToast } from "./Toasts";

export function EditTagDialog({ open, tag, colors, onClose, onDone }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [color, setColor] = useState("sky");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open && tag) {
      setName(tag.name);
      setColor(tag.color);
      setError("");
      setBusy(false);
    }
  }, [open, tag]);

  if (!tag) return null;

  async function submit(e) {
    e.preventDefault();
    const trimmed = name.trim().replace(/^#/, "");
    if (!trimmed) return setError("Enter a tag name.");
    if (trimmed.includes(",")) return setError("Tag names can't contain commas.");
    setBusy(true);
    try {
      const body = {};
      if (trimmed !== tag.name) body.name = trimmed;
      if (color !== tag.color) body.color = color;
      if (Object.keys(body).length) await tagsApi.update(tag.id, body);
      toast.success("Tag updated.");
      onDone();
    } catch (err) {
      setError(err.fieldErrors?.name || err.message);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} title="Edit tag" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="tag-name">Name</label>
          <input id="tag-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <fieldset className="field color-field">
          <legend>Colour</legend>
          <div className="swatches">
            {colors.map((c) => (
              <label key={c} className="swatch" data-color={c} title={c}>
                <input type="radio" name="tag-color" value={c} checked={color === c} onChange={() => setColor(c)} />
                <span className="sr-only">{c}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="muted small">
          Preview: <TagChip tag={{ name: name.trim() || tag.name, color }} size="sm" />
        </p>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function DeleteTagDialog({ open, tag, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setBusy(false);
  }, [open]);
  if (!tag) return null;

  async function confirm() {
    setBusy(true);
    try {
      await tagsApi.remove(tag.id);
      toast.success(`Deleted tag "${tag.name}".`);
      onDone(tag);
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Delete tag?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy}>
            {busy ? "Deleting…" : "Delete tag"}
          </button>
        </>
      }
    >
      <p>
        <TagChip tag={tag} size="sm" /> will be removed
        {tag.note_count ? ` from ${tag.note_count} note${tag.note_count === 1 ? "" : "s"}` : ""}. The notes
        themselves stay.
      </p>
    </Dialog>
  );
}
