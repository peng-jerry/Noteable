import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortError, notesApi } from "../api";

const PER_PAGE = 50;
const EXCERPT_LENGTH = 160; // same as the backend

export function toSummary(note) {
  const text = (note.content ?? "").split(/\s+/).filter(Boolean).join(" ");
  const excerpt =
    note.excerpt ?? (text.length <= EXCERPT_LENGTH ? text : `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…`);
  const { content: _content, ...rest } = note;
  return { ...rest, excerpt };
}

/**
 * Does a (full) note belong in the list for these filters? Returns null when
 * we can't tell locally (free-text search), meaning "leave it where it is".
 */
export function matches(note, query) {
  if (query.folder_id === "unfiled" && note.folder_id !== null) return false;
  if (query.folder_id && query.folder_id !== "unfiled" && note.folder_id !== query.folder_id) return false;
  if (query.pinned === true && !note.is_pinned) return false;
  if (query.tags) {
    const ids = new Set((note.tags ?? []).map((t) => t.id));
    if (!query.tags.split(",").every((id) => ids.has(id))) return false;
  }
  if (query.q) return null;
  return true;
}

/** Same ordering as the API. */
export function sortNotes(notes, { sort = "updated_at", order = "desc" }) {
  if (sort === "relevance") return notes;
  const dir = order === "asc" ? 1 : -1;
  return [...notes].sort((a, b) => {
    if (sort === "position") return a.position - b.position || (a.created_at < b.created_at ? 1 : -1);
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    const av = sort === "title" ? a.title.toLowerCase() : a[sort];
    const bv = sort === "title" ? b.title.toLowerCase() : b[sort];
    if (av < bv) return -dir;
    if (av > bv) return dir;
    return a.id < b.id ? -1 : 1;
  });
}

/**
 * Paged note list for a filter query, plus local updates so edits made in
 * the editor show up in the list immediately without refetching.
 */
export default function useNoteList(query) {
  const [state, setState] = useState({ status: "loading", notes: [], pagination: null, search: null, error: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const queryKey = JSON.stringify(query);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, status: "loading", error: null }));
    notesApi
      .list({ ...queryRef.current, page: 1, per_page: PER_PAGE }, { signal: controller.signal })
      .then((data) =>
        setState({
          status: "ready",
          notes: data.notes,
          pagination: data.pagination,
          search: data.search ?? null,
          error: null,
        }),
      )
      .catch((error) => {
        if (!isAbortError(error)) setState((s) => ({ ...s, status: "error", error }));
      });
    return () => controller.abort();
  }, [queryKey, reloadKey]);

  const loadMore = useCallback(async () => {
    const { pagination } = state;
    if (!pagination?.has_next || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await notesApi.list({ ...queryRef.current, page: pagination.page + 1, per_page: PER_PAGE });
      setState((s) => {
        const seen = new Set(s.notes.map((n) => n.id));
        return {
          ...s,
          notes: [...s.notes, ...data.notes.filter((n) => !seen.has(n.id))],
          pagination: data.pagination,
        };
      });
    } finally {
      setLoadingMore(false);
    }
  }, [state, loadingMore]);

  /** Insert or update a note after it's created/edited elsewhere. */
  const upsert = useCallback((note) => {
    setState((s) => {
      const exists = s.notes.some((n) => n.id === note.id);
      const belongs = matches(note, queryRef.current);
      let notes = s.notes;
      let total = s.pagination?.total ?? 0;
      const summary = toSummary(note);
      if (belongs === null) {
        // Searching: we can't re-run the search locally, so only refresh in place.
        if (!exists) return s;
        notes = notes.map((n) => (n.id === note.id ? { ...summary, excerpt: n.excerpt } : n));
      } else if (belongs) {
        notes = exists ? notes.map((n) => (n.id === note.id ? summary : n)) : [summary, ...notes];
        if (!exists) total += 1;
      } else if (exists) {
        notes = notes.filter((n) => n.id !== note.id);
        total -= 1;
      }
      return {
        ...s,
        notes: sortNotes(notes, queryRef.current),
        pagination: s.pagination && { ...s.pagination, total },
      };
    });
  }, []);

  const remove = useCallback((id) => {
    setState((s) => {
      if (!s.notes.some((n) => n.id === id)) return s;
      return {
        ...s,
        notes: s.notes.filter((n) => n.id !== id),
        pagination: s.pagination && { ...s.pagination, total: s.pagination.total - 1 },
      };
    });
  }, []);

  /** Show a new manual order immediately (the caller saves it). */
  const setOrder = useCallback((ids) => {
    setState((s) => {
      const byId = new Map(s.notes.map((n) => [n.id, n]));
      const ordered = ids.map((id, index) => ({ ...byId.get(id), position: index })).filter((n) => n.id);
      const rest = s.notes.filter((n) => !ids.includes(n.id));
      return { ...s, notes: [...ordered, ...rest] };
    });
  }, []);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { ...state, query, loadingMore, loadMore, upsert, remove, setOrder, reload };
}
