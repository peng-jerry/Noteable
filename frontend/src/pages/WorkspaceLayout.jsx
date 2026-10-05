import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useParams, useSearchParams } from "react-router";
import { foldersApi, notesApi } from "../api";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";
import NoteList from "../components/NoteList";
import Resizer from "../components/Resizer";
import Sidebar from "../components/Sidebar";
import TemplateList from "../components/TemplateList";
import { useToast } from "../components/Toasts";
import TrashList from "../components/TrashList";
import useLayoutPrefs, { LAYOUT_LIMITS } from "../hooks/useLayoutPrefs";
import useMediaQuery from "../hooks/useMediaQuery";
import useNoteList from "../hooks/useNoteList";
import { descendantIds } from "../utils/folders";
import { resolveSort, sortQuery, viewKey } from "../utils/sorting";
import { WorkspaceProvider, useWorkspace } from "../workspace/WorkspaceContext";

/** Read the list filters from the URL (?folder=…&pinned=1&tags=a,b&q=…&sort=…). */
export function filtersFromParams(params) {
  const folder = params.get("folder");
  const pinned = params.get("pinned") === "1";
  const tags = (params.get("tags") || "").split(",").filter(Boolean);
  const q = params.get("q") ?? "";
  const view = viewKey({ folder, pinned, tags });
  return {
    folder, // folder id, "unfiled", or null for all notes
    pinned,
    tags,
    q,
    view,
    sortKey: resolveSort({ urlSort: params.get("sort"), folder, q, view }),
  };
}

/**
 * The private app shell: sidebar | middle list | editor. The middle pane is
 * the note list at /notes, the trash at /trash and templates at /templates.
 * Desktop shows all three with draggable dividers; tablets turn the sidebar
 * into a drawer; phones show one pane at a time.
 */
export default function WorkspaceLayout() {
  const [params] = useSearchParams();
  const location = useLocation();
  const filters = filtersFromParams(params);
  const query = useMemo(
    () => ({
      folder_id: filters.folder || undefined,
      pinned: filters.pinned || undefined,
      tags: filters.tags.length ? filters.tags.join(",") : undefined,
      q: filters.q || undefined,
      ...sortQuery(filters.sortKey),
    }),
    [filters.folder, filters.pinned, filters.tags.join(","), filters.q, filters.sortKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const noteList = useNoteList(query);

  return (
    <WorkspaceProvider noteList={noteList} listSearch={location.search}>
      <WorkspaceShell filters={filters} />
    </WorkspaceProvider>
  );
}

function WorkspaceShell({ filters }) {
  const { noteId, templateId } = useParams();
  const location = useLocation();
  const toast = useToast();
  const ws = useWorkspace();
  const isWide = useMediaQuery("(min-width: 1100px)");
  const isPhone = useMediaQuery("(max-width: 699px)");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [layout, updateLayout, resetLayout] = useLayoutPrefs();
  const [dragging, setDragging] = useState(null);

  const mode = location.pathname.startsWith("/trash")
    ? "trash"
    : location.pathname.startsWith("/templates")
      ? "templates"
      : "notes";
  const selectedId = noteId ?? templateId;

  // Close the drawer whenever the user navigates.
  useEffect(() => setDrawerOpen(false), [location.pathname, location.search]);

  /* ---------------- drag & drop ---------------- */

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function collisionDetection(args) {
    const targets = args.droppableContainers.filter((c) => c.data.current?.type === "folder-target");
    const hits = pointerWithin({ ...args, droppableContainers: targets });
    if (hits.length) return hits;
    const notes = args.droppableContainers.filter((c) => c.data.current?.type === "note");
    return closestCenter({ ...args, droppableContainers: notes });
  }

  async function moveNote(note, folderId) {
    if (note.folder_id === folderId) return;
    const target = folderId ? ws.folders.list.find((f) => f.id === folderId)?.name : "Unfiled";
    try {
      const { note: saved } = await notesApi.update(note.id, { folder_id: folderId });
      ws.noteList.upsert(saved);
      ws.publishNote(saved);
      ws.refresh({ notes: false });
      toast.success(`Moved "${saved.title}" to ${target}.`, {
        label: "Undo",
        onClick: () => moveNote(saved, note.folder_id),
      });
    } catch (err) {
      toast.error(err);
    }
  }

  async function moveFolder(folder, parentId) {
    if (folder.parent_id === parentId || folder.id === parentId) return;
    if (parentId && descendantIds(ws.folders.list, folder.id).has(parentId)) {
      toast.error("A folder can't be moved inside one of its own subfolders.");
      return;
    }
    try {
      await foldersApi.update(folder.id, { parent_id: parentId });
      ws.refresh({ notes: false });
      toast.success(`Moved "${folder.name}".`);
    } catch (err) {
      toast.error(err);
    }
  }

  async function reorderNotes(activeId, overId) {
    const ids = ws.noteList.notes.map((n) => n.id);
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return;
    const next = arrayMove(ids, from, to);
    ws.noteList.setOrder(next);
    try {
      await notesApi.reorder(filters.folder === "unfiled" ? null : filters.folder, next);
    } catch (err) {
      toast.error(err);
      ws.noteList.reload();
    }
  }

  function onDragEnd({ active, over }) {
    setDragging(null);
    const a = active.data.current;
    const o = over?.data.current;
    if (!a || !o) return;
    if (a.type === "note" && o.type === "folder-target" && o.accepts.includes("note")) {
      moveNote(a.note, o.folderId);
    } else if (a.type === "note" && o.type === "note" && filters.sortKey === "manual") {
      reorderNotes(a.note.id, o.note.id);
    } else if (a.type === "folder" && o.type === "folder-target" && o.accepts.includes("folder")) {
      moveFolder(a.folder, o.folderId);
    }
  }

  // Screen-reader messages use names, not internal ids.
  function dragLabel(active) {
    const d = active?.data.current;
    return d?.type === "folder" ? `folder "${d.folder.name}"` : d?.note ? `note "${d.note.title}"` : "item";
  }
  function dropLabel(over) {
    const d = over?.data.current;
    if (d?.type === "note") return `the position of "${d.note.title}"`;
    if (d?.type === "folder-target") {
      if (d.folderId) return `folder "${ws.folders.list.find((f) => f.id === d.folderId)?.name ?? "folder"}"`;
      return d.accepts.includes("folder") ? "the top level" : "Unfiled";
    }
    return "a drop target";
  }

  /* ---------------- layout ---------------- */

  const sidebarVisible = !isWide || !layout.sidebarCollapsed; // narrow screens use the drawer
  const listVisible = !(isPhone && selectedId) && !(!isPhone && layout.listCollapsed && selectedId);
  const editorVisible = !isPhone || Boolean(selectedId);
  const columns = [];
  if (isWide && sidebarVisible) columns.push(`${layout.sidebar}px`, "6px");
  if (listVisible) columns.push(isPhone ? "minmax(0, 1fr)" : `${layout.list}px`);
  if (listVisible && editorVisible && !isPhone) columns.push("6px");
  if (editorVisible) columns.push("minmax(0, 1fr)");

  const toggleSidebar = () =>
    isWide ? updateLayout((p) => ({ sidebarCollapsed: !p.sidebarCollapsed })) : setDrawerOpen((o) => !o);

  const middle =
    mode === "trash" ? (
      <TrashList activeId={selectedId} />
    ) : mode === "templates" ? (
      <TemplateList activeId={selectedId} />
    ) : (
      <NoteList filters={filters} activeNoteId={noteId} />
    );

  return (
    <div className="app-shell">
      <AppHeader
        onMenuClick={toggleSidebar}
        menuOpen={isWide ? !layout.sidebarCollapsed : drawerOpen}
        menuLabel={isWide ? (layout.sidebarCollapsed ? "Show sidebar" : "Hide sidebar") : drawerOpen ? "Close folders" : "Open folders"}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={({ active }) => setDragging(active.data.current)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              "To pick up a note in manual order, press space or enter. Use the arrow keys to move it, then space or enter to drop it, or escape to cancel.",
          },
          announcements: {
            onDragStart: ({ active }) => `Picked up ${dragLabel(active)}.`,
            onDragOver: ({ active, over }) =>
              over ? `${dragLabel(active)} is over ${dropLabel(over)}.` : `${dragLabel(active)} is not over a drop target.`,
            onDragEnd: ({ active, over }) =>
              over ? `${dragLabel(active)} was dropped on ${dropLabel(over)}.` : `${dragLabel(active)} was dropped.`,
            onDragCancel: ({ active }) => `Stopped dragging ${dragLabel(active)}.`,
          },
        }}
      >
        <div
          className={`workspace ${drawerOpen ? "drawer-open" : ""}`}
          style={{ gridTemplateColumns: columns.join(" ") }}
        >
          {sidebarVisible && (
            <Sidebar filters={filters} mode={mode} onClose={() => setDrawerOpen(false)} />
          )}
          {isWide && sidebarVisible && (
            <Resizer
              label="Resize sidebar"
              value={layout.sidebar}
              min={LAYOUT_LIMITS.sidebar[0]}
              max={LAYOUT_LIMITS.sidebar[1]}
              onChange={(v) => updateLayout({ sidebar: v })}
              onReset={() => resetLayout("sidebar")}
            />
          )}
          {!isWide && (
            <button
              type="button"
              className="drawer-backdrop"
              aria-label="Close folders"
              tabIndex={-1}
              onClick={() => setDrawerOpen(false)}
            />
          )}
          {listVisible && middle}
          {listVisible && editorVisible && !isPhone && (
            <Resizer
              label="Resize note list"
              value={layout.list}
              min={LAYOUT_LIMITS.list[0]}
              max={LAYOUT_LIMITS.list[1]}
              onChange={(v) => updateLayout({ list: v })}
              onReset={() => resetLayout("list")}
            />
          )}
          {editorVisible && (
            <main className="editor-pane" id="main">
              <Outlet
                context={{
                  mode,
                  layout,
                  updateLayout,
                  resetLayout,
                  isPhone,
                  listCollapsed: !isPhone && layout.listCollapsed,
                  toggleList: () => updateLayout((p) => ({ listCollapsed: !p.listCollapsed })),
                }}
              />
            </main>
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <div className="drag-preview">
              <Icon name={dragging.type === "folder" ? "folder" : "note"} />
              <span>{dragging.type === "folder" ? dragging.folder.name : dragging.note.title}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
