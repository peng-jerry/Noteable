import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { descendantIds, pathTo } from "../utils/folders";
import { DeleteFolderDialog, FolderNameDialog, MoveFolderDialog } from "./FolderDialogs";
import FolderTree from "./FolderTree";
import Icon from "./Icon";
import Spinner from "./Spinner";

const EXPANDED_KEY = "noteable.expandedFolders";

function loadExpanded() {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY)) || []);
  } catch {
    return new Set();
  }
}

export default function Sidebar({ folders, filters, onRetry, reloadFolders, reloadNotes, onClose }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(loadExpanded);
  // { type: "create" | "rename" | "move" | "delete", folder?, parentId? }
  const [dialog, setDialog] = useState(null);

  const total = folders.list.reduce((sum, f) => sum + (f.note_count || 0), folders.unfiledCount);
  const selected = filters.pinned ? "pinned" : filters.folder ?? "all";

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

  async function afterChange({ deletedIds } = {}) {
    // Leave a deleted folder's view first, so nothing tries to load it again.
    if (deletedIds && filters.folder && deletedIds.has(filters.folder)) {
      navigate("/notes", { replace: true });
    }
    await reloadFolders();
    reloadNotes();
  }

  return (
    <aside className="sidebar" id="sidebar" aria-label="Folders">
      <nav className="sidebar-section">
        <SidebarLink to="/notes" icon="notes" label="All notes" count={total} active={selected === "all"} />
        <SidebarLink to="/notes?pinned=1" icon="pin" label="Pinned" active={selected === "pinned"} />
        <SidebarLink
          to="/notes?folder=unfiled"
          icon="inbox"
          label="Unfiled"
          count={folders.unfiledCount}
          active={selected === "unfiled"}
        />
      </nav>

      <div className="sidebar-heading">
        <span>Folders</span>
        <button
          type="button"
          className="icon-btn icon-btn-sm"
          onClick={() => setDialog({ type: "create", parentId: null })}
          aria-label="New folder"
          title="New folder"
        >
          <Icon name="folder-plus" />
        </button>
      </div>

      <div className="sidebar-tree">
        {folders.status === "loading" && (
          <div className="sidebar-placeholder">
            <Spinner /> Loading folders…
          </div>
        )}
        {folders.status === "error" && (
          <div className="sidebar-placeholder error">
            <p>{folders.error?.message || "Couldn't load folders."}</p>
            <button type="button" className="btn btn-sm" onClick={onRetry}>
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
            selectedId={filters.pinned ? null : filters.folder}
            expanded={expanded}
            onToggle={toggle}
            onAction={(type, folder) =>
              setDialog(type === "subfolder" ? { type: "create", parentId: folder.id } : { type, folder })
            }
          />
        )}
      </div>

      <button type="button" className="sidebar-close btn btn-ghost btn-sm" onClick={onClose}>
        Close
      </button>

      <FolderNameDialog
        open={dialog?.type === "create" || dialog?.type === "rename"}
        folder={dialog?.type === "rename" ? dialog.folder : null}
        parent={dialog?.parentId ? folders.list.find((f) => f.id === dialog.parentId) : null}
        onClose={() => setDialog(null)}
        onDone={(folder, created) => {
          setDialog(null);
          if (created && folder.parent_id) {
            setExpanded((prev) => new Set([...prev, folder.parent_id]));
          }
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
          const deletedIds = descendantIds(folders.list, folder.id);
          deletedIds.add(folder.id);
          afterChange({ deletedIds });
        }}
      />
    </aside>
  );
}

function SidebarLink({ to, icon, label, count, active }) {
  return (
    <Link to={to} className={`sidebar-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
      <Icon name={icon} />
      <span className="sidebar-link-label">{label}</span>
      {count > 0 && <span className="count">{count}</span>}
    </Link>
  );
}
