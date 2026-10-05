import { useDroppable } from "@dnd-kit/core";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { foldersApi, transferApi } from "../api";
import { descendantIds, pathTo } from "../utils/folders";
import { downloadFile, safeFileName } from "../utils/notes";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { DeleteFolderDialog, FolderNameDialog, MoveFolderDialog } from "./FolderDialogs";
import FolderTree from "./FolderTree";
import Icon from "./Icon";
import Menu from "./Menu";
import Spinner from "./Spinner";
import { DeleteTagDialog, EditTagDialog } from "./TagDialogs";
import { TagChip } from "./Tags";
import { useToast } from "./Toasts";

const EXPANDED_KEY = "noteable.expandedFolders";

function loadExpanded() {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY)) || []);
  } catch {
    return new Set();
  }
}

/** Build a /notes URL that keeps the other filters but changes some. */
function notesUrl(filters, changes) {
  const params = new URLSearchParams();
  const next = { folder: filters.folder, pinned: filters.pinned, tags: filters.tags, ...changes };
  if (next.folder) params.set("folder", next.folder);
  if (next.pinned) params.set("pinned", "1");
  if (next.tags?.length) params.set("tags", next.tags.join(","));
  const qs = params.toString();
  return `/notes${qs ? `?${qs}` : ""}`;
}

export default function Sidebar({ filters, mode, onClose }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { folders, tags, trashCount, refresh, reloadFolders } = useWorkspace();
  const [expanded, setExpanded] = useState(loadExpanded);
  // { type: "create" | "rename" | "move" | "delete" | "edit-tag" | "delete-tag", folder?, parentId?, tag? }
  const [dialog, setDialog] = useState(null);

  const total = folders.list.reduce((sum, f) => sum + (f.note_count || 0), folders.unfiledCount);
  const inNotes = mode === "notes";
  const selected = !inNotes ? mode : filters.pinned ? "pinned" : filters.folder ?? (filters.tags.length ? "tags" : "all");
  const starred = folders.list.filter((f) => f.is_starred).sort((a, b) => a.name.localeCompare(b.name));
  const activeTags = new Set(inNotes ? filters.tags : []);

  // Make sure the selected folder is visible by expanding its parents.
  useEffect(() => {
    if (!filters.folder || filters.folder === "unfiled") return;
    const ancestors = pathTo(folders.list, filters.folder).slice(0, -1);
    if (ancestors.some((f) => !expanded.has(f.id))) {
      setExpanded((prev) => new Set([...prev, ...ancestors.map((f) => f.id)]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.folder, folders.list]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
    } catch {
      /* ignore */
    }
  }, [expanded]);

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function afterChange({ removedIds } = {}) {
    // Leave a removed folder's view first, so nothing tries to load it again.
    // Navigating reloads the list by itself, so skip the extra (stale) reload.
    if (removedIds && filters.folder && removedIds.has(filters.folder)) {
      navigate("/notes", { replace: true });
      refresh({ notes: false });
      return;
    }
    refresh();
  }

  async function folderAction(type, folder) {
    if (type === "subfolder") return setDialog({ type: "create", parentId: folder.id });
    if (type === "star") {
      try {
        await foldersApi.update(folder.id, { is_starred: !folder.is_starred });
        reloadFolders();
      } catch (err) {
        toast.error(err);
      }
      return undefined;
    }
    if (type === "export") {
      try {
        const blob = await transferApi.exportZip(folder.id);
        downloadFile(`${safeFileName(folder.name)}.zip`, blob);
      } catch (err) {
        toast.error(err);
      }
      return undefined;
    }
    return setDialog({ type, folder });
  }

  function toggleTag(tag) {
    const next = activeTags.has(tag.id) ? filters.tags.filter((id) => id !== tag.id) : [...(inNotes ? filters.tags : []), tag.id];
    navigate(notesUrl(inNotes ? filters : { tags: [] }, { tags: next }));
  }

  return (
    <aside className="sidebar" id="sidebar" aria-label="Folders and tags">
      <div className="sidebar-scroll">
        <nav className="sidebar-section" aria-label="Views">
          <SidebarLink to="/notes" icon="notes" label="All notes" count={total} active={selected === "all"} />
          <SidebarLink to="/notes?pinned=1" icon="pin" label="Pinned" active={selected === "pinned"} />
          <UnfiledLink count={folders.unfiledCount} active={selected === "unfiled"} />
        </nav>

        {starred.length > 0 && (
          <>
            <div className="sidebar-heading">
              <span>Starred</span>
            </div>
            <nav className="sidebar-section" aria-label="Starred folders">
              {starred.map((f) => (
                <SidebarLink
                  key={f.id}
                  to={`/notes?folder=${f.id}`}
                  icon="star"
                  label={f.name}
                  count={f.note_count}
                  active={selected === f.id}
                  className="starred-link"
                />
              ))}
            </nav>
          </>
        )}

        <FoldersHeading onNew={() => setDialog({ type: "create", parentId: null })} />

        <div className="sidebar-tree">
          {folders.status === "loading" && (
            <div className="sidebar-placeholder">
              <Spinner /> Loading folders…
            </div>
          )}
          {folders.status === "error" && (
            <div className="sidebar-placeholder error">
              <p>{folders.error?.message || "Couldn't load folders."}</p>
              <button type="button" className="btn btn-sm" onClick={reloadFolders}>
                <Icon name="refresh" /> Retry
              </button>
            </div>
          )}
          {folders.status === "ready" && folders.list.length === 0 && (
            <p className="sidebar-placeholder muted">
              No folders yet.{" "}
              <button type="button" className="link-btn" onClick={() => setDialog({ type: "create", parentId: null })}>
                Create one
              </button>
            </p>
          )}
          {folders.status === "ready" && folders.list.length > 0 && (
            <FolderTree
              folders={folders.list}
              selectedId={inNotes && !filters.pinned ? filters.folder : null}
              expanded={expanded}
              onToggle={toggle}
              onAction={folderAction}
            />
          )}
        </div>

        <div className="sidebar-heading">
          <span>Tags</span>
          {activeTags.size > 0 && (
            <Link to={notesUrl(filters, { tags: [] })} className="sidebar-clear">
              Clear
            </Link>
          )}
        </div>
        {tags.list.length === 0 ? (
          <p className="sidebar-placeholder muted small">Add tags to a note from the editor and they'll show up here.</p>
        ) : (
          <ul className="tag-list">
            {tags.list.map((tag) => (
              <li key={tag.id} className={`tag-row ${activeTags.has(tag.id) ? "active" : ""}`}>
                <button
                  type="button"
                  className="tag-filter"
                  aria-pressed={activeTags.has(tag.id)}
                  onClick={() => toggleTag(tag)}
                  title={activeTags.has(tag.id) ? "Remove this tag from the filter" : "Show notes with this tag"}
                >
                  <TagChip tag={tag} size="sm" />
                  {tag.note_count > 0 && <span className="count">{tag.note_count}</span>}
                </button>
                <Menu
                  className="row-menu"
                  label={`Actions for tag ${tag.name}`}
                  trigger={<Icon name="more" />}
                  items={[
                    { label: "Rename or recolour", icon: <Icon name="pen" />, onSelect: () => setDialog({ type: "edit-tag", tag }) },
                    { label: "Delete tag", icon: <Icon name="trash" />, danger: true, onSelect: () => setDialog({ type: "delete-tag", tag }) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <nav className="sidebar-footer" aria-label="More">
        <SidebarLink to="/templates" icon="template" label="Templates" active={selected === "templates"} />
        <SidebarLink to="/trash" icon="trash" label="Trash" count={trashCount} active={selected === "trash"} />
        <button type="button" className="sidebar-close btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </nav>

      <FolderNameDialog
        open={dialog?.type === "create" || dialog?.type === "rename"}
        folder={dialog?.type === "rename" ? dialog.folder : null}
        parent={dialog?.parentId ? folders.list.find((f) => f.id === dialog.parentId) : null}
        onClose={() => setDialog(null)}
        onDone={(folder, created) => {
          setDialog(null);
          if (created && folder.parent_id) setExpanded((prev) => new Set([...prev, folder.parent_id]));
          afterChange();
          if (created) navigate(`/notes?folder=${folder.id}`);
        }}
      />
      <MoveFolderDialog
        open={dialog?.type === "move"}
        folder={dialog?.folder}
        folders={folders.list}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          afterChange();
        }}
      />
      <DeleteFolderDialog
        open={dialog?.type === "delete"}
        folder={dialog?.folder}
        folders={folders.list}
        onClose={() => setDialog(null)}
        onDone={(folder) => {
          setDialog(null);
          const removedIds = descendantIds(folders.list, folder.id);
          removedIds.add(folder.id);
          afterChange({ removedIds });
        }}
      />
      <EditTagDialog
        open={dialog?.type === "edit-tag"}
        tag={dialog?.tag}
        colors={tags.colors}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          refresh();
        }}
      />
      <DeleteTagDialog
        open={dialog?.type === "delete-tag"}
        tag={dialog?.tag}
        onClose={() => setDialog(null)}
        onDone={(tag) => {
          setDialog(null);
          if (activeTags.has(tag.id)) navigate(notesUrl(filters, { tags: filters.tags.filter((id) => id !== tag.id) }));
          refresh();
        }}
      />
    </aside>
  );
}

function SidebarLink({ to, icon, label, count, active, className = "" }) {
  return (
    <Link to={to} className={`sidebar-link ${active ? "active" : ""} ${className}`} aria-current={active ? "page" : undefined}>
      <Icon name={icon} />
      <span className="sidebar-link-label">{label}</span>
      {count > 0 && <span className="count">{count}</span>}
    </Link>
  );
}

/** "Unfiled" doubles as a drop target for notes. */
function UnfiledLink({ count, active }) {
  const { setNodeRef, isOver, active: dragging } = useDroppable({
    id: "drop:unfiled",
    data: { type: "folder-target", folderId: null, accepts: ["note"] },
  });
  const canDrop = dragging?.data.current?.type === "note";
  return (
    <div ref={setNodeRef} className={canDrop && isOver ? "drop-over" : ""}>
      <SidebarLink to="/notes?folder=unfiled" icon="inbox" label="Unfiled" count={count} active={active} />
    </div>
  );
}

/** The "Folders" heading is where you drop a folder to make it top-level. */
function FoldersHeading({ onNew }) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: "drop:root",
    data: { type: "folder-target", folderId: null, accepts: ["folder"] },
  });
  const canDrop = active?.data.current?.type === "folder";
  return (
    <div ref={setNodeRef} className={`sidebar-heading ${canDrop && isOver ? "drop-over" : ""}`}>
      <span>{canDrop ? "Drop here for top level" : "Folders"}</span>
      <button type="button" className="icon-btn icon-btn-sm" onClick={onNew} aria-label="New folder" title="New folder">
        <Icon name="folder-plus" />
      </button>
    </div>
  );
}
