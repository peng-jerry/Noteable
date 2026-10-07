import { createContext, memo, useContext, useMemo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { ATTACHMENT_URL } from "../utils/images";
import { linkifyWikiLinks } from "../utils/notes";
import AttachmentImage from "./AttachmentImage";

/**
 * Optional interactivity for an editable preview: ticking checklist items
 * (`onToggleTask(lineIndex)`) and editing doodles (`onEditDoodle(id)`).
 * Without a provider the preview is read-only.
 */
export const PreviewActions = createContext(null);
const TaskLine = createContext(null);

// react-markdown never renders raw HTML from the note, so previews are safe
// from script injection. External links open in a new tab; [[wiki links]]
// stay in the app (they're hash routes like #/notes/<id>).
function Anchor({ node: _node, href = "", title, children, ...props }) {
  if (title === "wikilink" || title === "wikilink-missing") {
    const missing = title === "wikilink-missing";
    return (
      <a
        {...props}
        href={href}
        className={`wiki-link ${missing ? "missing" : ""}`}
        title={missing ? "No note with this title yet — click to create it" : undefined}
      >
        {children}
      </a>
    );
  }
  const internal = href.startsWith("#");
  return (
    <a {...props} href={href} title={title} {...(internal ? {} : { target: "_blank", rel: "noopener noreferrer" })}>
      {children}
    </a>
  );
}

function Image({ node: _node, src = "", alt, ...props }) {
  const actions = useContext(PreviewActions);
  const match = src.match(ATTACHMENT_URL);
  if (match) return <AttachmentImage id={match[1]} alt={alt} onEditDoodle={actions?.onEditDoodle} />;
  return <img src={src} alt={alt} loading="lazy" {...props} />;
}

/** Task list items remember their source line so their checkbox can toggle it. */
function ListItem({ node, children, ...props }) {
  const line = node?.position?.start?.line;
  return (
    <TaskLine.Provider value={line ? line - 1 : null}>
      <li {...props}>{children}</li>
    </TaskLine.Provider>
  );
}

function Input({ node: _node, type, checked, ...props }) {
  const actions = useContext(PreviewActions);
  const line = useContext(TaskLine);
  if (type !== "checkbox") return <input type={type} {...props} />;
  const interactive = Boolean(actions?.onToggleTask) && line !== null;
  return (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      disabled={!interactive}
      onChange={interactive ? () => actions.onToggleTask(line) : undefined}
      aria-label={checked ? "Done (click to uncheck)" : "Not done (click to check off)"}
    />
  );
}

const components = { a: Anchor, img: Image, li: ListItem, input: Input };
const remarkPlugins = [remarkGfm];
const rehypePlugins = [rehypeSlug];
// Allow our attachment: image links; everything else gets the usual safety check.
const urlTransform = (url) => (ATTACHMENT_URL.test(url) ? url : defaultUrlTransform(url));

/**
 * Rendered Markdown. Pass `resolveTitle` (title → note id) to turn
 * [[Note title]] into links; without it they're left as typed.
 * (Linking never adds or removes lines, so line numbers still match the note.)
 */
function MarkdownPreview({ content, resolveTitle }) {
  const source = useMemo(
    () => (resolveTitle ? linkifyWikiLinks(content, resolveTitle) : content),
    [content, resolveTitle],
  );
  if (!content.trim()) {
    return <p className="preview-empty">Nothing to preview yet.</p>;
  }
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
        urlTransform={urlTransform}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownPreview);
