/** Helpers for the flat folder list returned by GET /folders. */

export const MAX_DEPTH = 10; // must match the backend

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

/** Turn the flat list into a sorted tree: [{...folder, children: [...]}]. */
export function buildTree(folders) {
  const nodes = new Map(folders.map((f) => [f.id, { ...f, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id && nodes.get(node.parent_id);
    (parent ? parent.children : roots).push(node);
  }
  const sortDeep = (list) => {
    list.sort(byName);
    list.forEach((n) => sortDeep(n.children));
    return list;
  };
  return sortDeep(roots);
}

/** IDs of every folder nested anywhere inside `folderId`. */
export function descendantIds(folders, folderId) {
  const children = new Map();
  for (const f of folders) {
    if (!children.has(f.parent_id)) children.set(f.parent_id, []);
    children.get(f.parent_id).push(f.id);
  }
  const found = new Set();
  const stack = [folderId];
  while (stack.length) {
    for (const child of children.get(stack.pop()) ?? []) {
      if (!found.has(child)) {
        found.add(child);
        stack.push(child);
      }
    }
  }
  return found;
}

/** Folders from the top level down to and including `folderId`. */
export function pathTo(folders, folderId) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = [];
  let current = byId.get(folderId);
  while (current && path.length <= MAX_DEPTH) {
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : null;
  }
  return path;
}

/** What deleting a folder will remove: { folders, notes } including itself. */
export function deletionImpact(folders, folderId) {
  const ids = descendantIds(folders, folderId);
  ids.add(folderId);
  const notes = folders.filter((f) => ids.has(f.id)).reduce((sum, f) => sum + (f.note_count || 0), 0);
  return { folders: ids.size, notes };
}

/**
 * Flattened, indented options for a folder <select>, in tree order.
 * `exclude` hides a folder and its subtree (when moving a folder).
 */
export function folderOptions(folders, { exclude } = {}) {
  const hidden = exclude ? new Set([exclude, ...descendantIds(folders, exclude)]) : new Set();
  const out = [];
  const walk = (nodes, depth) => {
    for (const node of nodes) {
      if (hidden.has(node.id)) continue;
      out.push({ id: node.id, name: node.name, depth, label: `${"  ".repeat(depth)}${node.name}` });
      walk(node.children, depth + 1);
    }
  };
  walk(buildTree(folders), 0);
  return out;
}
