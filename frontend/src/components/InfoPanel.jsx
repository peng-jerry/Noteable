import { useEffect, useState } from "react";
import { Link } from "react-router";
import { notesApi } from "../api";
import { fullDate } from "../utils/date";
import { plainText } from "../utils/markdown";
import { extractHeadings, noteStats } from "../utils/notes";
import Icon from "./Icon";
import Spinner from "./Spinner";

/** Outline (clickable headings), stats and backlinks for the open note. */
export default function InfoPanel({ note, content, onJump, onClose, listSearch }) {
  const headings = extractHeadings(content);
  const stats = noteStats(content);
  const [backlinks, setBacklinks] = useState({ status: "loading", items: [] });

  useEffect(() => {
    const controller = new AbortController();
    setBacklinks((b) => ({ ...b, status: "loading" }));
    notesApi
      .backlinks(note.id, { signal: controller.signal })
      .then((items) => setBacklinks({ status: "ready", items }))
      .catch((err) => err.name !== "AbortError" && setBacklinks({ status: "error", items: [] }));
    return () => controller.abort();
  }, [note.id, note.title]);

  return (
    <aside className="info-panel" aria-label="Note details">
      <div className="info-header">
        <h2>Details</h2>
        <button type="button" className="icon-btn icon-btn-sm" onClick={onClose} aria-label="Close details">
          <Icon name="x" />
        </button>
      </div>

      <section aria-labelledby="outline-heading">
        <h3 id="outline-heading">Outline</h3>
        {headings.length === 0 ? (
          <p className="muted small">Headings (# Title) appear here.</p>
        ) : (
          <ul className="outline">
            {headings.map((h, i) => (
              <li key={`${h.slug}-${i}`} style={{ "--level": h.level }}>
                <button type="button" className="outline-link" onClick={() => onJump(h)}>
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="stats-heading">
        <h3 id="stats-heading">Stats</h3>
        <dl className="stats">
          <div>
            <dt>Words</dt>
            <dd>{stats.words.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Characters</dt>
            <dd>{stats.characters.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Reading time</dt>
            <dd>{stats.readingMinutes ? `${stats.readingMinutes} min` : "—"}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{fullDate(note.created_at, { time: true })}</dd>
          </div>
          <div>
            <dt>Last saved</dt>
            <dd>{fullDate(note.updated_at, { time: true })}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="backlinks-heading">
        <h3 id="backlinks-heading">Linked from</h3>
        {backlinks.status === "loading" && <Spinner size={14} />}
        {backlinks.status === "error" && <p className="muted small">Couldn't load backlinks.</p>}
        {backlinks.status === "ready" && backlinks.items.length === 0 && (
          <p className="muted small">
            No notes link here yet. Link to this note from another with <code>[[{note.title}]]</code>.
          </p>
        )}
        <ul className="backlinks">
          {backlinks.items.map((b) => (
            <li key={b.id}>
              <Link to={`/notes/${b.id}${listSearch}`}>
                <Icon name="note" /> {b.title}
              </Link>
              {b.excerpt && <p className="muted small">{plainText(b.excerpt)}</p>}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
