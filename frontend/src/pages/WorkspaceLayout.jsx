import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useParams, useSearchParams } from "react-router";
import { foldersApi } from "../api";
import AppHeader from "../components/AppHeader";
import NoteList from "../components/NoteList";
import Sidebar from "../components/Sidebar";
import useMediaQuery from "../hooks/useMediaQuery";
import useNoteList from "../hooks/useNoteList";

const SORTS = {
  updated: { sort: "updated_at", order: "desc" },
  created: { sort: "created_at", order: "desc" },
  title: { sort: "title", order: "asc" },
};

/** Read the list filters from the URL (?folder=…&pinned=1&q=…&sort=…). */
export function filtersFromParams(params) {
  const folder = params.get("folder");
  const sortKey = SORTS[params.get("sort")] ? params.get("sort") : "updated";
  return {
    folder, // folder id, "unfiled", or null for all notes
    pinned: params.get("pinned") === "1",
    q: params.get("q") ?? "",
    sortKey,
  };
}

/**
 * The private app shell at /notes: folders sidebar, note list and the editor
 * (child route). Desktop shows all three; narrower screens turn the sidebar
 * into a drawer, and phones show the list or the editor, one at a time.
 */
export default function WorkspaceLayout() {
  const [params] = useSearchParams();
  const { noteId } = useParams();
  const location = useLocation();
  const filters = filtersFromParams(params);
  const isPhone = useMediaQuery("(max-width: 699px)");
  const [drawerOpen, setDrawerOpen] = useState(false);

  /* ---- folders ---- */
  const [folders, setFolders] = useState({ status: "loading", list: [], unfiledCount: 0, error: null });

  const reloadFolders = useCallback(async () => {
    try {
      const data = await foldersApi.list();
      setFolders({ status: "ready", list: data.folders, unfiledCount: data.unfiled_note_count, error: null });
    } catch (error) {
      setFolders((f) => ({ ...f, status: f.status === "ready" ? "ready" : "error", error }));
    }
  }, []);

  useEffect(() => {
    reloadFolders();
  }, [reloadFolders]);

  /* ---- notes for the current filter ---- */
  const query = useMemo(
    () => ({
      folder_id: filters.folder || undefined,
      pinned: filters.pinned || undefined,
      q: filters.q || undefined,
      ...SORTS[filters.sortKey],
    }),
    [filters.folder, filters.pinned, filters.q, filters.sortKey],
  );
  const noteList = useNoteList(query);

  // Close the drawer whenever the user navigates.
  useEffect(() => setDrawerOpen(false), [location.pathname, location.search]);

  const outletContext = {
    folders: folders.list,
    foldersReady: folders.status === "ready",
    reloadFolders,
    upsertNote: noteList.upsert,
    removeNote: noteList.remove,
    listSearch: location.search,
  };

  const showList = !(isPhone && noteId);
  const showEditor = !isPhone || Boolean(noteId);

  return (
    <div className="app-shell">
      <AppHeader onMenuClick={() => setDrawerOpen((o) => !o)} menuOpen={drawerOpen} />
      <div className={`workspace ${drawerOpen ? "drawer-open" : ""}`}>
        <Sidebar
          folders={folders}
          filters={filters}
          onRetry={reloadFolders}
          reloadFolders={reloadFolders}
          reloadNotes={noteList.reload}
          onClose={() => setDrawerOpen(false)}
        />
        <button
          type="button"
          className="drawer-backdrop"
          aria-label="Close folders"
          tabIndex={-1}
          onClick={() => setDrawerOpen(false)}
        />
        {showList && (
          <NoteList
            filters={filters}
            folders={folders.list}
            noteList={noteList}
            reloadFolders={reloadFolders}
            activeNoteId={noteId}
          />
        )}
        {showEditor && (
          <main className="editor-pane" id="main">
            <Outlet context={outletContext} />
          </main>
        )}
      </div>
    </div>
  );
}
