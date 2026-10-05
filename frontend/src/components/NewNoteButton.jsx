import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useWorkspace } from "../workspace/WorkspaceContext";
import Icon from "./Icon";

/**
 * "New note" with a dropdown of templates. `onCreate(template | null)` makes
 * the note; the dropdown also links to the template manager.
 */
export default function NewNoteButton({ onCreate, disabled, compact }) {
  const { templates, reloadTemplates } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;
    if (templates.status !== "ready") reloadTemplates();
    const close = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    rootRef.current?.querySelector('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, templates.status, reloadTemplates]);

  const builtin = templates.list.filter((t) => t.builtin);
  const own = templates.list.filter((t) => !t.builtin);

  function pick(template) {
    setOpen(false);
    onCreate(template);
  }

  return (
    <div className="split-button" ref={rootRef}>
      <button
        type="button"
        className="btn btn-primary btn-sm split-main"
        onClick={() => onCreate(null)}
        disabled={disabled}
        aria-label="New note"
      >
        <Icon name="plus" /> {!compact && <span>New note</span>}
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm split-toggle"
        aria-label="New note from a template"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
      >
        <Icon name="chevron-down" />
      </button>
      {open && (
        <div className="menu-list menu-end template-menu" role="menu" id={menuId}>
          <p className="menu-label">New from template</p>
          {templates.status === "loading" && templates.list.length === 0 && <p className="menu-note">Loading…</p>}
          {templates.status === "error" && <p className="menu-note">Couldn't load templates.</p>}
          {[...own, ...builtin].map((t) => (
            <button key={t.id} type="button" role="menuitem" className="menu-item" onClick={() => pick(t)}>
              <Icon name="template" />
              <span>
                {t.name}
                {t.description && <small>{t.description}</small>}
              </span>
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" className="menu-item" onClick={() => navigate("/templates")}>
            <Icon name="settings" />
            <span>Manage templates…</span>
          </button>
        </div>
      )}
    </div>
  );
}
