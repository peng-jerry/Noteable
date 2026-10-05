import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { isAbortError, trashApi } from "../api";
import { relativeTime } from "../utils/date";
import { useWorkspace } from "../workspace/WorkspaceContext";
import Dialog from "./Dialog";
import Icon from "./Icon";
import Spinner from "./Spinner";
import { useToast } from "./Toasts";

function daysLeft(expiresAt) {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  return days <= 1 ? "Deletes within a day" : `Deletes in ${days} days`;
}

/** Middle pane at /trash: everything that was moved to the trash. */
export default function TrashList({ activeId }) {
  const { refresh, trashCount } = useWorkspace();
  const toast = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "loading", items: [], retention: 30, error: null });
  const [confirm, setConfirm] = useState(null); // { kind: "empty" } | { kind: "item", item }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (signal) => {
    try {
      const data = await trashApi.list({ signal });
      setState({ status: "ready", items: data.items, retention: data.retention_days, error: null });
    } catch (error) {
      if (!isAbortError(error)) setState((s) => ({ ...s, status: "error", error }));
    }
  }, []);

  // Reload when something is trashed or restored elsewhere (the count changes).
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load, trashCount]);

  async function restore(item) {
    try {
      if (item.type === "folder") {
        const folder = await trashApi.restoreFolder(item.id);
        toast.success(
          folder.name === item.name ? `Restored "${item.name}".` : `Restored as "${folder.name}" (the old name was taken).`,
          { label: "Open", onClick: () => navigate(`/notes?folder=${folder.id}`) },
        );
      } else {
        const note = await trashApi.restoreNote(item.id);
        toast.success(`Restored "${note.title}"${note.folder_id ? "" : " to Unfiled"}.`, {
          label: "Open",
          onClick: () => navigate(`/notes/${note.id}`),
        });
      }
      if (activeId === item.id) navigate("/trash", { replace: true });
      refresh();
    } catch (err) {
      toast.error(err);
    }
  }

  async function deleteForever() {
    setBusy(true);
    try {
      if (confirm.kind === "empty") {
        await trashApi.empty();
        toast.success("Trash emptied.");
        navigate("/trash", { replace: true });
      } else {
        const { item } = confirm;
        await (item.type === "folder" ? trashApi.deleteFolder(item.id) : trashApi.deleteNote(item.id));
        toast.success(`Deleted "${item.title ?? item.name}" forever.`);
        if (activeId === item.id) navigate("/trash", { replace: true });
      }
      refresh();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const { status, items } = state;

  return (
    <section className="list-pane" aria-labelledby="trash-heading">
      <header className="list-header">
        <div className="list-title">
          <h1 id="trash-heading">Trash</h1>
          <p className="muted small">Items are deleted forever after {state.retention} days.</p>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          onClick={() => setConfirm({ kind: "empty" })}
          disabled={!items.length}
        >
          Empty trash
        </button>
      </header>

      <div className="note-list-scroll">
        {status === "loading" && (
          <div className="list-message">
            <Spinner />
          </div>
        )}
        {status === "error" && (
          <div className="list-message">
            <p>{state.error?.message || "Couldn't load the trash."}</p>
            <button type="button" className="btn btn-sm" onClick={() => load()}>
              <Icon name="refresh" /> Retry
            </button>
          </div>
        )}
        {status === "ready" && items.length === 0 && (
          <div className="list-message">
            <Icon name="trash" size={28} />
            <p>The trash is empty.</p>
          </div>
        )}
        <ul className="note-list trash-list">
          {items.map((item) => (
            <li key={`${item.type}:${item.id}`}>
              <div className={`trash-item ${activeId === item.id ? "active" : ""}`}>
                {item.type === "note" ? (
                  <Link to={`/trash/${item.id}`} className="trash-main" aria-current={activeId === item.id ? "page" : undefined}>
                    <span className="note-item-title">
                      <Icon name="note" /> {item.title}
                    </span>
                    {item.excerpt && <span className="note-item-excerpt">{item.excerpt}</span>}
                  </Link>
                ) : (
                  <div className="trash-main">
                    <span className="note-item-title">
                      <Icon name="folder" /> {item.name}
                    </span>
                    <span className="muted small">
                      Folder with {item.contains.notes} note{item.contains.notes === 1 ? "" : "s"}
                      {item.contains.folders ? ` and ${item.contains.folders} subfolder${item.contains.folders === 1 ? "" : "s"}` : ""}
                    </span>
                  </div>
                )}
                <div className="note-item-meta">
                  <span>Deleted {relativeTime(item.deleted_at)}</span>
                  <span>· {daysLeft(item.expires_at)}</span>
                  {item.location && <span className="note-item-folder">· from {item.location}</span>}
                </div>
                <div className="trash-actions">
                  <button type="button" className="btn btn-sm" onClick={() => restore(item)}>
                    <Icon name="restore" /> Restore
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost danger-text" onClick={() => setConfirm({ kind: "item", item })}>
                    Delete forever
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <Dialog
        open={Boolean(confirm)}
        title={confirm?.kind === "empty" ? "Empty the trash?" : "Delete forever?"}
        onClose={() => setConfirm(null)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={deleteForever} disabled={busy}>
              {busy ? "Deleting…" : "Delete forever"}
            </button>
          </>
        }
      >
        <p>
          {confirm?.kind === "empty"
            ? `Everything in the trash (${items.length} item${items.length === 1 ? "" : "s"}) will be permanently deleted.`
            : `"${confirm?.item?.title ?? confirm?.item?.name}"${confirm?.item?.type === "folder" ? " and everything in it" : ""} will be permanently deleted.`}{" "}
          This can't be undone.
        </p>
      </Dialog>
    </section>
  );
}
