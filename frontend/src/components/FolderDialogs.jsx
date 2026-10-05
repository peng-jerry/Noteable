import { useEffect, useState } from "react";
import { foldersApi } from "../api";
import { deletionImpact, folderOptions } from "../utils/folders";
import Dialog from "./Dialog";
import { useToast } from "./Toasts";

/** Create (optionally inside `parent`) or rename (`folder`) a folder. */
export function FolderNameDialog({ open, folder, parent, onClose, onDone }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const renaming = Boolean(folder);

  useEffect(() => {
    if (open) {
      setName(folder?.name ?? "");
      setError("");
      setBusy(false);
    }
  }, [open, folder]);

  async function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError("Enter a folder name.");
    if (trimmed.length > 100) return setError("Folder names can be at most 100 characters.");
    if (renaming && trimmed === folder.name) return onClose();

    setBusy(true);
    setError("");
    try {
      const result = renaming
        ? await foldersApi.update(folder.id, { name: trimmed })
        : await foldersApi.create({ name: trimmed, parent_id: parent?.id ?? null });
      toast.success(renaming ? "Folder renamed." : `Created "${result.name}".`);
      onDone(result, !renaming);
    } catch (err) {
      setError(err.fieldErrors?.name || err.fieldErrors?.parent_id || err.message);
      setBusy(false);
    }
  }

  const title = renaming ? "Rename folder" : parent ? `New folder in "${parent.name}"` : "New folder";

  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="folder-name">Name</label>
          <input
            id="folder-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "folder-name-error" : undefined}
          />
          {error && (
            <p className="field-error" id="folder-name-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : renaming ? "Rename" : "Create"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function MoveFolderDialog({ open, folder, folders, onClose, onDone }) {
  const toast = useToast();
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setTarget(folder?.parent_id ?? "");
      setError("");
      setBusy(false);
    }
  }, [open, folder]);

  if (!folder) return null;
  const options = folderOptions(folders, { exclude: folder.id });

  async function submit(e) {
    e.preventDefault();
    const parentId = target || null;
    if (parentId === folder.parent_id) return onClose();
    setBusy(true);
    setError("");
    try {
      await foldersApi.update(folder.id, { parent_id: parentId });
      toast.success(`Moved "${folder.name}".`);
      onDone();
    } catch (err) {
      setError(err.fieldErrors?.parent_id || err.fieldErrors?.name || err.message);
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} title={`Move "${folder.name}"`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="move-target">Move into</label>
          <select id="move-target" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Top level (no parent)</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Moving…" : "Move"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function DeleteFolderDialog({ open, folder, folders, onClose, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setBusy(false);
  }, [open]);

  if (!folder) return null;
  const impact = deletionImpact(folders, folder.id);
  const subfolders = impact.folders - 1;

  async function confirm() {
    setBusy(true);
    try {
      const result = await foldersApi.remove(folder.id);
      const { notes } = result.deleted;
      toast.success(`Deleted "${folder.name}"${notes ? ` and ${plural(notes, "note")}` : ""}.`);
      onDone(folder);
    } catch (err) {
      toast.error(err);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Delete folder?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={confirm} disabled={busy}>
            {busy ? "Deleting…" : "Delete folder"}
          </button>
        </>
      }
    >
      <p>
        <strong>{folder.name}</strong> will be permanently deleted
        {subfolders || impact.notes ? (
          <>
            {" "}
            along with{" "}
            {[subfolders && plural(subfolders, "subfolder"), impact.notes && plural(impact.notes, "note")]
              .filter(Boolean)
              .join(" and ")}{" "}
            inside it
          </>
        ) : null}
        . This can't be undone.
      </p>
    </Dialog>
  );
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
