import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { isAbortError, trashApi } from "../api";
import Icon from "../components/Icon";
import MarkdownPreview from "../components/LazyMarkdownPreview";
import Spinner from "../components/Spinner";
import { TagChip } from "../components/Tags";
import { useToast } from "../components/Toasts";
import { fullDate } from "../utils/date";
import { useWorkspace } from "../workspace/WorkspaceContext";

export function TrashEmptyPane() {
  return (
    <div className="editor-message">
      <Icon name="trash" size={36} />
      <h2>Trash</h2>
      <p className="muted">Pick a note to preview it before restoring. Folders restore with everything that was inside them.</p>
    </div>
  );
}

/** Read-only preview of a trashed note at /trash/:noteId. */
export function TrashNotePage() {
  const { noteId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh } = useWorkspace();
  const [state, setState] = useState({ status: "loading", note: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading", note: null, error: null });
    trashApi
      .note(noteId, { signal: controller.signal })
      .then((note) => setState({ status: "ready", note, error: null }))
      .catch((error) => !isAbortError(error) && setState({ status: "error", note: null, error }));
    return () => controller.abort();
  }, [noteId]);

  async function restore() {
    try {
      const note = await trashApi.restoreNote(noteId);
      refresh();
      toast.success(`Restored "${note.title}"${note.folder_id ? "" : " to Unfiled"}.`);
      navigate(`/notes/${note.id}`, { replace: true });
    } catch (err) {
      toast.error(err);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="editor-message">
        <Spinner size={24} />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div className="editor-message">
        <Icon name="alert" size={30} />
        <h2>{state.error?.status === 404 ? "Not in the trash" : "Couldn't open this note"}</h2>
        <p className="muted">{state.error?.status === 404 ? "It may have been restored or deleted forever." : state.error?.message}</p>
        <Link className="btn btn-ghost" to="/trash">
          Back to trash
        </Link>
      </div>
    );
  }

  const { note } = state;
  return (
    <article className="editor trash-preview" aria-label="Trashed note">
      <div className="editor-topbar">
        <Link to="/trash" className="icon-btn editor-back" aria-label="Back to trash">
          <Icon name="arrow-left" />
        </Link>
        <span className="save-status">
          <Icon name="trash" /> In the trash since {fullDate(note.deleted_at, { time: true })}
        </span>
        <div className="editor-actions">
          <button type="button" className="btn btn-sm btn-primary" onClick={restore}>
            <Icon name="restore" /> Restore
          </button>
        </div>
      </div>
      <div className="trash-preview-body">
        <h1 className="title-input">{note.title}</h1>
        {note.tags.length > 0 && (
          <p className="row-gap">
            {note.tags.map((t) => (
              <TagChip key={t.id} tag={t} size="sm" />
            ))}
          </p>
        )}
        <MarkdownPreview content={note.content} />
      </div>
    </article>
  );
}
