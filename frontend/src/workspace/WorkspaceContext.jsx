import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { foldersApi, notesApi, tagsApi, templatesApi, trashApi } from "../api";
import { titleResolver } from "../utils/notes";

const WorkspaceContext = createContext(null);

/** Load data with a reload function; keeps the last good data if a reload fails. */
function useResource(load, initial) {
  const [state, setState] = useState({ status: "loading", data: initial, error: null });
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      const data = await loadRef.current();
      setState({ status: "ready", data, error: null });
      return data;
    } catch (error) {
      setState((s) => ({ ...s, status: s.status === "ready" ? "ready" : "error", error }));
      return null;
    }
  }, []);

  return [state, reload];
}

/**
 * Data the whole workspace shares (folders, tags, note titles for [[links]],
 * trash count, templates) plus the current note list. Provided by
 * WorkspaceLayout; read with useWorkspace().
 */
export function WorkspaceProvider({ noteList, listSearch, children }) {
  const [folders, reloadFolders] = useResource(
    () => foldersApi.list().then((d) => ({ list: d.folders ?? [], unfiledCount: d.unfiled_note_count ?? 0 })),
    { list: [], unfiledCount: 0 },
  );
  const [tags, reloadTags] = useResource(
    () => tagsApi.list().then((d) => ({ list: d.tags ?? [], colors: d.colors ?? [] })),
    { list: [], colors: [] },
  );
  const [titles, reloadTitles] = useResource(() => notesApi.titles().then((t) => t ?? []), []);
  const [trash, reloadTrash] = useResource(() => trashApi.count().then((c) => c ?? 0), 0);
  const [templates, reloadTemplates] = useResource(() => templatesApi.list().then((t) => t ?? []), []);

  useEffect(() => {
    reloadFolders();
    reloadTags();
    reloadTitles();
    reloadTrash();
  }, [reloadFolders, reloadTags, reloadTitles, reloadTrash]);

  const noteListRef = useRef(noteList);
  noteListRef.current = noteList;

  /** After anything that may change counts, names or membership. */
  const refresh = useCallback(
    ({ notes = true } = {}) => {
      reloadFolders();
      reloadTags();
      reloadTitles();
      reloadTrash();
      if (notes) noteListRef.current.reload();
    },
    [reloadFolders, reloadTags, reloadTitles, reloadTrash],
  );

  const resolveTitle = useMemo(() => titleResolver(titles.data), [titles.data]);

  // Lets an open editor hear about changes made elsewhere (e.g. a note
  // dragged to another folder from the list).
  const listeners = useRef(new Set());
  const publishNote = useCallback((note) => {
    for (const fn of listeners.current) fn(note);
  }, []);
  const subscribeNotes = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const value = useMemo(
    () => ({
      folders: { ...folders, list: folders.data.list, unfiledCount: folders.data.unfiledCount },
      tags: { ...tags, list: tags.data.list, colors: tags.data.colors },
      titles: titles.data,
      resolveTitle,
      trashCount: trash.data,
      templates: { ...templates, list: templates.data },
      reloadFolders,
      reloadTags,
      reloadTitles,
      reloadTrash,
      reloadTemplates,
      refresh,
      publishNote,
      subscribeNotes,
      noteList,
      listSearch,
    }),
    [folders, tags, titles.data, resolveTitle, trash.data, templates, reloadFolders, reloadTags, reloadTitles, reloadTrash, reloadTemplates, refresh, publishNote, subscribeNotes, noteList, listSearch],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
