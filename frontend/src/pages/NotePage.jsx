import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import { isAbortError, notesApi } from "../api";
import Dialog from "../components/Dialog";
import Icon from "../components/Icon";
import MarkdownEditor from "../components/MarkdownEditor";
import Spinner from "../components/Spinner";
import { useToast } from "../components/Toasts";
import useAutosave from "../hooks/useAutosave";
import useMediaQuery from "../hooks/useMediaQuery";
import { fullDate, relativeTime } from "../utils/date";
import { folderOptions } from "../utils/folders";

const VIEW_KEY = "noteable.editorView";

/** Route element for /notes/:noteId. Keyed so each note gets fresh editor state. */
export default function NotePage() {
  const { noteId } = useParams();
  return <NoteEditor key={noteId} noteId={noteId} />;
}

function NoteEditor({ noteId }) {
  const { folders, foldersReady, reloadFolders, upsertNote, removeNote, listSearch } = useOutletContext();
  const navigate = useNavigate();
  const toast = useToast();
  const isPhone = useMediaQuery("(max-width: 699px)");
  const backTo = `/notes${listSearch}`;

  const [load, setLoad] = useState({ status: "loading", error: null });
  const [note, setNote] = useState(null); // last version confirmed by the server
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) || "split";
    } catch {
      return "split";
    }
  });
  const titleRef = useRef(title);
  titleRef.current = title;

  /* ---- load ---- */
  const fetchNote = useCallback(
    (signal) => {
      setLoad({ status: "loading", error: null });
      notesApi
        .get(noteId, { signal })
        .then((data) => {
          setNote(data);
          setTitle(data.title === "Untitled" && !data.content ? "" : data.title);
          setContent(data.content);
          setLoad({ status: "ready", error: null });
        })
        .catch((error) => {
          if (!isAbortError(error)) setLoad({ status: "error", error });
        });
    },
    [noteId],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchNote(controller.signal);
    return () => controller.abort();
  }, [fetchNote]);

  /* ---- autosave ---- */
  const autosave = useAutosave((patch) => notesApi.update(noteId, patch), {
    onSaved: (saved) => {
      setNote((prev) => {
        if (prev && prev.folder_id !== saved.folder_id) reloadFolders();
        return saved;
      });
      upsertNote(saved);
    },
    onUnmountError: (err) => {
      if (err.status === 404) return; // the note itself was deleted; nothing to save into
      toast.error(`Couldn't save your last changes to "${titleRef.current || "Untitled"}": ${err.message}`);
    },
  });

  // Ctrl/Cmd+S saves immediately instead of opening the browser's save dialog.
  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        autosave.flush().catch(() => {});
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [autosave.flush]);

  // If the note's folder is deleted (from the sidebar), the note went with it.
  useEffect(() => {
    if (foldersReady && note?.folder_id && !folders.some((f) => f.id === note.folder_id)) {
      autosave.discard();
      removeNote(note.id);
      toast.info("This note's folder was deleted, so the note was deleted too.");
      // Don't send the user back to a folder view that no longer exists.
      const params = new URLSearchParams(listSearch);
      const listFolder = params.get("folder");
      if (listFolder && listFolder !== "unfiled" && !folders.some((f) => f.id === listFolder)) {
        params.delete("folder");
      }
      navigate(`/notes${params.size ? `?${params}` : ""}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders, foldersReady]);

  function changeView(next) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* ignore */
    }
  }

  async function deleteNote() {
    setDeleting(true);
    autosave.discard();
    try {
      await notesApi.remove(noteId);
      removeNote(noteId);
      reloadFolders();
      toast.success("Note deleted.");
      navigate(backTo, { replace: true });
    } catch (err) {
      toast.error(err);
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  /* ---- render ---- */
  if (load.status === "loading") {
    return (
      <div className="editor-message">
        <Spinner size={24} />
      </div>
    );
  }

  if (load.status === "error") {
    const missing = load.error?.status === 404;
    return (
      <div className="editor-message">
        <Icon name={missing ? "note" : "alert"} size={32} />
        <h2>{missing ? "Note not found" : "Couldn't open this note"}</h2>
        <p className="muted">
          {missing ? "It may have been deleted, or the link is wrong." : load.error?.message}
        </p>
        <div className="row-gap">
          {!missing && (
            <button type="button" className="btn" onClick={() => fetchNote()}>
              <Icon name="refresh" /> Retry
            </button>
          )}
          <Link className="btn btn-ghost" to={backTo}>
            Back to notes
          </Link>
        </div>
      </div>
    );
  }

  const effectiveView = isPhone && view === "split" ? "write" : view;
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const options = folderOptions(folders);

  return (
    <article className="editor" aria-label="Note editor">
      <div className="editor-topbar">
        <Link to={backTo} className="icon-btn editor-back" aria-label="Back to notes">
          <Icon name="arrow-left" />
        </Link>
        <SaveStatus status={autosave.status} error={autosave.error} updatedAt={note.updated_at} onRetry={() => autosave.flush().catch(() => {})} />
        <div className="editor-actions">
          <div className="segmented" role="group" aria-label="Editor view">
            <ViewButton current={effectiveView} value="write" icon="pen" label="Write" onSelect={changeView} />
            {!isPhone && (
              <ViewButton current={effectiveView} value="split" icon="columns" label="Split" onSelect={changeView} />
            )}
            <ViewButton current={effectiveView} value="preview" icon="eye" label="Preview" onSelect={changeView} />
          </div>
          <button
            type="button"
            className={`icon-btn ${note.is_pinned ? "is-on" : ""}`}
            aria-pressed={note.is_pinned}
            aria-label={note.is_pinned ? "Unpin note" : "Pin note"}
            title={note.is_pinned ? "Unpin" : "Pin to top"}
            onClick={() => {
              const next = !note.is_pinned;
              setNote({ ...note, is_pinned: next });
              autosave.queue({ is_pinned: next }, true);
            }}
          >
            <Icon name="pin" />
          </button>
          <button
            type="button"
            className="icon-btn danger"
            aria-label="Delete note"
            title="Delete note"
            onClick={() => setConfirmDelete(true)}
          >
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <div className="editor-meta">
        <label className="sr-only" htmlFor="note-title">
          Title
        </label>
        <input
          id="note-title"
          className="title-input"
          value={title}
          placeholder="Untitled"
          maxLength={200}
          autoFocus={!title && !content /* new, empty note */}
          onChange={(e) => {
            setTitle(e.target.value);
            autosave.queue({ title: e.target.value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              document.getElementById("note-body")?.focus();
            }
          }}
        />
        <div className="editor-meta-row">
          <label className="folder-picker">
            <Icon name="folder" />
            <span className="sr-only">Folder</span>
            <select
              value={note.folder_id ?? ""}
              onChange={(e) => {
                const folderId = e.target.value || null;
                setNote({ ...note, folder_id: folderId });
                autosave.queue({ folder_id: folderId }, true);
              }}
            >
              <option value="">Unfiled</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <span className="muted small">
            {words} {words === 1 ? "word" : "words"} · Created {fullDate(note.created_at)}
          </span>
        </div>
      </div>

      <MarkdownEditor
        textareaId="note-body"
        value={content}
        view={effectiveView}
        placeholder={"Start writing…\n\nMarkdown works here: # headings, **bold**, - lists, [links](https://…)"}
        onChange={(value) => {
          setContent(value);
          autosave.queue({ content: value });
        }}
      />

      <Dialog
        open={confirmDelete}
        title="Delete note?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={deleteNote} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </>
        }
      >
        <p>
          <strong>{title || "Untitled"}</strong> will be permanently deleted. This can't be undone.
        </p>
      </Dialog>
    </article>
  );
}

function ViewButton({ current, value, icon, label, onSelect }) {
  return (
    <button
      type="button"
      className={current === value ? "active" : ""}
      aria-pressed={current === value}
      onClick={() => onSelect(value)}
      title={label}
    >
      <Icon name={icon} />
      <span className="hide-md">{label}</span>
    </button>
  );
}

function SaveStatus({ status, error, updatedAt, onRetry }) {
  // Re-render every 30s so "Saved 2 minutes ago" stays accurate.
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  let content;
  if (status === "saving") content = <><Spinner size={12} /> Saving…</>;
  else if (status === "pending") content = <>Unsaved changes</>;
  else if (status === "error") {
    content = (
      <>
        <Icon name="alert" /> <span title={error?.message}>Couldn't save</span>
        <button type="button" className="link-btn" onClick={onRetry}>
          Retry
        </button>
      </>
    );
  } else content = <><Icon name="check" /> Saved {relativeTime(updatedAt)}</>;

  return (
    <div className={`save-status status-${status}`} role="status" aria-live="polite">
      {content}
    </div>
  );
}
