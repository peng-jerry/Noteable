import { useDraggable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Suspense, lazy, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { notesApi, transferApi } from "../api";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { fullDate, relativeTime } from "../utils/date";
import { pathTo } from "../utils/folders";
import { plainText } from "../utils/markdown";
import { downloadFile, fillTemplate } from "../utils/notes";
import { availableSorts, rememberSort } from "../utils/sorting";
import { useWorkspace } from "../workspace/WorkspaceContext";
import Highlight from "./Highlight";
import Icon from "./Icon";
import Menu from "./Menu";
import NewNoteButton from "./NewNoteButton";
import Spinner from "./Spinner";
import { TagChip } from "./Tags";
import { useToast } from "./Toasts";

// Loaded on demand: includes the zip reader.
const ImportDialog = lazy(() => import("./ImportDialog"));

export default function NoteList({ filters, activeNoteId }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { folders: foldersState, tags, noteList, refresh } = useWorkspace();
  const folders = foldersState.list;
  const [search, setSearch] = useState(filters.q);
  const debouncedSearch = useDebouncedValue(search, 300);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(null); // null | { files?: FileList }
  const [fileDragOver, setFileDragOver] = useState(false);

  // Push the debounced search box into the URL (replace, so typing doesn't spam history).
  useEffect(() => {
    if (debouncedSearch.trim() === (params.get("q") ?? "")) return;
    const next = new URLSearchParams(params);
    if (debouncedSearch.trim()) next.set("q", debouncedSearch.trim());
    else next.delete("q");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Keep the box in sync when the URL changes (e.g. the user picks another folder).
  useEffect(() => {
    setSearch((current) => (current.trim() === filters.q ? current : filters.q));
  }, [filters.q]);

  const folderById = new Map(folders.map((f) => [f.id, f]));
  const tagById = new Map(tags.list.map((t) => [t.id, t]));
  const currentFolder = filters.folder && filters.folder !== "unfiled" ? folderById.get(filters.folder) : null;
  const activeTags = filters.tags.map((id) => tagById.get(id)).filter(Boolean);
  const heading = filters.pinned
    ? "Pinned"
    : filters.folder === "unfiled"
      ? "Unfiled"
      : currentFolder?.name ?? (filters.folder ? "Folder" : activeTags.length ? "Tagged" : "All notes");
  const breadcrumb = currentFolder ? pathTo(folders, currentFolder.id).slice(0, -1) : [];
  const showFolderNames = !currentFolder && filters.folder !== "unfiled";
  const listSearch = params.toString() ? `?${params.toString()}` : "";
  const manual = filters.sortKey === "manual";
  const searchTerms = noteList.search?.terms ?? [];

  async function createNote(template) {
    setCreating(true);
    try {
      const filled = template ? fillTemplate(template, { folder: currentFolder?.name ?? "" }) : {};
      const note = await notesApi.create({
        ...filled,
        folder_id: currentFolder?.id ?? null,
        is_pinned: filters.pinned,
        tags: activeTags.map((t) => t.name),
      });
      noteList.upsert(note);
      refresh({ notes: false });
      navigate(`/notes/${note.id}${listSearch}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setCreating(false);
    }
  }

  function setSort(value) {
    rememberSort(filters.view, value);
    const next = new URLSearchParams(params);
    next.set("sort", value);
    setParams(next, { replace: true });
  }

  async function exportAll() {
    try {
      const blob = await transferApi.exportZip(null);
      downloadFile(`Noteable export ${new Date().toISOString().slice(0, 10)}.zip`, blob);
    } catch (err) {
      toast.error(err);
    }
  }

  function removeTagFilter(tag) {
    const next = new URLSearchParams(params);
    const rest = filters.tags.filter((id) => id !== tag.id);
    if (rest.length) next.set("tags", rest.join(","));
    else next.delete("tags");
    setParams(next);
  }

  const { status, notes, pagination, error } = noteList;
  const folderMissing = status === "error" && error?.code === "folder_not_found";
  const total = pagination?.total ?? notes.length;
  const importTarget = currentFolder ?? null;

  const items = notes.map((note) => (
    <NoteItem
      key={note.id}
      note={note}
      manual={manual}
      active={note.id === activeNoteId}
      to={`/notes/${note.id}${listSearch}`}
      terms={searchTerms}
      folderName={showFolderNames && note.folder_id ? folderById.get(note.folder_id)?.name : null}
    />
  ));

  return (
    <section
      className={`list-pane ${fileDragOver ? "file-drag-over" : ""}`}
      aria-labelledby="list-heading"
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          setFileDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFileDragOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setFileDragOver(false);
        setImporting({ files: e.dataTransfer.files });
      }}
    >
      <header className="list-header">
        <div className="list-title">
          {breadcrumb.length > 0 && (
            <nav className="breadcrumb" aria-label="Folder path">
              {breadcrumb.map((f) => (
                <span key={f.id}>
                  <Link to={`/notes?folder=${f.id}`}>{f.name}</Link>
                  <span aria-hidden="true"> / </span>
                </span>
              ))}
            </nav>
          )}
          <h1 id="list-heading">{heading}</h1>
          {status === "ready" && (
            <p className="muted small">
              {total} {total === 1 ? "note" : "notes"}
              {filters.q && <> matching “{filters.q}”</>}
            </p>
          )}
        </div>
        <div className="list-header-actions">
          <Menu
            label="More list actions"
            trigger={<Icon name="more" />}
            items={[
              { label: `Import into ${currentFolder ? `"${currentFolder.name}"` : "Unfiled"}…`, icon: <Icon name="upload" />, onSelect: () => setImporting({}) },
              { label: "Export all notes (.zip)", icon: <Icon name="download" />, onSelect: exportAll },
            ]}
          />
          <NewNoteButton onCreate={createNote} disabled={creating || folderMissing} />
        </div>
      </header>

      <div className="list-controls">
        <label className="search-box">
          <Icon name="search" />
          <span className="sr-only">Search notes</span>
          <input
            type="search"
            placeholder="Search… try tag:name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={200}
          />
        </label>
        <label className="sr-only" htmlFor="sort-select">
          Sort notes
        </label>
        <select id="sort-select" className="sort-select" value={filters.sortKey} onChange={(e) => setSort(e.target.value)}>
          {availableSorts({ folder: filters.folder, q: filters.q }).map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {activeTags.length > 0 && (
        <div className="active-filters" aria-label="Tag filters">
          <span className="muted small">Tagged</span>
          {activeTags.map((tag) => (
            <TagChip key={tag.id} tag={tag} size="sm" onRemove={removeTagFilter} />
          ))}
        </div>
      )}
      {manual && notes.length > 1 && (
        <p className="list-hint muted small">
          <Icon name="grip" /> Drag notes (or use a note's handle with the keyboard) to reorder them.
        </p>
      )}

      <div className="note-list-scroll">
        {status === "loading" && notes.length === 0 && <ListSkeleton />}

        {status === "error" && (
          <div className="list-message">
            {folderMissing ? (
              <>
                <p>This folder doesn't exist anymore.</p>
                <Link className="btn btn-sm" to="/notes">
                  Go to all notes
                </Link>
              </>
            ) : (
              <>
                <p>{error?.message || "Couldn't load notes."}</p>
                <button type="button" className="btn btn-sm" onClick={noteList.reload}>
                  <Icon name="refresh" /> Retry
                </button>
              </>
            )}
          </div>
        )}

        {status === "ready" && notes.length === 0 && (
          <div className="list-message">
            <Icon name={filters.q ? "search" : "note"} size={28} />
            {filters.q ? (
              <p>No notes match “{filters.q}”.</p>
            ) : filters.pinned ? (
              <p>No pinned notes. Pin a note to keep it at the top.</p>
            ) : activeTags.length ? (
              <p>No notes have {activeTags.length === 1 ? "this tag" : "all of these tags"}.</p>
            ) : (
              <>
                <p>No notes here yet.</p>
                <button type="button" className="btn btn-sm" onClick={() => createNote(null)} disabled={creating}>
                  <Icon name="plus" /> Write your first note
                </button>
                <button type="button" className="link-btn small" onClick={() => setImporting({})}>
                  or import Markdown files
                </button>
              </>
            )}
          </div>
        )}

        {notes.length > 0 &&
          (manual ? (
            <SortableContext items={notes.map((n) => n.id)} strategy={verticalListSortingStrategy}>
              <ul className={`note-list ${status === "loading" ? "is-refreshing" : ""}`}>{items}</ul>
            </SortableContext>
          ) : (
            <ul className={`note-list ${status === "loading" ? "is-refreshing" : ""}`}>{items}</ul>
          ))}

        {pagination?.has_next && (
          <div className="load-more">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => noteList.loadMore().catch((err) => toast.error(err))}
              disabled={noteList.loadingMore}
            >
              {noteList.loadingMore ? <Spinner size={14} /> : null} Load more
            </button>
          </div>
        )}
      </div>

      {fileDragOver && (
        <div className="file-drop-hint" aria-hidden="true">
          <Icon name="upload" size={28} />
          Drop to import into {currentFolder ? `"${currentFolder.name}"` : "Unfiled"}
        </div>
      )}

      {importing !== null && (
        <Suspense fallback={null}>
          <ImportDialog open folder={importTarget} initialFiles={importing.files} onClose={() => setImporting(null)} />
        </Suspense>
      )}
    </section>
  );
}

/**
 * One row. Always draggable onto sidebar folders; in manual sort it's also
 * sortable, with a keyboard-operable grip handle.
 */
function NoteItem({ note, manual, active, to, terms, folderName }) {
  const data = { type: "note", note };
  const sortable = useSortable({ id: note.id, data, disabled: !manual });
  const draggable = useDraggable({ id: `note:${note.id}`, data, disabled: manual });
  const dnd = manual ? sortable : draggable;
  const { onKeyDown: _keyboard, ...pointerListeners } = dnd.listeners ?? {};
  const style = manual
    ? { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }
    : undefined;

  return (
    <li ref={manual ? sortable.setNodeRef : undefined} style={style} className={dnd.isDragging ? "is-dragging" : ""}>
      <div className="note-item-wrap">
        {manual && (
          <button
            type="button"
            className="drag-handle"
            ref={sortable.setActivatorNodeRef}
            aria-label={`Reorder ${note.title}`}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <Icon name="grip" />
          </button>
        )}
        <Link
          ref={manual ? undefined : draggable.setNodeRef}
          to={to}
          className={`note-item ${active ? "active" : ""}`}
          aria-current={active ? "page" : undefined}
          draggable={false}
          {...pointerListeners}
        >
          <div className="note-item-top">
            <span className="note-item-title">
              <Highlight text={note.title} terms={terms} />
            </span>
            {note.is_pinned && <Icon name="pin" className="pin-icon" title="Pinned" />}
          </div>
          <p className="note-item-excerpt">
            {plainText(note.excerpt) ? <Highlight text={plainText(note.excerpt)} terms={terms} /> : <em>No content</em>}
          </p>
          <div className="note-item-meta">
            <time dateTime={note.updated_at} title={fullDate(note.updated_at, { time: true })}>
              {relativeTime(note.updated_at)}
            </time>
            {folderName && (
              <span className="note-item-folder">
                <Icon name="folder" /> {folderName}
              </span>
            )}
            {note.tags?.slice(0, 3).map((tag) => (
              <TagChip key={tag.id} tag={tag} size="xs" />
            ))}
            {note.tags?.length > 3 && <span className="count">+{note.tags.length - 3}</span>}
          </div>
        </Link>
      </div>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul className="note-list" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="note-skeleton">
          <span />
          <span />
          <span />
        </li>
      ))}
    </ul>
  );
}
