import { useEffect, useRef, useState } from "react";
import { transferApi } from "../api";
import { ACCEPT, batchFiles, collectImportFiles } from "../utils/importFiles";
import { useWorkspace } from "../workspace/WorkspaceContext";
import Dialog from "./Dialog";
import Icon from "./Icon";
import Spinner from "./Spinner";

/**
 * Import .md / .txt files or .zip archives into a folder. Files can be
 * picked, dropped on the dialog, or passed in (`initialFiles`) when they were
 * dropped onto the note list.
 */
export default function ImportDialog({ open, folder, initialFiles, onClose }) {
  const { refresh } = useWorkspace();
  const inputRef = useRef(null);
  const [phase, setPhase] = useState("pick"); // pick | working | done
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhase("pick");
    setResult(null);
    setError("");
    setProgress({ done: 0, total: 0 });
    if (initialFiles?.length) run(initialFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function run(fileList) {
    setPhase("working");
    setError("");
    const { files, skipped } = await collectImportFiles(fileList);
    if (!files.length) {
      setResult({ notes: 0, folders: 0, skipped });
      setPhase("done");
      return;
    }
    const batches = batchFiles(files);
    setProgress({ done: 0, total: files.length });
    const totals = { notes: 0, folders: 0, skipped: [...skipped] };
    try {
      for (const batch of batches) {
        const res = await transferApi.importBatch(folder?.id ?? null, batch);
        totals.notes += res.created.notes;
        totals.folders += res.created.folders;
        totals.skipped.push(...res.skipped);
        setProgress((p) => ({ ...p, done: p.done + batch.length }));
      }
    } catch (err) {
      setError(`${err.message} Files imported before the error were kept.`);
    }
    setResult(totals);
    setPhase("done");
    refresh();
  }

  return (
    <Dialog open={open} title={`Import into ${folder ? `"${folder.name}"` : "Unfiled"}`} onClose={onClose} size="md">
      {phase === "pick" && (
        <div
          className={`drop-zone ${over ? "over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (e.dataTransfer.files.length) run(e.dataTransfer.files);
          }}
        >
          <Icon name="upload" size={28} />
          <p>
            Drop <strong>.md</strong>, <strong>.txt</strong> or <strong>.zip</strong> files here, or
          </p>
          <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
            Choose files
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(e) => e.target.files.length && run(e.target.files)}
          />
          <p className="muted small">
            Each file becomes a note. Titles come from the first <code># heading</code> or the file name.
            Folders inside a .zip are recreated, and Noteable exports keep their tags.
          </p>
        </div>
      )}

      {phase === "working" && (
        <div className="import-progress">
          <Spinner size={22} />
          <p>
            Importing… {progress.total ? `${progress.done} of ${progress.total}` : "reading files"}
          </p>
          {progress.total > 0 && <progress value={progress.done} max={progress.total} />}
        </div>
      )}

      {phase === "done" && result && (
        <div className="import-result">
          {error && (
            <div className="alert alert-error" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
            </div>
          )}
          <p>
            <Icon name="check" className="ok" /> Imported <strong>{result.notes}</strong> note{result.notes === 1 ? "" : "s"}
            {result.folders ? (
              <>
                {" "}
                and created <strong>{result.folders}</strong> folder{result.folders === 1 ? "" : "s"}
              </>
            ) : null}
            .
          </p>
          {result.skipped.length > 0 && (
            <details>
              <summary>
                {result.skipped.length} file{result.skipped.length === 1 ? " was" : "s were"} skipped
              </summary>
              <ul className="skipped-list">
                {result.skipped.slice(0, 50).map((s, i) => (
                  <li key={i}>
                    <code>{s.path}</code> — {s.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setPhase("pick")}>
              Import more
            </button>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
