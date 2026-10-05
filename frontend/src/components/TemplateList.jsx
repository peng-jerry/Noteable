import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { templatesApi } from "../api";
import { useWorkspace } from "../workspace/WorkspaceContext";
import Icon from "./Icon";
import Spinner from "./Spinner";
import { useToast } from "./Toasts";

/** Middle pane at /templates: built-in and your own templates. */
export default function TemplateList({ activeId }) {
  const { templates, reloadTemplates } = useWorkspace();
  const navigate = useNavigate();
  const toast = useToast();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    reloadTemplates();
  }, [reloadTemplates]);

  async function create() {
    setCreating(true);
    try {
      const template = await templatesApi.create({ name: "New template", title: "{{date}}", content: "# {{title}}\n\n" });
      await reloadTemplates();
      navigate(`/templates/${template.id}`);
    } catch (err) {
      toast.error(err);
    } finally {
      setCreating(false);
    }
  }

  const own = templates.list.filter((t) => !t.builtin);
  const builtin = templates.list.filter((t) => t.builtin);

  const row = (t) => (
    <li key={t.id}>
      <Link to={`/templates/${t.id}`} className={`note-item ${activeId === t.id ? "active" : ""}`} aria-current={activeId === t.id ? "page" : undefined}>
        <div className="note-item-top">
          <span className="note-item-title">{t.name}</span>
          {t.builtin && <span className="badge">Built-in</span>}
        </div>
        {t.description && <p className="note-item-excerpt">{t.description}</p>}
      </Link>
    </li>
  );

  return (
    <section className="list-pane" aria-labelledby="templates-heading">
      <header className="list-header">
        <div className="list-title">
          <h1 id="templates-heading">Templates</h1>
          <p className="muted small">Start new notes from these with the ▾ next to “New note”.</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={create} disabled={creating}>
          <Icon name="plus" /> <span>New template</span>
        </button>
      </header>
      <div className="note-list-scroll">
        {templates.status === "loading" && templates.list.length === 0 && (
          <div className="list-message">
            <Spinner />
          </div>
        )}
        {templates.status === "error" && (
          <div className="list-message">
            <p>{templates.error?.message || "Couldn't load templates."}</p>
            <button type="button" className="btn btn-sm" onClick={reloadTemplates}>
              Retry
            </button>
          </div>
        )}
        <h2 className="list-subheading">Your templates</h2>
        {own.length === 0 && templates.status === "ready" ? (
          <p className="muted small list-note">
            None yet. Create one here, or use “Save as template” from any note's ⋯ menu.
          </p>
        ) : (
          <ul className="note-list">{own.map(row)}</ul>
        )}
        <h2 className="list-subheading">Built-in</h2>
        <ul className="note-list">{builtin.map(row)}</ul>
      </div>
    </section>
  );
}
