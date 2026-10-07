import { useEffect, useState } from "react";
import { loadAttachment, onAttachmentRefresh } from "../utils/images";
import Icon from "./Icon";

/**
 * Shows an ![alt](attachment:<id>) image. Doodles get an "Edit doodle"
 * button when `onEditDoodle` is given (in the note editor's preview).
 */
export default function AttachmentImage({ id, alt, onEditDoodle }) {
  const [state, setState] = useState({ status: "loading", url: null, kind: null });
  const [version, setVersion] = useState(0);

  useEffect(() => onAttachmentRefresh((changed) => changed === id && setVersion((v) => v + 1)), [id]);

  useEffect(() => {
    let alive = true;
    loadAttachment(id)
      .then(({ url, kind }) => alive && setState({ status: "ready", url, kind }))
      .catch(() => alive && setState({ status: "error", url: null, kind: null }));
    return () => {
      alive = false;
    };
  }, [id, version]);

  if (state.status === "loading") {
    return <span className="attachment-placeholder" role="img" aria-label={`Loading image: ${alt || "image"}`} />;
  }
  if (state.status === "error") {
    return (
      <span className="attachment-placeholder error" role="img" aria-label={`Image unavailable: ${alt || "image"}`}>
        <Icon name="alert" /> Image unavailable
      </span>
    );
  }
  return (
    <span className={`attachment ${state.kind === "doodle" ? "is-doodle" : ""}`}>
      <img src={state.url} alt={alt || ""} loading="lazy" />
      {state.kind === "doodle" && onEditDoodle && (
        <button type="button" className="btn btn-sm attachment-edit" onClick={() => onEditDoodle(id)}>
          <Icon name="pen" /> Edit doodle
        </button>
      )}
    </span>
  );
}
