import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { notesApi } from "../api";
import useDebouncedValue from "../hooks/useDebouncedValue";
import { fullDate, relativeTime } from "../utils/date";
import { pathTo } from "../utils/folders";
import { plainText } from "../utils/markdown";
import Icon from "./Icon";
import Spinner from "./Spinner";
import { useToast } from "./Toasts";

export default function NoteList({ filters, folders, noteList, reloadFolders, activeNoteId }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState(filters.q);
  const debouncedSearch = useDebouncedValue(search, 300);
  const [creating, setCreating] = useState(false);

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
  const currentFolder = filters.folder && filters.folder !== "unfiled" ? folderById.get(filters.folder) : null;
  const heading = filters.pinned
    ? "Pinned"
    : filters.folder === "unfiled"
      ? "Unfiled"
      : currentFolder?.name ?? (filters.folder ? "Folder" : "All notes");
  const breadcrumb = currentFolder ? pathTo(folders, currentFolder.id).slice(0, -1) : [];
  const showFolderNames = !currentFolder && filters.folder !== "unfiled";
  const listSearch = params.toString() ? `?${params.toString()}` : "";

  async function createNote() {
    setCreating(true);
    try {
      const note = await notesApi.create({
        folder_id: currentFolder?.id ?? null,
        is_pinned: filters.pinned,
      });
      noteList.upsert(note);
      reloadFolders();
      navigate(`/notes/${note.id}${listSearch}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setCreating(false);
    }
  }

  function setSort(value) {
    const next = new URLSearchParams(params);
    if (value === "updated") next.delete("sort");
    else next.set("sort", value);
    setParams(next, { replace: true });
  }

  const { status, notes, pagination, error } = noteList;
  const folderMissing = status === "error" && error?.code === "folder_not_found";

  return (
    <section className="list-pane" aria-labelledby="list-heading">
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
              {pagination?.total ?? notes.length} {(pagination?.total ?? notes.length) === 1 ? "note" : "notes"}
              {filters.q && <> matching “{filters.q}”</>}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={createNote}
          disabled={creating || folderMissing}
          aria-label="New note"
        >
          <Icon name="plus" /> <span>New note</span>
        </button>
      </header>

      <div className="list-controls">
        <label className="search-box">
          <Icon name="search" />
          <span className="sr-only">Search notes</span>
          <input
            type="search"
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={200}
          />
        </label>
        <label className="sr-only" htmlFor="sort-select">
          Sort notes
        </label>
        <select
          id="sort-select"
          className="sort-select"
          value={filters.sortKey}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="updated">Last edited</option>
          <option value="created">Date created</option>
          <option value="title">Title (A–Z)</option>
        </select>
      </div>

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
            ) : (
              <>
                <p>No notes here yet.</p>
                <button type="button" className="btn btn-sm" onClick={createNote} disabled={creating}>
                  <Icon name="plus" /> Write your first note
                </button>
              </>
            )}
          </div>
        )}

        {notes.length > 0 && (
          <ul className={`note-list ${status === "loading" ? "is-refreshing" : ""}`}>
            {notes.map((note) => (
              <li key={note.id}>
                <Link
                  to={`/notes/${note.id}${listSearch}`}
                  className={`note-item ${note.id === activeNoteId ? "active" : ""}`}
                  aria-current={note.id === activeNoteId ? "page" : undefined}
                >
                  <div className="note-item-top">
                    <span className="note-item-title">{note.title}</span>
                    {note.is_pinned && <Icon name="pin" className="pin-icon" title="Pinned" />}
                  </div>
                  <p className="note-item-excerpt">{plainText(note.excerpt) || <em>No content</em>}</p>
                  <div className="note-item-meta">
                    <time dateTime={note.updated_at} title={fullDate(note.updated_at, { time: true })}>
                      {relativeTime(note.updated_at)}
                    </time>
                    {showFolderNames && note.folder_id && folderById.get(note.folder_id) && (
                      <span className="note-item-folder">
                        <Icon name="folder" /> {folderById.get(note.folder_id).name}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

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
    </section>
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
