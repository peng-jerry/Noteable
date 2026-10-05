import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router";
import { notesApi, templatesApi } from "../api";
import Dialog from "../components/Dialog";
import Icon from "../components/Icon";
import MarkdownEditor from "../components/MarkdownEditor";
import MarkdownPreview from "../components/LazyMarkdownPreview";
import Spinner from "../components/Spinner";
import { useToast } from "../components/Toasts";
import useAutosave from "../hooks/useAutosave";
import { fillTemplate } from "../utils/notes";
import { useWorkspace } from "../workspace/WorkspaceContext";

const PLACEHOLDERS = [
  ["{{date}}", "today's date"],
  ["{{time}}", "the current time"],
  ["{{datetime}}", "date and time"],
  ["{{weekday}}", "day of the week"],
  ["{{title}}", "the new note's title (in the body)"],
  ["{{folder}}", "the folder it's created in"],
];

export function TemplateEmptyPane() {
  return (
    <div className="editor-message">
      <Icon name="template" size={36} />
      <h2>Templates</h2>
      <p className="muted">Pick a template to see or edit it. Placeholders like {"{{date}}"} are filled in when you use one.</p>
    </div>
  );
}

/** Use a template: create a note from it and open it. */
async function createFromTemplate(template, navigate, refresh, toast) {
  try {
    const note = await notesApi.create(fillTemplate(template));
    refresh({ notes: false });
    navigate(`/notes/${note.id}`);
  } catch (err) {
    toast.error(err);
  }
}

/** /templates/:templateId — read-only for built-ins, editable (autosaved) otherwise. */
export function TemplatePage() {
  const { templateId } = useParams();
  const { templates, reloadTemplates } = useWorkspace();
  const template = templates.list.find((t) => t.id === templateId);

  // On phones the list pane (which loads templates) isn't shown, so load here too.
  useEffect(() => {
    if (templates.status !== "ready") reloadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!template) {
    if (templates.status === "loading") {
      return (
        <div className="editor-message">
          <Spinner size={24} />
        </div>
      );
    }
    return (
      <div className="editor-message">
        <Icon name="alert" size={30} />
        <h2>Template not found</h2>
        <Link className="btn btn-ghost" to="/templates">
          Back to templates
        </Link>
      </div>
    );
  }
  return template.builtin ? <BuiltinTemplate key={template.id} template={template} /> : <TemplateEditor key={template.id} template={template} />;
}

function BuiltinTemplate({ template }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { refresh, reloadTemplates } = useWorkspace();

  async function duplicate() {
    try {
      const copy = await templatesApi.create({
        name: `${template.name} (my copy)`,
        description: template.description,
        title: template.title,
        content: template.content,
      });
      await reloadTemplates();
      navigate(`/templates/${copy.id}`);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <article className="editor template-view">
      <div className="editor-topbar">
        <Link to="/templates" className="icon-btn editor-back" aria-label="Back to templates">
          <Icon name="arrow-left" />
        </Link>
        <span className="save-status">Built-in template (read-only)</span>
        <div className="editor-actions">
          <button type="button" className="btn btn-sm" onClick={duplicate}>
            <Icon name="copy" /> Duplicate to edit
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => createFromTemplate(template, navigate, refresh, toast)}>
            <Icon name="plus" /> Use template
          </button>
        </div>
      </div>
      <div className="trash-preview-body">
        <h1 className="title-input">{template.name}</h1>
        <p className="muted">{template.description}</p>
        <p className="small">
          New note title: <code>{template.title || "(template name)"}</code>
        </p>
        <pre className="template-source">{template.content}</pre>
      </div>
    </article>
  );
}

function TemplateEditor({ template }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { reloadTemplates, refresh } = useWorkspace();
  const { isPhone } = useOutletContext();
  const [fields, setFields] = useState({
    name: template.name,
    description: template.description,
    title: template.title,
    content: template.content,
  });
  const [view, setView] = useState("write");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const autosave = useAutosave((patch) => templatesApi.update(template.id, patch), {
    onSaved: () => reloadTemplates(),
  });

  function set(field, value) {
    setFields((f) => ({ ...f, [field]: value }));
    autosave.queue({ [field]: field === "name" ? value.trim() || "Untitled template" : value });
  }

  async function remove() {
    autosave.discard();
    try {
      await templatesApi.remove(template.id);
      await reloadTemplates();
      toast.success(`Deleted template "${fields.name}".`);
      navigate("/templates", { replace: true });
    } catch (err) {
      toast.error(err);
    }
  }

  const sample = fillTemplate({ ...fields, name: fields.name });

  return (
    <article className="editor template-editor">
      <div className="editor-topbar">
        <Link to="/templates" className="icon-btn editor-back" aria-label="Back to templates">
          <Icon name="arrow-left" />
        </Link>
        <span className={`save-status status-${autosave.status}`} role="status">
          {autosave.status === "saving" ? "Saving…" : autosave.status === "saved" ? "All changes saved" : autosave.status === "pending" ? "Unsaved changes" : "Couldn't save"}
        </span>
        <div className="editor-actions">
          <div className="segmented" role="group" aria-label="Editor view">
            <button type="button" className={view === "write" ? "active" : ""} aria-pressed={view === "write"} onClick={() => setView("write")}>
              <Icon name="pen" /> <span className="hide-md">Edit</span>
            </button>
            <button type="button" className={view === "preview" ? "active" : ""} aria-pressed={view === "preview"} onClick={() => setView("preview")}>
              <Icon name="eye" /> <span className="hide-md">Sample</span>
            </button>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={async () => {
              await autosave.flush().catch(() => {});
              createFromTemplate(fields, navigate, refresh, toast);
            }}
          >
            <Icon name="plus" /> {!isPhone && "Use template"}
          </button>
          <button type="button" className="icon-btn danger" aria-label="Delete template" title="Delete template" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" />
          </button>
        </div>
      </div>

      <div className="template-fields">
        <div className="field">
          <label htmlFor="tpl-name-edit">Template name</label>
          <input id="tpl-name-edit" value={fields.name} maxLength={100} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tpl-desc-edit">Description</label>
          <input id="tpl-desc-edit" value={fields.description} maxLength={200} onChange={(e) => set("description", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="tpl-title-edit">New note title</label>
          <input id="tpl-title-edit" value={fields.title} maxLength={200} placeholder="e.g. Lecture — {{date}}" onChange={(e) => set("title", e.target.value)} />
        </div>
        <details className="placeholder-help">
          <summary>Placeholders you can use</summary>
          <ul>
            {PLACEHOLDERS.map(([code, text]) => (
              <li key={code}>
                <code>{code}</code> — {text}
              </li>
            ))}
          </ul>
        </details>
      </div>

      {view === "write" ? (
        <MarkdownEditor textareaId="template-body" value={fields.content} view="write" onChange={(v) => set("content", v)} placeholder="Template body (Markdown)…" />
      ) : (
        <div className="trash-preview-body">
          <p className="muted small">A note made now would be titled:</p>
          <h1 className="title-input">{sample.title}</h1>
          <MarkdownPreview content={sample.content} />
        </div>
      )}

      <Dialog
        open={confirmDelete}
        title="Delete template?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={remove}>
              Delete
            </button>
          </>
        }
      >
        <p>
          <strong>{fields.name}</strong> will be deleted. Notes made from it aren't affected.
        </p>
      </Dialog>
    </article>
  );
}

/** /new?title=… — reached by clicking a [[link]] to a note that doesn't exist yet. */
export function NewFromLinkPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const started = useRef(false);
  const title = (params.get("title") || "").trim().slice(0, 200);

  useEffect(() => {
    if (started.current) return; // StrictMode runs effects twice in development
    started.current = true;
    notesApi
      .create({ title: title || "Untitled" })
      .then((note) => {
        toast.success(`Created "${note.title}".`);
        navigate(`/notes/${note.id}`, { replace: true });
      })
      .catch((err) => {
        toast.error(err);
        navigate("/notes", { replace: true });
      });
  }, [title, navigate, toast]);

  return (
    <div className="full-page-status">
      <div className="status-card">
        <Spinner size={24} />
        <p className="muted">Creating “{title || "Untitled"}”…</p>
      </div>
    </div>
  );
}
