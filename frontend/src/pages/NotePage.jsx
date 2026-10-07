import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router";
import { isAbortError, notesApi, templatesApi, transferApi, trashApi } from "../api";
import Dialog from "../components/Dialog";
import Icon from "../components/Icon";
import InfoPanel from "../components/InfoPanel";
import MarkdownEditor from "../components/MarkdownEditor";
import MarkdownPreview from "../components/LazyMarkdownPreview";
import Menu from "../components/Menu";
import Spinner from "../components/Spinner";
import { TagChip, TagInput } from "../components/Tags";
import { useToast } from "../components/Toasts";
import useAutosave, { drafts } from "../hooks/useAutosave";
import { fullDate, relativeTime } from "../utils/date";
import { folderOptions } from "../utils/folders";
import { downloadFile, markdownToText, safeFileName } from "../utils/notes";
import { useWorkspace } from "../workspace/WorkspaceContext";

// Loaded on demand: the diff library is only needed when history is opened.
const VersionHistoryDialog = lazy(() => import("../components/VersionHistoryDialog"));

const VIEW_KEY = "noteable.editorView";
const INFO_KEY = "noteable.infoPanel";

const readPref = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

/** Route element for /notes/:noteId. Keyed so each note gets fresh editor state. */
export default function NotePage() {
  const { noteId } = useParams();
  return <NoteEditor key={noteId} noteId={noteId} />;
}

/** Which fields of a saved draft differ from the server's copy. */
function draftDifferences(draft, note) {
  if (!draft?.patch) return [];
  return Object.entries(draft.patch).filter(([field, value]) => {
    if (field === "tags") return JSON.stringify(value) !== JSON.stringify(note.tags.map((t) => t.name));
    return note[field] !== value && !(field === "title" && value === "" && note.title === "Untitled");
  });
}

function NoteEditor({ noteId }) {
  const ws = useWorkspace();
  const { folders, tags, titles, resolveTitle, noteList, refresh, reloadTitles, listSearch } = ws;
  const { layout, updateLayout, resetLayout, isPhone, listCollapsed, toggleList } = useOutletContext();
  const navigate = useNavigate();
  const toast = useToast();
  const backTo = `/notes${listSearch}`;
  const editorRef = useRef(null);

  const [load, setLoad] = useState({ status: "loading", error: null });
  const [note, setNote] = useState(null); // last version confirmed by the server (+ local folder/tags/pin)
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [recovery, setRecovery] = useState(null); // { draft, fields, serverNewer }
  const [dialog, setDialog] = useState(null); // "delete" | "history" | "template"
  const [deleting, setDeleting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [view, setView] = useState(() => readPref(VIEW_KEY, "split"));
  const [infoOpen, setInfoOpen] = useState(() => readPref(INFO_KEY, "0") === "1");
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
          const draft = drafts.read(noteId);
          const fields = draftDifferences(draft, data);
          if (fields.length) {
            setRecovery({ draft, fields: fields.map(([f]) => f), serverNewer: data.updated_at > draft.savedAt });
          } else if (draft) {
            drafts.clear(noteId);
          }
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
    draftId: noteId,
    onSaved: ({ note: saved, links_updated: linksUpdated }, patch) => {
      setNote((prev) => ({ ...saved, deleted_at: prev?.deleted_at ?? null }));
      noteList.upsert(saved);
      if ("folder_id" in patch || "tags" in patch) refresh({ notes: false });
      else if ("title" in patch) reloadTitles();
      if (linksUpdated) {
        toast.info(`Updated [[links]] in ${linksUpdated} other note${linksUpdated === 1 ? "" : "s"}.`);
      }
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

  // Reflect moves/tags changed elsewhere (e.g. dragged onto a folder in the sidebar).
  useEffect(
    () =>
      ws.subscribeNotes((changed) => {
        if (changed.id === noteId) {
          setNote((prev) => prev && { ...prev, folder_id: changed.folder_id, is_pinned: changed.is_pinned, tags: changed.tags });
        }
      }),
    [ws.subscribeNotes, noteId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // If the note's folder went to the trash (from the sidebar), the note went with it.
  useEffect(() => {
    if (folders.status === "ready" && note?.folder_id && !folders.list.some((f) => f.id === note.folder_id)) {
      autosave.discard();
      noteList.remove(note.id);
      toast.info("This note's folder was moved to the trash, so the note went with it.");
      const params = new URLSearchParams(listSearch);
      const listFolder = params.get("folder");
      if (listFolder && listFolder !== "unfiled" && !folders.list.some((f) => f.id === listFolder)) {
        params.delete("folder");
      }
      navigate(`/notes${params.size ? `?${params}` : ""}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folders.list, folders.status]);

  // Print: render the print-only copy, wait for the preview to load, then print.
  useEffect(() => {
    if (!printing) return undefined;
    let cancelled = false;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const tryPrint = (attempt = 0) => {
      if (cancelled) return;
      const ready = document.querySelector(".print-area .markdown-body, .print-area .preview-empty");
      const imagesLoading = document.querySelector(".print-area .attachment-placeholder:not(.error)");
      const imagesDecoding = [...document.querySelectorAll(".print-area img")].some((img) => !img.complete);
      if ((ready && !imagesLoading && !imagesDecoding) || attempt > 100) {
        window.print();
        setTimeout(done, 500);
      } else {
        setTimeout(() => tryPrint(attempt + 1), 50);
      }
    };
    tryPrint();
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  function changeView(next) {
    setView(next);
    writePref(VIEW_KEY, next);
  }

  function toggleInfo() {
    setInfoOpen((open) => {
      writePref(INFO_KEY, open ? "0" : "1");
      return !open;
    });
  }

  function applyRecovery() {
    const { patch } = recovery.draft;
    if ("title" in patch) setTitle(patch.title);
    if ("content" in patch) setContent(patch.content);
    setNote((prev) => ({
      ...prev,
      ...("folder_id" in patch ? { folder_id: patch.folder_id } : {}),
      ...("is_pinned" in patch ? { is_pinned: patch.is_pinned } : {}),
      ...("tags" in patch ? { tags: patch.tags.map((name) => tags.list.find((t) => t.name === name) ?? { id: `new:${name}`, name, color: "slate" }) } : {}),
    }));
    autosave.queue(patch, true);
    setRecovery(null);
    toast.success("Your unsaved changes were restored.");
  }

  function discardRecovery() {
    drafts.clear(noteId);
    setRecovery(null);
  }

  async function moveToTrash() {
    setDeleting(true);
    autosave.discard();
    try {
      await notesApi.remove(noteId);
      noteList.remove(noteId);
      refresh({ notes: false });
      toast.success(`Moved "${title || "Untitled"}" to the trash.`, {
        label: "Undo",
        onClick: async () => {
          try {
            const restored = await trashApi.restoreNote(noteId);
            noteList.upsert(restored);
            refresh({ notes: false });
            navigate(`/notes/${noteId}${listSearch}`);
          } catch (err) {
            toast.error(err);
          }
        },
      });
      navigate(backTo, { replace: true });
    } catch (err) {
      toast.error(err);
      setDeleting(false);
      setDialog(null);
    }
  }

  async function duplicate() {
    try {
      await autosave.flush();
      const copy = await notesApi.duplicate(noteId);
      noteList.upsert(copy);
      refresh({ notes: false });
      toast.success("Note duplicated.");
      navigate(`/notes/${copy.id}${listSearch}`);
    } catch (err) {
      toast.error(err);
    }
  }

  async function exportAs(kind) {
    const name = safeFileName(title || "Untitled");
    if (kind === "txt") {
      downloadFile(`${name}.txt`, `${title || "Untitled"}\n\n${markdownToText(content)}`);
    } else if (/attachment:[0-9a-f-]{36}/.test(content)) {
      // Pictures can't live inside a .md file, so it becomes a .zip with them.
      try {
        await autosave.flush();
        downloadFile(`${name}.zip`, await transferApi.exportZip(null, { noteId }));
      } catch (err) {
        toast.error(err);
      }
    } else {
      downloadFile(`${name}.md`, content, "text/markdown;charset=utf-8");
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
          {missing ? "It may have been moved to the trash, or the link is wrong." : load.error?.message}
        </p>
        <div className="row-gap">
          {!missing && (
            <button type="button" className="btn" onClick={() => fetchNote()}>
              <Icon name="refresh" /> Retry
            </button>
          )}
          {missing && (
            <Link className="btn" to="/trash">
              <Icon name="trash" /> Look in the trash
            </Link>
          )}
          <Link className="btn btn-ghost" to={backTo}>
            Back to notes
          </Link>
        </div>
      </div>
    );
  }

  const effectiveView = isPhone && view === "split" ? "write" : view;
  const options = folderOptions(folders.list);
  const linkTitles = titles.filter((t) => t.id !== noteId);

  const infoPanel = (
    <InfoPanel
      note={note}
      content={content}
      listSearch={listSearch}
      onClose={toggleInfo}
      onJump={(h) => {
        if (isPhone) toggleInfo();
        editorRef.current?.scrollToHeading(h.offset, h.slug);
      }}
    />
  );

  return (
    <article className="editor" aria-label="Note editor">
      <div className="editor-topbar">
        <Link to={backTo} className="icon-btn editor-back" aria-label="Back to notes">
          <Icon name="arrow-left" />
        </Link>
        {!isPhone && (
          <button
            type="button"
            className={`icon-btn ${listCollapsed ? "" : "is-on"} list-toggle`}
            onClick={toggleList}
            aria-pressed={!listCollapsed}
            aria-label={listCollapsed ? "Show note list" : "Hide note list"}
            title={listCollapsed ? "Show note list" : "Hide note list"}
          >
            <Icon name="list2" />
          </button>
        )}
        <SaveStatus
          status={autosave.status}
          error={autosave.error}
          updatedAt={note.updated_at}
          onRetry={() => autosave.flush().catch(() => {})}
        />
        <div className="editor-actions">
          <div className="segmented" role="group" aria-label="Editor view">
            <ViewButton current={effectiveView} value="write" icon="pen" label="Write" onSelect={changeView} />
            {!isPhone && <ViewButton current={effectiveView} value="split" icon="columns" label="Split" onSelect={changeView} />}
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
            className={`icon-btn ${infoOpen ? "is-on" : ""}`}
            aria-pressed={infoOpen}
            aria-label={infoOpen ? "Hide details" : "Show outline, stats and backlinks"}
            title="Outline, stats & backlinks"
            onClick={toggleInfo}
          >
            <Icon name="panel-right" />
          </button>
          <Menu
            label="More note actions"
            trigger={<Icon name="more" />}
            items={[
              { label: "Version history", icon: <Icon name="history" />, onSelect: () => setDialog("history") },
              { label: "Duplicate", icon: <Icon name="copy" />, onSelect: duplicate },
              { label: "Save as template", icon: <Icon name="template" />, onSelect: () => setDialog("template") },
              {
                label: /attachment:[0-9a-f-]{36}/.test(content) ? "Export with pictures (.zip)" : "Export as Markdown (.md)",
                icon: <Icon name="download" />,
                onSelect: () => exportAs("md"),
              },
              { label: "Export as text (.txt)", icon: <Icon name="download" />, onSelect: () => exportAs("txt") },
              { label: "Print or save as PDF", icon: <Icon name="printer" />, onSelect: () => setPrinting(true) },
              { label: "Move to trash", icon: <Icon name="trash" />, danger: true, onSelect: () => setDialog("delete") },
            ]}
          />
        </div>
      </div>

      {recovery && (
        <div className="recovery-banner" role="alert">
          <Icon name="alert" />
          <span>
            Changes to this note from {relativeTime(recovery.draft.savedAt)} never reached the server
            {recovery.serverNewer ? ", and the note has been edited since" : ""}.
          </span>
          <button type="button" className="btn btn-sm btn-primary" onClick={applyRecovery}>
            Restore them
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={discardRecovery}>
            Discard
          </button>
        </div>
      )}

      <div className={`editor-body ${infoOpen && !isPhone ? "with-info" : ""}`}>
        <div className="editor-main">
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
                  editorRef.current?.focus();
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
              <TagInput
                value={note.tags}
                allTags={tags.list}
                onChange={(next) => {
                  setNote({ ...note, tags: next });
                  autosave.queue({ tags: next.map((t) => t.name) }, true);
                }}
              />
            </div>
          </div>

          <MarkdownEditor
            ref={editorRef}
            textareaId="note-body"
            noteId={noteId}
            value={content}
            view={effectiveView}
            titles={linkTitles}
            resolveTitle={resolveTitle}
            split={layout.split}
            onSplitChange={(v) => updateLayout({ split: v })}
            onSplitReset={() => resetLayout("split")}
            placeholder={"Start writing…\n\nMarkdown works here: # headings, **bold**, - lists, [links](https://…)\nLink to another note with [[its title]]."}
            onChange={(value) => {
              setContent(value);
              autosave.queue({ content: value });
            }}
          />
        </div>
        {infoOpen && !isPhone && infoPanel}
      </div>

      {infoOpen && isPhone && (
        <Dialog open title="Details" onClose={toggleInfo} size="md">
          {infoPanel}
        </Dialog>
      )}

      <Dialog
        open={dialog === "delete"}
        title="Move note to trash?"
        onClose={() => setDialog(null)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={moveToTrash} disabled={deleting}>
              {deleting ? "Moving…" : "Move to trash"}
            </button>
          </>
        }
      >
        <p>
          <strong>{title || "Untitled"}</strong> will move to the trash. You can restore it from there for 30 days.
        </p>
      </Dialog>

      {dialog === "history" && (
        <Suspense fallback={null}>
      <VersionHistoryDialog
        open
        noteId={noteId}
        current={{ title: title || "Untitled", content }}
        onClose={() => setDialog(null)}
        beforeRestore={() => autosave.flush()}
        onRestored={(restored) => {
          autosave.discard();
          setNote((prev) => ({ ...prev, ...restored }));
          setTitle(restored.title);
          setContent(restored.content);
          noteList.upsert(restored);
          reloadTitles();
        }}
      />
        </Suspense>
      )}

      <SaveAsTemplateDialog
        open={dialog === "template"}
        title={title || "Untitled"}
        content={content}
        onClose={() => setDialog(null)}
        onSaved={() => {
          setDialog(null);
          ws.reloadTemplates();
        }}
      />

      {printing && (
        <div className="print-area" aria-hidden="true">
          <h1>{title || "Untitled"}</h1>
          {note.tags.length > 0 && (
            <p className="print-tags">
              {note.tags.map((t) => (
                <TagChip key={t.id} tag={t} size="sm" />
              ))}
            </p>
          )}
          <MarkdownPreview content={content} resolveTitle={resolveTitle} />
        </div>
      )}
    </article>
  );
}

function SaveAsTemplateDialog({ open, title, content, onClose, onSaved }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(title);
      setDescription("");
      setError("");
      setBusy(false);
    }
  }, [open, title]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setError("Give the template a name.");
    setBusy(true);
    try {
      const template = await templatesApi.create({ name: name.trim(), description: description.trim(), title, content });
      toast.success(`Saved template "${template.name}".`, {
        label: "Edit",
        onClick: () => navigate(`/templates/${template.id}`),
      });
      onSaved(template);
    } catch (err) {
      setError(err.fieldErrors?.name || err.message);
      setBusy(false);
    }
    return undefined;
  }

  return (
    <Dialog open={open} title="Save as template" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="tpl-name">Template name</label>
          <input id="tpl-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="tpl-desc">Description (optional)</label>
          <input id="tpl-desc" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <p className="muted small">
          The note's title and text are copied. Edit the template afterwards to add placeholders like{" "}
          <code>{"{{date}}"}</code>.
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
            {busy ? "Saving…" : "Save template"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ViewButton({ current, value, icon, label, onSelect }) {
  return (
    <button type="button" className={current === value ? "active" : ""} aria-pressed={current === value} onClick={() => onSelect(value)} title={label}>
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
  else if (status === "offline") {
    content = (
      <>
        <Icon name="alert" /> <span title="Your changes are kept in this browser and will be sent when you're back online.">Offline — saved on this device</span>
      </>
    );
  } else if (status === "error") {
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

