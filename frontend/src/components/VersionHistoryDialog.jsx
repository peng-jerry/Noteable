import { diffLines } from "diff";
import { useCallback, useEffect, useState } from "react";
import { notesApi } from "../api";
import { fullDate, relativeTime } from "../utils/date";
import Dialog from "./Dialog";
import Icon from "./Icon";
import MarkdownPreview from "./LazyMarkdownPreview";
import Spinner from "./Spinner";
import { useToast } from "./Toasts";

const KIND_LABELS = { auto: "Autosaved", manual: "Saved", restore: "Before restore" };

/**
 * Browse a note's snapshots, compare one with the current text, save a named
 * version, or restore one. `beforeRestore` should flush pending autosaves.
 */
export default function VersionHistoryDialog({ open, noteId, current, onClose, beforeRestore, onRestored }) {
  const toast = useToast();
  const [list, setList] = useState({ status: "loading", versions: [], error: null });
  const [selected, setSelected] = useState(null); // full version
  const [loadingVersion, setLoadingVersion] = useState(false);
  const [tab, setTab] = useState("changes");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setList((l) => ({ ...l, status: "loading", error: null }));
    try {
      const data = await notesApi.versions(noteId);
      setList({ status: "ready", versions: data.versions, error: null });
    } catch (error) {
      setList({ status: "error", versions: [], error });
    }
  }, [noteId]);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setConfirming(false);
    setLabel("");
    load();
  }, [open, load]);

  async function select(version) {
    setConfirming(false);
    setLoadingVersion(true);
    try {
      setSelected(await notesApi.version(noteId, version.id));
    } catch (err) {
      toast.error(err);
    } finally {
      setLoadingVersion(false);
    }
  }

  async function saveVersion(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await beforeRestore();
      await notesApi.saveVersion(noteId, label.trim() || null);
      setLabel("");
      toast.success("Version saved.");
      load();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    try {
      await beforeRestore();
      const note = await notesApi.restoreVersion(noteId, selected.id);
      toast.success(`Restored the version from ${fullDate(selected.created_at, { time: true })}.`);
      onRestored(note);
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const diff = selected && tab === "changes" ? diffLines(current.content, selected.content) : null;
  const titleChanged = selected && selected.title !== current.title;

  return (
    <Dialog open={open} title="Version history" onClose={onClose} size="xl">
      <div className="versions">
        <div className="versions-list">
          <form className="save-version" onSubmit={saveVersion}>
            <label className="sr-only" htmlFor="version-label">
              Version name
            </label>
            <input
              id="version-label"
              value={label}
              maxLength={100}
              placeholder="Name this version (optional)"
              onChange={(e) => setLabel(e.target.value)}
            />
            <button type="submit" className="btn btn-sm" disabled={busy}>
              Save version
            </button>
          </form>
          {list.status === "loading" && (
            <p className="muted small">
              <Spinner size={14} /> Loading…
            </p>
          )}
          {list.status === "error" && (
            <p className="field-error">
              {list.error?.message}{" "}
              <button type="button" className="link-btn" onClick={load}>
                Retry
              </button>
            </p>
          )}
          {list.status === "ready" && list.versions.length === 0 && (
            <p className="muted small">
              No versions yet. Noteable keeps a snapshot every 10 minutes while you edit, or save one now.
            </p>
          )}
          <ul>
            {list.versions.map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  className={`version-item ${selected?.id === v.id ? "active" : ""}`}
                  onClick={() => select(v)}
                  aria-pressed={selected?.id === v.id}
                >
                  <span className="version-when" title={fullDate(v.created_at, { time: true })}>
                    {relativeTime(v.created_at)}
                  </span>
                  <span className={`version-kind kind-${v.kind}`}>{KIND_LABELS[v.kind] ?? v.kind}</span>
                  {v.label && <span className="version-label">{v.label}</span>}
                  <span className="muted small">
                    {v.title} · {v.words} words
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="versions-view">
          {!selected && !loadingVersion && (
            <div className="editor-message">
              <Icon name="history" size={30} />
              <p className="muted">Pick a version to see how it differs from the current note.</p>
            </div>
          )}
          {loadingVersion && (
            <div className="editor-message">
              <Spinner size={22} />
            </div>
          )}
          {selected && !loadingVersion && (
            <>
              <div className="versions-view-header">
                <div className="segmented" role="group" aria-label="Show">
                  <button type="button" className={tab === "changes" ? "active" : ""} aria-pressed={tab === "changes"} onClick={() => setTab("changes")}>
                    Changes
                  </button>
                  <button type="button" className={tab === "preview" ? "active" : ""} aria-pressed={tab === "preview"} onClick={() => setTab("preview")}>
                    Preview
                  </button>
                </div>
                {confirming ? (
                  <span className="confirm-inline">
                    Replace the current note? It's saved as a version first.
                    <button type="button" className="btn btn-sm btn-primary" onClick={restore} disabled={busy}>
                      {busy ? "Restoring…" : "Restore"}
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirming(false)}>
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => setConfirming(true)}>
                    <Icon name="restore" /> Restore this version
                  </button>
                )}
              </div>
              {titleChanged && (
                <p className="muted small">
                  Title in this version: <strong>{selected.title}</strong>
                </p>
              )}
              {tab === "changes" ? (
                <>
                  <p className="diff-legend muted small">
                    <span className="diff-add">+ only in this version</span>
                    <span className="diff-del">− only in the current note</span>
                  </p>
                  <pre className="diff" aria-label="Differences">
                    {diff.every((part) => !part.added && !part.removed) ? (
                      <span className="muted">This version's text is the same as the current note.</span>
                    ) : (
                      diff.map((part, i) => (
                        <span key={i} className={part.added ? "diff-add" : part.removed ? "diff-del" : "diff-same"}>
                          {part.value
                            .replace(/\n$/, "")
                            .split("\n")
                            .map((line) => `${part.added ? "+ " : part.removed ? "− " : "  "}${line}`)
                            .join("\n") + "\n"}
                        </span>
                      ))
                    )}
                  </pre>
                </>
              ) : (
                <div className="versions-preview">
                  <MarkdownPreview content={selected.content} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
