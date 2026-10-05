/** Sort options for the note list, and per-view memory of the chosen sort. */

export const SORT_OPTIONS = [
  { key: "relevance", label: "Best match", sort: "relevance", order: "desc", needs: "search" },
  { key: "updated", label: "Last edited", sort: "updated_at", order: "desc" },
  { key: "updated-asc", label: "Least recently edited", sort: "updated_at", order: "asc" },
  { key: "created", label: "Newest first", sort: "created_at", order: "desc" },
  { key: "created-asc", label: "Oldest first", sort: "created_at", order: "asc" },
  { key: "title", label: "Title (A–Z)", sort: "title", order: "asc" },
  { key: "title-desc", label: "Title (Z–A)", sort: "title", order: "desc" },
  { key: "manual", label: "Manual (drag to reorder)", sort: "position", order: "asc", needs: "folder" },
];

const BY_KEY = Object.fromEntries(SORT_OPTIONS.map((o) => [o.key, o]));
const STORAGE_KEY = "noteable.sortByView";

/** Which list is showing: a folder id, "unfiled", "pinned", "tags" or "all". */
export function viewKey({ folder, pinned, tags }) {
  if (pinned) return "pinned";
  if (folder) return folder;
  if (tags?.length) return "tags";
  return "all";
}

/** Options that make sense for this view. */
export function availableSorts({ folder, q }) {
  return SORT_OPTIONS.filter(
    (o) => (o.needs !== "search" || q) && (o.needs !== "folder" || Boolean(folder)),
  );
}

function storedSorts() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export function rememberSort(view, key) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...storedSorts(), [view]: key }));
  } catch {
    /* ignore */
  }
}

/**
 * The sort to use: the URL wins, then this view's remembered choice, then
 * "Best match" while searching, else "Last edited". Falls back if the choice
 * doesn't apply here (e.g. manual order outside a folder).
 */
export function resolveSort({ urlSort, folder, q, view }) {
  const allowed = new Set(availableSorts({ folder, q }).map((o) => o.key));
  for (const candidate of [urlSort, storedSorts()[view], q ? "relevance" : null, "updated"]) {
    if (candidate && allowed.has(candidate)) return candidate;
  }
  return "updated";
}

export function sortQuery(key) {
  const option = BY_KEY[key] ?? BY_KEY.updated;
  return { sort: option.sort, order: option.order };
}
